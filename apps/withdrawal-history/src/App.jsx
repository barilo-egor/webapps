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
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

// Как apiFetch, но дополнительно читает общее число записей из заголовка X-Total-Count.
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
  // POST /api/withdrawal-history — список записей. Возвращает { data: [...], total }.
  list: (body) => apiFetchWithTotal('/api/withdrawal-history', { method: 'POST', body: JSON.stringify(body) }),
};

const api = realApi;

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

// =============================================================
// ФИЛЬТР → ТЕЛО ЗАПРОСА (имена полей как в истории мерчантов)
// =============================================================
const PAGE_SIZE = 30;
const EMPTY_FILTER = {
  dateMode: 'equal', dateEqual: '', dateFrom: '', dateTo: '',
  dealId: '', bot: '', hash: '', chatId: '',
};

function buildBody(f, page) {
  const b = { page, size: PAGE_SIZE };
  if (f.dealId.trim() !== '') b.dealId = Number(f.dealId);
  if (f.chatId.trim() !== '') b.initiatorChatId = Number(f.chatId);
  if (f.bot.trim() !== '') b.bot = f.bot.trim();
  if (f.hash.trim() !== '') b.hash = f.hash.trim();
  // имена полей дат по схеме бэка WithdrawalHistoryRequest: createdAtFrom / createdAtTo
  if (f.dateMode === 'equal') {
    if (f.dateEqual) { b.createdAtFrom = `${f.dateEqual}T00:00:00.000Z`; b.createdAtTo = `${f.dateEqual}T23:59:59.999Z`; }
  } else {
    if (f.dateFrom) b.createdAtFrom = `${f.dateFrom}T00:00:00.000Z`;
    if (f.dateTo) b.createdAtTo = `${f.dateTo}T23:59:59.999Z`;
  }
  return b;
}

// =============================================================
// TOAST
// =============================================================
function Toast({ toast }) {
  if (!toast) return null;
  return (
      <div className={`toast toast-${toast.type}`}>
        <i className={`fas ${toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} aria-hidden="true"></i>
        {toast.text}
      </div>
  );
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

function FilterPanel({ draft, setDraft, onSearch, onReset, busy }) {
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
                <FilterField icon="fas fa-calendar-alt" label="Дата и время">
                  <div className="date-field">
                    <div className="date-mode">
                      <button type="button" className={`mode-btn ${draft.dateMode === 'equal' ? 'active' : ''}`} onClick={() => set({ dateMode: 'equal' })}>Равна</button>
                      <button type="button" className={`mode-btn ${draft.dateMode === 'range' ? 'active' : ''}`} onClick={() => set({ dateMode: 'range' })}>Диапазон</button>
                    </div>
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
                <FilterField icon="fas fa-hashtag" label="Пользовательский идентификатор сделки">
                  <input type="text" inputMode="numeric" className="input" placeholder="Введите номер сделки" value={draft.dealId} onChange={(e) => set({ dealId: e.target.value.replace(/[^\d]/g, '') })} />
                </FilterField>
                <FilterField icon="fas fa-robot" label="Бот">
                  <input type="text" className="input" placeholder="Название бота" value={draft.bot} onChange={(e) => set({ bot: e.target.value })} />
                </FilterField>
                <FilterField icon="fas fa-key" label="Hash транзакции">
                  <input type="text" className="input" placeholder="Hash транзакции" value={draft.hash} onChange={(e) => set({ hash: e.target.value })} />
                </FilterField>
                <FilterField icon="fas fa-id-badge" label="Chat ID">
                  <input type="text" inputMode="numeric" className="input" placeholder="Telegram ID" value={draft.chatId} onChange={(e) => set({ chatId: e.target.value.replace(/[^\d]/g, '') })} />
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
  { key: 'dealId', title: 'Сделка', align: 'left' },
  { key: 'createdAt', title: 'Дата и время', align: 'left' },
  { key: 'bot', title: 'Бот', align: 'left' },
  { key: 'hash', title: 'Hash транзакции', align: 'left' },
  { key: 'initiatorChatId', title: 'Chat ID', tooltip: 'Chat ID пользователя', align: 'left' },
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
              <div className="htrow" key={r.dealId + '|' + r.createdAt + '|' + r.hash}>
                <div className="hcell mono">{r.dealId}</div>
                <div className="hcell mono">{formatDateTime(r.createdAt)}</div>
                <div className="hcell" title={r.bot || ''}>{r.bot || '—'}</div>
                <div className="hcell"><span className="hash-badge" title={r.hash || ''}>{r.hash || '—'}</span></div>
                <div className="hcell mono">{r.initiatorChatId}</div>
              </div>
          ))}
        </div>
      </div>
  );
}

// Пагинация «страница X из Y» по total (X-Total-Count); fallback «назад/вперёд», если total неизвестен.
function Pagination({ page, total, hasNext, onPage, busy }) {
  const known = total != null;
  if (known) {
    if (total === 0) return null;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return (
        <div className="pagination">
          <span className="pagination-info">Всего записей: {total}</span>
          <div className="pagination-controls">
            <button type="button" className="page-btn" onClick={() => onPage(0)} disabled={busy || page <= 0} aria-label="Первая"><i className="fas fa-angles-left" aria-hidden="true"></i></button>
            <button type="button" className="page-btn" onClick={() => onPage(page - 1)} disabled={busy || page <= 0} aria-label="Назад"><i className="fas fa-chevron-left" aria-hidden="true"></i></button>
            <span className="page-current">{page + 1} / {pageCount}</span>
            <button type="button" className="page-btn" onClick={() => onPage(page + 1)} disabled={busy || page >= pageCount - 1} aria-label="Вперёд"><i className="fas fa-chevron-right" aria-hidden="true"></i></button>
            <button type="button" className="page-btn" onClick={() => onPage(pageCount - 1)} disabled={busy || page >= pageCount - 1} aria-label="Последняя"><i className="fas fa-angles-right" aria-hidden="true"></i></button>
          </div>
        </div>
    );
  }
  if (page === 0 && !hasNext) return null;
  return (
      <div className="pagination">
        <span className="pagination-info">Страница {page + 1}</span>
        <div className="pagination-controls">
          <button type="button" className="page-btn" onClick={() => onPage(page - 1)} disabled={busy || page <= 0} aria-label="Назад"><i className="fas fa-chevron-left" aria-hidden="true"></i></button>
          <span className="page-current">{page + 1}</span>
          <button type="button" className="page-btn" onClick={() => onPage(page + 1)} disabled={busy || !hasNext} aria-label="Вперёд"><i className="fas fa-chevron-right" aria-hidden="true"></i></button>
        </div>
      </div>
  );
}

// =============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// =============================================================
export default function App() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);          // поиск / смена страницы (маска)
  const [refreshing, setRefreshing] = useState(false); // ручное «Обновить»
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [draft, setDraft] = useState(EMPTY_FILTER);
  const [applied, setApplied] = useState(EMPTY_FILTER);
  const [page, setPage] = useState(0);

  const appliedRef = useRef(applied);
  const pageRef = useRef(page);
  const busyRef = useRef(false);
  useEffect(() => { appliedRef.current = applied; }, [applied]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { busyRef.current = busy || refreshing; }, [busy, refreshing]);

  const toastTimer = useRef(null);
  const showToast = useCallback((type, text) => {
    setToast({ type, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
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
      clearTimeout(toastTimer.current);
    };
  }, []);

  // Запрос страницы с авто-повтором: при «плавающих» сбоях бэкенда тихо повторяем
  // несколько раз с нарастающей паузой, прежде чем отдать ошибку наружу.
  const fetchPage = useCallback(async (filter, pageIndex, retries = 3) => {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await api.list(buildBody(filter, pageIndex));
        const data = Array.isArray(res?.data) ? res.data : [];
        const totalCount = typeof res?.total === 'number' && !isNaN(res.total) ? res.total : null;
        return { data, total: totalCount };
      } catch (e) {
        lastErr = e;
        if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr;
  }, []);

  // Первичная загрузка
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetchPage(EMPTY_FILTER, 0);
        if (!alive) return;
        setRows(res.data); setTotal(res.total); setHasNext(res.data.length === PAGE_SIZE);
      } catch (e) {
        if (alive) setError(e.message || 'Не удалось загрузить данные');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchPage]);

  // Автообновление каждые 30 сек — тихо, текущая страница с применёнными фильтрами
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden || busyRef.current) return;
      setAutoRefreshing(true);
      try {
        const res = await fetchPage(appliedRef.current, pageRef.current);
        setRows(res.data); setTotal(res.total); setHasNext(res.data.length === PAGE_SIZE);
      } catch { /* фоновые ошибки игнорируем */ }
      finally { setTimeout(() => setAutoRefreshing(false), 600); }
    }, 30000);
    return () => clearInterval(id);
  }, [fetchPage]);

  const goToPage = useCallback(async (filter, pageIndex) => {
    setBusy(true); setError(null);
    try {
      const res = await fetchPage(filter, pageIndex);
      setRows(res.data); setTotal(res.total); setPage(pageIndex); setHasNext(res.data.length === PAGE_SIZE);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
      showToast('error', 'Не удалось обновить данные');
    } finally {
      setBusy(false);
    }
  }, [fetchPage, showToast]);

  const handleSearch = () => { setApplied(draft); goToPage(draft, 0); };
  const handleReset = () => { setDraft(EMPTY_FILTER); setApplied(EMPTY_FILTER); goToPage(EMPTY_FILTER, 0); };
  const handlePage = (p) => { if (p < 0) return; goToPage(applied, p); };

  // Ручное «Обновить» — текущая страница с применёнными фильтрами, с индикацией и toast
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetchPage(appliedRef.current, pageRef.current);
      setRows(res.data); setTotal(res.total); setHasNext(res.data.length === PAGE_SIZE);
      showToast('success', 'Данные обновлены');
    } catch {
      showToast('error', 'Не удалось обновить данные');
    } finally {
      setRefreshing(false);
    }
  };

  return (
      <div className="app">
        <Toast toast={toast} />
        <div className="container">
          <header className="page-header">
            <h1><i className="fas fa-history" aria-hidden="true"></i>История автовывода</h1>
          </header>
          <main>
            {loading && (
                <div className="state"><i className="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Загрузка…</span></div>
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
                  <FilterPanel draft={draft} setDraft={setDraft} onSearch={handleSearch} onReset={handleReset} busy={busy} />

                  <div className="table-block">
                    <div className="refresh-bar">
                      {refreshing && (
                          <span className="refresh-status"><span className="dot" /> Обновление данных…</span>
                      )}
                      {autoRefreshing && !refreshing && (
                          <span className="auto-refresh"><i className="fas fa-sync-alt fa-spin" aria-hidden="true"></i> Обновление…</span>
                      )}
                      <button type="button" className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing || busy}>
                        <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`} aria-hidden="true"></i>
                        Обновить
                      </button>
                    </div>

                    <div className="results">
                      {busy && (
                          <div className="results-mask"><i className="fas fa-spinner fa-spin" aria-hidden="true"></i></div>
                      )}
                      {rows.length === 0 ? (
                          <div className="state state-empty"><i className="fas fa-inbox" aria-hidden="true"></i><span>Записей не найдено</span></div>
                      ) : (
                          <>
                            <HistoryTable rows={rows} />
                            <Pagination page={page} total={total} hasNext={hasNext} onPage={handlePage} busy={busy} />
                          </>
                      )}
                    </div>
                  </div>
                </div>
            )}
          </main>
        </div>
      </div>
  );
}