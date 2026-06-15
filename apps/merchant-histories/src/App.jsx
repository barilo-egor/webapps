import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './App.css';

// =============================================================
// API КЛИЕНТ
// =============================================================

const apiFetch = async (url, options = {}) => {
  const initData = window.Telegram?.WebApp?.initData || '';
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-TG-Init-Data': initData,
      ...(options.headers || {}),
    },
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

const realApi = {
  // GET /api/merchant-histories/filters — справочники для фильтров (список мерчантов)
  filters: () => apiFetch('/api/merchant-histories/filters'),
  // POST /api/merchant-histories — список записей.
  // Тело можно оставить пустым ({}) чтобы получить все записи и фильтровать на клиенте,
  // либо передать фильтр чтобы фильтровал бэк (см. комментарий в loadAll).
  list: (body = {}) =>
    apiFetch('/api/merchant-histories', { method: 'POST', body: JSON.stringify(body) }),
};

const api = realApi;

// Небольшая задержка для маски загрузки при «Поиск».
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// =============================================================
// ОТОБРАЖАЕМЫЕ ИМЕНА
// =============================================================

// Код мерчанта → человекочитаемое имя.
// Если кода нет в карте — генерим из кода (ALFA_TEAM → AlfaTeam).
// Заполните карту точными названиями, если они отличаются от авто-варианта.
const MERCHANT_LABEL = {
  // ALFA_TEAM: 'Alfa Team',
};
function merchantLabel(code) {
  if (!code) return '';
  if (MERCHANT_LABEL[code]) return MERCHANT_LABEL[code];
  return code
    .toLowerCase()
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

// Код метода → подпись (по макету: СБП, Карта…). Остальные — авто.
const METHOD_LABEL = {
  SBP: 'СБП',
  CARD: 'Карта',
  SBER_QR: 'Сбер QR',
  TO_CARD: 'На карту',
};
function methodLabel(code) {
  if (!code) return '';
  if (METHOD_LABEL[code]) return METHOD_LABEL[code];
  return code
    .toLowerCase()
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

// =============================================================
// УТИЛИТЫ ДАТЫ / ЧИСЕЛ
// =============================================================

// "2026-06-03T15:22:28.890Z" → "03.06.2026 15:22:28" (UTC, как в БД).
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

// "2026-06-03T15:22:28Z" → "2026-06-03" (для сравнения с input[type=date]).
function dateOnly(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

function formatAmount(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =============================================================
// ФИЛЬТРАЦИЯ (на клиенте — точно по семантике ТЗ)
// =============================================================

const EMPTY_FILTER = {
  dateMode: 'equal', // 'equal' | 'range'
  dateEqual: '',
  dateFrom: '',
  dateTo: '',
  dealId: '',
  details: '',
  initiatorApp: '',
  merchants: [], // массив кодов
  amount: '',
  merchantOrderId: '',
  userId: '',
};

const includesCI = (haystack, needle) =>
  String(haystack ?? '').toLowerCase().includes(needle.trim().toLowerCase());

function applyFilters(rows, f) {
  return rows.filter((r) => {
    // Дата (только календарная часть)
    const d = dateOnly(r.createdAt);
    if (f.dateMode === 'equal') {
      if (f.dateEqual && d !== f.dateEqual) return false;
    } else {
      if (f.dateFrom && d < f.dateFrom) return false;
      if (f.dateTo && d > f.dateTo) return false;
    }
    // № сделки — частичное совпадение по строке числа
    if (f.dealId.trim() && !String(r.dealId).includes(f.dealId.trim())) return false;
    // Chat ID пользователя — частичное совпадение
    if (f.userId.trim() && !String(r.userId).includes(f.userId.trim())) return false;
    // Реквизиты — частичное, регистронезависимо
    if (f.details.trim() && !includesCI(r.details, f.details)) return false;
    // Название бота — частичное, регистронезависимо
    if (f.initiatorApp.trim() && !includesCI(r.initiatorApp, f.initiatorApp)) return false;
    // Ордер ID — частичное
    if (f.merchantOrderId.trim() && !includesCI(r.merchantOrderId, f.merchantOrderId)) return false;
    // Мерчант — множественный выбор (точное вхождение кода)
    if (f.merchants.length && !f.merchants.includes(r.merchant)) return false;
    // Сумма — равенство merchant_amount ИЛИ requested_amount
    if (f.amount.trim() !== '') {
      const a = Number(f.amount);
      const okMerch = r.merchantAmount != null && Number(r.merchantAmount) === a;
      const okReq = r.requestedAmount != null && Number(r.requestedAmount) === a;
      if (!okMerch && !okReq) return false;
    }
    return true;
  });
}

// =============================================================
// СВОРАЧИВАЕМАЯ ПАНЕЛЬ ФИЛЬТРОВ
// =============================================================

function FilterField({ icon, label, children }) {
  return (
    <div className="filter-field">
      <label className="filter-label">
        <i className={`${icon} filter-label-icon`} aria-hidden="true"></i>
        {label}
      </label>
      {children}
    </div>
  );
}

// Множественный выпадающий список мерчантов (клик по строке, без чекбоксов)
function MerchantSelect({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = (code) => {
    if (selected.includes(code)) onChange(selected.filter((c) => c !== code));
    else onChange([...selected, code]);
  };

  const display =
    selected.length === 0
      ? 'Все'
      : selected.map(merchantLabel).join(', ');

  return (
    <div className="ms" ref={ref}>
      <button
        type="button"
        className={`ms-control ${selected.length ? 'ms-control-filled' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="ms-value">{display}</span>
        <i className={`fas fa-chevron-down ms-chevron ${open ? 'open' : ''}`} aria-hidden="true"></i>
      </button>
      {open && (
        <div className="ms-dropdown" role="listbox">
          {options.map((code) => {
            const isSel = selected.includes(code);
            return (
              <div
                key={code}
                className={`ms-option ${isSel ? 'ms-option-selected' : ''}`}
                role="option"
                aria-selected={isSel}
                onClick={() => toggle(code)}
              >
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
      <button
        type="button"
        className="section-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <i className="fas fa-sliders-h section-icon" aria-hidden="true"></i>
        <span className="section-title">Фильтрация</span>
        <i className={`fas fa-chevron-right section-chevron ${open ? 'open' : ''}`} aria-hidden="true"></i>
      </button>

      {open && (
        <div className="section-body">
          <div className="filter-grid">
            {/* Дата */}
            <FilterField icon="fas fa-calendar-alt" label="Дата">
              <div className="date-field">
                <select
                  className="select"
                  value={draft.dateMode}
                  onChange={(e) => set({ dateMode: e.target.value })}
                >
                  <option value="equal">Равна</option>
                  <option value="range">Диапазон</option>
                </select>
                {draft.dateMode === 'equal' ? (
                  <input
                    type="date"
                    className="input"
                    value={draft.dateEqual}
                    onChange={(e) => set({ dateEqual: e.target.value })}
                  />
                ) : (
                  <div className="date-range">
                    <input
                      type="date"
                      className="input"
                      value={draft.dateFrom}
                      onChange={(e) => set({ dateFrom: e.target.value })}
                    />
                    <input
                      type="date"
                      className="input"
                      value={draft.dateTo}
                      onChange={(e) => set({ dateTo: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </FilterField>

            {/* № сделки */}
            <FilterField icon="fas fa-hashtag" label="№ сделки">
              <input
                type="text"
                inputMode="numeric"
                className="input"
                value={draft.dealId}
                onChange={(e) => set({ dealId: e.target.value.replace(/[^\d]/g, '') })}
              />
            </FilterField>

            {/* Реквизиты */}
            <FilterField icon="fas fa-credit-card" label="Реквизиты">
              <input
                type="text"
                className="input"
                value={draft.details}
                onChange={(e) => set({ details: e.target.value })}
              />
            </FilterField>

            {/* Название бота */}
            <FilterField icon="fas fa-robot" label="Название бота">
              <input
                type="text"
                className="input"
                value={draft.initiatorApp}
                onChange={(e) => set({ initiatorApp: e.target.value })}
              />
            </FilterField>

            {/* Мерчант */}
            <FilterField icon="fas fa-store" label="Мерчант">
              <MerchantSelect
                options={merchants}
                selected={draft.merchants}
                onChange={(merchants) => set({ merchants })}
              />
            </FilterField>

            {/* Сумма */}
            <FilterField icon="fas fa-coins" label="Сумма">
              <input
                type="text"
                inputMode="decimal"
                className="input"
                value={draft.amount}
                onChange={(e) => set({ amount: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })}
              />
            </FilterField>

            {/* Идентификатор ордера */}
            <FilterField icon="fas fa-ticket-alt" label="Идентификатор ордера">
              <input
                type="text"
                className="input"
                value={draft.merchantOrderId}
                onChange={(e) => set({ merchantOrderId: e.target.value })}
              />
            </FilterField>

            {/* Chat ID пользователя */}
            <FilterField icon="fab fa-telegram-plane" label="Chat ID пользователя">
              <input
                type="text"
                inputMode="numeric"
                className="input"
                value={draft.userId}
                onChange={(e) => set({ userId: e.target.value.replace(/[^\d]/g, '') })}
              />
            </FilterField>
          </div>

          <div className="filter-actions">
            <button type="button" className="btn btn-secondary" onClick={onReset} disabled={busy}>
              <i className="fas fa-undo-alt" aria-hidden="true"></i>
              Сбросить
            </button>
            <button type="button" className="btn btn-primary" onClick={onSearch} disabled={busy}>
              <i className="fas fa-search" aria-hidden="true"></i>
              Поиск
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
  { key: 'dealId', title: '№', tooltip: 'Номер сделки', cls: 'col-num', align: 'left' },
  { key: 'createdAt', title: 'Дата и время', cls: 'col-date', align: 'left' },
  { key: 'details', title: 'Реквизиты', cls: 'col-details', align: 'left' },
  { key: 'initiatorApp', title: 'Бот', cls: 'col-bot', align: 'left' },
  { key: 'merchant', title: 'Мерчант', cls: 'col-merchant', align: 'left' },
  { key: 'merchantAmount', title: 'Мерч.сумма', tooltip: 'Мерчантская сумма', cls: 'col-mamount', align: 'right' },
  { key: 'requestedAmount', title: 'Запр.сумма', tooltip: 'Запрошенная сумма', cls: 'col-ramount', align: 'right' },
  { key: 'method', title: 'Метод', cls: 'col-method', align: 'center' },
  { key: 'merchantOrderId', title: 'Ордер ID', cls: 'col-order', align: 'left' },
  { key: 'userId', title: 'Chat ID', tooltip: 'Chat ID пользователя', cls: 'col-chat', align: 'left' },
];

function HistoryTable({ rows }) {
  return (
    <div className="table-wrapper">
      <div className="htable">
        <div className="htrow htable-head">
          {COLUMNS.map((c) => (
            <div key={c.key} className={`hcell hhead hcell-${c.align}`}>
              {c.tooltip ? (
                <span className="th-tooltip" title={c.tooltip}>
                  {c.title}
                </span>
              ) : (
                c.title
              )}
            </div>
          ))}
        </div>
        <div className="htable-body">
          {rows.map((r) => (
            <div className="htrow" key={r.dealId + '|' + r.createdAt}>
              <div className="hcell mono">{r.dealId}</div>
              <div className="hcell mono">{formatDateTime(r.createdAt)}</div>
              <div className="hcell" title={r.details || ''}>{r.details || '—'}</div>
              <div className="hcell" title={r.initiatorApp || ''}>{r.initiatorApp || '—'}</div>
              <div className="hcell" title={merchantLabel(r.merchant)}>{merchantLabel(r.merchant)}</div>
              <div className="hcell hcell-right mono">{formatAmount(r.merchantAmount)}</div>
              <div className="hcell hcell-right mono">{formatAmount(r.requestedAmount)}</div>
              <div className="hcell hcell-center">
                <span className="method-badge">{methodLabel(r.method)}</span>
              </div>
              <div className="hcell mono" title={r.merchantOrderId || ''}>{r.merchantOrderId || '—'}</div>
              <div className="hcell mono">{r.userId}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// ПАГИНАЦИЯ
// =============================================================

function Pagination({ page, pageCount, total, onPage }) {
  if (pageCount <= 1) return null;
  return (
    <div className="pagination">
      <span className="pagination-info">Всего записей: {total}</span>
      <div className="pagination-controls">
        <button
          type="button"
          className="page-btn"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Предыдущая страница"
        >
          <i className="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <span className="page-current">{page} / {pageCount}</span>
        <button
          type="button"
          className="page-btn"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Следующая страница"
        >
          <i className="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}

// =============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// =============================================================

const PAGE_SIZE = 30;

export default function App() {
  const [allRows, setAllRows] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);   // первичная загрузка
  const [searching, setSearching] = useState(false); // маска при «Поиск»
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState(EMPTY_FILTER);     // значения в панели
  const [applied, setApplied] = useState(EMPTY_FILTER); // применённый фильтр
  const [page, setPage] = useState(1);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Грузим всё разом + справочник мерчантов. Фильтрация — на клиенте.
      // Чтобы фильтровать на бэке: передайте applied в api.list(buildServerBody(applied))
      // и уберите applyFilters ниже (нужно согласовать имена полей с бэком).
      const [rows, flt] = await Promise.all([api.list({}), api.filters()]);
      const data = Array.isArray(rows) ? rows : [];
      // Сортировка: новые сверху
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAllRows(data);
      setMerchants(Array.isArray(flt?.merchants) ? flt.merchants : []);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить историю');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => applyFilters(allRows, applied), [allRows, applied]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const handleSearch = async () => {
    setSearching(true);
    // маска загрузки по ТЗ (даже если фильтрация мгновенная на клиенте)
    await delay(250);
    setApplied(draft);
    setPage(1);
    setSearching(false);
  };

  const handleReset = () => {
    setDraft(EMPTY_FILTER);
    setApplied(EMPTY_FILTER);
    setPage(1);
  };

  return (
    <div className="app">
      <div className="container">
        <header className="page-header">
          <h1>
            <i className="fas fa-history" aria-hidden="true"></i>
            История мерчантов
          </h1>
        </header>

        <main>
          {loading && (
            <div className="state">
              <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
              <span>Загрузка…</span>
            </div>
          )}

          {!loading && error && (
            <div className="state state-error">
              <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
              <span>{error}</span>
              <button type="button" className="btn btn-secondary" onClick={loadAll}>
                Повторить
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              <FilterPanel
                draft={draft}
                setDraft={setDraft}
                merchants={merchants}
                onSearch={handleSearch}
                onReset={handleReset}
                busy={searching}
              />

              <div className="results">
                {searching && (
                  <div className="results-mask">
                    <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  </div>
                )}

                {filtered.length === 0 ? (
                  <div className="state state-empty">
                    <i className="fas fa-inbox" aria-hidden="true"></i>
                    <span>Записей не найдено</span>
                  </div>
                ) : (
                  <>
                    <HistoryTable rows={pageRows} />
                    <Pagination
                      page={page}
                      pageCount={pageCount}
                      total={filtered.length}
                      onPage={setPage}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
