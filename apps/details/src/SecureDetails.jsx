import { useCallback, useEffect, useState } from 'react';
import { request } from '../../shared/request.js';
import { ConfirmModal, Modal } from './Modal.jsx';

const API = '/api/secure-details';
const MAX_LENGTH = 255;

const dealsText = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} сделка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} сделки`;
  return `${n} сделок`;
};

/* ---------- Модалка создания / редактирования защитного реквизита ---------- */
function SecureFormModal({ initial, fiatCurrencies, countByFiat, fiatName, busy, onSubmit, onClose }) {
  const isEdit = Boolean(initial?.pid);
  const [details, setDetails] = useState(initial?.details ?? '');
  const [fiatCurrency, setFiatCurrency] = useState(initial?.fiatCurrency ?? fiatCurrencies[0]?.name ?? '');
  const [error, setError] = useState(null);

  const minDealCount = isEdit ? initial.minDealCount : (countByFiat[fiatCurrency] ?? 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!details.trim()) {
      setError('Заполните реквизит');
      return;
    }
    if (!isEdit && !fiatCurrency) {
      setError('Выберите валюту');
      return;
    }
    setError(null);
    onSubmit({ pid: initial?.pid ?? null, details: details.trim(), fiatCurrency });
  };

  return (
    <Modal
      icon={isEdit ? 'fa-solid fa-pen' : 'fa-solid fa-plus'}
      title={isEdit ? 'Редактирование защитного реквизита' : 'Создание защитного реквизита'}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="submit" form="secure-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="secure-form" onSubmit={handleSubmit} style={{ display: 'contents' }}>
        <div className="field">
          <label className="field-label" htmlFor="s-fiat">
            Фиатная валюта <span className="req">*</span>
          </label>
          {isEdit ? (
            <input id="s-fiat" type="text" value={fiatName(fiatCurrency)} disabled />
          ) : (
            <select
              id="s-fiat"
              value={fiatCurrency}
              onChange={(e) => setFiatCurrency(e.target.value)}
              disabled={busy}
            >
              {fiatCurrencies.map((f) => (
                <option key={f.name} value={f.name}>{f.displayName}</option>
              ))}
            </select>
          )}
        </div>

        <div className="field">
          <span className="field-label">Количество сделок для отображения реквизита</span>
          <input type="text" value={minDealCount} disabled />
          <span className="field-hint">
            {isEdit
              ? 'Валюта и количество сделок не меняются'
              : 'Значение формируется автоматически: новый реквизит встаёт последним в своей валюте'}
          </span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="s-details">
            Реквизит <span className="req">*</span>
          </label>
          <textarea
            id="s-details"
            placeholder="Введите реквизит"
            maxLength={MAX_LENGTH}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className={error ? 'invalid' : ''}
            disabled={busy}
          />
          {error && <span className="field-error">{error}</span>}
        </div>
      </form>
    </Modal>
  );
}

/* ==================== Вкладка защитных реквизитов ==================== */
export default function SecureDetails({ toast }) {
  const [items, setItems] = useState([]);
  const [fiatCurrencies, setFiatCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formTarget, setFormTarget] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, fiats] = await Promise.all([
        request(API),
        request(`${API}/fiat-currencies`),
      ]);
      setItems(Array.isArray(list) ? list : []);
      setFiatCurrencies(Array.isArray(fiats) ? fiats : []);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить защитные реквизиты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fiatName = (name) => fiatCurrencies.find((f) => f.name === name)?.displayName ?? name;

  const groups = [];
  items.forEach((item) => {
    const group = groups.find((g) => g.fiat === item.fiatCurrency);
    if (group) group.items.push(item);
    else groups.push({ fiat: item.fiatCurrency, items: [item] });
  });

  const countByFiat = Object.fromEntries(groups.map((g) => [g.fiat, g.items.length]));

  const lastPidByFiat = Object.fromEntries(groups.map((g) => [
    g.fiat,
    g.items.reduce((a, b) => ((b.minDealCount ?? 0) > (a.minDealCount ?? 0) ? b : a)).pid,
  ]));

  const openCreate = () => {
    if (fiatCurrencies.length === 0) {
      toast.show('Нет включённых фиатных валют', 'error');
      return;
    }
    setFormTarget({ details: null });
  };

  const handleSave = async (payload) => {
    setBusy(true);
    try {
      if (payload.pid == null) {
        await request(API, { method: 'POST', body: payload });
        toast.show('Защитный реквизит создан', 'success');
      } else {
        await request(`${API}/${payload.pid}`, { method: 'PUT', body: payload });
        toast.show('Защитный реквизит обновлён', 'success');
      }
      setFormTarget(null);
      await load();
    } catch (err) {
      toast.show(err.message || 'Ошибка сохранения защитного реквизита', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteClick = (row) => {
    if (lastPidByFiat[row.fiatCurrency] !== row.pid) {
      toast.show('Сначала удалите реквизиты этой валюты с большим количеством сделок', 'error');
      return;
    }
    setConfirmState({
      title: 'Подтверждение удаления',
      message: `Удалить защитный реквизит ${fiatName(row.fiatCurrency)} для ${dealsText(row.minDealCount ?? 0)}?`,
      confirmLabel: 'Удалить',
      danger: true,
      action: async () => {
        await request(`${API}/${row.pid}`, { method: 'DELETE' });
        toast.show('Защитный реквизит удалён', 'success');
        await load();
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
    <>
      <div className="secure-toolbar">
        <span className="secure-hint">
          Пользователю с указанным количеством подтверждённых сделок в покупке вместо выбора типа оплаты
          показывается защитный реквизит своей валюты.
        </span>
        <div className="header-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <i className="fa-solid fa-plus" />
            <span>Создать</span>
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={load}
            disabled={loading}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" className="btn" onClick={load}>
            Повторить
          </button>
        </div>
      )}

      <div className="card">
        {loading && items.length === 0 ? (
          <div className="state-box">
            <i className="fa-solid fa-spinner fa-spin" />
            <span>Загрузка защитных реквизитов…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="state-box">
            <i className="fa-regular fa-folder-open" />
            <span>Защитных реквизитов пока нет</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Валюта</th>
                  <th>Кол-во сделок</th>
                  <th>Реквизит</th>
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((g) => g.items).map((row) => {
                  const isLast = lastPidByFiat[row.fiatCurrency] === row.pid;
                  return (
                    <tr
                      key={row.pid}
                      onDoubleClick={(e) => {
                        if (e.target.closest('button')) return;
                        setFormTarget({ details: row });
                      }}
                    >
                      <td>
                        <span className="badge badge-fiat">{fiatName(row.fiatCurrency)}</span>
                      </td>
                      <td className="mono">{row.minDealCount ?? 0}</td>
                      <td className="requisite-cell mono">{row.details}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-icon"
                            title="Редактировать"
                            onClick={() => setFormTarget({ details: row })}
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button
                            type="button"
                            className={`btn btn-icon danger${isLast ? '' : ' dimmed'}`}
                            title={isLast ? 'Удалить' : 'Удалить можно только последний реквизит валюты'}
                            onClick={() => handleDeleteClick(row)}
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formTarget && (
        <SecureFormModal
          initial={formTarget.details}
          fiatCurrencies={fiatCurrencies}
          countByFiat={countByFiat}
          fiatName={fiatName}
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
    </>
  );
}
