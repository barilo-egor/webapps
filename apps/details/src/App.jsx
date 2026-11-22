import { useCallback, useEffect, useRef, useState } from 'react';
import { myChatId, request } from '../../shared/request.js';

const API = '/api/details';
const PAGE_SIZE = 20;
const DEFAULT_SORT = 'pid,asc';

const COLUMNS = [
  { key: 'isOn', title: 'Статус', icon: 'fa-solid fa-power-off' },
  { key: 'shortName', label: 'Наименование' },
  { key: 'requisite', label: 'Реквизит' },
  { key: 'targetAmount', label: 'Целевая' },
  { key: 'receivedAmount', label: 'Принятая' },
  { key: 'reserveAmount', label: 'Резерв' },
  { key: 'rangeFrom', label: 'Диапазон' },
  { key: 'minDealsCount', label: 'Мин. сделок' },
  { key: 'priority', label: 'Приоритет' },
];

const formatTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const toIntOrNull = (value) => {
  const s = String(value ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : NaN;
};

/* ---------- Тост ---------- */
function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((message, type = 'info') => {
    window.clearTimeout(timer.current);
    setToast({ message, type, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const node = toast ? (
    <div key={toast.key} className={`toast ${toast.type}`}>
      {toast.message}
    </div>
  ) : null;

  return { show, node };
}

/* ---------- Модальное окно ---------- */
function Modal({ icon, title, onClose, busy, children, foot }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <span className="modal-icon">
            <i className={icon} />
          </span>
          <h2>{title}</h2>
          <button
            type="button"
            className="modal-x"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ---------- Модалка подтверждения ---------- */
function ConfirmModal({ title, message, confirmLabel, danger, busy, onConfirm, onClose }) {
  return (
    <Modal
      icon={danger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question'}
      title={title}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Выполнение…' : confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  );
}

/* ---------- Модалка создания / редактирования реквизита ---------- */
function DetailsFormModal({ initial, paymentTypes, categories, busy, onSubmit, onClose }) {
  const isEdit = Boolean(initial?.pid);

  const [shortName, setShortName] = useState(initial?.shortName ?? '');
  const [requisite, setRequisite] = useState(initial?.requisite ?? '');
  const [targetAmount, setTargetAmount] = useState(
    initial?.targetAmount != null ? String(initial.targetAmount) : ''
  );
  const [minDealsCount, setMinDealsCount] = useState(
    initial?.minDealsCount != null ? String(initial.minDealsCount) : '1'
  );
  const [rangeFrom, setRangeFrom] = useState(
    initial?.rangeFrom != null ? String(initial.rangeFrom) : ''
  );
  const [rangeTo, setRangeTo] = useState(
    initial?.rangeTo != null ? String(initial.rangeTo) : ''
  );
  const [priority, setPriority] = useState(
    initial?.priority != null ? String(initial.priority) : '0'
  );

  // При редактировании открываем вкладку «По типу оплаты», чтобы сохранить текущие привязки
  const [linkTab, setLinkTab] = useState(isEdit ? 'paymentTypes' : 'categories');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedPaymentTypes, setSelectedPaymentTypes] = useState(
    () => (Array.isArray(initial?.paymentTypes) ? [...initial.paymentTypes] : [])
  );
  const [errors, setErrors] = useState({});

  const toggleId = (setter, id) => {
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextErrors = {};

    if (!shortName.trim()) {
      nextErrors.shortName = 'Введите наименование';
    } else if (shortName.trim().length > 30) {
      nextErrors.shortName = 'Максимум 30 символов';
    }

    if (!requisite.trim()) {
      nextErrors.requisite = 'Введите реквизит';
    }

    const parsedTarget = toIntOrNull(targetAmount);
    if (Number.isNaN(parsedTarget) || (parsedTarget !== null && parsedTarget < 0)) {
      nextErrors.targetAmount = 'Введите целое число не меньше 0';
    }

    const parsedMinDeals = toIntOrNull(minDealsCount);
    if (parsedMinDeals === null || Number.isNaN(parsedMinDeals) || parsedMinDeals < 0) {
      nextErrors.minDealsCount = 'Введите целое число не меньше 0';
    }

    const parsedPriority = toIntOrNull(priority);
    if (
      parsedPriority === null
      || Number.isNaN(parsedPriority)
      || parsedPriority < 0
      || parsedPriority > 100
    ) {
      nextErrors.priority = 'Приоритет должен быть от 0 до 100';
    }

    const parsedFrom = toIntOrNull(rangeFrom);
    const parsedTo = toIntOrNull(rangeTo);
    if (Number.isNaN(parsedFrom) || Number.isNaN(parsedTo)) {
      nextErrors.range = 'Введите целые числа';
    } else if ((parsedFrom === null) !== (parsedTo === null)) {
      nextErrors.range = 'Заполните обе границы диапазона или оставьте оба поля пустыми';
    } else if (parsedFrom !== null && (parsedFrom < 1 || parsedTo < 1)) {
      nextErrors.range = 'Границы диапазона должны быть не меньше 1';
    } else if (parsedFrom !== null && parsedFrom > parsedTo) {
      nextErrors.range = 'Максимальная сумма не может быть меньше минимальной';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = {
      pid: initial?.pid ?? null,
      shortName: shortName.trim(),
      requisite: requisite.trim(),
      targetAmount: parsedTarget,
      minDealsCount: parsedMinDeals,
      rangeFrom: parsedFrom,
      rangeTo: parsedTo,
      priority: parsedPriority,
      paymentTypes: linkTab === 'paymentTypes' ? selectedPaymentTypes : null,
      paymentTypeCategories: linkTab === 'categories' ? selectedCategories : null,
    };

    onSubmit(payload);
  };

  return (
    <Modal
      icon={isEdit ? 'fa-solid fa-pen' : 'fa-solid fa-plus'}
      title={isEdit ? 'Редактирование реквизита' : 'Создание реквизита'}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="submit"
            form="details-form"
            className="btn btn-primary"
            disabled={busy}
          >
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="details-form" onSubmit={handleSubmit} style={{ display: 'contents' }}>
        <div className="field">
          <label className="field-label" htmlFor="f-shortName">
            Наименование <span className="req">*</span>
          </label>
          <input
            id="f-shortName"
            type="text"
            maxLength={30}
            placeholder="Введите наименование"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            className={errors.shortName ? 'invalid' : ''}
            disabled={busy}
          />
          {errors.shortName && <span className="field-error">{errors.shortName}</span>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-requisite">
            Реквизит <span className="req">*</span>
          </label>
          <textarea
            id="f-requisite"
            placeholder="Введите реквизит"
            value={requisite}
            onChange={(e) => setRequisite(e.target.value)}
            className={errors.requisite ? 'invalid' : ''}
            disabled={busy}
          />
          {errors.requisite && <span className="field-error">{errors.requisite}</span>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-targetAmount">
            Максимальная сумма
          </label>
          <input
            id="f-targetAmount"
            type="number"
            min={0}
            step={1}
            placeholder="Введите сумму"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className={errors.targetAmount ? 'invalid' : ''}
            disabled={busy}
          />
          <span className="field-hint">Если без ограничений — оставьте поле пустым</span>
          {errors.targetAmount && <span className="field-error">{errors.targetAmount}</span>}
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="f-minDealsCount">
              Минимальное кол-во сделок <span className="req">*</span>
            </label>
            <input
              id="f-minDealsCount"
              type="number"
              min={0}
              step={1}
              placeholder="Введите кол-во"
              value={minDealsCount}
              onChange={(e) => setMinDealsCount(e.target.value)}
              className={errors.minDealsCount ? 'invalid' : ''}
              disabled={busy}
            />
            {errors.minDealsCount && <span className="field-error">{errors.minDealsCount}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="f-priority">
              Приоритет (0–100) <span className="req">*</span>
            </label>
            <input
              id="f-priority"
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="Введите приоритет"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={errors.priority ? 'invalid' : ''}
              disabled={busy}
            />
            {errors.priority && <span className="field-error">{errors.priority}</span>}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Диапазон сумм</span>
          <div className="range-inputs">
            <input
              type="number"
              min={1}
              step={1}
              placeholder="от"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className={errors.range ? 'invalid' : ''}
              disabled={busy}
            />
            <span className="range-dash">—</span>
            <input
              type="number"
              min={1}
              step={1}
              placeholder="до"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className={errors.range ? 'invalid' : ''}
              disabled={busy}
            />
          </div>
          <span className="field-hint">Если без ограничений — оставьте поля пустыми</span>
          {errors.range && <span className="field-error">{errors.range}</span>}
        </div>

        <div className="field">
          <span className="field-label">Привязка</span>
          <div className="tabs">
            <button
              type="button"
              className={`tab-btn${linkTab === 'categories' ? ' active' : ''}`}
              onClick={() => setLinkTab('categories')}
              disabled={busy}
            >
              По категории ({selectedCategories.length})
            </button>
            <button
              type="button"
              className={`tab-btn${linkTab === 'paymentTypes' ? ' active' : ''}`}
              onClick={() => setLinkTab('paymentTypes')}
              disabled={busy}
            >
              По типу оплаты ({selectedPaymentTypes.length})
            </button>
          </div>

          <div className="check-list">
            {linkTab === 'categories' ? (
              categories.length === 0 ? (
                <div className="state-box" style={{ padding: '18px' }}>
                  Категории не найдены
                </div>
              ) : (
                categories.map((cat) => (
                  <label key={cat.pid} className="check-item">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.pid)}
                      onChange={() => toggleId(setSelectedCategories, cat.pid)}
                      disabled={busy}
                    />
                    <span className="check-item-title">{cat.name}</span>
                  </label>
                ))
              )
            ) : paymentTypes.length === 0 ? (
              <div className="state-box" style={{ padding: '18px' }}>
                Типы оплаты не найдены
              </div>
            ) : (
              paymentTypes.map((pt) => (
                <label key={pt.pid} className="check-item">
                  <input
                    type="checkbox"
                    checked={selectedPaymentTypes.includes(pt.pid)}
                    onChange={() => toggleId(setSelectedPaymentTypes, pt.pid)}
                    disabled={busy}
                  />
                  <span className="check-item-title">{pt.name}</span>
                  {pt.fiatCurrency && (
                    <span className="badge badge-fiat">{pt.fiatCurrency}</span>
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ==================== Основное приложение ==================== */
export default function App() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [paymentTypes, setPaymentTypes] = useState([]);
  const [categories, setCategories] = useState([]);

  const [formTarget, setFormTarget] = useState(null); // null | { mode: 'create' } | { mode: 'edit', details }
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [togglingPid, setTogglingPid] = useState(null);

  const toast = useToast();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const loadList = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const { items: data, total: totalCount } = await request(API, {
        params: { page: targetPage, size: PAGE_SIZE, sort: sort ? `${sort.field},${sort.dir}` : DEFAULT_SORT },
        withTotal: true,
      });
      setItems(data);
      setTotal(totalCount);
      setLastUpdated(formatTime(new Date()));
    } catch (err) {
      setError(err.message || 'Не удалось загрузить реквизиты');
    } finally {
      setLoading(false);
    }
  }, [page, sort]);

  const toggleSort = (field) => {
    let next;
    if (!sort || sort.field !== field) next = { field, dir: 'asc' };
    else if (sort.dir === 'asc') next = { field, dir: 'desc' };
    else next = null;
    setSort(next);
    setPage(0);
  };

  const loadReferences = useCallback(async () => {
    try {
      const [pts, cats] = await Promise.all([
        request('/api/payment-types', { params: { onlyBuy: true } }).catch(() => []),
        request('/api/payment-type-category').catch(() => []),
      ]);
      setPaymentTypes(Array.isArray(pts) ? pts : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch {
      // не блокируем основной список
    }
  }, []);

  useEffect(() => {
    loadList(page);
  }, [page, loadList]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openCreate = () => {
    loadReferences();
    setFormTarget({ mode: 'create', details: null });
  };

  const openEdit = (row) => {
    loadReferences();
    setFormTarget({ mode: 'edit', details: row });
  };

  const handleSave = async (payload) => {
    setBusy(true);
    try {
      if (payload.pid == null) {
        await request(API, { method: 'POST', body: payload });
      } else {
        await request(`${API}/${payload.pid}`, { method: 'PUT', body: payload });
      }
      setFormTarget(null);
      toast.show('Реквизит сохранён', 'success');
      await loadList(page);
    } catch (err) {
      toast.show(err.message || 'Ошибка сохранения реквизита', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (row, nextIsOn) => {
    setTogglingPid(row.pid);
    try {
      await request(`${API}/${row.pid}/activation`, {
        method: 'PATCH',
        params: { isOn: nextIsOn },
      });
      setItems((prev) =>
        prev.map((item) => (item.pid === row.pid ? { ...item, isOn: nextIsOn } : item))
      );
      toast.show(
        `Реквизит ${row.shortName} ${nextIsOn ? 'включён' : 'выключен'}`,
        'success'
      );
    } catch (err) {
      toast.show(err.message || 'Ошибка смены статуса реквизита', 'error');
    } finally {
      setTogglingPid(null);
    }
  };

  const handleResetClick = (row) => {
    if (!(row.targetAmount > 0)) {
      toast.show('Реквизит не является целевым');
      return;
    }
    if ((row.receivedAmount || 0) === 0 && (row.reserveAmount || 0) === 0) {
      toast.show('Суммы уже сброшены');
      return;
    }
    setConfirmState({
      title: 'Подтверждение сброса',
      message: `Вы действительно хотите сбросить полученную сумму и сумму резерва для реквизита «${row.shortName}»?`,
      confirmLabel: 'Сбросить',
      danger: false,
      action: async () => {
        await request(`${API}/${row.pid}/reset`, { method: 'POST' });
        toast.show('Суммы сброшены', 'success');
        await loadList(page);
      },
    });
  };

  const handleSendInfo = async (row) => {
    if (!(row.targetAmount > 0)) {
      toast.show('Реквизит не является целевым');
      return;
    }
    const chatId = myChatId();
    if (!chatId) {
      toast.show('Не удалось определить chatId из Telegram WebApp', 'error');
      return;
    }
    try {
      await request(`${API}/${row.pid}/send-info`, {
        method: 'POST',
        params: { chatId },
      });
      toast.show('Данные реквизита отправлены в чат', 'success');
    } catch (err) {
      toast.show(err.message || 'Ошибка просмотра реквизита', 'error');
    }
  };

  const handleDeleteClick = (row) => {
    if (row.reserveAmount && row.reserveAmount > 0) {
      toast.show('У реквизита присутствует резерв, удаление невозможно', 'error');
      return;
    }
    setConfirmState({
      title: 'Подтверждение удаления',
      message: `Вы уверены, что хотите удалить реквизит «${row.shortName}»?`,
      confirmLabel: 'Удалить',
      danger: true,
      action: async () => {
        await request(`${API}/${row.pid}`, { method: 'DELETE' });
        toast.show('Реквизит удалён', 'success');
        const nextPage = items.length === 1 && page > 0 ? page - 1 : page;
        if (nextPage !== page) {
          setPage(nextPage);
        } else {
          await loadList(page);
        }
      },
    });
  };

  const runConfirm = async () => {
    if (!confirmState) return;
    setBusy(true);
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (err) {
      toast.show(err.message || 'Ошибка выполнения операции', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <span className="icon">
            <i className="fa-solid fa-credit-card" />
          </span>
          <div>
            <h1>Управление реквизитами</h1>
            {lastUpdated && (
              <div className="last-update">
                <i className="fa-regular fa-clock" />
                <span>Последнее обновление: {lastUpdated}</span>
              </div>
            )}
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <i className="fa-solid fa-plus" />
            <span>Создать реквизит</span>
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => loadList(page)}
            disabled={loading}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" className="btn" onClick={() => loadList(page)}>
            Повторить
          </button>
        </div>
      )}

      <div className="card">
        {loading && items.length === 0 ? (
          <div className="state-box">
            <i className="fa-solid fa-spinner fa-spin" />
            <span>Загрузка реквизитов…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="state-box">
            <i className="fa-regular fa-folder-open" />
            <span>Реквизитов пока нет</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const active = sort && sort.field === c.key;
                    const ico = !active ? 'fa-solid fa-sort sort-ico dim'
                      : sort.dir === 'asc' ? 'fa-solid fa-arrow-up-long sort-ico'
                        : 'fa-solid fa-arrow-down-long sort-ico';
                    return (
                      <th
                        key={c.key}
                        title={c.title}
                        className={`sortable${active ? ' active' : ''}`}
                        onClick={() => toggleSort(c.key)}
                      >
                        {c.icon ? <i className={c.icon} /> : c.label}
                        <i className={ico} />
                      </th>
                    );
                  })}
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.pid}
                    onDoubleClick={(e) => {
                      if (e.target.closest('button, input, label')) return;
                      openEdit(row);
                    }}
                  >
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={Boolean(row.isOn)}
                          disabled={togglingPid === row.pid}
                          onChange={(e) => handleToggle(row, e.target.checked)}
                        />
                        <span className="slider" />
                      </label>
                    </td>
                    <td>
                      <span
                        className="short-name"
                        onClick={() => openEdit(row)}
                        title="Редактировать"
                      >
                        {row.shortName}
                      </span>
                    </td>
                    <td className="requisite-cell mono">{row.requisite}</td>
                    <td className="mono">
                      {row.targetAmount > 0 ? (
                        <span className="badge badge-target">{row.targetAmount}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono">{row.receivedAmount ?? 0}</td>
                    <td className="mono">{row.reserveAmount ?? 0}</td>
                    <td className="mono">
                      {row.rangeFrom ? `${row.rangeFrom} – ${row.rangeTo}` : '—'}
                    </td>
                    <td className="mono">{row.minDealsCount ?? 0}</td>
                    <td className="mono">{row.priority ?? 0}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-icon"
                          title="Редактировать"
                          onClick={() => openEdit(row)}
                        >
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon"
                          title="Сброс сумм"
                          onClick={() => handleResetClick(row)}
                        >
                          <i className="fa-solid fa-rotate-left" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon"
                          title="Прислать данные реквизита"
                          onClick={() => handleSendInfo(row)}
                        >
                          <i className="fa-regular fa-file-lines" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon danger"
                          title="Удалить"
                          onClick={() => handleDeleteClick(row)}
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="pagination">
            <span className="mono">
              Всего: {total} · Страница {page + 1} из {totalPages}
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <i className="fa-solid fa-chevron-left" />
                <span>Назад</span>
              </button>
              <button
                type="button"
                className="btn"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <span>Вперёд</span>
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {formTarget && (
        <DetailsFormModal
          initial={formTarget.details}
          paymentTypes={paymentTypes}
          categories={categories}
          busy={busy}
          onSubmit={handleSave}
          onClose={() => setFormTarget(null)}
        />
      )}

      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          busy={busy}
          onConfirm={runConfirm}
          onClose={() => setConfirmState(null)}
        />
      )}

      {toast.node}
    </div>
  );
}
