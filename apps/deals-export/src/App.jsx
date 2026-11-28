import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../../shared/request.js';

const API = '/api/deals-export';

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

const EMPTY_FILTER = {
  from: '',
  to: '',
  chatId: '',
  merchantDeals: null,
  merchants: [],
  dealType: null,
  deliveryType: null,
  fiatCurrencies: [],
  cryptoCurrencies: [],
  paymentTypePids: [],
};

const MERCHANT_DEALS = [
  { name: null, description: 'Все' },
  { name: 'MERCHANT', description: 'Сделки мерчантов' },
  { name: 'NOT_MERCHANT', description: 'Не мерчантов' },
];

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((message, type = 'info') => {
    window.clearTimeout(timer.current);
    setToast({ message, type, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const node = toast ? (
    <div key={toast.key} className={`toast ${toast.type}`}>
      {toast.message}
    </div>
  ) : null;

  return { show, node };
}

const pad = (n) => String(n).padStart(2, '0');

function mskDate(shiftDays = 0) {
  const d = new Date(Date.now() + MSK_OFFSET_MS);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + shiftDays);
  return d;
}

const toInput = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00`;

function quickPeriods() {
  const today = mskDate();
  const weekday = (today.getUTCDay() + 6) % 7;
  const thisMonday = mskDate(-weekday);
  const lastMonday = mskDate(-weekday - 7);
  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return [
    { label: 'Сегодня', from: toInput(today), to: toInput(mskDate(1)) },
    { label: 'Вчера', from: toInput(mskDate(-1)), to: toInput(today) },
    { label: 'Прошлая неделя', from: toInput(lastMonday), to: toInput(thisMonday) },
    { label: 'Прошлый месяц', from: toInput(lastMonth), to: toInput(thisMonth) },
  ];
}

const toBackend = (value) => (value ? `${value}:00` : null);
const fromBackend = (value) => (value ? String(value).slice(0, 16) : '');

function defaultColumns(dictionary) {
  return (dictionary.DealExportColumn || []).filter((c) => c.selectedByDefault).map((c) => c.name);
}

function fromSettings(settings, dictionary) {
  const f = settings?.filter || {};
  return {
    filter: {
      ...EMPTY_FILTER,
      from: fromBackend(f.from),
      to: fromBackend(f.to),
      chatId: f.chatId != null ? String(f.chatId) : '',
      merchantDeals: f.merchantDeals ?? null,
      merchants: f.merchants || [],
      dealType: f.dealType ?? null,
      deliveryType: f.deliveryType ?? null,
      fiatCurrencies: f.fiatCurrencies || [],
      cryptoCurrencies: f.cryptoCurrencies || [],
      paymentTypePids: f.paymentTypePids || [],
    },
    columns: settings?.columns
      ? settings.columns.filter((name) => (dictionary.DealExportColumn || []).some((c) => c.name === name))
      : defaultColumns(dictionary),
  };
}

function toBody(filter, columns, visiblePaymentTypePids) {
  return {
    filter: {
      from: toBackend(filter.from),
      to: toBackend(filter.to),
      chatId: filter.chatId ? Number(filter.chatId) : null,
      merchantDeals: filter.merchantDeals,
      merchants: filter.merchantDeals === 'MERCHANT' ? filter.merchants : [],
      dealType: filter.dealType,
      deliveryType: filter.deliveryType,
      fiatCurrencies: filter.fiatCurrencies,
      cryptoCurrencies: filter.cryptoCurrencies,
      paymentTypePids: filter.paymentTypePids.filter((pid) => visiblePaymentTypePids.has(pid)),
    },
    columns,
  };
}

function Section({ icon, title, hint, children }) {
  return (
    <section className="card section">
      <div className="section-head">
        <i className={`fas ${icon}`} aria-hidden="true"></i>
        <h2>{title}</h2>
      </div>
      {hint && <div className="section-hint">{hint}</div>}
      {children}
    </section>
  );
}

function Single({ options, value, onChange, allLabel = 'Все' }) {
  const items = options[0]?.name === null ? options : [{ name: null, description: allLabel }, ...options];
  return (
    <div className="chips">
      {items.map((o) => (
        <button
          key={o.name ?? 'all'}
          type="button"
          className={`chip ${value === o.name ? 'active' : ''}`}
          onClick={() => onChange(o.name)}
        >
          {o.description}
        </button>
      ))}
    </div>
  );
}

function Multi({ options, value, onChange, keyOf = (o) => o.name, labelOf = (o) => o.description, allLabel }) {
  const selected = new Set(value);
  const toggle = (key) => onChange(selected.has(key) ? value.filter((v) => v !== key) : [...value, key]);
  return (
    <div className="chips">
      {allLabel && (
        <button
          type="button"
          className={`chip ${options.some((o) => selected.has(keyOf(o))) ? '' : 'active'}`}
          onClick={() => onChange([])}
        >
          {allLabel}
        </button>
      )}
      {options.map((o) => {
        const key = keyOf(o);
        return (
          <button
            key={key}
            type="button"
            className={`chip ${selected.has(key) ? 'active' : ''}`}
            onClick={() => toggle(key)}
          >
            {labelOf(o)}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

export default function App() {
  const { show, node: toastNode } = useToast();
  const [dictionary, setDictionary] = useState(null);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [launched, setLaunched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dict, types, settings] = await Promise.all([
        request('/api/dictionary'),
        request('/api/payment-types'),
        request(`${API}/settings`),
      ]);
      const state = fromSettings(settings && typeof settings === 'object' ? settings : null, dict);
      setDictionary(dict);
      setPaymentTypes(Array.isArray(types) ? types : []);
      setFilter(state.filter);
      setColumns(state.columns);
    } catch (e) {
      setLoadError(e.message || 'Не удалось загрузить форму');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
    load();
  }, [load]);

  const set = (patch) => setFilter((f) => ({ ...f, ...patch }));

  const fiatTitle = useMemo(() => {
    const map = new Map((dictionary?.FiatCurrency || []).map((f) => [f.name, f.description]));
    return (name) => map.get(name) || name;
  }, [dictionary]);

  const dealTypeTitle = useMemo(() => {
    const map = new Map((dictionary?.DealType || []).map((t) => [t.name, t.description]));
    return (name) => map.get(name) || name;
  }, [dictionary]);

  const visiblePaymentTypes = useMemo(() => {
    const fiats = new Set(filter.fiatCurrencies);
    return paymentTypes
      .filter((p) => !filter.dealType || p.dealType === filter.dealType)
      .filter((p) => fiats.size === 0 || fiats.has(p.fiatCurrency))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
  }, [paymentTypes, filter.dealType, filter.fiatCurrencies]);

  const visiblePaymentTypePids = useMemo(() => new Set(visiblePaymentTypes.map((p) => p.pid)), [visiblePaymentTypes]);

  const periods = useMemo(() => quickPeriods(), []);

  const periodError = filter.from && filter.to && filter.from >= filter.to
    ? 'Начало периода должно быть раньше конца'
    : null;

  const submit = async () => {
    if (periodError) {
      show(periodError, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await request(API, { method: 'POST', body: toBody(filter, columns, visiblePaymentTypePids) });
      setLaunched(true);
    } catch (e) {
      show(e.message || 'Не удалось запустить отчёт', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="state-box">
          <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Загрузка…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app">
        <div className="state-box state-error">
          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{loadError}</span>
          <button type="button" className="btn" onClick={load}>Повторить</button>
        </div>
      </div>
    );
  }

  if (launched) {
    return (
      <div className="app">
        <header className="header">
          <h1><i className="fas fa-file-excel" aria-hidden="true"></i>Экспорт сделок</h1>
        </header>
        <div className="card launched">
          <i className="fas fa-hourglass-half" aria-hidden="true"></i>
          <div className="launched-text">Отчёт формируется и придёт в бот</div>
          <button type="button" className="btn btn-primary" onClick={() => setLaunched(false)}>
            Сформировать новый отчёт
          </button>
        </div>
        {toastNode}
      </div>
    );
  }

  const columnOptions = dictionary.DealExportColumn || [];

  return (
    <div className="app">
      <header className="header">
        <h1><i className="fas fa-file-excel" aria-hidden="true"></i>Экспорт сделок</h1>
      </header>

      <div className="notice">В отчёт попадают только подтверждённые сделки.</div>

      <Section icon="fa-calendar-alt" title="Период" hint="Время московское (МСК). Можно задать одну границу.">
        <div className="chips">
          {periods.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip ${filter.from === p.from && filter.to === p.to ? 'active' : ''}`}
              onClick={() => set({ from: p.from, to: p.to })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="period">
          <Field label="С">
            <input type="datetime-local" className="input" value={filter.from}
                   onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="До (не включая)">
            <input type="datetime-local" className="input" value={filter.to}
                   onChange={(e) => set({ to: e.target.value })} />
          </Field>
        </div>
        {periodError && <div className="field-error">{periodError}</div>}
        {(filter.from || filter.to) && (
          <button type="button" className="link-btn" onClick={() => set({ from: '', to: '' })}>
            Сбросить период
          </button>
        )}
      </Section>

      <Section icon="fa-filter" title="Фильтры" hint="Пустой фильтр не применяется.">
        <Field label="Chat ID">
          <input type="text" inputMode="numeric" className="input" placeholder="Chat ID клиента"
                 value={filter.chatId}
                 onChange={(e) => set({ chatId: e.target.value.replace(/[^\d]/g, '') })} />
        </Field>
        <Field label="Тип сделки">
          <Single options={dictionary.DealType || []} value={filter.dealType} onChange={(v) => set({ dealType: v })} />
        </Field>
        <Field label="Сделки мерчантов">
          <Single options={MERCHANT_DEALS} value={filter.merchantDeals} onChange={(v) => set({ merchantDeals: v })} />
        </Field>
        {filter.merchantDeals === 'MERCHANT' && (
          <Field label="Мерчанты">
            <Multi options={dictionary.Merchant || []} value={filter.merchants}
                   onChange={(v) => set({ merchants: v })} />
          </Field>
        )}
        <Field label="Доставка">
          <Single options={dictionary.DeliveryType || []} value={filter.deliveryType}
                  onChange={(v) => set({ deliveryType: v })} />
        </Field>
        <Field label="Фиатная валюта">
          <Multi options={dictionary.FiatCurrency || []} value={filter.fiatCurrencies}
                 onChange={(v) => set({ fiatCurrencies: v })} allLabel="Все" />
        </Field>
        <Field label="Криптовалюта">
          <Multi options={dictionary.CryptoCurrency || []} value={filter.cryptoCurrencies}
                 onChange={(v) => set({ cryptoCurrencies: v })} allLabel="Все" />
        </Field>
        <Field label="Тип оплаты">
          {visiblePaymentTypes.length === 0 ? (
            <div className="section-hint">Нет типов оплаты под выбранные тип сделки и валюту</div>
          ) : (
            <Multi
              options={visiblePaymentTypes}
              value={filter.paymentTypePids}
              onChange={(v) => set({ paymentTypePids: v })}
              allLabel="Все"
              keyOf={(p) => p.pid}
              labelOf={(p) => `${p.name} · ${dealTypeTitle(p.dealType)} · ${fiatTitle(p.fiatCurrency)}`}
            />
          )}
        </Field>
      </Section>

      <Section icon="fa-table-columns" title="Колонки"
               hint="Колонки, нужные для итогов и заработка, попадут в файл в любом случае — неотмеченные будут скрыты.">
        <div className="columns-actions">
          <button type="button" className="link-btn" onClick={() => setColumns(defaultColumns(dictionary))}>
            По умолчанию
          </button>
          <button type="button" className="link-btn" onClick={() => setColumns(columnOptions.map((c) => c.name))}>
            Все
          </button>
        </div>
        <Multi options={columnOptions} value={columns} onChange={setColumns} />
      </Section>

      <div className="submit-bar">
        <button type="button" className="btn btn-primary btn-block" onClick={submit}
                disabled={submitting || Boolean(periodError)}>
          {submitting
            ? <><i className="fas fa-spinner fa-spin" aria-hidden="true"></i>Запуск…</>
            : <><i className="fas fa-file-export" aria-hidden="true"></i>Сформировать отчёт</>}
        </button>
      </div>

      {toastNode}
    </div>
  );
}
