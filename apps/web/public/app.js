/**
 * Nhịp — bảng điều khiển.
 *
 * Nguyên tắc: **không có số nào được bịa.** Mọi con số trên màn hình đọc từ
 * `/v1/overview`, `/v1/payouts`, `/v1/workers` — nếu API lỗi thì chỗ đó hiện lỗi,
 * không hiện số 0 giả. Một dashboard trả lương mà hiển thị "0 đã trả" khi mất kết
 * nối sẽ khiến người vận hành tưởng đã trả xong.
 *
 * Toàn bộ số tiền trên đường dây là **chuỗi micro-USDC** (1 USDC = 1.000.000).
 * Module này không bao giờ đổi chúng sang `Number` để tính: 1.000.000.000 micro
 * vẫn nằm trong safe integer hôm nay, nhưng cộng dồn vài tháng thì không, và
 * JavaScript không báo lỗi khi mất chính xác. Mọi phép tính dùng `BigInt`, phần
 * hiển thị dùng `Intl.NumberFormat`.
 */

import { formatUsdc, parseAmountToMicro } from './money.js';

const STORAGE_KEY = 'nhip.apiKey';
const PAGE_SIZE = 25;

const STATE_LABEL = {
  queued: 'Chờ',
  batched: 'Trong lô',
  submitted: 'Đã gửi',
  confirmed: 'Đã trả',
  failed: 'Lỗi',
};

const state = {
  apiKey: null,
  /** Khoá Idempotency đang chờ, gắn với nội dung form đã sinh ra nó. */
  pendingPayoutKey: null,
  pendingPayoutSignature: null,
  nextCursor: null,
  workersById: new Map(),
  /** Id payout vừa tạo, để tô sáng đúng một dòng sau khi bảng vẽ lại. */
  freshPayoutId: null,
  healthTimer: null,
};

const $ = (id) => document.getElementById(id);

/* -------------------------------------------------------------------------
 * DOM helpers
 * ---------------------------------------------------------------------- */

/**
 * Dựng node bằng `textContent`, không bằng `innerHTML`.
 * Lý do: `reference` và `displayName` là dữ liệu người dùng nhập. Nối chuỗi vào
 * HTML là mở đường cho XSS ngay trong trang đang giữ API key.
 */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === undefined || child === null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function emptyRow(colSpan, message) {
  return el('tr', {}, el('td', { colspan: colSpan, class: 'empty', text: message }));
}

/* -------------------------------------------------------------------------
 * Tiền
 * ---------------------------------------------------------------------- */

const vnNumber = new Intl.NumberFormat('vi-VN');

// `formatUsdc` / `parseAmountToMicro` nằm ở `money.js` — có test riêng trong
// `money.test.js`. Không chép lại ở đây: hai bản sao của logic tiền là hai chỗ
// có thể lệch nhau, và chỗ lệch đó không hiện ra trên màn hình.


/* -------------------------------------------------------------------------
 * HTTP
 * ---------------------------------------------------------------------- */

class ApiError extends Error {
  constructor(message, { code, status, details, requestId } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (state.apiKey) headers.Authorization = `Bearer ${state.apiKey}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Không kết nối được tới API. Server đã chạy chưa?', { status: 0 });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const info = payload?.error ?? {};
    throw new ApiError(info.message ?? `HTTP ${response.status}`, {
      code: info.code,
      status: response.status,
      details: info.details,
      requestId: info.requestId,
    });
  }

  return { status: response.status, body: payload };
}

/* -------------------------------------------------------------------------
 * Toast
 * ---------------------------------------------------------------------- */

function toast(tone, title, body, { timeout = 6000 } = {}) {
  const container = $('toasts');
  const node = el(
    'div',
    { class: 'toast', role: 'alert' },
    el('p', { class: 'toast__title', text: title }),
    body ? el('p', { class: 'toast__body', text: body }) : null,
  );
  node.dataset.tone = tone;
  container.append(node);

  const remove = () => {
    if (node.dataset.leaving === 'true') return;
    node.dataset.leaving = 'true';
    node.addEventListener('animationend', () => node.remove(), { once: true });
    // Lưới an toàn: nếu animation bị tắt (prefers-reduced-motion), sự kiện không bắn.
    window.setTimeout(() => node.remove(), 400);
  };
  window.setTimeout(remove, timeout);
  node.addEventListener('click', remove);
}

function describeError(error) {
  if (!(error instanceof ApiError)) return 'Lỗi không xác định.';
  const parts = [error.message];
  const fields = error.details?.fields;
  if (Array.isArray(fields) && fields.length > 0) {
    parts.push(fields.map((f) => `${f.field}: ${f.message}`).join(' '));
  }
  const rejected = error.details?.rejected;
  if (Array.isArray(rejected) && rejected.length > 0) {
    parts.push(`${rejected.length} dòng bị từ chối.`);
  }
  if (error.requestId) parts.push(`Mã lỗi: ${error.requestId}`);
  return parts.join(' ');
}

/* -------------------------------------------------------------------------
 * Kết nối
 * ---------------------------------------------------------------------- */

function showGate(message) {
  $('shell').hidden = true;
  $('gate').hidden = false;
  const error = $('gate-error');
  error.textContent = message ?? '';
  $('api-key-input').focus();
  stopHealthTimer();
}

function showShell() {
  $('gate').hidden = true;
  $('shell').hidden = false;
}

function setGateBusy(busy) {
  const button = $('gate-submit');
  button.disabled = busy;
  button.dataset.busy = busy ? 'true' : 'false';
}

/**
 * Xác thực key bằng `/v1/me` thay vì đoán theo định dạng.
 * Chỉ có server mới biết key nào tồn tại; kiểm ở client chỉ tạo cảm giác an toàn.
 */
async function connect({ fromStorage }) {
  setGateBusy(true);
  $('gate-error').textContent = '';

  try {
    const me = await api('/v1/me');
    localStorage.setItem(STORAGE_KEY, state.apiKey);
    showShell();
    paintPlatform(me.body);
    await refresh({ initial: true });
    startHealthTimer();
    void pingHealth();
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Không kết nối được.';
    if (fromStorage) {
      // Key cũ hỏng: xoá để lần mở sau không lặp lại vòng lỗi này.
      localStorage.removeItem(STORAGE_KEY);
      state.apiKey = null;
      showGate(`${message} Nhập key mới từ \`npm run seed\`.`);
    } else {
      $('gate-error').textContent = message;
    }
  } finally {
    setGateBusy(false);
  }
}

function paintPlatform(me) {
  const pill = $('platform-pill');
  pill.textContent = me.name;
  pill.title = `Nền tảng ${me.id} · tối đa ${me.maxPayoutsPerBatch} payout/lô · chu kỳ ${me.batchIntervalMs} ms`;
}

/* -------------------------------------------------------------------------
 * Health
 * ---------------------------------------------------------------------- */

async function pingHealth() {
  const pill = $('health-pill');
  const text = $('health-text');
  try {
    const { body } = await api('/health');
    const ok = body?.status === 'ok';
    pill.dataset.state = ok ? 'ok' : 'bad';
    text.textContent = ok ? 'API ổn định' : 'API suy giảm';
  } catch {
    pill.dataset.state = 'bad';
    text.textContent = 'Mất kết nối';
  }
}

function startHealthTimer() {
  stopHealthTimer();
  state.healthTimer = window.setInterval(() => {
    // Tab ẩn thì không ping: đừng giữ server thức vì một tab bị bỏ quên.
    if (!document.hidden) void pingHealth();
  }, 30_000);
}

function stopHealthTimer() {
  if (state.healthTimer !== null) {
    window.clearInterval(state.healthTimer);
    state.healthTimer = null;
  }
}

/* -------------------------------------------------------------------------
 * Tải dữ liệu
 * ---------------------------------------------------------------------- */

async function refresh({ initial = false } = {}) {
  const kpis = document.querySelector('.kpis');

  await Promise.all([
    (async () => {
      kpis.dataset.loading = 'true';
      try {
        const [overview, workers] = await Promise.all([
          api(`/v1/overview?recentBatches=8`),
          initial || state.workersById.size === 0 ? api('/v1/workers?limit=200') : null,
        ]);
        if (workers) paintWorkers(workers.body.workers);
        paintOverview(overview.body);
        paintBatches(overview.body.recentBatches);
      } catch (error) {
        toast('bad', 'Không tải được tổng quan', describeError(error));
        paintOverviewError();
      } finally {
        delete kpis.dataset.loading;
      }
    })(),
    loadPayouts({ reset: true }),
  ]);
}

function paintOverview(overview) {
  const total =
    overview.queued.count + overview.batched.count + overview.confirmed.count + overview.failed.count;

  $('kpi-queued-count').textContent = vnNumber.format(overview.queued.count);
  $('kpi-queued-amount').textContent = formatUsdc(overview.queued.totalMicro);
  $('kpi-batched-count').textContent = vnNumber.format(overview.batched.count);
  $('kpi-batched-amount').textContent = formatUsdc(overview.batched.totalMicro);
  $('kpi-confirmed-count').textContent = vnNumber.format(overview.confirmed.count);
  $('kpi-confirmed-amount').textContent = formatUsdc(overview.confirmed.totalMicro);

  const rate = overview.successRate;
  $('kpi-rate').textContent = rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
  $('kpi-workers').textContent = vnNumber.format(overview.workers);
  $('kpi-batches').textContent = vnNumber.format(overview.batches);

  const share = (count) => (total === 0 ? 0 : Math.round((count / total) * 100));
  setBar('kpi--queued', share(overview.queued.count));
  setBar('kpi--batched', share(overview.batched.count));
  setBar('kpi--confirmed', share(overview.confirmed.count));

  const rateBar = $('kpi-rate-bar');
  rateBar.style.width = `${rate === null ? 0 : Math.round(rate * 100)}%`;

  if (overview.failed.count > 0) {
    $('foot-note').textContent = `${vnNumber.format(overview.failed.count)} payout lỗi đang cần xử lý.`;
  }
}

function setBar(cardClass, percent) {
  const card = document.querySelector(`.${cardClass}`);
  const bar = card?.querySelector('.kpi__bar > span');
  if (bar) bar.style.width = `${percent}%`;
}

function paintOverviewError() {
  for (const id of [
    'kpi-queued-count',
    'kpi-batched-count',
    'kpi-confirmed-count',
    'kpi-rate',
  ]) {
    $(id).textContent = '—';
  }
  $('batches-body').replaceChildren(emptyRow(5, 'Không tải được dữ liệu.'));
}

function paintBatches(batches) {
  const body = $('batches-body');
  if (!Array.isArray(batches) || batches.length === 0) {
    body.replaceChildren(emptyRow(5, 'Chưa có lô nào. Bấm "Gom lô hàng đợi" để tạo.'));
    return;
  }

  body.replaceChildren(
    ...batches.map((batch) =>
      el(
        'tr',
        {},
        el('td', {}, el('span', { class: 'id', text: shortId(batch.id) })),
        el('td', {}, stateBadge(batch.state)),
        el('td', { class: 'num', text: vnNumber.format(batch.payoutCount) }),
        el('td', { class: 'num amount', text: formatUsdc(batch.total_micro) }),
        el('td', { class: 'id', text: formatTime(batch.created_at) }),
      ),
    ),
  );
}

function paintWorkers(workers) {
  state.workersById = new Map(workers.map((worker) => [worker.id, worker]));

  const select = $('worker-select');
  const previous = select.value;
  select.replaceChildren();

  if (workers.length === 0) {
    select.append(el('option', { value: '', text: 'Chưa có người lao động — chạy npm run seed' }));
    return;
  }

  select.append(el('option', { value: '', text: 'Chọn người nhận' }));
  for (const worker of workers) {
    const label = worker.displayName ? `${worker.displayName} · ${worker.externalId}` : worker.externalId;
    select.append(el('option', { value: worker.id, text: label }));
  }
  if (previous && state.workersById.has(previous)) select.value = previous;
}

async function loadPayouts({ reset }) {
  const body = $('payouts-body');
  const button = $('load-more');

  if (reset) {
    body.replaceChildren(emptyRow(6, 'Đang tải…'));
    state.nextCursor = null;
  }

  button.disabled = true;
  try {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (!reset && state.nextCursor) query.set('cursor', state.nextCursor);

    const { body: page } = await api(`/v1/payouts?${query}`);
    const rows = page.payouts.map(payoutRow);

    if (reset) body.replaceChildren();
    body.append(...rows);
    if (body.children.length === 0) {
      body.replaceChildren(emptyRow(6, 'Chưa có payout nào.'));
    }

    state.nextCursor = page.nextCursor;
    button.hidden = !page.nextCursor;
  } catch (error) {
    if (reset) body.replaceChildren(emptyRow(6, 'Không tải được payout.'));
    toast('bad', 'Không tải được payout', describeError(error));
  } finally {
    button.disabled = false;
    // Chỉ tô sáng một lần: giữ lại thì mọi lần làm mới đều nháy.
    state.freshPayoutId = null;
  }
}

function payoutRow(payout) {
  const worker = state.workersById.get(payout.workerId);
  const workerLabel = worker ? worker.displayName ?? worker.externalId : null;

  const row = el(
    'tr',
    {},
    el('td', {}, el('span', { class: 'id', text: shortId(payout.id) })),
    el(
      'td',
      {},
      workerLabel
        ? el('span', { text: workerLabel })
        : el('span', { class: 'id', text: shortId(payout.workerId) }),
    ),
    el('td', { class: 'num amount', text: formatUsdc(payout.amount_micro) }),
    el('td', {}, stateBadge(payout.state)),
    el('td', {}, el('span', { class: 'ref', title: payout.reference ?? '', text: payout.reference ?? '—' })),
    el('td', { class: 'id', text: formatTime(payout.created_at) }),
  );
  if (payout.id === state.freshPayoutId) row.dataset.fresh = 'true';
  return row;
}

function stateBadge(value) {
  const node = el('span', { class: 'state', text: STATE_LABEL[value] ?? value });
  node.dataset.state = value;
  return node;
}

/** Id đầy đủ dài 36 ký tự; bảng cần đọc được, tooltip giữ nguyên bản. */
function shortId(id) {
  if (typeof id !== 'string') return '—';
  const separator = id.indexOf('_');
  if (separator < 0) return id;
  const prefix = id.slice(0, separator);
  const rest = id.slice(separator + 1);
  return `${prefix}_${rest.slice(0, 6)}…${rest.slice(-4)}`;
}

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return timeFormat.format(date);
}

/* -------------------------------------------------------------------------
 * Hành động
 * ---------------------------------------------------------------------- */

async function withBusy(button, work) {
  if (button.dataset.busy === 'true') return;
  button.dataset.busy = 'true';
  button.disabled = true;
  try {
    await work();
  } finally {
    delete button.dataset.busy;
    button.disabled = false;
  }
}

async function submitPayout(event) {
  event.preventDefault();
  const button = $('payout-submit');
  const select = $('worker-select');
  const amountInput = $('amount-input');
  const referenceInput = $('reference-input');
  const help = $('amount-help');

  const workerId = select.value;
  if (!workerId) {
    toast('bad', 'Chưa chọn người nhận', 'Chọn một người lao động trong danh sách.');
    select.focus();
    return;
  }

  const parsed = parseAmountToMicro(amountInput.value);
  if (parsed.error) {
    amountInput.setAttribute('aria-invalid', 'true');
    help.dataset.tone = 'bad';
    help.textContent = parsed.error;
    amountInput.focus();
    return;
  }
  amountInput.removeAttribute('aria-invalid');
  help.dataset.tone = '';
  help.textContent = 'Tối đa 6 chữ số thập phân.';

  const reference = referenceInput.value.trim();
  // Cùng nội dung → cùng key. Nhờ vậy bấm lại sau khi timeout trả về 200
  // `duplicate: true` thay vì tạo payout thứ hai.
  const signature = `${workerId}|${parsed.micro}|${reference}`;
  if (state.pendingPayoutSignature !== signature || !state.pendingPayoutKey) {
    state.pendingPayoutKey = crypto.randomUUID();
    state.pendingPayoutSignature = signature;
  }

  await withBusy(button, async () => {
    try {
      const { status, body } = await api('/v1/payouts', {
        method: 'POST',
        headers: { 'Idempotency-Key': state.pendingPayoutKey },
        body: {
          workerId,
          amount_micro: parsed.micro,
          ...(reference ? { reference } : {}),
        },
      });

      state.pendingPayoutKey = null;
      state.pendingPayoutSignature = null;
      state.freshPayoutId = body.id;

      const amount = formatUsdc(body.amount_micro);
      if (body.duplicate) {
        toast('ok', 'Payout đã tồn tại', `${amount} USDC · ${shortId(body.id)} — request trước đã tới đích (HTTP ${status}).`);
      } else {
        toast('ok', 'Đã vào hàng đợi', `${amount} USDC cho ${workerLabelFor(workerId)}.`);
      }

      amountInput.value = '';
      referenceInput.value = '';
      await refresh();
    } catch (error) {
      // Giữ nguyên key: lần bấm tiếp theo phải là retry của cùng request này.
      toast('bad', 'Không tạo được payout', describeError(error));
    }
  });
}

function workerLabelFor(workerId) {
  const worker = state.workersById.get(workerId);
  return worker?.displayName ?? worker?.externalId ?? shortId(workerId);
}

async function collectQueue() {
  const button = $('run-batcher');
  await withBusy(button, async () => {
    try {
      const { status, body } = await api('/v1/batches/from-queue', { method: 'POST' });

      if (status === 200 || body.payoutCount === 0) {
        toast('ok', 'Hàng đợi rỗng', 'Không có payout nào đang chờ để gom.');
        return;
      }

      const total = formatUsdc(body.total_micro);
      toast(
        'ok',
        `Đã tạo ${body.batches.length} lô`,
        `${vnNumber.format(body.payoutCount)} payout · ${total} USDC. Gửi lên Arc là bước tiếp theo.`,
      );
      await refresh();
    } catch (error) {
      toast('bad', 'Không gom được lô', describeError(error));
    }
  });
}

/* -------------------------------------------------------------------------
 * Wiring
 * ---------------------------------------------------------------------- */

function wire() {
  $('gate-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = $('api-key-input').value.trim();
    if (!value) {
      $('gate-error').textContent = 'Dán API key vào ô trên.';
      return;
    }
    state.apiKey = value;
    void connect({ fromStorage: false });
  });

  $('disconnect').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    state.apiKey = null;
    state.workersById = new Map();
    state.nextCursor = null;
    $('api-key-input').value = '';
    showGate('');
  });

  $('payout-form').addEventListener('submit', (event) => void submitPayout(event));
  $('run-batcher').addEventListener('click', () => void collectQueue());
  $('refresh').addEventListener('click', () => {
    void refresh().then(() => toast('ok', 'Đã làm mới', 'Số liệu vừa đọc lại từ database.'));
  });
  $('load-more').addEventListener('click', () => void loadPayouts({ reset: false }));

  // Sửa số tiền thì bỏ trạng thái lỗi ngay, đừng để viền đỏ bám theo.
  $('amount-input').addEventListener('input', () => {
    const input = $('amount-input');
    input.removeAttribute('aria-invalid');
    const help = $('amount-help');
    help.dataset.tone = '';
    help.textContent = 'Tối đa 6 chữ số thập phân.';
  });

  void boot();
}

async function boot() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    showGate('');
    return;
  }
  state.apiKey = stored;
  showShell();
  await connect({ fromStorage: true });
}

wire();
