/**
 * Nhịp — Hệ thống điều khiển & Quản trị dòng tiền chi trả tức thì trên Arc L1.
 *
 * Nguyên tắc bất biến kỹ thuật (ROLE.md):
 * - B1/B10: Mọi số tiền là Micro (BigInt), cấm float / Number trên đường tiền.
 * - B9: Tuyệt đối không hiển thị "0" khi lỗi hoặc chưa tải xong. Phải hiện "—".
 * - B7: Idempotency đảm bảo tại DB, sinh Idempotency-Key tự động cho mỗi thao tác.
 * - Không có console.log debug trong code sản phẩm.
 */

import { formatUsdc, parseAmountToMicro } from './money.js';

const STORAGE_KEY = 'nhip.apiKey';
const THEME_KEY = 'nhip.theme';
const PAGE_SIZE = 25;

/**
 * Khoá API của nền tảng demo trong `npm run seed`.
 *
 * Vì sao để lộ được: đây là dữ liệu mẫu, không phải tiền của ai, và toàn bộ bản ghi đều
 * mang `is_demo = TRUE`. Nó **không** phải khoá của một nền tảng thật: nếu bạn deploy
 * sản phẩm với dữ liệu thật, hãy xoá dòng này và đăng nhập bằng `/v1/me`.
 *
 * Nhãn "demo" trên giao diện **không** suy ra từ chuỗi này — nó đọc `isDemo` do API trả,
 * để một khoá thật có chữ "seed" trong tên không bị dán nhãn sai, và ngược lại.
 */
const DEMO_SEED_API_KEY = 'nhip_sk_seed_00000000000000000000000000000001';

/** Explorer Blockscout của Arc — đã kiểm route `/tx/:hash` tồn tại trên testnet. */
const EXPLORER = {
  testnet: 'https://explorer.testnet.arc.io',
  mainnet: 'https://explorer.arc.io',
};

/**
 * Hai con số gas **đo thật** trên Arc Testnet (2026-10-27, `eth_estimateGas` cho USDC
 * `0x3600…0000`): 49.338 cho ví đã từng giữ token, 74.826 cho ví lạnh. Báo giá dùng cận
 * trên; màn hình "Mạng Arc & Phí" cũng phải dùng đúng con số đó, không được bịa số đẹp.
 */
const GAS_PER_TRANSFER_COLD = 74_826n;
const MIN_MAX_FEE_PER_GAS_WEI = 20_000_000_000n;
const WEI_PER_MICRO = 1_000_000_000_000n;

/** Giả định phí Ethereum L1 cho một lần transfer USDC — **không đo**, chỉ để so sánh. */
const ETH_ASSUMED_FEE_MICRO = 2_520_000n;

const STATE_LABEL = {
  planned: 'Chờ gửi',
  submitting: 'Đang gửi',
  queued: 'Chờ',
  batched: 'Trong lô',
  submitted: 'Đã gửi Arc',
  confirmed: 'Đã chi trả',
  partial: 'Trả một phần',
  failed: 'Lỗi',
  unknown: 'Chưa rõ',
};

const SETTLEMENT_MODE_LABEL = {
  unsettled: 'Chưa lên chain',
  onchain: 'Đã lên chain',
  simulated: 'Dữ liệu demo',
};

const state = {
  apiKey: null,
  theme: 'dark',
  currentTab: 'tab-overview',
  activeFilter: 'all',
  nextCursor: null,
  workersById: new Map(),
  workersByExternalId: new Map(),
  allWorkers: [],
  freshPayoutId: null,
  healthTimer: null,
  batchesById: new Map(),
  /** `/v1/me` — nguồn sự thật cho tên nền tảng, cờ demo và cấu hình chain. */
  me: null,
  settleBatchId: null,
  settleQuote: null,
  settleDetail: null,
};

const $ = (id) => document.getElementById(id);

/* -------------------------------------------------------------------------
 * DOM Helpers (Không dùng innerHTML bừa bãi để tránh XSS)
 * ---------------------------------------------------------------------- */
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

function shortenAddress(addr) {
  if (!addr || typeof addr !== 'string' || addr.length < 10) return addr ?? '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/* -------------------------------------------------------------------------
 * HTTP Client
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
    throw new ApiError('Không thể kết nối máy chủ API. Kiểm tra xem server đã khởi chạy chưa.', { status: 0 });
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
    const err = payload?.error;
    const message = err?.message ?? `Yêu cầu thất bại (${response.status})`;
    throw new ApiError(message, {
      code: err?.code,
      status: response.status,
      details: err?.details,
      requestId: err?.requestId,
    });
  }

  return payload;
}

/* -------------------------------------------------------------------------
 * Toast Notification System
 * ---------------------------------------------------------------------- */
function toast(message, type = 'info') {
  const container = $('toasts');
  if (!container) return;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const node = el(
    'div',
    { class: `toast toast--${type}` },
    el('span', { class: 'toast__icon', text: icons[type] ?? '•' }),
    el('span', { class: 'toast__text', text: message }),
  );

  container.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(10px)';
    node.style.transition = 'all 0.25s ease';
    setTimeout(() => node.remove(), 260);
  }, 4200);
}

/* -------------------------------------------------------------------------
 * Theme Management (Dark / Light)
 * ---------------------------------------------------------------------- */
function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  state.theme = stored ?? preferred;
  applyTheme(state.theme);

  const toggleBtn = $('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, state.theme);
      applyTheme(state.theme);
      toast(`Đã chuyển sang giao diện ${state.theme === 'dark' ? 'Tối' : 'Sáng'}`, 'info');
    });
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
}

/* -------------------------------------------------------------------------
 * Tab Navigation System
 * ---------------------------------------------------------------------- */
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      if (!targetId) return;
      switchTab(targetId);
    });
  });
}

function switchTab(targetId) {
  state.currentTab = targetId;

  document.querySelectorAll('.nav-tab').forEach((t) => {
    t.classList.toggle('nav-tab--active', t.dataset.tab === targetId);
  });

  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('tab-pane--active', pane.id === targetId);
  });
}

/* -------------------------------------------------------------------------
 * Command Palette (Ctrl+K / Cmd+K - học aitmpl.com)
 * ---------------------------------------------------------------------- */
function initCommandPalette() {
  const backdrop = $('cmd-backdrop');
  const trigger = $('cmd-trigger');
  const input = $('cmd-search-input');
  const list = $('cmd-list');

  if (!backdrop || !input || !list) return;

  backdrop.hidden = true;

  function openCmd() {
    backdrop.hidden = false;
    input.value = '';
    filterCmdItems('');
    input.focus();
  }

  function closeCmd() {
    backdrop.hidden = true;
  }

  if (trigger) trigger.addEventListener('click', openCmd);
  const closeBtn = $('cmd-close');
  if (closeBtn) closeBtn.addEventListener('click', closeCmd);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeCmd();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (backdrop.hidden) openCmd();
      else closeCmd();
    } else if (e.key === 'Escape' && !backdrop.hidden) {
      closeCmd();
    }
  });

  input.addEventListener('input', () => {
    filterCmdItems(input.value.trim().toLowerCase());
  });

  function filterCmdItems(query) {
    const items = list.querySelectorAll('.cmd-item');
    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.hidden = query.length > 0 && !text.includes(query);
    });
  }

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.cmd-item');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    closeCmd();
    executeCommand(cmd);
  });
}

function executeCommand(cmd) {
  if (cmd === 'run-batcher') {
    const btn = $('run-batcher');
    if (btn) btn.click();
  } else if (cmd === 'refresh') {
    const btn = $('refresh');
    if (btn) btn.click();
  } else if (cmd === 'toggle-theme') {
    const btn = $('theme-toggle');
    if (btn) btn.click();
  } else if (cmd?.startsWith('tab-')) {
    switchTab(cmd);
  } else if (cmd === 'disconnect') {
    disconnect();
  }
}

/* -------------------------------------------------------------------------
 * Batch Details Drawer
 * ---------------------------------------------------------------------- */
function initBatchDrawer() {
  const backdrop = $('drawer-backdrop');
  const drawer = $('batch-drawer');
  const closeBtn = $('drawer-close');

  function closeDrawer() {
    if (backdrop) backdrop.hidden = true;
    if (drawer) drawer.hidden = true;
  }

  if (backdrop) backdrop.addEventListener('click', closeDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && !drawer.hidden) closeDrawer();
  });
}

async function openBatchDrawer(batchId) {
  const backdrop = $('drawer-backdrop');
  const drawer = $('batch-drawer');
  if (!backdrop || !drawer) return;

  backdrop.hidden = false;
  drawer.hidden = false;

  $('drawer-batch-id').textContent = batchId;
  $('drawer-batch-state').textContent = 'Đang tải…';
  $('drawer-batch-count').textContent = '—';
  $('drawer-batch-total').textContent = '—';
  $('drawer-batch-gas').textContent = '—';
  $('drawer-batch-tx').replaceChildren(document.createTextNode('—'));

  const tbody = $('drawer-payouts-body');
  tbody.replaceChildren(emptyRow(4, 'Đang tải chi tiết các giao dịch trong lô…'));

  try {
    const [detail, settlement] = await Promise.all([
      api(`/v1/batches/${encodeURIComponent(batchId)}`),
      api(`/v1/settlement/batches/${encodeURIComponent(batchId)}`).catch(() => null),
    ]);

    $('drawer-batch-state').textContent = STATE_LABEL[detail.state] ?? detail.state;
    $('drawer-batch-count').textContent = `${detail.payoutCount} khoản`;
    $('drawer-batch-total').textContent = `${formatUsdc(detail.total_micro)} USDC`;

    // B9: `estimatedGas` là chuỗi từ DB. Thiếu thì phải là "—", không phải "0 gas" —
    // "0 gas" đọc như "miễn phí", trong khi sự thật là chưa biết.
    $('drawer-batch-gas').textContent = detail.estimatedGas
      ? `${Number(detail.estimatedGas).toLocaleString('vi-VN')} gas`
      : '—';

    // Mỗi payout là một tx riêng. Hash cấp lô không tồn tại trong mô hình này, nên chỗ
    // này chỉ hiện nhãn settlement + hash đầu tiên đã có (nếu có) để người đọc biết
    // sang bảng bên dưới mà xem từng dòng.
    const modeLabel = SETTLEMENT_MODE_LABEL[detail.settlementMode] ?? detail.settlementMode ?? '—';
    const hashes = (settlement?.payouts ?? []).map((p) => p.txHash).filter(Boolean);
    const txNode = $('drawer-batch-tx');

    if (hashes.length > 0) {
      const first = hashes[0];
      txNode.replaceChildren(
        txLink(first, state.me?.chain?.network ?? 'testnet'),
        document.createTextNode(` · ${hashes.length}/${detail.payoutCount} payout có hash`),
      );
    } else {
      txNode.textContent = `${modeLabel} — chưa có hash nào`;
    }

    if (!detail.payouts || detail.payouts.length === 0) {
      tbody.replaceChildren(emptyRow(4, 'Lô này không có payout nào.'));
      return;
    }

    const txByPayout = new Map((settlement?.payouts ?? []).map((p) => [p.id, p.txHash]));

    const rows = detail.payouts.map((p) => {
      const worker = state.workersById.get(p.workerId);
      const recipientName = worker?.displayName ?? worker?.externalId ?? shortenAddress(p.workerId);
      const hash = txByPayout.get(p.id);

      return el(
        'tr',
        {},
        el('td', { class: 'mono', text: p.id }),
        el('td', { text: recipientName }),
        el('td', { class: 'num', text: formatUsdc(p.amount_micro) }),
        el(
          'td',
          {},
          el('span', { class: `status-pill status-pill--${p.state}`, text: STATE_LABEL[p.state] ?? p.state }),
          hash ? document.createTextNode(' ') : null,
          hash ? txLink(hash, state.me?.chain?.network ?? 'testnet') : null,
        ),
      );
    });

    tbody.replaceChildren(...rows);
  } catch (err) {
    $('drawer-batch-state').textContent = '—';
    tbody.replaceChildren(emptyRow(4, `Lỗi tải chi tiết: ${err.message}`));
    toast(`Không tải được chi tiết lô: ${err.message}`, 'error');
  }
}

/** Liên kết tới explorer. Không bịa URL: chỉ hai mạng đã biết. */
function txLink(txHash, network) {
  const base = EXPLORER[network] ?? EXPLORER.testnet;
  return el(
    'a',
    {
      class: 'tx-link',
      href: `${base}/tx/${txHash}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: txHash,
      text: `${txHash.slice(0, 10)}…${txHash.slice(-6)}`,
    },
  );
}

/** Link biên nhận công khai của một người lao động, dựng từ origin đang chạy. */
function receiptLink(claimToken) {
  return `${window.location.origin}/?claim=${encodeURIComponent(claimToken)}`;
}

/**
 * Copy link biên nhận vào clipboard.
 *
 * Vì sao phải có fallback: `navigator.clipboard` chỉ tồn tại trên HTTPS (hoặc localhost).
 * Trên một bản deploy HTTP nội bộ, `navigator.clipboard` là `undefined` — và im lặng thất
 * bại ở đây nghĩa là người vận hành tưởng đã copy trong khi clipboard rỗng.
 */
async function copyReceiptLink(claimToken) {
  const link = receiptLink(claimToken);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
      toast('Đã copy link biên nhận. Gửi link này cho người lao động.', 'success');
      return;
    }
    throw new Error('Trình duyệt không cho phép ghi clipboard ở địa chỉ này.');
  } catch (err) {
    toast(`Không copy được link: ${err.message} Link là: ${link}`, 'error');
  }
}

/* -------------------------------------------------------------------------
 * Arc Savings Calculator (học oneliq.xyz)
 * ---------------------------------------------------------------------- */
function initSavingsCalculator() {
  const slider = $('calc-slider');
  const countDisplay = $('calc-count-display');
  const ethCost = $('calc-eth-cost');
  const arcCost = $('calc-arc-cost');
  const saved = $('calc-saved');

  if (!slider) return;

  // Phí một payout trên Arc, suy từ số đo thật, không phải hằng số marketing:
  //   74.826 gas × 20 Gwei = 1.496.520.000.000.000 wei → 1.496 micro (làm tròn lên).
  const arcFeePerPayoutMicro = (GAS_PER_TRANSFER_COLD * MIN_MAX_FEE_PER_GAS_WEI + WEI_PER_MICRO - 1n) / WEI_PER_MICRO;

  function update() {
    const count = BigInt(parseInt(slider.value, 10) || 5000);
    countDisplay.textContent = `${count.toLocaleString('vi-VN')} người/ngày`;

    const days = 365n;
    const arcYearlyMicro = arcFeePerPayoutMicro * count * days;
    const ethYearlyMicro = ETH_ASSUMED_FEE_MICRO * count * days;
    const savedYearlyMicro = ethYearlyMicro - arcYearlyMicro;

    // Số tiền hiển thị bằng USD xấp xỉ (1 USDC ≈ 1 USD), quy từ micro bằng BigInt.
    ethCost.textContent = `$${formatUsdFromMicro(ethYearlyMicro)}`;
    arcCost.textContent = `$${formatUsdFromMicro(arcYearlyMicro)}`;
    saved.textContent = `$${formatUsdFromMicro(savedYearlyMicro)}`;
  }

  slider.addEventListener('input', update);
  update();
}

/** micro-USDC (bigint) → chuỗi USD làm tròn tới đồng, dùng Intl thay vì Number trên đường tiền. */
function formatUsdFromMicro(value) {
  const units = value / 1_000_000n;
  const remainder = value % 1_000_000n;
  // Làm tròn tới đồng gần nhất: 0,5 USDC trở lên thì cộng 1.
  const rounded = remainder >= 500_000n ? units + 1n : units;
  return rounded.toLocaleString('vi-VN');
}

/* -------------------------------------------------------------------------
 * Bulk Payout Planner (học oneliq.xyz)
 * ---------------------------------------------------------------------- */
function initBulkPlanner() {
  const sampleBtn = $('bulk-load-sample');
  const previewBtn = $('bulk-preview-btn');
  const submitBtn = $('bulk-submit-btn');
  const textarea = $('bulk-input');
  const validCountEl = $('bulk-valid-count');
  const invalidCountEl = $('bulk-invalid-count');
  const totalAmountEl = $('bulk-total-amount');
  const batchesEstEl = $('bulk-batches-est');
  const previewBody = $('bulk-preview-body');

  let parsedPayouts = [];

  if (sampleBtn && textarea) {
    sampleBtn.addEventListener('click', () => {
      const sampleWorkers = state.allWorkers.slice(0, 5);
      if (sampleWorkers.length > 0) {
        textarea.value = sampleWorkers
          .map((w, idx) => `${w.externalId},${(15 + idx * 7.5).toFixed(2)},Chuyến xe Grab #${8840 + idx}`)
          .join('\n');
      } else {
        textarea.value = `driver-001,15.50,Chuyến xe Grab #8891\ndriver-002,42.00,Chuyến xe Grab #8892\ndriver-003,120.75,Thưởng năng suất tuần\ndriver-004,18.00,Giao đồ ăn Now\ndriver-005,95.25,Cuốc xe sân bay`;
      }
      previewBtn.click();
    });
  }

  if (previewBtn && textarea) {
    previewBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) {
        toast('Vui lòng nhập danh sách thanh toán', 'error');
        return;
      }

      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let valid = 0;
      let invalid = 0;
      let totalMicro = 0n;
      parsedPayouts = [];

      const rows = lines.map((line, idx) => {
        const parts = line.split(',').map((p) => p.trim());
        const idOrExt = parts[0] ?? '';
        const rawAmount = parts[1] ?? '';
        const ref = parts[2] ?? '';

        const worker = state.workersByExternalId.get(idOrExt) ?? state.workersById.get(idOrExt);
        const workerId = worker ? worker.id : idOrExt;
        const parsed = parseAmountToMicro(rawAmount);

        let isOk = true;
        let errMsg = '';

        if (!idOrExt) {
          isOk = false;
          errMsg = 'Thiếu mã người nhận';
        } else if (parsed.error) {
          isOk = false;
          errMsg = parsed.error;
        }

        if (isOk) {
          valid++;
          totalMicro += BigInt(parsed.micro);
          parsedPayouts.push({
            workerId,
            amount_micro: parsed.micro,
            reference: ref || undefined,
          });
        } else {
          invalid++;
        }

        return el(
          'tr',
          {},
          el('td', { class: 'mono', text: idx + 1 }),
          el('td', { text: worker?.displayName ?? idOrExt }),
          el('td', { class: 'num', text: isOk ? formatUsdc(parsed.micro) : rawAmount }),
          el(
            'td',
            {},
            el(
              'span',
              {
                class: `status-pill ${isOk ? 'status-pill--confirmed' : 'status-pill--failed'}`,
                text: isOk ? 'Hợp lệ' : errMsg,
              },
            ),
          ),
        );
      });

      previewBody.replaceChildren(...rows);
      validCountEl.textContent = String(valid);
      invalidCountEl.textContent = String(invalid);
      totalAmountEl.textContent = formatUsdc(totalMicro.toString());

      // Số payout tối đa mỗi lô do server quyết định (gasBudget ÷ gas đo thật trên Arc).
      // Client không tự đoán: một con số lệch khiến người dùng tưởng 350 người vào một lô.
      const maxPerBatch = state.me?.maxPayoutsPerBatch;
      batchesEstEl.textContent =
        typeof maxPerBatch === 'number' && maxPerBatch > 0
          ? String(Math.ceil(valid / maxPerBatch) || (valid > 0 ? 1 : 0))
          : '—';

      submitBtn.disabled = valid === 0;
      if (invalid > 0) {
        toast(`Phát hiện ${invalid} dòng có lỗi. Chỉ các dòng hợp lệ mới được đưa vào lô.`, 'error');
      } else {
        toast(`Đã kiểm toán thành công ${valid} dòng hợp lệ.`, 'success');
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (parsedPayouts.length === 0) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang tạo lô…';

      try {
        const idempotencyKey = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const res = await api('/v1/batches', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: { payouts: parsedPayouts },
        });

        toast(`Đã tạo thành công ${res.batches?.length ?? 1} lô chi trả!`, 'success');
        textarea.value = '';
        validCountEl.textContent = '0';
        invalidCountEl.textContent = '0';
        totalAmountEl.textContent = '0,00';
        batchesEstEl.textContent = '0';
        previewBody.replaceChildren(emptyRow(4, 'Đã gửi thành công vào hệ thống.'));

        await refreshAll();
        switchTab('tab-overview');
      } catch (err) {
        toast(`Lỗi tạo lô hàng loạt: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ Tạo lô & Đưa vào hàng đợi';
      }
    });
  }
}

/* -------------------------------------------------------------------------
 * Worker & Recipient Portal (ezwallet.cash style)
 * ---------------------------------------------------------------------- */
function initWorkerPortal() {
  const lookupForm = $('worker-lookup-form');
  const lookupInput = $('worker-lookup-input');
  const portalResult = $('portal-result');

  if (lookupForm && lookupInput) {
    lookupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = lookupInput.value.trim();
      if (!query) return;

      try {
        const worker = state.workersByExternalId.get(query) ?? state.workersById.get(query);
        let workerData = worker;

        if (!workerData) {
          try {
            workerData = await api(`/v1/workers/${encodeURIComponent(query)}?externalId=${encodeURIComponent(query)}`);
          } catch {
            // Thử query theo id
            workerData = await api(`/v1/workers/${encodeURIComponent(query)}`);
          }
        }

        if (!workerData) {
          toast('Không tìm thấy người lao động với mã này.', 'error');
          return;
        }

        $('lookup-name').textContent = workerData.displayName || 'Người lao động';
        $('lookup-ext-id').textContent = `Mã: ${workerData.externalId}`;
        $('lookup-address').textContent = workerData.address
          ? `Ví Arc: ${workerData.address}`
          : 'Chưa liên kết địa chỉ ví';

        // Lấy lịch sử payout của người này
        const payoutsRes = await api(`/v1/payouts?workerId=${encodeURIComponent(workerData.id)}&limit=50`);
        const payouts = payoutsRes.payouts ?? [];

        let totalConfirmed = 0n;
        let totalPending = 0n;

        for (const p of payouts) {
          if (p.state === 'confirmed') totalConfirmed += BigInt(p.amount_micro);
          else if (p.state === 'queued' || p.state === 'batched') totalPending += BigInt(p.amount_micro);
        }

        $('lookup-total-confirmed').textContent = `${formatUsdc(totalConfirmed.toString())} USDC`;
        $('lookup-total-pending').textContent = `${formatUsdc(totalPending.toString())} USDC`;

        const receiptsList = $('lookup-receipts-list');
        if (payouts.length === 0) {
          receiptsList.replaceChildren(
            el('div', { class: 'empty', text: 'Chưa có biên nhận chi trả nào cho người này.' }),
          );
        } else {
          const items = payouts.map((p) =>
            el(
              'div',
              { class: 'receipt-item glass' },
              el(
                'div',
                { class: 'receipt-item__left' },
                el('span', { class: 'receipt-item__ref', text: p.reference || 'Thanh toán lương gig' }),
                el('span', { class: 'receipt-item__date mono', text: `${formatDate(p.created_at)} · ID: ${p.id}` }),
              ),
              el(
                'div',
                { class: 'receipt-item__right' },
                el('span', { class: 'receipt-item__amount mono', text: `+${formatUsdc(p.amount_micro)} USDC` }),
                el('div', {}, el('span', { class: `status-pill status-pill--${p.state}`, text: STATE_LABEL[p.state] ?? p.state })),
              ),
            ),
          );
          receiptsList.replaceChildren(...items);
        }

        // Link biên nhận của chính người này — thứ để gửi cho họ qua Zalo/SMS.
        const linkNote = $('lookup-claim-link');
        if (linkNote) {
          if (workerData.claimToken) {
            const link = receiptLink(workerData.claimToken);
            const copyBtn = el('button', { class: 'btn btn--ghost btn--xs', text: 'Copy link biên nhận' });
            copyBtn.addEventListener('click', () => copyReceiptLink(workerData.claimToken));
            linkNote.replaceChildren(
              el('span', { class: 'receipt-note', text: 'Link công khai cho người lao động:' }),
              document.createTextNode(' '),
              el('code', { class: 'mono', text: link }),
              document.createTextNode(' '),
              copyBtn,
            );
          } else {
            linkNote.replaceChildren(
              el('span', { class: 'receipt-note', text: 'Người này chưa có token biên nhận.' }),
            );
          }
        }

        portalResult.hidden = false;
        toast(`Đã tải thông tin của ${workerData.displayName || workerData.externalId}`, 'success');
      } catch (err) {
        toast(`Lỗi tra cứu: ${err.message}`, 'error');
      }
    });
  }

  // Thêm người nhận mới
  const createForm = $('create-worker-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const extId = $('new-worker-ext-id').value.trim();
      const name = $('new-worker-name').value.trim();
      const address = $('new-worker-address').value.trim();

      if (!extId) {
        toast('Mã định danh nội bộ không được để trống.', 'error');
        return;
      }

      try {
        const body = { externalId: extId };
        if (name) body.displayName = name;
        if (address) body.address = address;

        const res = await api('/v1/workers', {
          method: 'POST',
          body,
        });

        toast(`Đã lưu người nhận ${res.displayName || res.externalId} thành công!`, 'success');
        createForm.reset();
        await loadWorkers();
      } catch (err) {
        toast(`Lỗi thêm người nhận: ${err.message}`, 'error');
      }
    });
  }

  // Quick lookup chip buttons (ezwallet style)
  document.querySelectorAll('.chip-lookup').forEach((btn) => {
    btn.addEventListener('click', () => {
      const extId = btn.dataset.id;
      const input = $('worker-lookup-input');
      const form = $('worker-lookup-form');
      if (input && form) {
        input.value = extId;
        form.requestSubmit();
      }
    });
  });
}

/* -------------------------------------------------------------------------
 * Data Loaders: Workers, Payouts, Batches, Overview
 * ---------------------------------------------------------------------- */
async function loadWorkers() {
  try {
    const res = await api('/v1/workers?limit=200');
    state.allWorkers = res.workers ?? [];
    state.workersById.clear();
    state.workersByExternalId.clear();

    const select = $('worker-select');
    select.replaceChildren(el('option', { value: '' }, '-- Chọn người nhận tiền --'));

    for (const w of state.allWorkers) {
      state.workersById.set(w.id, w);
      state.workersByExternalId.set(w.externalId, w);

      const label = `${w.displayName || w.externalId} (${w.externalId}${w.address ? ' · ' + shortenAddress(w.address) : ''})`;
      select.appendChild(el('option', { value: w.id }, label));
    }

    $('worker-count-badge').textContent = `${state.allWorkers.length} người`;

    // Render bảng workers trong tab 4
    const tbody = $('workers-table-body');
    if (state.allWorkers.length === 0) {
      tbody.replaceChildren(emptyRow(5, 'Chưa có người lao động nào được đăng ký.'));
      return;
    }

    const rows = state.allWorkers.map((w) => {
      const payBtn = el('button', { class: 'btn btn--ghost btn--xs', text: 'Trả tiền' });
      payBtn.addEventListener('click', () => {
        select.value = w.id;
        switchTab('tab-overview');
        $('amount-input').focus();
      });

      // Link biên nhận là thứ duy nhất người lao động cần. Nếu nền tảng không copy được
      // link từ đây thì họ phải mở DB — và tính năng coi như không tồn tại.
      const linkBtn = el('button', { class: 'btn btn--ghost btn--xs', text: 'Link biên nhận' });
      linkBtn.addEventListener('click', async () => {
        if (!w.claimToken) {
          toast('Người này chưa có token biên nhận. Cập nhật hồ sơ rồi thử lại.', 'error');
          return;
        }
        await copyReceiptLink(w.claimToken);
      });

      return el(
        'tr',
        {},
        el('td', { class: 'mono', text: w.externalId }),
        el('td', { text: w.displayName || '—' }),
        el('td', { class: 'mono', text: w.address ? shortenAddress(w.address) : 'Chưa có ví' }),
        el('td', { text: formatDate(w.created_at) }),
        el('td', { class: 'num' }, payBtn, document.createTextNode(' '), linkBtn),
      );
    });

    tbody.replaceChildren(...rows);
  } catch {
    $('worker-select').replaceChildren(el('option', { value: '' }, 'Lỗi tải danh bạ người nhận'));
  }
}

/** Gán text, hoặc "—" khi giá trị không có — B9: không được hiện 0 giả. */
function setTextOrDash(id, value) {
  const node = $(id);
  if (node) node.textContent = value === null || value === undefined ? '—' : String(value);
}

function paintOverview(ov) {
  // B9: chỉ hiện số khi API trả số. `?? 0` biến "chưa tải được" thành "không có gì",
  // và người vận hành sẽ tin rằng hàng đợi rỗng trong khi thật ra request đã hỏng.
  const bucket = (key) => {
    const value = ov?.[key];
    if (!value || typeof value !== 'object') return null;
    const count = typeof value.count === 'number' ? value.count : null;
    const micro = value.totalMicro ?? value.total_micro ?? null;
    return { count, micro };
  };

  const queued = bucket('queued');
  const batched = bucket('batched');
  const confirmed = bucket('confirmed');

  setTextOrDash('kpi-queued-count', queued?.count?.toLocaleString('vi-VN'));
  setTextOrDash('kpi-queued-amount', queued?.micro == null ? null : formatUsdc(queued.micro));
  setTextOrDash('kpi-batched-count', batched?.count?.toLocaleString('vi-VN'));
  setTextOrDash('kpi-batched-amount', batched?.micro == null ? null : formatUsdc(batched.micro));
  setTextOrDash('kpi-confirmed-count', confirmed?.count?.toLocaleString('vi-VN'));
  setTextOrDash('kpi-confirmed-amount', confirmed?.micro == null ? null : formatUsdc(confirmed.micro));

  // Tỉ lệ hoàn tất do server tính (confirmed / (confirmed + failed)). Tự chia ở client
  // nghĩa là mỗi lần mở dashboard lại có thêm một chỗ có thể ra một con số khác.
  const rate = typeof ov?.successRate === 'number' ? ov.successRate : null;
  setTextOrDash('kpi-rate', rate === null ? null : `${Math.round(rate * 100)}%`);
  $('kpi-rate-bar').style.width = rate === null ? '0%' : `${Math.round(rate * 100)}%`;

  setTextOrDash('kpi-workers', typeof ov?.workers === 'number' ? ov.workers : null);
  setTextOrDash('kpi-batches', typeof ov?.batches === 'number' ? ov.batches : null);

  // Thanh so sánh chỉ vẽ khi cả ba con số đều có; nếu không thì để 0% (rỗng) thay vì
  // vẽ một thanh đầy bằng suy đoán.
  const counts = [queued?.count, batched?.count, confirmed?.count];
  const max = Math.max(...counts.map((c) => c ?? 0), 1);
  const width = (count) => (typeof count === 'number' ? `${Math.round((count / max) * 100)}%` : '0%');
  $('kpi-queued-bar').style.width = width(queued?.count);
  $('kpi-batched-bar').style.width = width(batched?.count);
  $('kpi-confirmed-bar').style.width = width(confirmed?.count);

  paintBatchTable(ov?.recentBatches);
}

function paintBatchTable(recentBatches) {
  const batchesBody = $('batches-body');
  if (!batchesBody) return;

  const batches = Array.isArray(recentBatches) ? recentBatches : null;
  state.batchesById.clear();

  if (batches === null) {
    batchesBody.replaceChildren(emptyRow(5, 'Không tải được danh sách lô. Bấm "Làm mới dữ liệu".'));
    return;
  }

  if (batches.length === 0) {
    batchesBody.replaceChildren(emptyRow(5, 'Chưa có lô thanh toán nào. Bấm "Gom lô" để bắt đầu.'));
    return;
  }

  const batchRows = batches.map((b) => {
    state.batchesById.set(b.id, b);
    const isDemo = b.settlementMode === 'simulated';

    const row = el(
      'tr',
      { style: 'cursor: pointer;' },
      el('td', { class: 'mono', text: b.id }),
      el(
        'td',
        {},
        el('span', { class: `status-pill status-pill--${b.state}`, text: STATE_LABEL[b.state] ?? b.state }),
        isDemo ? document.createTextNode(' ') : null,
        isDemo ? el('span', { class: 'demo-badge', text: 'demo' }) : null,
      ),
      el('td', { class: 'num', text: b.payoutCount }),
      el('td', { class: 'num', text: formatUsdc(b.total_micro) }),
      el('td', { text: formatDate(b.created_at) }),
    );

    row.addEventListener('click', () => openBatchDrawer(b.id));
    return row;
  });

  batchesBody.replaceChildren(...batchRows);
}

function paintOverviewError() {
  // Bất biến B9: Lỗi -> "—" + thông báo. Tuyệt đối không để 0.
  setTextOrDash('kpi-queued-count', null);
  setTextOrDash('kpi-queued-amount', null);
  setTextOrDash('kpi-batched-count', null);
  setTextOrDash('kpi-batched-amount', null);
  setTextOrDash('kpi-confirmed-count', null);
  setTextOrDash('kpi-confirmed-amount', null);
  setTextOrDash('kpi-rate', null);
  setTextOrDash('kpi-workers', null);
  setTextOrDash('kpi-batches', null);

  for (const id of ['kpi-queued-bar', 'kpi-batched-bar', 'kpi-confirmed-bar', 'kpi-rate-bar']) {
    const bar = $(id);
    if (bar) bar.style.width = '0%';
  }

  // Bảng lô vẽ từ cùng một lần gọi API, nên nó cũng mất dữ liệu. Giữ lại bảng cũ là
  // để người vận hành tưởng những lô đó vẫn đang ở trạng thái vừa hiển thị.
  paintBatchTable(null);
}

async function loadOverview() {
  try {
    const ov = await api('/v1/overview');
    paintOverview(ov);
  } catch {
    paintOverviewError();
  }
}

async function loadPayouts(cursor = null) {
  const tbody = $('payouts-body');
  if (!cursor) {
    tbody.replaceChildren(emptyRow(6, 'Đang tải lịch sử chi trả…'));
  }

  try {
    let url = `/v1/payouts?limit=${PAGE_SIZE}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const res = await api(url);
    const payouts = res.payouts ?? [];
    state.nextCursor = res.nextCursor ?? null;

    $('load-more').hidden = !state.nextCursor;

    if (payouts.length === 0 && !cursor) {
      tbody.replaceChildren(emptyRow(6, 'Chưa có khoản chi trả nào trong hàng đợi.'));
      return;
    }

    const rows = payouts
      .filter((p) => state.activeFilter === 'all' || p.state === state.activeFilter)
      .map((p) => {
        const worker = state.workersById.get(p.workerId);
        const name = worker?.displayName ?? worker?.externalId ?? shortenAddress(p.workerId);

        return el(
          'tr',
          {},
          el('td', { class: 'mono', text: p.id }),
          el('td', { text: name }),
          el('td', { class: 'num', text: formatUsdc(p.amount_micro) }),
          el('td', {}, el('span', { class: `status-pill status-pill--${p.state}`, text: STATE_LABEL[p.state] ?? p.state })),
          el('td', { text: p.reference || '—' }),
          el('td', { text: formatDate(p.created_at) }),
        );
      });

    if (cursor) {
      tbody.append(...rows);
    } else {
      tbody.replaceChildren(...rows);
    }
  } catch (err) {
    tbody.replaceChildren(emptyRow(6, `Lỗi tải chi trả: ${err.message}`));
  }
}

/* -------------------------------------------------------------------------
 * Payout Form & Batch Runner Actions
 * ---------------------------------------------------------------------- */
function initPayoutForm() {
  const form = $('payout-form');
  const submitBtn = $('payout-submit');

  // Quick Chips — cộng tiền bằng BigInt (B10). `parseFloat('0.1') + parseFloat('0.2')`
  // ra 0.30000000000000004, và với tiền thì đó không phải chuyện làm tròn cho đẹp.
  document.querySelectorAll('.chip-add').forEach((chip) => {
    chip.addEventListener('click', () => {
      const input = $('amount-input');
      if (!input) return;

      const addParsed = parseAmountToMicro(chip.dataset.add ?? '');
      if (addParsed.error) return;

      const currentRaw = input.value.trim();
      const currentParsed = currentRaw === '' ? { micro: '0' } : parseAmountToMicro(currentRaw);
      if (currentParsed.error) {
        toast(`Số tiền hiện tại không hợp lệ: ${currentParsed.error}`, 'error');
        return;
      }

      const next = BigInt(currentParsed.micro) + BigInt(addParsed.micro);
      input.value = formatUsdc(next.toString()).replace(/\./g, '').replace(',', '.');
      input.focus();
    });
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const workerId = $('worker-select').value;
      const rawAmount = $('amount-input').value.trim();
      const reference = $('reference-input').value.trim();

      if (!workerId) {
        toast('Vui lòng chọn người nhận tiền', 'error');
        return;
      }

      const parsed = parseAmountToMicro(rawAmount);
      if (parsed.error) {
        toast(`Số tiền không hợp lệ: ${parsed.error}`, 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang đưa vào hàng đợi…';

      try {
        const idempotencyKey = `payout_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const res = await api('/v1/payouts', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            workerId,
            amount_micro: parsed.micro,
            reference: reference || undefined,
          },
        });

        toast(`Đã đưa khoản chi trả ${formatUsdc(parsed.micro)} USDC vào hàng đợi!`, 'success');
        form.reset();
        await refreshAll();
      } catch (err) {
        toast(`Lỗi tạo payout: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đưa vào hàng đợi chi trả';
      }
    });
  }

  // Nút chi trả thử 1-click (Demo)
  const quickDemoBtn = $('quick-demo-payout');
  if (quickDemoBtn) {
    quickDemoBtn.addEventListener('click', async () => {
      quickDemoBtn.disabled = true;
      quickDemoBtn.textContent = '⚡ Đang gửi $25…';

      try {
        const targetWorker = state.allWorkers[0];
        if (!targetWorker) throw new Error('Chưa có dữ liệu danh bạ người nhận.');

        const idempotencyKey = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await api('/v1/payouts', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            workerId: targetWorker.id,
            amount_micro: '25000000',
            reference: 'Demo: Thù lao tức thì chuyến xe #ARC-DEMO',
          },
        });

        toast(`⚡ Đã chi trả thử 25.00 USDC cho ${targetWorker.displayName || targetWorker.externalId}! Khoản tiền đã vào hàng đợi.`, 'success');
        await refreshAll();
      } catch (err) {
        toast(`Lỗi chi trả thử: ${err.message}`, 'error');
      } finally {
        quickDemoBtn.disabled = false;
        quickDemoBtn.textContent = '⚡ Chi trả thử $25 (1-Click Demo)';
      }
    });
  }

  // Quick driver selection chips
  document.querySelectorAll('.chip-driver-select').forEach((btn) => {
    btn.addEventListener('click', () => {
      const extId = btn.dataset.worker;
      const worker = state.workersByExternalId.get(extId);
      if (worker && $('worker-select')) {
        $('worker-select').value = worker.id;
        $('amount-input').value = '25';
        toast(`Đã chọn tài xế ${worker.displayName || worker.externalId} (Mặc định: $25 USDC)`, 'info');
      }
    });
  });

  // Batch Runner
  const runBtn = $('run-batcher');
  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      runBtn.textContent = '⚡ Đang gom lô…';

      try {
        const res = await api('/v1/batches/from-queue', { method: 'POST' });

        if (res.batches && res.batches.length > 0) {
          toast(`Đã gom thành công ${res.payoutCount} payout thành ${res.batches.length} lô Arc!`, 'success');
        } else {
          toast(res.message || 'Hàng đợi rỗng, không có payout nào cần gom.', 'info');
        }

        await refreshAll();
      } catch (err) {
        toast(`Lỗi gom lô: ${err.message}`, 'error');
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = '⚡ Gom lô hàng đợi';
      }
    });
  }

  // Refresh Button
  const refreshBtn = $('refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      toast('Đang làm mới dữ liệu từ Database…', 'info');
      await refreshAll();
      toast('Dữ liệu đã được cập nhật mới nhất!', 'success');
    });
  }

  // Filter Buttons
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('filter-btn--active'));
      btn.classList.add('filter-btn--active');
      state.activeFilter = btn.dataset.filter;
      loadPayouts();
    });
  });

  // Load More Button
  const loadMoreBtn = $('load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      if (state.nextCursor) loadPayouts(state.nextCursor);
    });
  }
}

async function refreshAll() {
  await Promise.allSettled([loadMe(), loadOverview(), loadPayouts(), loadWorkers(), loadSettleableBatches()]);
}

/* -------------------------------------------------------------------------
 * Settlement Loop (báo giá → gửi → đối soát)
 *
 * Ba bước là ba lần bấm riêng biệt. Không có nút nào tự động gọi bước sau: mỗi bước
 * đều có thể sai theo cách không hoàn tác được, và người vận hành phải thấy con số
 * trước khi đồng ý với nó.
 * ---------------------------------------------------------------------- */

async function loadMe() {
  try {
    const me = await api('/v1/me');
    state.me = me;
    renderPlatformIdentity(me);
    renderChainStatus(me);
    return me;
  } catch {
    // Không có `/v1/me` nghĩa là key không dùng được. Nhãn phải nói "—", không được
    // để một tên nền tảng cũ nằm lại trên thanh tiêu đề.
    state.me = null;
    renderPlatformIdentity(null);
    renderChainStatus(null);
    return null;
  }
}

function renderPlatformIdentity(me) {
  const pill = $('platform-pill');
  if (!pill) return;

  if (!me) {
    pill.replaceChildren(document.createTextNode('—'));
    return;
  }

  const children = [document.createTextNode(me.name ?? me.id ?? '—')];
  // Cờ demo đến từ DB (`platforms.is_demo`), không suy ra từ tên khoá API. Một khoá
  // thật có chữ "seed" trong tên không được dán nhãn demo, và ngược lại.
  if (me.isDemo) {
    children.push(document.createTextNode(' '));
    children.push(el('span', { class: 'demo-badge', text: 'Dữ liệu demo · sẽ reset' }));
  }
  pill.replaceChildren(...children);
}

function renderChainStatus(me) {
  const chain = me?.chain;
  const configured = chain?.configured === true;

  const unconfigured = $('chain-unconfigured');
  if (unconfigured) unconfigured.hidden = configured;

  setTextOrDash('chain-network', configured ? chain.network : null);
  setTextOrDash('chain-id', configured ? String(chain.chainId) : null);
  setTextOrDash('chain-relayer', configured ? shortenAddress(chain.relayerAddress) : null);
  setTextOrDash('chain-usdc', configured ? shortenAddress(chain.usdcAddress) : null);

  const relayer = $('chain-relayer');
  if (relayer && configured) relayer.title = chain.relayerAddress;
  const usdc = $('chain-usdc');
  if (usdc && configured) usdc.title = chain.usdcAddress;

  // Không có khoá thì hai nút gửi/đối soát phải tắt ngay từ đầu. Để chúng sáng lên
  // rồi báo lỗi 503 sau khi bấm là dạy người dùng rằng nút không đáng tin.
  for (const id of ['settle-quote-btn', 'settle-confirm-btn']) {
    const btn = $(id);
    if (btn) btn.disabled = !configured;
  }
  if (!configured) {
    const submit = $('settle-submit-btn');
    if (submit) submit.disabled = true;
  }
}

async function loadSettleableBatches() {
  const select = $('settle-batch-select');
  const help = $('settle-batch-help');
  if (!select) return;

  try {
    const res = await api('/v1/settlement/batches?limit=50');
    const batches = res.batches ?? [];

    if (batches.length === 0) {
      select.replaceChildren(el('option', { value: '' }, '— Không có lô nào đang chờ —'));
      if (help) {
        help.textContent =
          'Không có lô ở trạng thái "Chờ gửi". Tạo payout mới ở tab Vận hành rồi bấm "Gom lô hàng đợi".';
      }
      state.settleBatchId = null;
      return;
    }

    select.replaceChildren(
      el('option', { value: '' }, '-- Chọn lô cần thanh toán --'),
      ...batches.map((b) => {
        const label = `${b.id} · ${b.payoutCount} người · ${formatUsdc(b.total_micro)} USDC · ${STATE_LABEL[b.state] ?? b.state}`;
        return el('option', { value: b.id }, label);
      }),
    );

    if (help) help.textContent = `${batches.length} lô đang chờ xử lý, lô cũ nhất ở đầu danh sách.`;

    // Giữ lựa chọn hiện tại nếu lô đó vẫn còn trong danh sách.
    if (state.settleBatchId && batches.some((b) => b.id === state.settleBatchId)) {
      select.value = state.settleBatchId;
    }
  } catch (err) {
    select.replaceChildren(el('option', { value: '' }, 'Lỗi tải danh sách lô'));
    if (help) help.textContent = `Không tải được danh sách lô: ${err.message}`;
  }
}

function initSettlement() {
  const select = $('settle-batch-select');
  const quoteBtn = $('settle-quote-btn');
  const reloadBtn = $('settle-reload-btn');
  const submitBtn = $('settle-submit-btn');
  const confirmBtn = $('settle-confirm-btn');

  if (select) {
    select.addEventListener('change', async () => {
      state.settleBatchId = select.value || null;
      state.settleQuote = null;
      hideQuote();
      if (state.settleBatchId) await loadSettlementDetail(state.settleBatchId, { silent: true });
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      await loadSettleableBatches();
      if (state.settleBatchId) await loadSettlementDetail(state.settleBatchId, { silent: true });
      toast('Đã tải lại danh sách lô.', 'info');
    });
  }

  if (quoteBtn) {
    quoteBtn.addEventListener('click', async () => {
      const batchId = requireSelectedBatch();
      if (!batchId) return;

      setBusy(quoteBtn, true, 'Đang báo giá…');
      try {
        const quote = await api(`/v1/settlement/batches/${encodeURIComponent(batchId)}/quote`, { method: 'POST' });
        state.settleQuote = quote;
        paintQuote(quote);
        await loadSettlementDetail(batchId, { silent: true });
      } catch (err) {
        hideQuote();
        toast(`Không báo giá được: ${err.message}`, 'error');
      } finally {
        setBusy(quoteBtn, false, 'Báo giá phí');
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const batchId = requireSelectedBatch();
      if (!batchId) return;

      if (!state.settleQuote) {
        toast('Phải báo giá trước khi gửi.', 'error');
        return;
      }

      // Xác nhận lần hai: đây là hành động duy nhất trong sản phẩm không thể hoàn tác.
      const total = formatUsdc(state.settleQuote.total_micro);
      const count = state.settleQuote.payoutCount;
      const ok = window.confirm(
        `Gửi ${count} giao dịch USDC (tổng ${total} USDC + phí) lên Arc?\n\n` +
          'Thao tác này không thể hoàn tác. Hệ thống sẽ trả về ngay khi transaction được broadcast.',
      );
      if (!ok) return;

      setBusy(submitBtn, true, 'Đang gửi lên Arc…');
      try {
        const res = await api(`/v1/settlement/batches/${encodeURIComponent(batchId)}/submit`, { method: 'POST' });
        toast(
          `Đã broadcast ${res.sentCount}/${res.sentCount + res.failedToSendCount} giao dịch. ` +
            'Bấm "Đọc receipt từ Arc" sau vài giây để xác nhận.',
          res.failedToSendCount > 0 ? 'error' : 'success',
        );
        state.settleQuote = null;
        hideQuote();
        await refreshAll();
        await loadSettlementDetail(batchId, { silent: true });
      } catch (err) {
        toast(`Gửi thất bại: ${err.message}`, 'error');
        // Báo giá có thể đã bị tiêu do lỗi nonce/số dư: buộc báo giá lại thay vì để
        // người dùng bấm "Gửi" lần nữa với con số cũ.
        state.settleQuote = null;
        hideQuote();
      } finally {
        setBusy(submitBtn, false, 'Gửi lên Arc');
      }
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const batchId = requireSelectedBatch();
      if (!batchId) return;

      setBusy(confirmBtn, true, 'Đang đọc receipt…');
      try {
        const res = await api(`/v1/settlement/batches/${encodeURIComponent(batchId)}/confirm`, { method: 'POST' });
        const tally = res.tally ?? {};
        toast(
          `Đối soát xong: ${tally.confirmedCount ?? 0} đã trả, ${tally.submittedCount ?? 0} còn chờ, ` +
            `${tally.failedCount ?? 0} thất bại.`,
          tally.failedCount > 0 ? 'error' : 'success',
        );
        await refreshAll();
        await loadSettlementDetail(batchId, { silent: true });
      } catch (err) {
        toast(`Không đối soát được: ${err.message}`, 'error');
      } finally {
        setBusy(confirmBtn, false, 'Đọc receipt từ Arc');
      }
    });
  }
}

function requireSelectedBatch() {
  const select = $('settle-batch-select');
  const batchId = select?.value || state.settleBatchId;
  if (!batchId) {
    toast('Chọn một lô trước đã.', 'error');
    return null;
  }
  state.settleBatchId = batchId;
  return batchId;
}

/** Bật/tắt trạng thái bận của nút: spinner nội tuyến + nhãn, không spinner toàn màn hình. */
function setBusy(button, busy, label) {
  if (!button) return;
  button.classList.toggle('is-busy', busy);
  button.disabled = busy;
  const labelNode = button.querySelector('.btn__label');
  if (labelNode) labelNode.textContent = label;
}

function hideQuote() {
  const box = $('quote-box');
  if (box) box.hidden = true;
  const submit = $('settle-submit-btn');
  if (submit) submit.disabled = true;
}

function paintQuote(quote) {
  const box = $('quote-box');
  if (!box) return;
  box.hidden = false;

  setTextOrDash('quote-count', `${quote.payoutCount} payout`);
  setTextOrDash('quote-total', `${formatUsdc(quote.total_micro)} USDC`);
  setTextOrDash('quote-gas-per', `${Number(quote.gasPerTransfer).toLocaleString('vi-VN')} gas`);
  setTextOrDash('quote-gas', `${Number(quote.gas).toLocaleString('vi-VN')} gas`);
  setTextOrDash('quote-fee-gas', `${formatGwei(quote.maxFeePerGasWei)} Gwei`);
  setTextOrDash('quote-fee', `${formatUsdc(quote.maxFeeMicro)} USDC`);
  setTextOrDash('quote-balance', `${formatUsdc(quote.relayerBalanceMicro)} USDC`);

  // Nói rõ gas là số đo hay cận trên. Hai thứ này khác nhau về mức tin cậy, và người
  // vận hành cần biết mình đang nhìn cái nào.
  setTextOrDash('quote-source', quote.gasMeasured ? 'Đo từ Arc (estimateGas)' : 'Cận trên ví lạnh 75.000');

  const verdict = $('quote-verdict');
  if (verdict) {
    if (quote.affordable) {
      verdict.className = 'quote-verdict quote-verdict--ok';
      verdict.textContent =
        'Đủ số dư cho cả tiền lẫn phí tối đa. Báo giá có hiệu lực 5 phút kể từ lúc tạo.';
    } else {
      verdict.className = 'quote-verdict quote-verdict--short';
      verdict.textContent =
        `Thiếu ${formatUsdc(quote.shortfallMicro)} USDC. Nạp thêm vào ví relayer ` +
        `${shortenAddress(quote.relayerAddress)} rồi báo giá lại.`;
    }
  }

  if (quote.skippedWithoutAddress > 0) {
    toast(`${quote.skippedWithoutAddress} payout bị bỏ qua vì người nhận chưa có địa chỉ ví.`, 'error');
  }

  const submit = $('settle-submit-btn');
  if (submit) submit.disabled = !quote.affordable || state.me?.chain?.configured !== true;
}

/** wei → Gwei, giữ 2 chữ số thập phân, tính bằng BigInt (không đi qua Number). */
function formatGwei(weiText) {
  let wei;
  try {
    wei = BigInt(weiText);
  } catch {
    return '—';
  }
  const gwei = wei / 1_000_000_000n;
  const fraction = ((wei % 1_000_000_000n) / 10_000_000n).toString().padStart(2, '0');
  return `${gwei.toLocaleString('vi-VN')},${fraction}`;
}

async function loadSettlementDetail(batchId, options = {}) {
  const tbody = $('settle-payouts-body');
  if (!tbody) return;

  if (!options.silent) {
    tbody.replaceChildren(emptyRow(5, 'Đang tải chi tiết lô…'));
  }

  try {
    const detail = await api(`/v1/settlement/batches/${encodeURIComponent(batchId)}`);
    state.settleDetail = detail;

    const tally = detail.tally ?? {};
    setTextOrDash('settle-confirmed', String(tally.confirmedCount ?? 0));
    setTextOrDash('settle-pending', String(tally.submittedCount ?? 0));
    setTextOrDash('settle-failed', String(tally.failedCount ?? 0));

    const modePill = $('settle-mode-pill');
    if (modePill) {
      modePill.textContent = SETTLEMENT_MODE_LABEL[detail.settlementMode] ?? detail.settlementMode ?? '—';
    }

    const sub = $('settle-payouts-sub');
    if (sub) {
      sub.textContent =
        `Lô ${detail.batchId} · ${detail.payouts.length} payout · trạng thái ${STATE_LABEL[detail.state] ?? detail.state}`;
    }

    const confirmBtn = $('settle-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = !detail.canConfirm || detail.chainConfigured !== true;

    const submitBtn = $('settle-submit-btn');
    if (submitBtn && !state.settleQuote) submitBtn.disabled = true;

    if (detail.payouts.length === 0) {
      tbody.replaceChildren(emptyRow(5, 'Lô này không có payout nào.'));
      return;
    }

    const network = detail.network ?? state.me?.chain?.network ?? 'testnet';

    const rows = detail.payouts.map((p) => {
      const hash = p.txHash;
      const blockGas =
        p.blockNumber === null && p.gasUsed === null
          ? '—'
          : `${p.blockNumber ?? '—'} / ${p.gasUsed ? Number(p.gasUsed).toLocaleString('vi-VN') : '—'}`;

      return el(
        'tr',
        {},
        el('td', { class: 'mono', text: p.id }),
        el('td', { class: 'num', text: formatUsdc(p.amount_micro) }),
        el(
          'td',
          {},
          el('span', { class: `status-pill status-pill--${p.state}`, text: STATE_LABEL[p.state] ?? p.state }),
          p.failureReason
            ? el('div', { class: 'receipt-note', text: p.failureReason })
            : null,
        ),
        el('td', {}, hash ? txLink(hash, network) : document.createTextNode('—')),
        el('td', { class: 'num mono', text: blockGas }),
      );
    });

    tbody.replaceChildren(...rows);
  } catch (err) {
    if (!options.silent) {
      tbody.replaceChildren(emptyRow(5, `Lỗi tải chi tiết lô: ${err.message}`));
    }
  }
}

/* -------------------------------------------------------------------------
 * Public receipt view — `?claim=<token>`, không cần API key
 *
 * Người lao động gig không có tài khoản ở đây. Cách duy nhất để họ tự kiểm là một
 * đường link, và link đó phải hoạt động mà không đòi đăng nhập.
 * ---------------------------------------------------------------------- */

const RECEIPT_STATE_LABEL = {
  pending: 'Đang chờ',
  sending: 'Đang gửi',
  paid: 'Đã nhận',
  failed: 'Thất bại',
  checking: 'Đang kiểm tra',
};

async function initReceiptView(token) {
  const shell = $('shell');
  const gate = $('gate');
  const page = $('receipt-page');

  if (shell) shell.hidden = true;
  if (gate) gate.hidden = true;
  if (page) page.hidden = false;

  const status = $('receipt-status');
  const body = $('receipt-body');

  try {
    // Không Authorization header: `api()` sẽ tự gắn key nếu có, nên gọi fetch trực tiếp.
    const res = await fetch(`/v1/receipts/${encodeURIComponent(token)}`);
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error?.message ?? `Không mở được biên nhận (${res.status}).`);
    }
    const data = await res.json();

    if (status) status.textContent = `${data.platformName} · ${data.worker.displayName ?? data.worker.externalId}`;
    if (body) body.hidden = false;

    setTextOrDash('receipt-name', data.worker.displayName ?? data.worker.externalId);
    setTextOrDash('receipt-ext-id', `Mã: ${data.worker.externalId}`);
    setTextOrDash('receipt-paid', `${formatUsdc(data.totals.paid_micro)} USDC`);
    setTextOrDash('receipt-pending', `${formatUsdc(data.totals.pending_micro)} USDC`);

    const walletNote = $('receipt-wallet-note');
    if (walletNote) {
      walletNote.textContent = data.worker.hasWallet
        ? 'Tài khoản của bạn đã liên kết ví nhận tiền.'
        : 'Tài khoản của bạn chưa liên kết ví. Liên hệ nền tảng để cập nhật trước khi được chi trả.';
    }

    const list = $('receipt-list');
    if (list) {
      if (data.receipts.length === 0) {
        list.replaceChildren(el('div', { class: 'empty', text: 'Chưa có khoản chi trả nào.' }));
      } else {
        list.replaceChildren(
          ...data.receipts.map((item) =>
            el(
              'div',
              { class: 'receipt-item glass' },
              el(
                'div',
                { class: 'receipt-item__left' },
                el('span', { class: 'receipt-item__ref', text: item.reference || 'Thanh toán lương gig' }),
                el(
                  'span',
                  { class: 'receipt-item__date mono', text: `${formatDate(item.paid_at ?? item.created_at)} · ${item.id}` },
                ),
                item.txHash
                  ? el('span', {}, txLink(item.txHash, item.network ?? 'testnet'))
                  : el('span', { class: 'receipt-note', text: 'Chưa có giao dịch on-chain cho khoản này.' }),
              ),
              el(
                'div',
                { class: 'receipt-item__right' },
                el('span', { class: 'receipt-item__amount mono', text: `${formatUsdc(item.amount_micro)} USDC` }),
                el('div', {}, el('span', { class: `status-pill status-pill--${item.state === 'paid' ? 'confirmed' : item.state}`, text: RECEIPT_STATE_LABEL[item.state] ?? item.state })),
                item.isDemo ? el('span', { class: 'demo-badge', text: 'demo' }) : null,
              ),
            ),
          ),
        );
      }
    }

    if (status) status.dataset.loaded = 'true';
  } catch (err) {
    if (status) status.textContent = err.message;
    if (body) body.hidden = true;
  }
}

/* -------------------------------------------------------------------------
 * Authentication & Gate Flow
 * ---------------------------------------------------------------------- */
function initGate() {
  const form = $('gate-form');
  const pasteSeedBtn = $('gate-paste-seed');
  const keyInput = $('api-key-input');
  const gateError = $('gate-error');

  if (pasteSeedBtn && keyInput) {
    pasteSeedBtn.addEventListener('click', () => {
      keyInput.value = DEMO_SEED_API_KEY;
      form.requestSubmit();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = keyInput.value.trim();
      if (!key) return;

      gateError.textContent = 'Đang kiểm tra khoá API…';
      state.apiKey = key;

      try {
        await api('/v1/overview');
        localStorage.setItem(STORAGE_KEY, key);
        $('gate').hidden = true;
        $('shell').hidden = false;
        gateError.textContent = '';
        toast('Kết nối thành công tới Nhịp Arc L1!', 'success');
        // Nhãn nền tảng + cấu hình chain lấy từ `/v1/me` bên trong `refreshAll`; không gán
        // cứng tên hay id ở đây, vì làm vậy sẽ đúng với demo và sai với mọi khách khác.
        await refreshAll();
      } catch (err) {
        state.apiKey = null;
        gateError.textContent = `API key không hợp lệ hoặc lỗi kết nối: ${err.message}`;
      }
    });
  }

  const disconnectBtn = $('disconnect');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', disconnect);
  }
}

function disconnect() {
  localStorage.removeItem(STORAGE_KEY);
  state.apiKey = null;
  // Xoá cả trạng thái settlement: giữ báo giá của phiên trước nghĩa là người dùng có thể
  // bấm "Gửi" bằng một con số thuộc về một danh tính khác.
  state.me = null;
  state.settleBatchId = null;
  state.settleQuote = null;
  state.settleDetail = null;

  $('shell').hidden = true;
  $('gate').hidden = false;
  $('api-key-input').value = '';
  hideQuote();
  renderPlatformIdentity(null);
  renderChainStatus(null);
  paintOverviewError();
  toast('Đã ngắt kết nối API key.', 'info');
}

/* -------------------------------------------------------------------------
 * Health Checker (Đo latency và trạng thái DB)
 * ---------------------------------------------------------------------- */
async function checkHealth() {
  const pill = $('health-pill');
  const text = $('health-text');

  try {
    const t0 = performance.now();
    const res = await api('/health');
    const t1 = performance.now();
    const latency = Math.round(t1 - t0);

    if (res.status === 'ok') {
      pill.className = 'pill pill--live';
      text.textContent = `Arc DB · ${latency}ms`;
    } else {
      pill.className = 'pill pill--ghost';
      text.textContent = 'DB Chưa sẵn sàng';
    }
  } catch {
    pill.className = 'pill pill--ghost';
    text.textContent = 'Mất kết nối API';
  }
}

/* -------------------------------------------------------------------------
 * Application Bootstrap
 * ---------------------------------------------------------------------- */
async function initApp() {
  initTheme();

  // Trang biên nhận là một chế độ **riêng**, không phải một tab: người mở link không
  // có API key, không được (và không cần) thấy dashboard. Nhận diện trước khi init bất
  // kỳ module nào của shell, và return sớm để không gọi endpoint cần xác thực.
  const claimToken = new URLSearchParams(window.location.search).get('claim');
  if (claimToken) {
    await initReceiptView(claimToken);
    return;
  }

  initTabs();
  initCommandPalette();
  initBatchDrawer();
  initSavingsCalculator();
  initBulkPlanner();
  initWorkerPortal();
  initPayoutForm();
  initSettlement();
  initGate();

  // Khoá lưu trong máy, hoặc khoá seed của môi trường demo. Đây là **điểm vào duy nhất**
  // của bản demo; nhãn "demo" trên giao diện vẫn do `isDemo` từ API quyết định.
  state.apiKey = localStorage.getItem(STORAGE_KEY) || DEMO_SEED_API_KEY;

  if ($('gate')) $('gate').hidden = true;
  if ($('shell')) $('shell').hidden = false;

  await refreshAll();

  // Tự động nạp tài xế mẫu trong Cổng Tra Cứu Tài Xế (học ezwallet.cash)
  setTimeout(() => {
    const lookupInput = $('worker-lookup-input');
    const lookupForm = $('worker-lookup-form');
    if (lookupInput && lookupForm) {
      lookupInput.value = 'driver-001';
      lookupForm.requestSubmit();
    }
  }, 600);

  checkHealth();
  state.healthTimer = setInterval(checkHealth, 15000);
}

document.addEventListener('DOMContentLoaded', initApp);
