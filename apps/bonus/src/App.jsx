import { useEffect, useMemo, useState } from 'react';
import MessageEditor from '../../shared/MessageEditor.jsx';

/* ============================================================
   Бонусная программа — веб-апп админки. ПРОД-версия (без mock).

   Схема бэка:
   - 5 переменных  -> /api/variables (GET все + POST по одной), типы -> /api/variables/types
   - 2 текста      -> общий компонент ../../shared/MessageEditor.jsx
                      (API /api/message_image), каждый со своей кнопкой сохранения
   ============================================================ */

// Переменные (variable-таблица): читаем/пишем через /api/variables.
const VARIABLE_KEYS = [
  'BONUS_ENABLED',
  'BONUS_DEALS_THRESHOLD',
  'BONUS_DISCOUNT_PERCENT',
  'BONUS_EMOJI_DONE',
  'BONUS_EMOJI_LEFT',
];
// Тексты сообщений живут в общем компоненте MessageEditor и сохраняются
// собственными кнопками. Здесь держим только их содержимое — оно нужно
// для проверки «все настройки заполнены» перед включением программы.
const MESSAGES = [
  { code: 'BONUS_PROGRESS_TEXT', hint: 'Плейсхолдер: %1$s — осталось сделок' },
  { code: 'BONUS_ACTIVATED_TEXT', hint: 'Плейсхолдер: %1$s — процент скидки' },
];
const ALL_KEYS = [...VARIABLE_KEYS];

// value BONUS_ENABLED шлём строкой "true"/"false" (бэк хранит Boolean строкой).
const SEND_BOOL_AS_STRING = true;

// Поля-настройки (кроме тумблера, он рендерится отдельно сверху).
// label — fallback, если displayName не пришёл из /api/variables/types.
const FIELDS = [
  { id: 'BONUS_DEALS_THRESHOLD', kind: 'int', label: 'Количество сделок до бонуса', min: 2, hint: 'Целое число, минимум 2' },
  { id: 'BONUS_DISCOUNT_PERCENT', kind: 'int', label: 'Процент скидки', min: 1, max: 100, hint: 'От 1 до 100', suffix: '%' },
  { id: 'BONUS_EMOJI_DONE', kind: 'emoji', label: 'Смайлик совершённой сделки' },
  { id: 'BONUS_EMOJI_LEFT', kind: 'emoji', label: 'Смайлик оставшейся сделки' },
];

const EMPTY_FORM = {
  BONUS_ENABLED: false,
  BONUS_DEALS_THRESHOLD: '',
  BONUS_DISCOUNT_PERCENT: '',
  BONUS_EMOJI_DONE: '',
  BONUS_EMOJI_LEFT: '',
};

const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const toStr = (v) => (v == null ? '' : String(v));

/* ---------------- API ---------------- */

const headers = () => ({
  'Content-Type': 'application/json',
  'X-TG-Init-Data': window.Telegram?.WebApp?.initData || '',
});

const api = {
  async getTypes() {
    const r = await fetch('/api/variables/types', { headers: headers() });
    if (!r.ok) throw new Error('types ' + r.status);
    return r.json();
  },
  async getValues() {
    const r = await fetch('/api/variables', { headers: headers() });
    if (!r.ok) throw new Error('values ' + r.status);
    return r.json();
  },
  async saveVariable(variableType, value) {
    const r = await fetch('/api/variables', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ variableType, fiatCurrency: null, dealType: null, cryptoCurrency: null, value }),
    });
    if (!r.ok) throw new Error('save ' + variableType + ' ' + r.status);
    return true;
  },
};

/* ---------------- Компонент ---------------- */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [initial, setInitial] = useState(EMPTY_FORM);
  const [toast, setToast] = useState(null);
  // Тексты сообщений хранит MessageEditor. Сюда он отдаёт их при загрузке
  // и после сохранения — нужно, чтобы проверить заполненность перед включением.
  const [msgTexts, setMsgTexts] = useState({});
  const setMsgText = (code, value) => setMsgTexts((p) => ({ ...p, [code]: value }));

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [types, values] = await Promise.all([api.getTypes(), api.getValues()]);

      const lbl = {};
      (types || [])
          .filter((t) => String(t.id ?? t.variableType ?? '').startsWith('BONUS_'))
          .forEach((t) => {
            const key = t.id ?? t.variableType;
            if (t.displayName) lbl[key] = t.displayName;
          });

      const next = { ...EMPTY_FORM };
      (values || [])
          .filter((v) => VARIABLE_KEYS.includes(v.variableType ?? v.type ?? v.id))
          .forEach((v) => {
            const key = v.variableType ?? v.type ?? v.id;
            next[key] = key === 'BONUS_ENABLED' ? toBool(v.value) : toStr(v.value);
          });

      setLabels(lbl);
      setForm(next);
      setInitial(next);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelOf = (id, fallback) => labels[id] || fallback;
  const set = (id, value) => setForm((f) => ({ ...f, [id]: value }));

  // Все настройки заполнены и валидны (без учёта самого тумблера).
  const isComplete = useMemo(() => {
    const n = parseInt(form.BONUS_DEALS_THRESHOLD, 10);
    const p = parseInt(form.BONUS_DISCOUNT_PERCENT, 10);
    return (
        Number.isFinite(n) && n >= 2 &&
        Number.isFinite(p) && p >= 1 && p <= 100 &&
        form.BONUS_EMOJI_DONE.trim() !== '' &&
        form.BONUS_EMOJI_LEFT.trim() !== '' &&
        MESSAGES.every((m) => (msgTexts[m.code] ?? '').trim() !== '')
    );
  }, [form, msgTexts]);

  const dirty = useMemo(() => ALL_KEYS.some((k) => form[k] !== initial[k]), [form, initial]);

  const onToggle = () => {
    if (!form.BONUS_ENABLED) {
      if (!isComplete) {
        showToast('Заполните все настройки бонусной программы, прежде чем включать бонусный обмен', 'error');
        return;
      }
      set('BONUS_ENABLED', true);
    } else {
      set('BONUS_ENABLED', false);
    }
  };

  const serializeVar = (id) => {
    const v = form[id];
    if (id === 'BONUS_ENABLED') return SEND_BOOL_AS_STRING ? String(!!v) : !!v;
    return typeof v === 'string' ? v.trim() : String(v);
  };

  const onSave = async () => {
    if (form.BONUS_ENABLED && !isComplete) {
      showToast('Заполните все настройки бонусной программы, прежде чем включать бонусный обмен', 'error');
      return;
    }
    const changedVars = VARIABLE_KEYS.filter((k) => form[k] !== initial[k]);
    if (changedVars.length === 0) {
      showToast('Нет изменений для сохранения', 'info');
      return;
    }
    setSaving(true);
    try {
      await Promise.all(changedVars.map((k) => api.saveVariable(k, serializeVar(k))));
      setInitial({ ...form });
      showToast('Настройки бонусной программы сохранены', 'success');
    } catch (e) {
      showToast('Не удалось сохранить: ' + (e.message || 'ошибка'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* -------- Состояния -------- */
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
          <div className="icon">
            <i className="fa-solid fa-gift" />
          </div>
          <h1>Бонусная программа</h1>
        </div>

        <div className="card">
          <div className="switch-row">
            <div className="label-wrap">
              <b>{labelOf('BONUS_ENABLED', 'Бонусный обмен')}</b>
              <span className="hint">Включает / выключает программу</span>
            </div>
            <label className="switch">
              <input type="checkbox" checked={form.BONUS_ENABLED} onChange={onToggle} />
              <span className="track" />
              <span className="thumb" />
            </label>
          </div>
        </div>

        <div className="card">
          {FIELDS.map((fld) => (
              <div className="field" key={fld.id}>
                <label htmlFor={fld.id}>{labelOf(fld.id, fld.label)}</label>
                {fld.hint && <span className="hint">{fld.hint}</span>}
                {fld.kind === 'text' ? (
                    <textarea id={fld.id} value={form[fld.id]} onChange={(e) => set(fld.id, e.target.value)} />
                ) : fld.kind === 'int' ? (
                    <div className={fld.suffix ? 'input-suffix' : ''}>
                      <input
                          id={fld.id}
                          type="number"
                          inputMode="numeric"
                          min={fld.min}
                          max={fld.max}
                          value={form[fld.id]}
                          onChange={(e) => set(fld.id, e.target.value)}
                      />
                      {fld.suffix && <span className="suffix">{fld.suffix}</span>}
                    </div>
                ) : (
                    <input id={fld.id} type="text" maxLength={8} value={form[fld.id]} onChange={(e) => set(fld.id, e.target.value)} />
                )}
              </div>
          ))}
        </div>

        <div className="card">
          <div className="msg-list">
            {MESSAGES.map((m) => (
                <MessageEditor
                    key={m.code}
                    code={m.code}
                    hint={m.hint}
                    showToast={showToast}
                    onLoaded={(v) => setMsgText(m.code, v)}
                    onSaved={(v) => setMsgText(m.code, v)}
                />
            ))}
          </div>
        </div>

        <div className="save-bar">
          <button className="btn btn-primary btn-block" onClick={onSave} disabled={saving || !dirty}>
            {saving ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Сохранение…
                </>
            ) : (
                <>
                  <i className="fa-solid fa-floppy-disk" /> Сохранить
                </>
            )}
          </button>
        </div>

        {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      </div>
  );
}