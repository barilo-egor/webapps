import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../../shared/request.js';

/* ============================================================
   Веб-апп «Мерчанты» («Панель администратора» → «Мерчанты» →
   «Мерчанты WebApp»): список мерчантов и их настройки.

   Эндпоинты (коллекция rce, папки «Управление мерчантами» и
   «Управление переменными бота»):
     GET   /api/merchants?page&size&sort&search&paymentTypeId -> [...] + X-Total-Count
     PATCH /api/merchants/{merchant}   <- только изменённые поля:
             isOn, minAmount, maxAmount, minDealsCount, requiredReceipt, merchantOrder
     GET   /api/merchants/{merchant}/statuses             — карточка: «Статус автоподтверждения»
     GET   /api/merchants/crypto-currencies               — карточка: валюты для автоподтверждения
     GET   /api/merchants/{merchant}/auto-confirm-config?currency=
     GET   /api/merchants/{merchant}/payment-methods      — карточка: «Привязка»
     GET   /api/merchants/{merchant}/disputes-groups      — карточка: «Группы споров»
     PUT   /api/merchants/{merchant}/config               — сохранение карточки целиком
     GET   /api/variables/merchants  ·  PATCH /api/variables/merchants <- { attemptsCount, minAttemptTime }
     GET   /api/payment-types                             — список для фильтра «Тип оплаты»

   Живой ответ списка (31.10.2026):
     { merchant: "SOUZ", name: "Souz", isOn: false, merchantOrder: 1,
       minAmount: 1, maxAmount: 50000, minDealsCount: 0,
       requiredReceipt: { name: "NOT_REQUIRED", description: "Не требуется", ... } }
   merchant — код для запросов, name — подпись в таблице.
   ============================================================ */

const API = '/api/merchants';
const PAGE_SIZE = 25;
const SORT = 'merchantOrder,asc';

// Требуемый чек: подписи и цвета плашек — по ТЗ.
const RECEIPTS = [
  { value: 'NOT_REQUIRED', label: 'Не требуется', tone: 'grey' },
  { value: 'ANY', label: 'Любой чек', tone: 'green' },
  { value: 'PDF', label: 'PDF чек', tone: 'blue' },
];
const receiptOf = (row) => RECEIPTS.find((r) => r.value === row.requiredReceipt?.name)
    || { value: row.requiredReceipt?.name || '', label: row.requiredReceipt?.description || '—', tone: 'grey' };

const HELP_TEXT = [
  'Используйте стрелки ⬆⬇ для перемещения строк или измените номер в колонке «№» и нажмите Enter.',
  'Суммы, количество сделок и требуемый чек меняются по клику в ячейке.',
  'Чтобы изменить статус, нажмите на чекбокс: ✓ — включено, ☐ — выключено.',
  'Для доп. редактирования дважды кликните на название мерчанта.',
];

const isWhole = (s) => /^\d+$/.test(String(s).trim());

/* ---------- Тост ---------- */
function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((message, type = 'info') => {
    window.clearTimeout(timer.current);
    setToast({ message, type, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  const node = toast ? <div key={toast.key} className={`toast ${toast.type}`}>{toast.message}</div> : null;
  return { show, node };
}

/* ---------- Модальное окно: затемнение, Escape, шапка с иконкой ---------- */
function Modal({ icon, title, onClose, busy, wide, children, foot }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
        <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
          <div className="modal-head">
            <span className="modal-icon"><i className={icon} /></span>
            <h2>{title}</h2>
            <button type="button" className="modal-x" onClick={onClose} disabled={busy} aria-label="Закрыть">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {foot && <div className="modal-foot">{foot}</div>}
        </div>
      </div>
  );
}

/* Поле ввода с кнопкой очистки (поиск, «Переменные»). */
function ClearableInput({ value, onChange, icon, invalid, ...rest }) {
  return (
      <div className={`input-clear${icon ? ' with-icon' : ''}`}>
        {icon && <i className={`input-icon ${icon}`} />}
        <input value={value} onChange={(e) => onChange(e.target.value)} className={invalid ? 'invalid' : ''} {...rest} />
        {value !== '' && (
            <button type="button" className="clear-btn" onClick={() => onChange('')} aria-label="Очистить">
              <i className="fa-solid fa-xmark" />
            </button>
        )}
      </div>
  );
}

/* Сворачиваемая панель (фильтр, панели карточки). */
function Panel({ title, icon, open, onToggle, nested, children }) {
  return (
      <section className={`panel${open ? ' open' : ''}${nested ? ' nested' : ''}`}>
        <button type="button" className="panel-head" onClick={onToggle} aria-expanded={open}>
          {icon && <span className="panel-icon"><i className={icon} /></span>}
          <span className="panel-title">{title}</span>
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} panel-caret`} />
        </button>
        {open && <div className="panel-body">{children}</div>}
      </section>
  );
}

/* ==================== Окно «Переменные» ====================
   Настройки поиска реквизитов, общие для всех мерчантов. Оба поля
   обязательны; при ошибке окно не закрывается. */
function VariablesModal({ onClose, showToast }) {
  const [form, setForm] = useState({ attemptsCount: '', minAttemptTime: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Ответ: [{ type: "ATTEMPTS_COUNT", description, value: 3 }, { type: "MIN_ATTEMPT_TIME", ... }]
    request('/api/variables/merchants')
        .then((d) => {
          const list = Array.isArray(d) ? d : [];
          const val = (type) => list.find((v) => v.type === type)?.value;
          setForm({
            attemptsCount: val('ATTEMPTS_COUNT') != null ? String(val('ATTEMPTS_COUNT')) : '',
            minAttemptTime: val('MIN_ATTEMPT_TIME') != null ? String(val('MIN_ATTEMPT_TIME')) : '',
          });
        })
        .catch((e) => setLoadError(e.message || 'Не удалось загрузить переменные'))
        .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = async () => {
    const errs = {};
    if (!isWhole(form.attemptsCount) || Number(form.attemptsCount) < 1) errs.attemptsCount = 'Укажите целое число от 1';
    if (!isWhole(form.minAttemptTime)) errs.minAttemptTime = 'Укажите целое число от 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await request('/api/variables/merchants', {
        method: 'PATCH',
        body: { attemptsCount: Number(form.attemptsCount), minAttemptTime: Number(form.minAttemptTime) },
      });
      showToast('Изменения сохранены', 'success');
      onClose();
    } catch (e) {
      // Окно остаётся открытым — значения можно поправить.
      showToast(e.message || 'Не удалось сохранить', 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = (k, label) => (
      <label className="field">
        <span className="field-label">{label} <span className="req">*</span></span>
        <ClearableInput value={form[k]} onChange={(v) => set(k, v)} inputMode="numeric" disabled={saving}
                        invalid={!!errors[k]} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        {errors[k] && <span className="field-error">{errors[k]}</span>}
      </label>
  );

  return (
      <Modal icon="fa-solid fa-gear" title="Переменные" onClose={onClose} busy={saving}
             foot={!loading && !loadError && (
                 <>
                   <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
                   <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                     {saving && <i className="fa-solid fa-spinner fa-spin" />} Сохранить
                   </button>
                 </>
             )}>
        {loading ? (
            <div className="state"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</div>
        ) : loadError ? (
            <div className="state state-error"><i className="fa-solid fa-circle-exclamation" /><span>{loadError}</span></div>
        ) : (
            <div className="form">
              {field('attemptsCount', 'Количество попыток')}
              {field('minAttemptTime', 'Минимальное время итерации')}
            </div>
        )}
      </Modal>
  );
}

/* ==================== Карточка мерчанта ====================
   Настройки, которых нет в таблице: успешные статусы, матрица
   автоподтверждения, привязка методов к типам оплат, группа споров.
   Всё сохраняется одним PUT …/config, поэтому данные всех панелей
   загружаются сразу при открытии, хотя панели свёрнуты. */
const CARD_PANELS = [
  { id: 'statuses', title: 'Статус автоподтверждения', icon: 'fa-regular fa-rectangle-list' },
  { id: 'confirm', title: 'Включение автоподтверждения', icon: 'fa-solid fa-bolt' },
  { id: 'binding', title: 'Привязка (типы оплат / методы)', icon: 'fa-solid fa-paperclip' },
  { id: 'groups', title: 'Группы споров', icon: 'fa-solid fa-user-group' },
];

// «Пул» (ADD_TO_POOL) по ТЗ выводится только у BTC.
const POOL_TYPE = 'ADD_TO_POOL';
const POOL_CURRENCY = 'BITCOIN';

function MerchantCard({ row, onClose, showToast }) {
  const [data, setData] = useState(null);   // { statuses, currencies, confirm, methods, paymentTypes, groups }
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState({});     // какие панели раскрыты; при открытии — все свёрнуты
  const [openCur, setOpenCur] = useState({});
  const [saving, setSaving] = useState(false);
  const base = `${API}/${encodeURIComponent(row.merchant)}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [statuses, currencies, pm, groups] = await Promise.all([
          request(`${base}/statuses`),
          request(`${API}/crypto-currencies`),
          request(`${base}/payment-methods`),
          request(`${base}/disputes-groups`),
        ]);
        const curList = Array.isArray(currencies) ? currencies : [];
        // Матрица автоподтверждения — отдельным запросом на каждую валюту.
        const confirmList = await Promise.all(curList.map((c) =>
            request(`${base}/auto-confirm-config`, { params: { currency: c.name } })));
        if (!alive) return;
        setData({
          statuses: (Array.isArray(statuses) ? statuses : []).map((s) => ({ ...s, selected: !!s.selected })),
          currencies: curList,
          confirm: Object.fromEntries(curList.map((c, i) => [c.name, {
            deliveryTypes: confirmList[i]?.allDeliveryTypes || [],
            types: (confirmList[i]?.autoConfirmTypeDTOList || [])
                .map((t) => ({ ...t, deliveryTypes: Array.isArray(t.deliveryTypes) ? t.deliveryTypes : [] })),
          }])),
          methods: Array.isArray(pm?.merchantMethods) ? pm.merchantMethods : [],
          paymentTypes: (Array.isArray(pm?.paymentTypes) ? pm.paymentTypes : [])
              .map((p) => ({ ...p, methods: Array.isArray(p.methods) ? p.methods : [] })),
          groups: (Array.isArray(groups) ? groups : []).map((g) => ({ ...g, selected: !!g.selected })),
        });
      } catch (e) {
        if (alive) setLoadError(e.message || 'Не удалось загрузить настройки мерчанта');
      }
    })();
    return () => { alive = false; };
  }, [base]);

  const toggleStatus = (name) => setData((d) => ({
    ...d, statuses: d.statuses.map((s) => (s.name === name ? { ...s, selected: !s.selected } : s)),
  }));

  const toggleDelivery = (cur, type, delivery) => setData((d) => {
    const c = d.confirm[cur];
    const types = c.types.map((t) => {
      if (t.name !== type) return t;
      const has = t.deliveryTypes.includes(delivery);
      return { ...t, deliveryTypes: has ? t.deliveryTypes.filter((x) => x !== delivery) : [...t.deliveryTypes, delivery] };
    });
    return { ...d, confirm: { ...d.confirm, [cur]: { ...c, types } } };
  });

  const toggleBinding = (pid, method) => setData((d) => ({
    ...d,
    paymentTypes: d.paymentTypes.map((p) => {
      if (p.pid !== pid) return p;
      const has = p.methods.includes(method);
      return { ...p, methods: has ? p.methods.filter((m) => m !== method) : [...p.methods, method] };
    }),
  }));

  // Группа у мерчанта одна (group_chat_id): отметка новой снимает прежнюю, повторный клик — снимает совсем.
  const toggleGroup = (pid) => setData((d) => ({
    ...d, groups: d.groups.map((g) => ({ ...g, selected: g.pid === pid ? !g.selected : false })),
  }));

  const save = async () => {
    setSaving(true);
    try {
      const group = data.groups.find((g) => g.selected);
      await request(`${base}/config`, {
        method: 'PUT',
        body: {
          merchant: row.merchant,
          successStatuses: data.statuses.filter((s) => s.selected).map((s) => s.name),
          confirmConfig: data.currencies.map((c) => ({
            cryptoCurrency: c.name,
            autoConfirmTypes: data.confirm[c.name].types.map((t) => ({
              autoConfirmType: t.name,
              deliveryTypes: t.deliveryTypes,
            })),
          })),
          paymentTypes: data.paymentTypes.map((p) => ({ pid: p.pid, name: p.name, methods: p.methods })),
          groupChatId: group ? group.chatId : null,
        },
      });
      showToast('Изменения сохранены', 'success');
      onClose();
    } catch (e) {
      showToast(e.message || 'Не удалось сохранить', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const methodLabel = (name) => data.methods.find((m) => m.name === name)?.description || name;

  const body = () => {
    if (loadError) return <div className="state state-error"><i className="fa-solid fa-circle-exclamation" /><span>{loadError}</span></div>;
    if (!data) return <div className="state"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</div>;
    const p = CARD_PANELS;
    return (
        <div className="panels">
          <Panel {...p[0]} open={!!open.statuses} onToggle={() => toggle('statuses')}>
            {data.statuses.length === 0 ? <p className="panel-empty">Статусов нет</p> : (
                <table className="mini">
                  <thead><tr><th className="c-check">Выбрать</th><th>Статус</th></tr></thead>
                  <tbody>
                  {data.statuses.map((s) => (
                      <tr key={s.name} onClick={() => toggleStatus(s.name)}>
                        <td className="c-check"><input type="checkbox" checked={s.selected} readOnly tabIndex={-1} /></td>
                        <td title={s.name}>{s.description || s.name}</td>
                      </tr>
                  ))}
                  </tbody>
                </table>
            )}
          </Panel>

          <Panel {...p[1]} open={!!open.confirm} onToggle={() => toggle('confirm')}>
            {data.currencies.length === 0 ? <p className="panel-empty">Нет валют с автоподтверждением</p>
                : data.currencies.map((c) => {
                  const cfg = data.confirm[c.name];
                  const types = cfg.types.filter((t) => t.name !== POOL_TYPE || c.name === POOL_CURRENCY);
                  return (
                      <Panel key={c.name} nested title={(c.shortName || c.name).toUpperCase()}
                             open={!!openCur[c.name]} onToggle={() => setOpenCur((o) => ({ ...o, [c.name]: !o[c.name] }))}>
                        <table className="mini matrix">
                          <thead><tr><th />{cfg.deliveryTypes.map((dt) => <th key={dt} className="c-center">{dt}</th>)}</tr></thead>
                          <tbody>
                          {types.map((t) => (
                              <tr key={t.name}>
                                <td>{t.description || t.name}</td>
                                {cfg.deliveryTypes.map((dt) => (
                                    <td key={dt} className="c-center">
                                      <input type="checkbox" checked={t.deliveryTypes.includes(dt)}
                                             onChange={() => toggleDelivery(c.name, t.name, dt)}
                                             aria-label={`${t.description || t.name}: ${dt}`} />
                                    </td>
                                ))}
                              </tr>
                          ))}
                          </tbody>
                        </table>
                      </Panel>
                  );
                })}
          </Panel>

          {/* Строки — типы оплат, колонки — методы мерчанта (как на рисунке 6 ТЗ). */}
          <Panel {...p[2]} open={!!open.binding} onToggle={() => toggle('binding')}>
            {data.paymentTypes.length === 0 || data.methods.length === 0
                ? <p className="panel-empty">{data.methods.length === 0 ? 'У мерчанта нет методов' : 'Нет типов оплат'}</p>
                : (
                    <div className="mini-scroll">
                      <table className="mini matrix">
                        <thead>
                        <tr>
                          <th />
                          {data.methods.map((m) => <th key={m.name} className="c-center" title={m.name}>{m.description || m.name}</th>)}
                        </tr>
                        </thead>
                        <tbody>
                        {data.paymentTypes.map((pt) => (
                            <tr key={pt.pid}>
                              <td>{pt.name}</td>
                              {data.methods.map((m) => (
                                  <td key={m.name} className="c-center">
                                    <input type="checkbox" checked={pt.methods.includes(m.name)}
                                           onChange={() => toggleBinding(pt.pid, m.name)}
                                           aria-label={`${pt.name}: ${methodLabel(m.name)}`} />
                                  </td>
                              ))}
                            </tr>
                        ))}
                        </tbody>
                      </table>
                    </div>
                )}
          </Panel>

          <Panel {...p[3]} open={!!open.groups} onToggle={() => toggle('groups')}>
            {data.groups.length === 0 ? <p className="panel-empty">Групп нет</p> : (
                <table className="mini">
                  <thead><tr><th className="c-check">Выбрать</th><th>Группы</th></tr></thead>
                  <tbody>
                  {data.groups.map((g) => (
                      <tr key={g.pid} onClick={() => toggleGroup(g.pid)}>
                        <td className="c-check"><input type="checkbox" checked={g.selected} readOnly tabIndex={-1} /></td>
                        <td>{g.name || g.chatId}</td>
                      </tr>
                  ))}
                  </tbody>
                </table>
            )}
          </Panel>
        </div>
    );
  };

  return (
      <Modal icon="fa-solid fa-gear" title={row.name || row.merchant} onClose={onClose} busy={saving} wide
             foot={(
                 <>
                   <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
                   <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !data}>
                     {saving && <i className="fa-solid fa-spinner fa-spin" />} Сохранить
                   </button>
                 </>
             )}>
        {body()}
      </Modal>
  );
}

/* ==================== Ячейка с редактированием по клику ====================
   Одновременно редактируется одна ячейка (editing в App). Enter — сохранить,
   Escape — отменить. Уход фокуса: верное значение сохраняется, неверное
   отбрасывается с сообщением. */
function NumberCell({ value, editing, disabled, onStart, onSave, onCancel, validate, className = '' }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) { setDraft(String(value ?? '')); setError(''); setTimeout(() => inputRef.current?.select(), 0); }
  }, [editing, value]);

  const commit = async (fromBlur) => {
    if (busy) return;
    const text = draft.trim();
    if (text === String(value ?? '')) { onCancel(); return; }
    const err = validate(text);
    if (err) {
      if (fromBlur) { onCancel(err); return; }
      setError(err);
      return;
    }
    setBusy(true);
    const ok = await onSave(Number(text));
    setBusy(false);
    if (!ok && !fromBlur) inputRef.current?.focus();
  };

  if (!editing) {
    return (
        <td className={`c-right mono${disabled ? '' : ' editable'} ${className}`}
            onClick={disabled ? undefined : onStart} title={disabled ? undefined : 'Изменить'}>
          {value ?? '—'}
        </td>
    );
  }
  return (
      <td className={`c-right editing ${className}`}>
        <input ref={inputRef} className={`cell-input${error ? ' invalid' : ''}`} inputMode="numeric" value={draft}
               disabled={busy}
               onChange={(e) => { setDraft(e.target.value); setError(''); }}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') commit(false);
                 if (e.key === 'Escape') onCancel();
               }}
               onBlur={() => commit(true)} />
        {error && <span className="cell-error">{error}</span>}
      </td>
  );
}

/* ==================== Приложение ==================== */
export default function App() {
  const { show: showToast, node: toastNode } = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Фильтр: search применяется с задержкой, пока печатают.
  const [filterOpen, setFilterOpen] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [paymentTypeId, setPaymentTypeId] = useState('');
  const [paymentTypes, setPaymentTypes] = useState([]);

  const [editing, setEditing] = useState(null); // { merchant, field }
  const [busyRow, setBusyRow] = useState(null); // merchant, пока идёт запрос по строке
  const [card, setCard] = useState(null);
  const [showVars, setShowVars] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
  }, []);

  // Типы оплат для фильтра: [{ pid, name, fiatCurrency, dealType, ... }]
  useEffect(() => {
    request('/api/payment-types')
        .then((d) => setPaymentTypes(Array.isArray(d) ? d : []))
        .catch(() => { /* без списка фильтр по типу оплаты будет пустым */ });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Смена условий фильтра — на первую страницу.
  useEffect(() => { setPage(0); }, [search, paymentTypeId]);

  const filtered = Boolean(search || paymentTypeId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    request(API, {
      params: { page, size: PAGE_SIZE, sort: SORT, search, paymentTypeId },
      withTotal: true,
    })
        .then(({ items, total: t }) => {
          if (!alive) return;
          setRows(items);
          setTotal(t);
          setError('');
          // Страница опустела (например, после перестановки на последней) — шаг назад.
          if (items.length === 0 && page > 0 && t > 0) setPage(Math.max(0, Math.ceil(t / PAGE_SIZE) - 1));
        })
        .catch((e) => { if (alive) setError(e.message || 'Не удалось загрузить мерчантов'); })
        .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, search, paymentTypeId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const resetFilter = () => { setSearchInput(''); setSearch(''); setPaymentTypeId(''); };

  /* Частичное обновление мерчанта. Возвращает true при успехе. */
  const patch = async (row, body, okText = 'Изменения сохранены') => {
    setBusyRow(row.merchant);
    try {
      const updated = await request(`${API}/${encodeURIComponent(row.merchant)}`, { method: 'PATCH', body });
      setRows((prev) => prev.map((r) => (r.merchant === row.merchant
          ? (updated && typeof updated === 'object' ? { ...r, ...updated } : { ...r, ...body })
          : r)));
      showToast(okText, 'success');
      return true;
    } catch (e) {
      showToast(e.message || 'Не удалось сохранить', 'error');
      return false;
    } finally {
      setBusyRow(null);
    }
  };

  const stopEdit = (err) => {
    setEditing(null);
    if (err) showToast(`${err} — значение не сохранено`, 'error');
  };

  const isEditing = (row, field) => editing?.merchant === row.merchant && editing?.field === field;
  const startEdit = (row, field) => { if (!busyRow) setEditing({ merchant: row.merchant, field }); };

  /* Суммы и количество сделок: целые от 0; мин. сумма не больше макс. */
  const amountValidator = (row, field) => (text) => {
    if (!isWhole(text)) return 'Нужно целое число от 0';
    const v = Number(text);
    if (field === 'minAmount' && row.maxAmount != null && v > row.maxAmount) return 'Мин. сумма больше макс.';
    if (field === 'maxAmount' && row.minAmount != null && v < row.minAmount) return 'Макс. сумма меньше мин.';
    return '';
  };

  const saveField = (row, field) => async (value) => {
    const ok = await patch(row, { [field]: value });
    if (ok) setEditing(null);
    return ok;
  };

  /* Очерёдность: новый номер — merchantOrder, остальные бэк сдвигает сам.
     Очерёдность сквозная, поэтому после перестановки перечитываем страницу. */
  const moveTo = async (row, order) => {
    const ok = await patch(row, { merchantOrder: order });
    if (ok) { setEditing(null); reload(); }
    return ok;
  };

  const orderValidator = (text) => {
    if (!isWhole(text) || Number(text) < 1) return 'Нужно целое число от 1';
    if (Number(text) > total) return `Не больше ${total}`;
    return '';
  };

  const toggleOn = (row) => {
    const next = !row.isOn;
    patch(row, { isOn: next }, next ? 'Мерчант включён' : 'Мерчант отключён');
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE + rows.length);

  return (
      <div className="app">
        <header className="header">
          <div className="header-title">
            <span className="icon"><i className="fa-solid fa-gear" /></span>
            <h1>Управление мерчантами</h1>
          </div>
          <div className="header-actions">
            <button type="button" className="round-btn" onClick={() => setShowVars(true)} title="Переменные" aria-label="Переменные">
              <i className="fa-solid fa-gear" />
            </button>
            <button type="button" className="round-btn" onClick={() => setShowHelp(true)} title="Подсказка" aria-label="Подсказка">
              <i className="fa-solid fa-question" />
            </button>
          </div>
        </header>

        <section className="card">
          <button type="button" className="filter-head" onClick={() => setFilterOpen((v) => !v)} aria-expanded={filterOpen}>
            <span>Фильтр</span>
            <i className={`fa-solid fa-chevron-${filterOpen ? 'up' : 'down'}`} />
          </button>
          {filterOpen && (
              <div className="filter-body">
                <div className="filter-row">
                  <label className="field">
                    <span className="field-label">Поиск</span>
                    <ClearableInput value={searchInput} onChange={setSearchInput} icon="fa-solid fa-magnifying-glass"
                                    placeholder="Название мерчанта" />
                  </label>
                  <label className="field">
                    <span className="field-label">Тип оплаты</span>
                    <select value={paymentTypeId} onChange={(e) => setPaymentTypeId(e.target.value)}>
                      <option value="">Все</option>
                      {paymentTypes.map((p) => (
                          <option key={p.pid} value={p.pid}>
                            {p.name}{p.fiatCurrency ? ` · ${p.fiatCurrency}` : ''}
                          </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <button type="button" className="btn btn-secondary" onClick={resetFilter}
                          disabled={!searchInput && !paymentTypeId}>
                    Сбросить
                  </button>
                </div>
              </div>
          )}
        </section>

        {error && !loading && rows.length === 0 ? (
            <div className="state state-error">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{error}</span>
              <button type="button" className="btn btn-secondary" onClick={reload}>Повторить</button>
            </div>
        ) : (
            <div className="table-card">
              <p className="table-hint">
                {filtered
                    ? 'Во время поиска порядок мерчантов менять нельзя — сбросьте фильтр.'
                    : 'Значения в таблице меняются по клику в ячейке. Двойной клик по названию мерчанта — дополнительные настройки'}
              </p>
              <div className={`table-wrap${loading ? ' is-loading' : ''}`}>
                <table className="grid">
                  <thead>
                  <tr>
                    <th className="c-center c-order">№</th>
                    <th className="c-center c-on">Вкл.</th>
                    <th>Мерчант</th>
                    <th className="c-right">Мин. сумма</th>
                    <th className="c-right">Макс. сумма</th>
                    <th className="c-right">Кол-во сделок</th>
                    <th>Требуемый чек</th>
                    <th className="c-arrow" aria-label="Выше" />
                    <th className="c-arrow" aria-label="Ниже" />
                  </tr>
                  </thead>
                  <tbody>
                  {loading && rows.length === 0 ? (
                      <tr><td colSpan={9} className="empty"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</td></tr>
                  ) : rows.length === 0 ? (
                      <tr><td colSpan={9} className="empty">Мерчанты не найдены</td></tr>
                  ) : rows.map((r) => {
                    const busy = busyRow === r.merchant;
                    const rc = receiptOf(r);
                    const order = r.merchantOrder;
                    return (
                        <tr key={r.merchant} className={r.isOn ? '' : 'is-off'}>
                          <NumberCell
                              className="c-center c-order"
                              value={order}
                              editing={isEditing(r, 'merchantOrder')}
                              disabled={filtered || busy}
                              onStart={() => startEdit(r, 'merchantOrder')}
                              onCancel={stopEdit}
                              validate={orderValidator}
                              onSave={(v) => moveTo(r, v)}
                          />
                          <td className="c-center c-on">
                            <input type="checkbox" checked={!!r.isOn} disabled={busy} onChange={() => toggleOn(r)}
                                   aria-label={r.isOn ? 'Отключить' : 'Включить'} />
                          </td>
                          <td className="c-name" onDoubleClick={() => setCard(r)} title="Двойной клик — дополнительные настройки">
                            {r.name || r.merchant}
                          </td>
                          {['minAmount', 'maxAmount', 'minDealsCount'].map((f) => (
                              <NumberCell
                                  key={f}
                                  value={r[f]}
                                  editing={isEditing(r, f)}
                                  disabled={busy}
                                  onStart={() => startEdit(r, f)}
                                  onCancel={stopEdit}
                                  validate={f === 'minDealsCount' ? (t) => (isWhole(t) ? '' : 'Нужно целое число от 0') : amountValidator(r, f)}
                                  onSave={saveField(r, f)}
                              />
                          ))}
                          {isEditing(r, 'requiredReceipt') ? (
                              <td className="editing">
                                <select className="cell-select" autoFocus defaultValue={rc.value} disabled={busy}
                                        onChange={async (e) => {
                                          const ok = await patch(r, { requiredReceipt: e.target.value });
                                          if (ok) {
                                            const rec = RECEIPTS.find((x) => x.value === e.target.value);
                                            setRows((prev) => prev.map((x) => (x.merchant === r.merchant && x.requiredReceipt?.name !== e.target.value
                                                ? { ...x, requiredReceipt: { name: rec.value, description: rec.label } } : x)));
                                          }
                                          setEditing(null);
                                        }}
                                        onBlur={() => { if (!busy) setEditing(null); }}
                                        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}>
                                  {RECEIPTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                                </select>
                              </td>
                          ) : (
                              <td className={busy ? '' : 'editable'} onClick={busy ? undefined : () => startEdit(r, 'requiredReceipt')}
                                  title={busy ? undefined : 'Изменить'}>
                                <span className={`badge badge-${rc.tone}`}>{rc.label}</span>
                              </td>
                          )}
                          <td className="c-arrow">
                            <button type="button" className="arrow-btn" disabled={filtered || busy || order <= 1}
                                    onClick={() => moveTo(r, order - 1)} title="Выше" aria-label="Переместить выше">
                              <i className="fa-solid fa-arrow-up" />
                            </button>
                          </td>
                          <td className="c-arrow">
                            <button type="button" className="arrow-btn" disabled={filtered || busy || order >= total}
                                    onClick={() => moveTo(r, order + 1)} title="Ниже" aria-label="Переместить ниже">
                              <i className="fa-solid fa-arrow-down" />
                            </button>
                          </td>
                        </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
              {total > 0 && (
                  <div className="pager">
                    <span className="pager-info">Показано {from}–{to} из {total}</span>
                    <div className="pager-nav">
                      <button type="button" className="arrow-btn" disabled={page === 0 || loading}
                              onClick={() => setPage(0)} aria-label="Первая страница"><i className="fa-solid fa-angles-left" /></button>
                      <button type="button" className="arrow-btn" disabled={page === 0 || loading}
                              onClick={() => setPage((p) => p - 1)} aria-label="Предыдущая страница"><i className="fa-solid fa-angle-left" /></button>
                      <span className="pager-page">{page + 1} / {pageCount}</span>
                      <button type="button" className="arrow-btn" disabled={page >= pageCount - 1 || loading}
                              onClick={() => setPage((p) => p + 1)} aria-label="Следующая страница"><i className="fa-solid fa-angle-right" /></button>
                      <button type="button" className="arrow-btn" disabled={page >= pageCount - 1 || loading}
                              onClick={() => setPage(pageCount - 1)} aria-label="Последняя страница"><i className="fa-solid fa-angles-right" /></button>
                    </div>
                  </div>
              )}
            </div>
        )}

        {card && <MerchantCard row={card} onClose={() => setCard(null)} showToast={showToast} />}
        {showVars && <VariablesModal onClose={() => setShowVars(false)} showToast={showToast} />}
        {showHelp && (
            <Modal icon="fa-solid fa-question" title="Подсказка" onClose={() => setShowHelp(false)}
                   foot={<button type="button" className="btn btn-primary" onClick={() => setShowHelp(false)}>Понятно</button>}>
              <div className="help">{HELP_TEXT.map((t) => <p key={t}>{t}</p>)}</div>
            </Modal>
        )}

        {toastNode}
      </div>
  );
}
