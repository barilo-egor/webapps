import React, { useEffect, useState, useCallback } from 'react';
import './App.css';

// =============================================================
// API CLIENT
// =============================================================
// Все запросы идут с заголовком X-TG-Init-Data — Telegram.WebApp.initData.
// Бэкенд обязан валидировать его подпись (HMAC-SHA256) до любых операций.
//
// Контракт бэкенда:
//   GET    /api/payment-types
//          -> [{ pid, name, dealType, fiatCurrency, minSum,
//               requisiteAdditionalText, isOn, discounts: [...] }, ...]
//   POST   /api/payment-types
//          <- { name, dealType, fiatCurrency, minSum,
//              requisiteAdditionalText, isOn }
//          -> созданный объект
//   PATCH  /api/payment-types
//          <- { pid, name, dealType, fiatCurrency, minSum,
//              requisiteAdditionalText, discounts: [...] }
//          -> обновлённый объект
//   DELETE /api/payment-types/{pid}                          -> 200 / 204
//   PATCH  /api/payment-types/{pid}/activation?isOn=true     -> 200
// =============================================================
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/payment-types';

const getInitData = () => {
  try {
    return window.Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
};

const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-TG-Init-Data': getInitData(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  return res.json();
};

const realApi = {
  list: () => apiFetch(API_BASE),
  create: (data) =>
    apiFetch(API_BASE, { method: 'POST', body: JSON.stringify(data) }),
  update: (data) =>
    apiFetch(API_BASE, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (pid) => apiFetch(`${API_BASE}/${pid}`, { method: 'DELETE' }),
  toggleActive: (pid, isOn) =>
    apiFetch(`${API_BASE}/${pid}/activation?isOn=${isOn}`, { method: 'PATCH' }),
};

// =============================================================
// MOCK API (для локальной разработки без бэкенда)
// =============================================================
// Включается через VITE_USE_MOCK=1 в .env.local. Хранит данные в памяти
// (исчезают при перезагрузке страницы) и имитирует задержку сети.
// =============================================================
let mockData = [
  {
    pid: 1,
    name: 'Карта',
    dealType: 'SELL',
    fiatCurrency: 'RUB',
    minSum: 500,
    requisiteAdditionalText: '',
    isOn: true,
    discounts: [],
  },
  {
    pid: 2,
    name: 'СБП',
    dealType: 'SELL',
    fiatCurrency: 'RUB',
    minSum: 15000,
    requisiteAdditionalText: '',
    isOn: false,
    discounts: [],
  },
  {
    pid: 3,
    name: 'Транс',
    dealType: 'SELL',
    fiatCurrency: 'BYN',
    minSum: 1000,
    requisiteAdditionalText: 'Минимум 1000 BYN',
    isOn: true,
    discounts: [{ percent: 5, maxAmount: 50 }],
  },
  {
    pid: 4,
    name: 'Карта',
    dealType: 'BUY',
    fiatCurrency: 'RUB',
    minSum: 2000,
    requisiteAdditionalText: '',
    isOn: true,
    discounts: [],
  },
  {
    pid: 5,
    name: 'СБП',
    dealType: 'BUY',
    fiatCurrency: 'BYN',
    minSum: 50000,
    requisiteAdditionalText: '',
    isOn: false,
    discounts: [],
  },
];
let mockPidCounter = 100;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const mockApi = {
  list: async () => {
    await delay(300);
    return [...mockData];
  },
  create: async (data) => {
    await delay(200);
    const created = { ...data, pid: mockPidCounter++, discounts: [] };
    mockData.push(created);
    return created;
  },
  update: async (data) => {
    await delay(200);
    const idx = mockData.findIndex((it) => it.pid === data.pid);
    if (idx === -1) throw new Error('Not found');
    mockData[idx] = { ...mockData[idx], ...data };
    return mockData[idx];
  },
  remove: async (pid) => {
    await delay(200);
    mockData = mockData.filter((it) => it.pid !== pid);
    return null;
  },
  toggleActive: async (pid, isOn) => {
    await delay(150);
    const idx = mockData.findIndex((it) => it.pid === pid);
    if (idx === -1) throw new Error('Not found');
    mockData[idx] = { ...mockData[idx], isOn };
    return mockData[idx];
  },
};

const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';
const paymentTypesApi = USE_MOCK ? mockApi : realApi;

if (USE_MOCK) {
  // eslint-disable-next-line no-console
  console.info('[payment-types] Работает в MOCK-режиме (VITE_USE_MOCK=1)');
}

// =============================================================
// СПРАВОЧНИКИ
// =============================================================
// Список валют. Когда бэк сделает endpoint — заменить на динамический GET.
const FIAT_CURRENCIES = ['RUB', 'BYN', 'USD', 'EUR', 'KZT', 'UAH'];

const DEAL_TYPES = [
  { value: 'BUY', label: 'Покупка', icon: 'fa-shopping-cart' },
  { value: 'SELL', label: 'Продажа', icon: 'fa-tag' },
];

// =============================================================
// MODAL: создание/редактирование типа оплаты
// =============================================================
function PaymentTypeFormModal({ initial, onClose, onSubmit, isSubmitting }) {
  const isEdit = Boolean(initial?.pid);

  const [dealType, setDealType] = useState(initial?.dealType || 'SELL');
  const [name, setName] = useState(initial?.name || '');
  const [fiatCurrency, setFiatCurrency] = useState(
    initial?.fiatCurrency || FIAT_CURRENCIES[0]
  );
  const [minSum, setMinSum] = useState(
    initial?.minSum != null ? String(initial.minSum) : ''
  );
  const [discounts, setDiscounts] = useState(
    initial?.discounts && initial.discounts.length > 0
      ? initial.discounts.map((d) => ({
          percent: d.percent != null ? String(d.percent) : '',
          maxAmount: d.maxAmount != null ? String(d.maxAmount) : '',
        }))
      : [{ percent: '', maxAmount: '' }]
  );
  const [additionalText, setAdditionalText] = useState(
    initial?.requisiteAdditionalText || ''
  );
  const [errors, setErrors] = useState({
    name: false,
    fiatCurrency: false,
    minSum: false,
  });

  const handleAddDiscount = () => {
    setDiscounts((prev) => [...prev, { percent: '', maxAmount: '' }]);
  };

  const handleRemoveDiscount = (idx) => {
    setDiscounts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDiscountChange = (idx, field, value) => {
    setDiscounts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d))
    );
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const minSumNum = Number(minSum);
    const newErrors = {
      name: !trimmedName,
      fiatCurrency: !fiatCurrency,
      minSum: minSum === '' || Number.isNaN(minSumNum) || minSumNum < 0,
    };
    setErrors(newErrors);
    if (newErrors.name || newErrors.fiatCurrency || newErrors.minSum) return;

    // Чистим скидки: убираем строки где оба поля пустые
    const cleanDiscounts = discounts
      .filter((d) => d.percent !== '' || d.maxAmount !== '')
      .map((d) => ({
        percent: Number(d.percent),
        maxAmount: Number(d.maxAmount),
      }));

    const payload = {
      name: trimmedName,
      dealType,
      fiatCurrency,
      minSum: minSumNum,
      requisiteAdditionalText: additionalText.trim(),
    };

    if (isEdit) {
      payload.pid = initial.pid;
      payload.discounts = cleanDiscounts;
    } else {
      payload.isOn = true;
    }

    onSubmit(payload);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pt-form-title"
      >
        <div className="modal-header">
          <h2 id="pt-form-title">
            <i
              className={isEdit ? 'fas fa-pen-to-square' : 'fas fa-plus-circle'}
              aria-hidden="true"
            ></i>
            {isEdit ? 'Редактирование типа оплаты' : 'Создание типа оплаты'}
          </h2>
        </div>

        <div className="modal-body">
          {/* Тип сделки */}
          <div className="field">
            <label htmlFor="pt-dealtype">
              <i className="fas fa-exchange-alt" aria-hidden="true"></i>
              Тип сделки
            </label>
            <select
              id="pt-dealtype"
              value={dealType}
              onChange={(e) => setDealType(e.target.value)}
            >
              {DEAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Название */}
          <div className="field">
            <label htmlFor="pt-name">
              <i className="fas fa-tag" aria-hidden="true"></i>
              Название <span className="required">*</span>
            </label>
            <input
              id="pt-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: false }));
              }}
              className={errors.name ? 'invalid' : ''}
              placeholder="Например: Карта, СБП, Опт"
              autoFocus
              maxLength={255}
            />
          </div>

          {/* Фиатная валюта */}
          <div className="field">
            <label htmlFor="pt-currency">
              <i className="fas fa-money-bill-wave" aria-hidden="true"></i>
              Фиатная валюта <span className="required">*</span>
            </label>
            <select
              id="pt-currency"
              value={fiatCurrency}
              onChange={(e) => {
                setFiatCurrency(e.target.value);
                if (errors.fiatCurrency)
                  setErrors((p) => ({ ...p, fiatCurrency: false }));
              }}
              className={errors.fiatCurrency ? 'invalid' : ''}
            >
              {FIAT_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Минимальная сумма */}
          <div className="field">
            <label htmlFor="pt-minsum">
              <i className="fas fa-chart-line" aria-hidden="true"></i>
              Минимальная сумма <span className="required">*</span>
            </label>
            <input
              id="pt-minsum"
              type="number"
              value={minSum}
              onChange={(e) => {
                setMinSum(e.target.value);
                if (errors.minSum) setErrors((p) => ({ ...p, minSum: false }));
              }}
              className={errors.minSum ? 'invalid' : ''}
              placeholder="Сумма"
              inputMode="decimal"
              min="0"
              step="0.01"
            />
          </div>

          {/* Скидки */}
          <div className="field">
            <div className="field-header">
              <label>
                <i className="fas fa-percent" aria-hidden="true"></i>
                Скидки
              </label>
              <button
                type="button"
                className="btn-icon-add"
                onClick={handleAddDiscount}
                aria-label="Добавить скидку"
                title="Добавить скидку"
              >
                <i className="fas fa-plus-circle" aria-hidden="true"></i>
              </button>
            </div>
            <div className="discounts-table">
              <div className="discounts-thead">
                <div>Процент (%)</div>
                <div>Макс. сумма</div>
                <div></div>
              </div>
              {discounts.map((d, idx) => (
                <div className="discounts-row" key={idx}>
                  <input
                    type="number"
                    value={d.percent}
                    onChange={(e) =>
                      handleDiscountChange(idx, 'percent', e.target.value)
                    }
                    placeholder="%"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                  />
                  <input
                    type="number"
                    value={d.maxAmount}
                    onChange={(e) =>
                      handleDiscountChange(idx, 'maxAmount', e.target.value)
                    }
                    placeholder="Макс. сумма"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                  />
                  <button
                    type="button"
                    className="btn-icon-delete"
                    onClick={() => handleRemoveDiscount(idx)}
                    aria-label="Удалить скидку"
                    title="Удалить скидку"
                  >
                    <i className="fas fa-times" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
              {discounts.length === 0 && (
                <div className="discounts-empty">Нет скидок</div>
              )}
            </div>
          </div>

          {/* Дополнительный текст */}
          <div className="field">
            <label htmlFor="pt-addtext">
              <i className="fas fa-sticky-note" aria-hidden="true"></i>
              Дополнительный текст
            </label>
            <textarea
              id="pt-addtext"
              value={additionalText}
              onChange={(e) => setAdditionalText(e.target.value)}
              placeholder="Любые условия или комментарии..."
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                {isEdit ? 'Сохранение...' : 'Создание...'}
              </>
            ) : (
              <>
                <i
                  className={isEdit ? 'fas fa-check' : 'fas fa-plus-circle'}
                  aria-hidden="true"
                ></i>
                {isEdit ? 'Сохранить' : 'Создать'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// MODAL: подтверждение удаления
// =============================================================
function DeleteConfirmModal({ item, onClose, onConfirm, isSubmitting }) {
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal modal-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pt-delete-title"
      >
        <div className="modal-header modal-header-danger">
          <h2 id="pt-delete-title">
            <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
            Подтверждение
          </h2>
        </div>

        <div className="modal-body">
          <p className="confirm-text">
            Вы уверены, что хотите удалить тип оплаты{' '}
            <strong>«{item.name}»</strong>?
          </p>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                Удаление...
              </>
            ) : (
              <>
                <i className="fas fa-trash" aria-hidden="true"></i>
                Да, удалить
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// СВОРАЧИВАЕМЫЙ БЛОК ТАБЛИЦЫ
// =============================================================
function TableSection({
  dealType,
  items,
  open,
  onToggleOpen,
  onRowDoubleClick,
  onToggleActive,
  onRowDelete,
}) {
  const meta = DEAL_TYPES.find((t) => t.value === dealType);
  return (
    <div className={`section ${open ? 'section-open' : ''}`}>
      <button
        type="button"
        className="section-header"
        onClick={onToggleOpen}
        aria-expanded={open}
      >
        <i
          className={`fas fa-chevron-right section-chevron ${
            open ? 'open' : ''
          }`}
          aria-hidden="true"
        ></i>
        <span className="section-title">
          <i className={`fas ${meta.icon}`} aria-hidden="true"></i>
          {meta.label}
        </span>
        <span className="section-hint">
          Для редактирования дважды кликните по строке типа оплаты.
        </span>
      </button>

      {open && (
        <div className="section-body">
          {items.length === 0 ? (
            <div className="section-empty">Нет записей</div>
          ) : (
            <div className="table-wrapper">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th className="col-toggle">Включение</th>
                    <th>Название</th>
                    <th>Фиатная валюта</th>
                    <th>Минимальная сумма</th>
                    <th aria-label="Удаление" className="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.pid}
                      className="row-editable"
                      onDoubleClick={() => onRowDoubleClick(it)}
                    >
                      <td
                        className="cell-toggle"
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!!it.isOn}
                          onChange={(e) =>
                            onToggleActive(it, e.target.checked)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Включение ${it.name}`}
                        />
                      </td>
                      <td className="cell-name" title={it.name}>
                        {it.name}
                      </td>
                      <td>{it.fiatCurrency}</td>
                      <td>{formatNumber(it.minSum)}</td>
                      <td className="cell-action">
                        <button
                          type="button"
                          className="btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowDelete(it);
                          }}
                          aria-label={`Удалить ${it.name}`}
                          title="Удалить"
                        >
                          <i
                            className="fas fa-times-circle"
                            aria-hidden="true"
                          ></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================
// УТИЛИТЫ
// =============================================================
function formatNumber(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return new Intl.NumberFormat('ru-RU').format(num);
}

function haptic(kind) {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(kind);
  } catch {}
}

// =============================================================
// MAIN APP
// =============================================================
export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null); // null | 'new' | объект
  const [toDelete, setToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Изначально оба блока свёрнуты (как на Рисунке №1)
  const [openSections, setOpenSections] = useState({ BUY: false, SELL: false });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentTypesApi.list();
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      setError(e.message || 'Не удалось загрузить типы оплат');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Создание / редактирование
  const handleSubmit = async (payload) => {
    setIsSubmitting(true);
    try {
      if (payload.pid) {
        const updated = await paymentTypesApi.update(payload);
        if (updated && updated.pid != null) {
          setItems((prev) =>
            prev.map((it) => (it.pid === updated.pid ? updated : it))
          );
        } else {
          // Фоллбэк: применяем то что отправили локально
          setItems((prev) =>
            prev.map((it) => (it.pid === payload.pid ? { ...it, ...payload } : it))
          );
        }
      } else {
        const created = await paymentTypesApi.create(payload);
        if (created && created.pid != null) {
          setItems((prev) => [...prev, created]);
        } else {
          await loadItems();
        }
      }
      setEditing(null);
      haptic('success');
    } catch (e) {
      haptic('error');
      alert('Ошибка при сохранении: ' + (e.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Удаление
  const handleDelete = async () => {
    if (!toDelete) return;
    setIsSubmitting(true);
    try {
      await paymentTypesApi.remove(toDelete.pid);
      setItems((prev) => prev.filter((it) => it.pid !== toDelete.pid));
      setToDelete(null);
      haptic('success');
    } catch (e) {
      haptic('error');
      alert('Ошибка при удалении: ' + (e.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Переключение чекбокса включения (быстрый запрос)
  const handleToggleActive = async (item, isOn) => {
    // Оптимистичное обновление UI
    setItems((prev) =>
      prev.map((it) => (it.pid === item.pid ? { ...it, isOn } : it))
    );
    try {
      await paymentTypesApi.toggleActive(item.pid, isOn);
      haptic('success');
    } catch (e) {
      // Откат если не получилось
      setItems((prev) =>
        prev.map((it) => (it.pid === item.pid ? { ...it, isOn: !isOn } : it))
      );
      haptic('error');
      alert('Не удалось изменить статус: ' + (e.message || ''));
    }
  };

  // Группировка по типу сделки.
  // Сортировку по fiatCurrency делает бэк (см. ТЗ),
  // фронт показывает в полученном порядке.
  const buyItems = items.filter((it) => it.dealType === 'BUY');
  const sellItems = items.filter((it) => it.dealType === 'SELL');

  return (
    <div className="app">
      <div className="container">
        <header className="page-header">
          <h1>
            <i className="fas fa-credit-card" aria-hidden="true"></i>
            Управление типами оплат
          </h1>
          <button
            type="button"
            className="btn btn-primary btn-create"
            onClick={() => setEditing('new')}
          >
            <i className="fas fa-plus-circle" aria-hidden="true"></i>
            Создать
          </button>
        </header>

        <main className="content">
          {loading && (
            <div className="state state-loading">
              <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
              <span>Загрузка...</span>
            </div>
          )}

          {!loading && error && (
            <div className="state state-error">
              <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
              <span>{error}</span>
              <button className="btn btn-secondary" onClick={loadItems}>
                <i className="fas fa-rotate" aria-hidden="true"></i>
                Повторить
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Сначала "Покупка", затем "Продажа" — как требует ТЗ */}
              <TableSection
                dealType="BUY"
                items={buyItems}
                open={openSections.BUY}
                onToggleOpen={() =>
                  setOpenSections((s) => ({ ...s, BUY: !s.BUY }))
                }
                onRowDoubleClick={(it) => setEditing(it)}
                onToggleActive={handleToggleActive}
                onRowDelete={(it) => setToDelete(it)}
              />
              <TableSection
                dealType="SELL"
                items={sellItems}
                open={openSections.SELL}
                onToggleOpen={() =>
                  setOpenSections((s) => ({ ...s, SELL: !s.SELL }))
                }
                onRowDoubleClick={(it) => setEditing(it)}
                onToggleActive={handleToggleActive}
                onRowDelete={(it) => setToDelete(it)}
              />
            </>
          )}
        </main>
      </div>

      {editing && (
        <PaymentTypeFormModal
          initial={editing === 'new' ? null : editing}
          onClose={() => !isSubmitting && setEditing(null)}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}

      {toDelete && (
        <DeleteConfirmModal
          item={toDelete}
          onClose={() => !isSubmitting && setToDelete(null)}
          onConfirm={handleDelete}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
