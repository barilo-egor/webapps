import React, { useEffect, useState, useCallback, useRef } from 'react';
import './App.css';

// =============================================================
// API КЛИЕНТ
// =============================================================
const apiFetch = async (url, options = {}) => {
  const initData = window.Telegram?.WebApp?.initData || '';
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData, ...(options.headers || {}) },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch {}
    throw new Error(`${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return data;
};

// Как apiFetch, но дополнительно возвращает общее число записей из заголовка X-Total-Count.
// (Бэк должен отдавать Access-Control-Expose-Headers: X-Total-Count, иначе total = null.)
const apiFetchWithTotal = async (url, options = {}) => {
  const initData = window.Telegram?.WebApp?.initData || '';
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData, ...(options.headers || {}) },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch {}
    throw new Error(`${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  const totalRaw = res.headers.get('X-Total-Count');
  const total = totalRaw != null && totalRaw !== '' ? Number(totalRaw) : null;
  return { data, total };
};

const realApi = {
  // POST /api/merchant-histories — список записей. Возвращает { data: [...], total }.
  list: (body) => apiFetchWithTotal('/api/merchant-histories', { method: 'POST', body: JSON.stringify(body) }),
  // GET /api/filters/merchants — справочник мерчантов для фильтра.
  merchants: () => apiFetch('/api/filters/merchants'),
};

// =============================================================
// MOCK API
// =============================================================
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const MOCK_MERCHANTS = ['ALFA_TEAM','NOROS','YOLO','DEORA','LOTRIEN','EXTASY_PAY','BASE_51','ECLIPSE_GATE','SOUZ','MERIDIAN_PAY','ASGARD','GAMBIT','STORM_TRADE','PAY_LEE','CROCO_PAY'];
const MOCK_METHODS = ['CARD','SBP','SBER_QR','TO_CARD'];
const MOCK_BOTS = ['MainBot','PaymentBot','TradeBot','SupportBot','rce-dev3'];
const MOCK_BANKS = ['СберБанк','Т-Банк','ВТБ','Озон Банк','Альфа-Банк'];

function buildMockRecords() {
  const rows = [];
  let seed = 20260603;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const hex = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');
  const uuid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
  const base = Date.parse('2026-06-03T15:22:28Z');
  for (let i = 0; i < 95; i++) {
    const method = MOCK_METHODS[Math.floor(rnd() * MOCK_METHODS.length)];
    const hasDetails = method === 'CARD' || method === 'TO_CARD';
    const reqAmount = Math.round(1000 + rnd() * 59000);
    const hasMerchAmount = rnd() > 0.4;
    rows.push({
      dealId: 1780500142646 - Math.floor(rnd() * 9e8),
      userId: 100000000 + Math.floor(rnd() * 899999999),
      initiatorApp: MOCK_BOTS[Math.floor(rnd() * MOCK_BOTS.length)],
      createdAt: new Date(base - i * (rnd() * 9 + 1) * 3600 * 1000).toISOString(),
      merchant: MOCK_MERCHANTS[Math.floor(rnd() * MOCK_MERCHANTS.length)],
      merchantOrderId: rnd() > 0.5 ? uuid() : String(100000 + Math.floor(rnd() * 900000)),
      requestedAmount: reqAmount,
      merchantAmount: hasMerchAmount ? Math.round(reqAmount + (rnd() - 0.5) * 4000) : null,
      method,
      details: hasDetails ? `${MOCK_BANKS[Math.floor(rnd() * MOCK_BANKS.length)]} ${String(2000000000000000 + Math.floor(rnd() * 8e15)).slice(0, 16)}` : null,
    });
  }
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return rows;
}
const MOCK_RECORDS = buildMockRecords();

function mockFilterRows(rows, b) {
  return rows.filter((r) => {
    if (b.dealId != null && r.dealId !== b.dealId) return false;
    if (b.userId != null && r.userId !== b.userId) return false;
    if (b.details && !String(r.details ?? '').toLowerCase().includes(b.details.toLowerCase())) return false;
    if (b.initiatorApp && !String(r.initiatorApp ?? '').toLowerCase().includes(b.initiatorApp.toLowerCase())) return false;
    if (b.merchantOrderId && !String(r.merchantOrderId ?? '').toLowerCase().includes(b.merchantOrderId.toLowerCase())) return false;
    if (Array.isArray(b.merchants) && b.merchants.length && !b.merchants.includes(r.merchant)) return false;
    if (b.amount != null) {
      const ok = (r.merchantAmount != null && Math.round(r.merchantAmount) === b.amount) ||
          (r.requestedAmount != null && Math.round(r.requestedAmount) === b.amount);
      if (!ok) return false;
    }
    if (b.createdFrom && r.createdAt < b.createdFrom) return false;
    if (b.createdTo && r.createdAt > b.createdTo) return false;
    return true;
  });
}

const mockApi = {
  list: async (body) => {
    await delay(160);
    const filtered = mockFilterRows(JSON.parse(JSON.stringify(MOCK_RECORDS)), body);
    const page = body.page ?? 0, size = body.size ?? 30;
    return { data: filtered.slice(page * size, page * size + size), total: filtered.length };
  },
  merchants: async () => { await delay(100); return { merchants: [...MOCK_MERCHANTS] }; },
};

const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';
const api = USE_MOCK ? mockApi : realApi;
if (USE_MOCK) console.info('[merchant-history] Работает в MOCK-режиме (VITE_USE_MOCK=1)');

// =============================================================
// ОТОБРАЖАЕМЫЕ ИМЕНА
// =============================================================
const MERCHANT_LABEL = {};
function merchantLabel(code) {
  if (!code) return '';
  if (MERCHANT_LABEL[code]) return MERCHANT_LABEL[code];
  return code.toLowerCase().split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
const METHOD_LABEL = { SBP: 'СБП', CARD: 'Карта', SBER_QR: 'Сбер QR', TO_CARD: 'На карту' };
function methodLabel(code) {
  if (!code) return '';
  if (METHOD_LABEL[code]) return METHOD_LABEL[code];
  return code.toLowerCase().split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// =============================================================
// УТИЛИТЫ
// =============================================================
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function formatAmount(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =============================================================
// ФИЛЬТР → ТЕЛО ЗАПРОСА (имена полей из JSON-схемы бэка)
// =============================================================
const PAGE_SIZE = 30;
const EMPTY_FILTER = {
  dateMode: 'equal', dateEqual: '', dateFrom: '', dateTo: '',
  dealId: '', details: '', initiatorApp: '', merchants: [], amount: '', merchantOrderId: '', userId: '',
};

function buildBody(f, page) {
  const b = { page, size: PAGE_SIZE };
  if (f.dealId.trim() !== '') b.dealId = Number(f.dealId);
  if (f.userId.trim() !== '') b.userId = Number(f.userId);
  if (f.details.trim() !== '') b.details = f.details.trim();
  if (f.initiatorApp.trim() !== '') b.initiatorApp = f.initiatorApp.trim();
  if (f.merchantOrderId.trim() !== '') b.merchantOrderId = f.merchantOrderId.trim();
  if (f.merchants.length) b.merchants = f.merchants;
  if (f.amount.trim() !== '') b.amount = Number(f.amount);
  if (f.dateMode === 'equal') {
    if (f.dateEqual) { b.createdFrom = `${f.dateEqual}T00:00:00.000Z`; b.createdTo = `${f.dateEqual}T23:59:59.999Z`; }
  } else {
    if (f.dateFrom) b.createdFrom = `${f.dateFrom}T00:00:00.000Z`;
    if (f.dateTo) b.createdTo = `${f.dateTo}T23:59:59.999Z`;
  }
  return b;
}

// =============================================================
// ПАНЕЛЬ ФИЛЬТРОВ
// =============================================================
function FilterField({ icon, label, children }) {
  return (
      <div className="filter-field">
        <label className="filter-label">
          <i className={`${icon} filter-label-icon`} aria-hidden="true"></i>{label}
        </label>
        {children}
      </div>
  );
}

function MerchantSelect({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const toggle = (code) => onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const display = selected.length === 0 ? 'Все' : selected.map(merchantLabel).join(', ');
  return (
      <div className="ms" ref={ref}>
        <button type="button" className={`ms-control ${selected.length ? 'ms-control-filled' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="ms-value">{display}</span>
          <i className={`fas fa-chevron-down ms-chevron ${open ? 'open' : ''}`} aria-hidden="true"></i>
        </button>
        {open && (
            <div className="ms-dropdown" role="listbox">
              {options.map((code) => {
                const isSel = selected.includes(code);
                return (
                    <div key={code} className={`ms-option ${isSel ? 'ms-option-selected' : ''}`} role="option" aria-selected={isSel} onClick={() => toggle(code)}>
                      {merchantLabel(code)}
                    </div>
                );
              })}
            </div>
        )}
      </div>
  );
}

function FilterPanel({ draft, setDraft, merchants, onSearch, onReset, busy }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  return (
      <div className="section">
        <button type="button" className="section-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <i className="fas fa-sliders-h section-icon" aria-hidden="true"></i>
          <span className="section-title">Фильтрация</span>
          <i className={`fas fa-chevron-right section-chevron ${open ? 'open' : ''}`} aria-hidden="true"></i>
        </button>
        {open && (
            <div className="section-body">
              <div className="filter-grid">
                <FilterField icon="fas fa-calendar-alt" label="Дата">
                  <div className="date-field">
                    <select className="select" value={draft.dateMode} onChange={(e) => set({ dateMode: e.target.value })}>
                      <option value="equal">Равна</option>
                      <option value="range">Диапазон</option>
                    </select>
                    {draft.dateMode === 'equal' ? (
                        <input type="date" className="input" value={draft.dateEqual} onChange={(e) => set({ dateEqual: e.target.value })} />
                    ) : (
                        <div className="date-range">
                          <input type="date" className="input" value={draft.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
                          <input type="date" className="input" value={draft.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
                        </div>
                    )}
                  </div>
                </FilterField>
                <FilterField icon="fas fa-hashtag" label="№ сделки">
                  <input type="text" inputMode="numeric" className="input" value={draft.dealId} onChange={(e) => set({ dealId: e.target.value.replace(/[^\d]/g, '') })} />
                </FilterField>
                <FilterField icon="fas fa-credit-card" label="Реквизиты">
                  <input type="text" className="input" value={draft.details} onChange={(e) => set({ details: e.target.value })} />
                </FilterField>
                <FilterField icon="fas fa-robot" label="Название бота">
                  <input type="text" className="input" value={draft.initiatorApp} onChange={(e) => set({ initiatorApp: e.target.value })} />
                </FilterField>
                <FilterField icon="fas fa-store" label="Мерчант">
                  <MerchantSelect options={merchants} selected={draft.merchants} onChange={(merchants) => set({ merchants })} />
                </FilterField>
                <FilterField icon="fas fa-coins" label="Сумма">
                  <input type="text" inputMode="numeric" className="input" placeholder="целое число" value={draft.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d]/g, '') })} />
                </FilterField>
                <FilterField icon="fas fa-ticket-alt" label="Идентификатор ордера">
                  <input type="text" className="input" value={draft.merchantOrderId} onChange={(e) => set({ merchantOrderId: e.target.value })} />
                </FilterField>
                <FilterField icon="fab fa-telegram-plane" label="Chat ID пользователя">
                  <input type="text" inputMode="numeric" className="input" value={draft.userId} onChange={(e) => set({ userId: e.target.value.replace(/[^\d]/g, '') })} />
                </FilterField>
              </div>
              <div className="filter-actions">
                <button type="button" className="btn btn-secondary" onClick={onReset} disabled={busy}>
                  <i className="fas fa-undo-alt" aria-hidden="true"></i>Сбросить
                </button>
                <button type="button" className="btn btn-primary" onClick={onSearch} disabled={busy}>
                  <i className="fas fa-search" aria-hidden="true"></i>Поиск
                </button>
              </div>
            </div>
        )}
      </div>
  );
}

// =============================================================
// ТАБЛИЦА
// =============================================================
const COLUMNS = [
  { key: 'dealId', title: '№', tooltip: 'Номер сделки', align: 'left' },
  { key: 'createdAt', title: 'Дата и время', align: 'left' },
  { key: 'details', title: 'Реквизиты', align: 'left' },
  { key: 'initiatorApp', title: 'Бот', align: 'left' },
  { key: 'merchant', title: 'Мерчант', align: 'left' },
  { key: 'merchantAmount', title: 'Мерч.сумма', tooltip: 'Мерчантская сумма', align: 'right' },
  { key: 'requestedAmount', title: 'Запр.сумма', tooltip: 'Запрошенная сумма', align: 'right' },
  { key: 'method', title: 'Метод', align: 'center' },
  { key: 'merchantOrderId', title: 'Ордер ID', align: 'left' },
  { key: 'userId', title: 'Chat ID', tooltip: 'Chat ID пользователя', align: 'left' },
];

function HistoryTable({ rows }) {
  return (
      <div className="table-wrapper">
        <div className="htable">
          <div className="htrow htable-head">
            {COLUMNS.map((c) => (
                <div key={c.key} className={`hcell hhead hcell-${c.align}`}>
                  {c.tooltip ? <span className="th-tooltip" title={c.tooltip}>{c.title}</span> : c.title}
                </div>
            ))}
          </div>
          {rows.map((r) => (
              <div className="htrow" key={r.dealId + '|' + r.createdAt}>
                <div className="hcell mono">{r.dealId}</div>
                <div className="hcell mono">{formatDateTime(r.createdAt)}</div>
                <div className="hcell" title={r.details || ''}>{r.details || '—'}</div>
                <div className="hcell" title={r.initiatorApp || ''}>{r.initiatorApp || '—'}</div>
                <div className="hcell" title={merchantLabel(r.merchant)}>{merchantLabel(r.merchant)}</div>
                <div className="hcell hcell-right mono">{formatAmount(r.merchantAmount)}</div>
                <div className="hcell hcell-right mono">{formatAmount(r.requestedAmount)}</div>
                <div className="hcell hcell-center"><span className="method-badge">{methodLabel(r.method)}</span></div>
                <div className="hcell mono" title={r.merchantOrderId || ''}>{r.merchantOrderId || '—'}</div>
                <div className="hcell mono">{r.userId}</div>
              </div>
          ))}
        </div>
      </div>
  );
}

// Пагинация. Если известен total (из X-Total-Count) — «страница X из Y» с переходом
// на любую/последнюю; иначе fallback «назад/вперёд» (вперёд активна, пока пришла полная страница).
function Pagination({ page, total, hasNext, onPage, busy }) {
  const known = total != null;
  const pageCount = known ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
  if (known) {
    if (total === 0) return null;
    return (
        <div className="pagination">
          <span className="pagination-info">Всего записей: {total}</span>
          <div className="pagination-controls">
            <button type="button" className="page-btn" onClick={() => onPage(0)} disabled={busy || page <= 0} aria-label="Первая">
              <i className="fas fa-angles-left" aria-hidden="true"></i>
            </button>
            <button type="button" className="page-btn" onClick={() => onPage(page - 1)} disabled={busy || page <= 0} aria-label="Назад">
              <i className="fas fa-chevron-left" aria-hidden="true"></i>
            </button>
            <span className="page-current">{page + 1} / {pageCount}</span>
            <button type="button" className="page-btn" onClick={() => onPage(page + 1)} disabled={busy || page >= pageCount - 1} aria-label="Вперёд">
              <i className="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
            <button type="button" className="page-btn" onClick={() => onPage(pageCount - 1)} disabled={busy || page >= pageCount - 1} aria-label="Последняя">
              <i className="fas fa-angles-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
    );
  }
  // fallback без total
  if (page === 0 && !hasNext) return null;
  return (
      <div className="pagination">
        <span className="pagination-info">Страница {page + 1}</span>
        <div className="pagination-controls">
          <button type="button" className="page-btn" onClick={() => onPage(page - 1)} disabled={busy || page <= 0} aria-label="Назад">
            <i className="fas fa-chevron-left" aria-hidden="true"></i>
          </button>
          <span className="page-current">{page + 1}</span>
          <button type="button" className="page-btn" onClick={() => onPage(page + 1)} disabled={busy || !hasNext} aria-label="Вперёд">
            <i className="fas fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
  );
}

// =============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// =============================================================
export default function App() {
  const [rows, setRows] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState(EMPTY_FILTER);
  const [applied, setApplied] = useState(EMPTY_FILTER);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(null);   // из X-Total-Count; null → fallback назад/вперёд
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
    // Высота окна аппа в Telegram (особенно Desktop) не равна 100vh.
    // Берём фактическую высоту из Telegram и пишем в CSS-переменную --app-h.
    const applyHeight = () => {
      const h = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${h}px`);
    };
    applyHeight();
    tg?.onEvent?.('viewportChanged', applyHeight);
    window.addEventListener('resize', applyHeight);
    return () => {
      tg?.offEvent?.('viewportChanged', applyHeight);
      window.removeEventListener('resize', applyHeight);
    };
  }, []);

  // актуальные applied/page в ref — чтобы автообновление всегда брало свежие значения
  const appliedRef = useRef(applied);
  const pageRef = useRef(page);
  useEffect(() => { appliedRef.current = applied; }, [applied]);
  useEffect(() => { pageRef.current = page; }, [page]);
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const [autoRefreshing, setAutoRefreshing] = useState(false);

  const fetchPage = useCallback(async (filter, pageIndex) => {
    const res = await api.list(buildBody(filter, pageIndex));
    const data = Array.isArray(res?.data) ? res.data : [];
    const totalCount = typeof res?.total === 'number' && !isNaN(res.total) ? res.total : null;
    return { data, total: totalCount };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [res, flt] = await Promise.all([fetchPage(EMPTY_FILTER, 0), api.merchants()]);
        if (!alive) return;
        setRows(res.data);
        setTotal(res.total);
        setHasNext(res.data.length === PAGE_SIZE);
        setMerchants(Array.isArray(flt?.merchants) ? flt.merchants : []);
      } catch (e) {
        if (alive) setError(e.message || 'Не удалось загрузить историю');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchPage]);

  const goToPage = useCallback(async (filter, pageIndex) => {
    setBusy(true); setError(null);
    try {
      const res = await fetchPage(filter, pageIndex);
      setRows(res.data);
      setTotal(res.total);
      setPage(pageIndex);
      setHasNext(res.data.length === PAGE_SIZE);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  }, [fetchPage]);

  const handleSearch = () => { setApplied(draft); goToPage(draft, 0); };
  const handleReset = () => { setDraft(EMPTY_FILTER); setApplied(EMPTY_FILTER); goToPage(EMPTY_FILTER, 0); };
  const handlePage = (p) => { if (p < 0) return; goToPage(applied, p); };
  const handleRefresh = () => { goToPage(applied, page); }; // обновить текущую страницу с текущими фильтрами

  // Автообновление каждые 30 сек — тихо, текущая страница с применёнными фильтрами.
  // Не дёргаем, когда вкладка скрыта или идёт другой запрос.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden || busyRef.current) return;
      setAutoRefreshing(true);
      try {
        const res = await fetchPage(appliedRef.current, pageRef.current);
        setRows(res.data);
        setTotal(res.total);
        setHasNext(res.data.length === PAGE_SIZE);
      } catch { /* фоновые ошибки игнорируем */ }
      finally { setTimeout(() => setAutoRefreshing(false), 600); }
    }, 30000);
    return () => clearInterval(id);
  }, [fetchPage]);

  return (
      <div className="app">
        <div className="container">
          <header className="page-header">
            <h1><i className="fas fa-history" aria-hidden="true"></i>История мерчантов</h1>
          </header>
          <main>
            {loading && (
                <div className="state">
                  <i className="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Загрузка…</span>
                </div>
            )}
            {!loading && error && (
                <div className="state state-error">
                  <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                  <span>{error}</span>
                  <button type="button" className="btn btn-secondary" onClick={() => goToPage(applied, page)}>Повторить</button>
                </div>
            )}
            {!loading && !error && (
                <div className="results-area">
                  <FilterPanel draft={draft} setDraft={setDraft} merchants={merchants} onSearch={handleSearch} onReset={handleReset} busy={busy} />
                  <div className="refresh-bar">
                    {autoRefreshing && (
                        <span className="auto-refresh">
                    <i className="fas fa-sync-alt fa-spin" aria-hidden="true"></i>
                    Обновление…
                  </span>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={handleRefresh} disabled={busy}>
                      <i className={`fas fa-sync-alt ${busy ? 'fa-spin' : ''}`} aria-hidden="true"></i>
                      Обновить
                    </button>
                  </div>
                  <div className="results">
                    {busy && (
                        <div className="results-mask"><i className="fas fa-spinner fa-spin" aria-hidden="true"></i></div>
                    )}
                    {rows.length === 0 ? (
                        <div className="state state-empty">
                          <i className="fas fa-inbox" aria-hidden="true"></i><span>Записей не найдено</span>
                        </div>
                    ) : (
                        <>
                          <HistoryTable rows={rows} />
                          <Pagination page={page} total={total} hasNext={hasNext} onPage={handlePage} busy={busy} />
                        </>
                    )}
                  </div>
                </div>
            )}
          </main>
        </div>
      </div>
  );
}