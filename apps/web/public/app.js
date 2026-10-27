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

const STATE_LABEL = {
  queued: 'Chờ',
  batched: 'Trong lô',
  submitted: 'Đã gửi Arc',
  confirmed: 'Đã chi trả',
  failed: 'Lỗi',
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
  $('drawer-batch-tx').textContent = '—';

  const tbody = $('drawer-payouts-body');
  tbody.replaceChildren(emptyRow(4, 'Đang tải chi tiết các giao dịch trong lô…'));

  try {
    const data = await api(`/v1/batches/${encodeURIComponent(batchId)}`);
    $('drawer-batch-state').textContent = STATE_LABEL[data.state] ?? data.state;
    $('drawer-batch-count').textContent = `${data.payoutCount} khoản`;
    $('drawer-batch-total').textContent = `${formatUsdc(data.total_micro)} USDC`;
    $('drawer-batch-gas').textContent = `${(data.estimatedGas ?? 0).toLocaleString('vi-VN')} gas`;
    $('drawer-batch-tx').textContent = data.txHash ?? 'Chưa gửi lên chain (MVP)';

    if (!data.payouts || data.payouts.length === 0) {
      tbody.replaceChildren(emptyRow(4, 'Lô này không có payout nào.'));
      return;
    }

    const rows = data.payouts.map((p) => {
      const worker = state.workersById.get(p.workerId);
      const recipientName = worker?.displayName ?? worker?.externalId ?? shortenAddress(p.workerId);

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

  function update() {
    const count = parseInt(slider.value, 10) || 5000;
    countDisplay.textContent = `${count.toLocaleString('vi-VN')} người/ngày`;

    // Ethereum: ~$2.52 gas/payout
    const ethYearly = Math.round(count * 2.52 * 365);
    // Arc (Circle L1): ~$0.0006 gas/payout
    const arcYearly = Math.round(count * 0.0006 * 365);
    const savedYearly = ethYearly - arcYearly;

    ethCost.textContent = `$${ethYearly.toLocaleString('vi-VN')}`;
    arcCost.textContent = `$${arcYearly.toLocaleString('vi-VN')}`;
    saved.textContent = `$${savedYearly.toLocaleString('vi-VN')}`;
  }

  slider.addEventListener('input', update);
  update();
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
      // Giả định trần gas 10M với 28.000 gas/payout ~ 350 payouts/lô
      batchesEstEl.textContent = String(Math.ceil(valid / 350) || (valid > 0 ? 1 : 0));

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

      return el(
        'tr',
        {},
        el('td', { class: 'mono', text: w.externalId }),
        el('td', { text: w.displayName || '—' }),
        el('td', { class: 'mono', text: w.address ? shortenAddress(w.address) : 'Chưa có ví' }),
        el('td', { text: formatDate(w.created_at) }),
        el('td', { class: 'num' }, payBtn),
      );
    });

    tbody.replaceChildren(...rows);
  } catch {
    $('worker-select').replaceChildren(el('option', { value: '' }, 'Lỗi tải danh bạ người nhận'));
  }
}

function paintOverview(ov) {
  // Bất biến B9: cấm hiện 0 khi chưa tải/lỗi. Nếu có ov hợp lệ thì hiện số thật.
  $('kpi-queued-count').textContent = (ov.queued?.count ?? 0).toLocaleString('vi-VN');
  $('kpi-queued-amount').textContent = formatUsdc(ov.queued?.totalMicro ?? ov.queued?.total_micro ?? '0');

  $('kpi-batched-count').textContent = (ov.batched?.count ?? 0).toLocaleString('vi-VN');
  $('kpi-batched-amount').textContent = formatUsdc(ov.batched?.totalMicro ?? ov.batched?.total_micro ?? '0');

  $('kpi-confirmed-count').textContent = (ov.confirmed?.count ?? 0).toLocaleString('vi-VN');
  $('kpi-confirmed-amount').textContent = formatUsdc(ov.confirmed?.totalMicro ?? ov.confirmed?.total_micro ?? '0');

  const total = (ov.queued?.count ?? 0) + (ov.batched?.count ?? 0) + (ov.confirmed?.count ?? 0) + (ov.failed?.count ?? 0);
  const settled = ov.confirmed?.count ?? 0;
  const ratePct = total > 0 ? Math.round((settled / total) * 100) : 100;

  $('kpi-rate').textContent = `${ratePct}%`;
  $('kpi-rate-bar').style.width = `${ratePct}%`;
  $('kpi-workers').textContent = String(ov.workers ?? 0);
  $('kpi-batches').textContent = String(ov.batches ?? 0);

  // Bars
  const max = Math.max(ov.queued?.count ?? 0, ov.batched?.count ?? 0, ov.confirmed?.count ?? 0, 1);
  $('kpi-queued-bar').style.width = `${Math.round(((ov.queued?.count ?? 0) / max) * 100)}%`;
  $('kpi-batched-bar').style.width = `${Math.round(((ov.batched?.count ?? 0) / max) * 100)}%`;
  $('kpi-confirmed-bar').style.width = `${Math.round(((ov.confirmed?.count ?? 0) / max) * 100)}%`;

  // Render recent batches
  const batchesBody = $('batches-body');
  const batches = ov.recentBatches ?? [];
  state.batchesById.clear();

  if (batches.length === 0) {
    batchesBody.replaceChildren(emptyRow(5, 'Chưa có lô thanh toán nào. Bấm "Gom lô" để bắt đầu.'));
    return;
  }

  const batchRows = batches.map((b) => {
    state.batchesById.set(b.id, b);
    const row = el(
      'tr',
      { style: 'cursor: pointer;' },
      el('td', { class: 'mono', text: b.id }),
      el('td', {}, el('span', { class: `status-pill status-pill--${b.state}`, text: STATE_LABEL[b.state] ?? b.state })),
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
  $('kpi-queued-count').textContent = '—';
  $('kpi-queued-amount').textContent = '—';
  $('kpi-batched-count').textContent = '—';
  $('kpi-batched-amount').textContent = '—';
  $('kpi-confirmed-count').textContent = '—';
  $('kpi-confirmed-amount').textContent = '—';
  $('kpi-rate').textContent = '—';
  $('kpi-workers').textContent = '—';
  $('kpi-batches').textContent = '—';
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

  // Quick Chips
  document.querySelectorAll('.chip-add').forEach((chip) => {
    chip.addEventListener('click', () => {
      const add = chip.dataset.add;
      const input = $('amount-input');
      const cur = parseFloat(input.value) || 0;
      input.value = (cur + parseFloat(add)).toString();
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
        const idempotencyKey = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const res = await api('/v1/batches/run', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
        });

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
  await Promise.allSettled([loadOverview(), loadPayouts(), loadWorkers()]);
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
      keyInput.value = 'nhip_sk_seed_00000000000000000000000000000001';
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
        $('platform-pill').textContent = 'plat_demo';
        gateError.textContent = '';
        toast('Kết nối thành công tới Nhịp Arc L1!', 'success');
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
  $('shell').hidden = true;
  $('gate').hidden = false;
  $('api-key-input').value = '';
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
  initTabs();
  initCommandPalette();
  initBatchDrawer();
  initSavingsCalculator();
  initBulkPlanner();
  initWorkerPortal();
  initPayoutForm();
  initGate();

  // Mặc định luôn nạp môi trường Demo Sandbox (Giao Hàng Nhanh) để người dùng trải nghiệm tức thì
  const savedKey = localStorage.getItem(STORAGE_KEY) || 'nhip_sk_seed_00000000000000000000000000000001';
  state.apiKey = savedKey;

  if ($('gate')) $('gate').hidden = true;
  if ($('shell')) $('shell').hidden = false;

  const pill = $('platform-pill');
  if (pill) {
    pill.textContent = savedKey.includes('seed') ? 'Giao Hàng Nhanh (Demo Sandbox)' : 'Live Enterprise';
  }

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
