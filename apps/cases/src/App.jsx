import { useCallback, useEffect, useMemo, useState } from 'react';
import MessageEditor from '../../shared/MessageEditor.jsx';
import { request } from '../../shared/request.js';

/* ============================================================
   Кейсы — веб-апп админки. Заменяет механику лотереи.

   Четыре вкладки:
     Общие     — переменные CASES_* (/api/variables)
     Призы     — шансы по суммам, одна строка CASES_PRIZE_CHANCES
     Сообщения — шаблоны CASE_* через общий MessageEditor
     Выигрыши  — таблица case_win (/api/cases/winners, PATCH /api/cases)
   ============================================================ */

const TABS = [
  { id: 'general', title: 'Общие', icon: 'fa-sliders' },
  { id: 'prizes', title: 'Призы', icon: 'fa-gift' },
  { id: 'messages', title: 'Сообщения', icon: 'fa-comment-dots' },
  { id: 'winners', title: 'Выигрыши', icon: 'fa-trophy' },
];

/* ---------------- Вкладка «Общие» ---------------- */

const VARIABLE_KEYS = [
  'CASES_ENABLED',
  'CASES_COUNT',
  'CASE_NAME_TEMPLATE',
  'CASES_ANIMATION_SECONDS',
  'CASES_PRIZE_CHANCES',
];

// Плейсхолдер, который обязан быть в названии кнопки кейса.
const NAME_PLACEHOLDER = '{номер кейса}';

const GENERAL_FIELDS = [
  {
    id: 'CASES_COUNT', kind: 'int', label: 'Количество кейсов',
    hint: 'Сколько кнопок с кейсами увидит пользователь',
  },
  {
    id: 'CASE_NAME_TEMPLATE', kind: 'text', label: 'Название кейса',
    hint: `Плейсхолдер: ${NAME_PLACEHOLDER} — порядковый номер`,
  },
  {
    id: 'CASES_ANIMATION_SECONDS', kind: 'int', label: 'Длительность анимации открытия кейса, сек',
    hint: 'Сколько секунд крутится анимация перед результатом',
  },
];

/* ---------------- Вкладка «Призы» ---------------- */

// Суммы зафиксированы, на вкладке не редактируются. Порядок важен:
// в CASES_PRIZE_CHANCES шансы идут ровно в этом порядке.
const PRIZE_AMOUNTS = [0, 250, 500, 1000, 3000, 10000];

/* ---------------- Вкладка «Сообщения» ---------------- */

const MESSAGES = [
  { code: 'CASE_START_MESSAGE', hint: 'Плейсхолдер: {количество открытий}' },
  { code: 'CASE_SELECT_MESSAGE' },
  { code: 'CASE_ANIMATION', hint: 'Анимация прокрутки кейса' },
  { code: 'CASE_WIN_MESSAGE_250', hint: 'Плейсхолдер: {номер выигрыша}' },
  { code: 'CASE_WIN_MESSAGE_500', hint: 'Плейсхолдер: {номер выигрыша}' },
  { code: 'CASE_WIN_MESSAGE_1000', hint: 'Плейсхолдер: {номер выигрыша}' },
  { code: 'CASE_WIN_MESSAGE_3000', hint: 'Плейсхолдер: {номер выигрыша}' },
  { code: 'CASE_WIN_MESSAGE_10000', hint: 'Плейсхолдер: {номер выигрыша}' },
  { code: 'CASE_LOSE_MESSAGE' },
  { code: 'CASE_WIN_BROADCAST_MESSAGE', hint: 'Плейсхолдеры: {пользователь}, {сумма приза}, {номер выигрыша}' },
  { code: 'CASE_REF_CREDITED_MESSAGE', hint: 'Плейсхолдеры: {номер выигрыша}, {сумма приза}' },
];

/* ---------------- Вкладка «Выигрыши» ---------------- */

const PAGE_SIZE = 25;

const EMPTY_WIN_FILTER = {
  caseNumber: '',
  dateMode: 'eq',   // eq — одна дата, range — период
  dateEq: '',
  dateFrom: '',
  dateTo: '',
  chatId: '',
  username: '',
  amount: '',
  status: '',
};

/* ---------------- Общее ---------------- */

const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const toStr = (v) => (v == null ? '' : String(v));

// Целое строго больше нуля.
const isPositiveInt = (v) => /^\d+$/.test(String(v).trim()) && Number(v) > 0;

const fmtMoney = (v) => `${Number(v || 0).toLocaleString('ru-RU')} ₽`;

/* Дата из <input type="date"> в формат, который принимает бэк.
   Пример из коллекции: 2026-09-20T05:00 — без зоны. */
function dayBound(value, edge) {
  if (!value) return '';
  return `${value}T${edge === 'end' ? '23:59:59' : '00:00:00'}`;
}

const api = {
  variableTypes: () => request('/api/variables/types'),
  variables: () => request('/api/variables'),
  saveVariable: (variableType, value) =>
      request('/api/variables', {
        method: 'POST',
        body: { variableType, fiatCurrency: null, dealType: null, cryptoCurrency: null, value },
      }),

  // Текст сообщения правится в MessageEditor, а сохраняется общей кнопкой
  // вкладки — поэтому запрос живёт здесь.
  saveMessage: (code, text) =>
      request(`/api/message_image/image/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: { text },
      }),

  caseStatuses: () => request('/api/cases/statuses'),
  winners: (body) => request('/api/cases/winners', { method: 'POST', body, withTotal: true }),
  saveStatuses: (rows) => request('/api/cases', { method: 'PATCH', body: rows }),
};

export default function App() {
  const [tab, setTab] = useState('general');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [labels, setLabels] = useState({});

  // Значения переменных: тумблер, поля вкладки «Общие» и строка шансов.
  const [enabled, setEnabled] = useState(false);
  const [general, setGeneral] = useState({
    CASES_COUNT: '', CASE_NAME_TEMPLATE: '', CASES_ANIMATION_SECONDS: '',
  });
  const [chances, setChances] = useState(PRIZE_AMOUNTS.map(() => ''));

  // Сохранённые значения — чтобы понимать, что изменилось.
  const [savedGeneral, setSavedGeneral] = useState(general);
  const [savedChances, setSavedChances] = useState(chances);
  const [savedEnabled, setSavedEnabled] = useState(false);
  /* Ошибки показываем не сразу: пустые поля при первом открытии — это не
     ошибка пользователя. Помечаем поля, которых касались, и вкладки, на
     которых нажимали «Сохранить». */
  const [touched, setTouched] = useState({});
  const [triedGeneral, setTriedGeneral] = useState(false);
  const [triedPrizes, setTriedPrizes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [types, values] = await Promise.all([api.variableTypes(), api.variables()]);

      const lbl = {};
      (types || [])
          .filter((t) => String(t.id ?? t.variableType ?? '').startsWith('CASE'))
          .forEach((t) => {
            const key = t.id ?? t.variableType;
            if (t.displayName) lbl[key] = t.displayName;
          });

      const map = {};
      (values || [])
          .filter((v) => VARIABLE_KEYS.includes(v.variableType ?? v.type ?? v.id))
          .forEach((v) => { map[v.variableType ?? v.type ?? v.id] = v.value; });

      const nextGeneral = {
        CASES_COUNT: toStr(map.CASES_COUNT),
        CASE_NAME_TEMPLATE: toStr(map.CASE_NAME_TEMPLATE),
        CASES_ANIMATION_SECONDS: toStr(map.CASES_ANIMATION_SECONDS),
      };
      // Шансы приходят строкой «60;15;10;8;5;2» в порядке сумм.
      const parts = toStr(map.CASES_PRIZE_CHANCES).split(';');
      const nextChances = PRIZE_AMOUNTS.map((_, i) => toStr(parts[i]).trim());

      setLabels(lbl);
      setEnabled(toBool(map.CASES_ENABLED));
      setSavedEnabled(toBool(map.CASES_ENABLED));
      setGeneral(nextGeneral);
      setSavedGeneral(nextGeneral);
      setChances(nextChances);
      setSavedChances(nextChances);
      setTouched({});
      setTriedGeneral(false);
      setTriedPrizes(false);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const labelOf = (id, fallback) => labels[id] || fallback;

  /* ---- проверки ---- */

  const generalErrors = useMemo(() => {
    const e = {};
    if (!isPositiveInt(general.CASES_COUNT)) e.CASES_COUNT = 'Укажите целое число больше нуля';
    if (!isPositiveInt(general.CASES_ANIMATION_SECONDS)) {
      e.CASES_ANIMATION_SECONDS = 'Укажите целое число больше нуля';
    }
    if (!general.CASE_NAME_TEMPLATE.includes(NAME_PLACEHOLDER)) {
      e.CASE_NAME_TEMPLATE = `В названии кейса должен быть плейсхолдер ${NAME_PLACEHOLDER}`;
    }
    return e;
  }, [general]);

  const chancesSum = useMemo(
      () => chances.reduce((acc, c) => acc + (/^\d+$/.test(c.trim()) ? Number(c) : 0), 0),
      [chances],
  );

  const prizesError = useMemo(() => {
    if (chances.some((c) => c.trim() === '')) return 'Укажите значения шансов для каждой суммы';
    if (chances.some((c) => !/^\d+$/.test(c.trim()) || Number(c) < 0 || Number(c) > 100)) {
      return 'Шанс указывается целым числом от 0 до 100';
    }
    if (chancesSum !== 100) return `Сумма шансов должна быть равна 100 %, сейчас ${chancesSum} %`;
    return '';
  }, [chances, chancesSum]);

  // Тумблер доступен, только когда обе вкладки заполнены без ошибок.
  const canEnable = Object.keys(generalErrors).length === 0 && !prizesError;

  // Ошибка поля — к показу, если поле трогали или нажимали «Сохранить».
  const errorOf = (id) => ((touched[id] || triedGeneral) ? generalErrors[id] : '');
  const prizesShownError = (touched.prizes || triedPrizes) ? prizesError : '';
  const markTouched = (id) => setTouched((t) => (t[id] ? t : { ...t, [id]: true }));

  /* ---- сохранение ---- */

  const [saving, setSaving] = useState(false);

  const saveVars = async (pairs, okText) => {
    setSaving(true);
    try {
      for (const [key, value] of pairs) {
        // eslint-disable-next-line no-await-in-loop
        await api.saveVariable(key, value);
      }
      showToast(okText, 'success');
      return true;
    } catch (e) {
      showToast(e.message || 'Не удалось сохранить', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onSaveGeneral = async () => {
    setTriedGeneral(true);
    if (Object.keys(generalErrors).length) return;

    const pairs = [];
    Object.keys(general).forEach((k) => {
      if (general[k].trim() !== savedGeneral[k]) pairs.push([k, general[k].trim()]);
    });
    if (enabled !== savedEnabled) pairs.push(['CASES_ENABLED', String(enabled)]);

    if (!pairs.length) { showToast('Изменений нет', 'info'); return; }

    if (await saveVars(pairs, 'Настройки сохранены')) {
      setSavedGeneral({
        CASES_COUNT: general.CASES_COUNT.trim(),
        CASE_NAME_TEMPLATE: general.CASE_NAME_TEMPLATE.trim(),
        CASES_ANIMATION_SECONDS: general.CASES_ANIMATION_SECONDS.trim(),
      });
      setSavedEnabled(enabled);
    }
  };

  const onSavePrizes = async () => {
    setTriedPrizes(true);
    if (prizesError) return;
    const line = chances.map((c) => c.trim()).join(';');
    if (line === savedChances.map((c) => c.trim()).join(';')) {
      showToast('Изменений нет', 'info');
      return;
    }
    if (await saveVars([['CASES_PRIZE_CHANCES', line]], 'Шансы сохранены')) {
      setSavedChances(chances.map((c) => c.trim()));
    }
  };

  const onToggle = () => {
    if (!enabled && !canEnable) return;
    setEnabled((v) => !v);
  };

  /* ---- состояния ---- */

  if (loading) {
    return (
        <div className="app">
          <div className="state">
            <div className="spinner" />
            <div>Загрузка настроек…</div>
          </div>
        </div>
    );
  }
  if (error) {
    return (
        <div className="app">
          <div className="state">
            <i className="fa-solid fa-triangle-exclamation" />
            <div>Не удалось загрузить настройки.</div>
            <div className="hint">{error}</div>
            <button className="btn btn-secondary" onClick={load}>
              <i className="fa-solid fa-rotate-right" /> Повторить
            </button>
          </div>
        </div>
    );
  }

  return (
      <div className="app">
        <div className="header">
          <div className="icon"><i className="fa-solid fa-box-open" /></div>
          <h1>Кейсы</h1>
        </div>

        <div className="tabs" role="tablist">
          {TABS.map((t) => (
              <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`tab${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
              >
                <i className={`fa-solid ${t.icon}`} />
                <span>{t.title}</span>
              </button>
          ))}
        </div>

        {tab === 'general' && (
            <>
              <div className="card rows">
                <div className="row">
                  <span className="row-label">{labelOf('CASES_ENABLED', 'Кейсы включены')}</span>
                  <label className={`switch${!enabled && !canEnable ? ' disabled' : ''}`}>
                    <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!enabled && !canEnable}
                        onChange={onToggle}
                    />
                    <span className="track" />
                    <span className="thumb" />
                  </label>
                </div>
                {!enabled && !canEnable && (
                    <div className="row-note">Заполните настройки на вкладках «Общие» и «Призы»</div>
                )}

                {GENERAL_FIELDS.map((fld) => (
                    <div className="row" key={fld.id}>
                      <label className="row-label" htmlFor={fld.id}>{labelOf(fld.id, fld.label)}</label>
                      <div className="row-control">
                        <input
                            id={fld.id}
                            type={fld.kind === 'int' ? 'number' : 'text'}
                            inputMode={fld.kind === 'int' ? 'numeric' : undefined}
                            min={fld.kind === 'int' ? 1 : undefined}
                            className={`${fld.kind === 'int' ? 'in-num' : 'in-text'}${errorOf(fld.id) ? ' invalid' : ''}`}
                            value={general[fld.id]}
                            onBlur={() => markTouched(fld.id)}
                            onChange={(e) => {
                              markTouched(fld.id);
                              setGeneral((g) => ({ ...g, [fld.id]: e.target.value }));
                            }}
                        />
                        {errorOf(fld.id) && <span className="err">{errorOf(fld.id)}</span>}
                      </div>
                    </div>
                ))}
              </div>

              <div className="save-row">
                <button className="btn btn-primary" onClick={onSaveGeneral} disabled={saving}>
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </>
        )}

        {tab === 'prizes' && (
            <>
              <div className="card rows">
                <div className="row row-head">
                  <span>Сумма приза</span>
                  <span>Шанс, %</span>
                </div>

                {PRIZE_AMOUNTS.map((amount, i) => (
                    <div className="row" key={amount}>
                      <span className="row-label">{fmtMoney(amount)}</span>
                      <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          className={`in-num${prizesShownError ? ' invalid' : ''}`}
                          aria-label={`Шанс для суммы ${amount}`}
                          value={chances[i]}
                          onBlur={() => markTouched('prizes')}
                          onChange={(e) => {
                            markTouched('prizes');
                            setChances((c) => {
                              const next = [...c];
                              next[i] = e.target.value;
                              return next;
                            });
                          }}
                      />
                    </div>
                ))}

                <div className="row row-total">
                  <span>Итого</span>
                  <b className={chancesSum === 100 ? 'ok' : 'bad'}>{chancesSum} %</b>
                </div>

                {prizesShownError && <div className="row-note err">{prizesShownError}</div>}
              </div>

              <div className="save-row">
                <button className="btn btn-primary" onClick={onSavePrizes} disabled={saving}>
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </>
        )}

        {tab === 'messages' && <MessagesTab showToast={showToast} />}

        {tab === 'winners' && <WinnersTab showToast={showToast} />}

        {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      </div>
  );
}


/* Окно из нескольких номеров страниц вокруг текущей. */
function pageNumbers(page, pages) {
  const window = 3;
  let from = Math.max(0, page - Math.floor(window / 2));
  const to = Math.min(pages, from + window);
  from = Math.max(0, to - window);
  const out = [];
  for (let i = from; i < to; i += 1) out.push(i);
  return out;
}

/* ==================== Вкладка «Сообщения» ==================== */
/* Тексты правятся в общем MessageEditor в управляемом режиме: он показывает
   поле и блок вложения, а сохраняются тексты одной кнопкой внизу вкладки.
   Картинка и видео сохраняются сразу, это делает сам компонент. */

function MessagesTab({ showToast }) {
  const [texts, setTexts] = useState({});    // текущее содержимое полей
  const [saved, setSaved] = useState({});    // что уже лежит на сервере
  const [saving, setSaving] = useState(false);

  const setText = (code, value) => setTexts((p) => ({ ...p, [code]: value }));

  const onLoaded = (code, value) => {
    setTexts((p) => ({ ...p, [code]: value }));
    setSaved((p) => ({ ...p, [code]: value }));
  };

  const changed = MESSAGES.filter((m) => (texts[m.code] ?? '') !== (saved[m.code] ?? ''));

  const save = async () => {
    if (!changed.length) { showToast('Изменений нет', 'info'); return; }
    setSaving(true);
    try {
      for (const m of changed) {
        // eslint-disable-next-line no-await-in-loop
        await api.saveMessage(m.code, texts[m.code] ?? '');
      }
      setSaved((p) => {
        const next = { ...p };
        changed.forEach((m) => { next[m.code] = texts[m.code] ?? ''; });
        return next;
      });
      showToast(changed.length === 1 ? 'Сообщение сохранено' : 'Сообщения сохранены', 'success');
    } catch (e) {
      showToast(e.message || 'Не удалось сохранить', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
      <>
        <div className="card">
          <div className="msg-list">
            {MESSAGES.map((m) => (
                <MessageEditor
                    key={m.code}
                    code={m.code}
                    hint={m.hint}
                    showToast={showToast}
                    value={texts[m.code] ?? ''}
                    onChange={(v) => setText(m.code, v)}
                    onLoaded={(v) => onLoaded(m.code, v)}
                />
            ))}
          </div>
        </div>

        <div className="save-row">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </>
  );
}

/* ==================== Вкладка «Выигрыши» ==================== */

function WinnersTab({ showToast }) {
  const [statuses, setStatuses] = useState([]);
  const [draft, setDraft] = useState(EMPTY_WIN_FILTER);
  const [applied, setApplied] = useState(EMPTY_WIN_FILTER);
  const [openFilter, setOpenFilter] = useState(false);   // по ТЗ свёрнут

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Выбранные в списках статусы, ещё не сохранённые: {id: name}
  const [edits, setEdits] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.caseStatuses()
        .then((list) => setStatuses(Array.isArray(list) ? list : []))
        .catch(() => setStatuses([]));
  }, []);

  const load = useCallback(async (filter, pageNum) => {
    setLoading(true);
    try {
      const body = { page: pageNum, size: PAGE_SIZE };
      if (filter.caseNumber.trim()) body.caseNumber = Number(filter.caseNumber.trim());
      if (filter.chatId.trim()) body.winnerChatId = Number(filter.chatId.trim());
      if (filter.username.trim()) body.username = filter.username.trim();
      if (filter.amount) body.amount = Number(filter.amount);
      if (filter.status) body.status = filter.status;

      if (filter.dateMode === 'eq') {
        if (filter.dateEq) {
          body.drawnAt = dayBound(filter.dateEq, 'start');
          body.drawnTo = dayBound(filter.dateEq, 'end');
        }
      } else {
        if (filter.dateFrom) body.drawnAt = dayBound(filter.dateFrom, 'start');
        if (filter.dateTo) body.drawnTo = dayBound(filter.dateTo, 'end');
      }

      const r = await api.winners(body);
      setRows(r.items);
      setTotal(r.total);
      setEdits({});
    } catch (e) {
      setRows([]);
      setTotal(0);
      showToast(e.message || 'Не удалось загрузить выигрыши', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(applied, page); }, [applied, page, load]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const search = () => { setPage(0); setApplied(draft); };
  const reset = () => { setPage(0); setDraft(EMPTY_WIN_FILTER); setApplied(EMPTY_WIN_FILTER); };

  const statusLabel = (name) =>
      statuses.find((s) => s.name === name)?.description || name || '—';

  // Строки, у которых статус изменён в списке, но ещё не сохранён.
  const changed = useMemo(
      () => rows
          .map((r) => r.cases)
          .filter((c) => edits[c.id] && edits[c.id] !== c.status?.name),
      [rows, edits],
  );

  const applyStatuses = async () => {
    setSaving(true);
    try {
      await api.saveStatuses(changed.map((c) => ({ id: c.id, status: edits[c.id] })));
      showToast(changed.length === 1 ? 'Статус изменён' : 'Статусы изменены', 'success');
      setConfirm(null);
      load(applied, page);
    } catch (e) {
      showToast(e.message || 'Не удалось сохранить', 'error');
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
      <>
        <div className="card filter-card">
          <button
              type="button"
              className="filter-head"
              aria-expanded={openFilter}
              onClick={() => setOpenFilter((v) => !v)}
          >
            <span><i className="fa-solid fa-filter" /> Фильтр</span>
            <i className={`fa-solid fa-chevron-${openFilter ? 'up' : 'down'}`} />
          </button>

          {openFilter && (
              <div className="filter-body">
                <div className="field">
                  <label htmlFor="w-number">№ выигрыша</label>
                  <input id="w-number" type="text" inputMode="numeric" value={draft.caseNumber}
                         onChange={(e) => set('caseNumber', e.target.value)} />
                </div>

                <div className="field">
                  <label htmlFor="w-date-mode">Дата</label>
                  <select id="w-date-mode" value={draft.dateMode}
                          onChange={(e) => set('dateMode', e.target.value)}>
                    <option value="eq">Равна</option>
                    <option value="range">Диапазон</option>
                  </select>
                </div>

                {draft.dateMode === 'eq' ? (
                    <div className="field">
                      <label htmlFor="w-date">Значение</label>
                      <input id="w-date" type="date" value={draft.dateEq}
                             onChange={(e) => set('dateEq', e.target.value)} />
                    </div>
                ) : (
                    <>
                      <div className="field">
                        <label htmlFor="w-from">с</label>
                        <input id="w-from" type="date" value={draft.dateFrom}
                               onChange={(e) => set('dateFrom', e.target.value)} />
                      </div>
                      <div className="field">
                        <label htmlFor="w-to">по</label>
                        <input id="w-to" type="date" value={draft.dateTo}
                               onChange={(e) => set('dateTo', e.target.value)} />
                      </div>
                    </>
                )}

                <div className="field">
                  <label htmlFor="w-chat">Chat ID</label>
                  <input id="w-chat" type="text" inputMode="numeric" value={draft.chatId}
                         onChange={(e) => set('chatId', e.target.value)} />
                </div>

                <div className="field">
                  <label htmlFor="w-username">Username</label>
                  <input id="w-username" type="text" value={draft.username}
                         onChange={(e) => set('username', e.target.value)} />
                </div>

                <div className="field">
                  <label htmlFor="w-amount">Сумма</label>
                  <select id="w-amount" value={draft.amount}
                          onChange={(e) => set('amount', e.target.value)}>
                    <option value="">Все</option>
                    {PRIZE_AMOUNTS.filter((a) => a > 0).map((a) => (
                        <option key={a} value={a}>{fmtMoney(a)}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="w-status">Статус</label>
                  <select id="w-status" value={draft.status}
                          onChange={(e) => set('status', e.target.value)}>
                    <option value="">Все</option>
                    {statuses.map((st) => (
                        <option key={st.name} value={st.name}>{st.description}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-actions">
                  <button type="button" className="btn btn-primary" onClick={search} disabled={loading}>
                    <i className="fa-solid fa-magnifying-glass" /> Поиск
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={reset} disabled={loading}>
                    Сбросить
                  </button>
                </div>
              </div>
          )}
        </div>

        <div className="card">
          <div className="wins-wrap">
            <table className="wins">
              <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Chat ID</th>
                <th>Username</th>
                <th className="c-right">Сумма</th>
                <th>Статус</th>
              </tr>
              </thead>
              <tbody>
              {rows.map((r) => {
                const c = r.cases || {};
                const u = r.user || {};
                const value = edits[c.id] ?? c.status?.name ?? '';
                return (
                    <tr key={c.id}>
                      <td className="mono">{c.id}</td>
                      <td className="mono nowrap">{c.createdAt || '—'}</td>
                      <td className="mono">{u.chatId ?? '—'}</td>
                      <td>{u.username ? `@${u.username}` : '—'}</td>
                      <td className="c-right mono">{fmtMoney(c.amount)}</td>
                      <td>
                        <select
                            className="status-select"
                            aria-label={`Статус выигрыша №${c.id}`}
                            value={value}
                            onChange={(e) => setEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                        >
                          {statuses.map((s) => (
                              <option key={s.name} value={s.name}>{s.description}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          {loading && <div className="state state-inline"><div className="spinner" /></div>}
          {!loading && rows.length === 0 && (
              <div className="state state-inline">Выигрышей не найдено</div>
          )}

          <div className="pager">
          <span className="pager-info">
            Показано {rows.length} из {total}
          </span>

            <div className="pager-controls">
              <button type="button" className="pg-btn" disabled={loading || page === 0}
                      onClick={() => setPage(page - 1)} aria-label="Назад">
                <i className="fa-solid fa-angle-left" />
              </button>

              {pageNumbers(page, pages).map((p) => (
                  <button
                      key={p}
                      type="button"
                      className={`pg-num${p === page ? ' active' : ''}`}
                      disabled={loading}
                      onClick={() => setPage(p)}
                      aria-current={p === page ? 'page' : undefined}
                  >
                    {p + 1}
                  </button>
              ))}

              <button type="button" className="pg-btn" disabled={loading || page >= pages - 1}
                      onClick={() => setPage(page + 1)} aria-label="Вперёд">
                <i className="fa-solid fa-angle-right" />
              </button>
            </div>

            <button
                className="btn btn-primary"
                disabled={saving || changed.length === 0}
                onClick={() => setConfirm(true)}
            >
              Сохранить
            </button>
          </div>
        </div>

        {confirm && (
            <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
              <div className="modal">
                <div className="modal-head">Изменить статус выигрышей?</div>
                <div className="modal-body">
                  <ul className="changes">
                    {changed.map((c) => (
                        <li key={c.id}>
                          №{c.id} — {statusLabel(c.status?.name)} → {statusLabel(edits[c.id])}
                        </li>
                    ))}
                  </ul>
                </div>
                <div className="modal-foot">
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
                    Отмена
                  </button>
                  <button type="button" className="btn btn-primary" onClick={applyStatuses} disabled={saving}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </button>
                </div>
              </div>
            </div>
        )}
      </>
  );
}