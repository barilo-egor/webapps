import React, { useEffect, useState, useCallback } from 'react';
import './App.css';

// =============================================================
// API КЛИЕНТ
// =============================================================
// Базовый fetch с авторизацией через Telegram WebApp initData
// (на сервере бэкендер проверяет подпись и из неё достаёт user_id).
// Возвращает распарсенный JSON или текст. Кидает исключение при !ok.

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
  // PATCH/DELETE могут отдать пустое тело
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

// API для категорий: /api/payment-type-category
const realCategoriesApi = {
  list: () => apiFetch('/api/payment-type-category'),
  create: (name) =>
    apiFetch(
      `/api/payment-type-category?name=${encodeURIComponent(name)}`,
      { method: 'POST' }
    ),
  remove: (pid) =>
    apiFetch(`/api/payment-type-category/${pid}`, { method: 'DELETE' }),
  // Toggle: один и тот же endpoint и для привязки, и для отвязки.
  // Бэк сам определяет: если связь есть — удалить, нет — создать.
  toggleBinding: (catPid, typePid) =>
    apiFetch(
      `/api/payment-type-category/${catPid}?paymentTypePid=${typePid}`,
      { method: 'PATCH' }
    ),
};

// API для типов оплат (нам нужен только GET для списка колонок)
const realTypesApi = {
  list: () => apiFetch('/api/payment-types'),
};

// =============================================================
// MOCK API (для локальной разработки без бэкенда)
// =============================================================
// Включается через VITE_USE_MOCK=1 в .env.local

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Тестовые типы оплаты (как в payment-types в SELL)
const mockTypes = [
  { pid: 1, name: 'Карта', dealType: 'SELL', fiatCurrency: 'RUB' },
  { pid: 2, name: 'СБП', dealType: 'SELL', fiatCurrency: 'RUB' },
  { pid: 3, name: 'Транс', dealType: 'SELL', fiatCurrency: 'BYN' },
];

// Тестовые категории. Структура: pid, name, paymentTypePids (массив pid типов).
let mockCategories = [
  { pid: 1, name: 'Категория А', paymentTypePids: [1, 3] },
  { pid: 2, name: 'Категория Б', paymentTypePids: [2] },
  { pid: 3, name: 'Категория В', paymentTypePids: [1, 2] },
];
let mockCatCounter = 4;

const mockCategoriesApi = {
  list: async () => {
    await delay(120);
    // Возвращаем глубокую копию чтобы внешний код случайно не мутировал mock
    return JSON.parse(JSON.stringify(mockCategories));
  },
  create: async (name) => {
    await delay(150);
    const created = { pid: mockCatCounter++, name, paymentTypePids: [] };
    mockCategories.push(created);
    return JSON.parse(JSON.stringify(created));
  },
  remove: async (pid) => {
    await delay(150);
    mockCategories = mockCategories.filter((c) => c.pid !== pid);
    return null;
  },
  toggleBinding: async (catPid, typePid) => {
    await delay(100);
    const cat = mockCategories.find((c) => c.pid === catPid);
    if (!cat) throw new Error('Category not found');
    const idx = cat.paymentTypePids.indexOf(typePid);
    if (idx === -1) cat.paymentTypePids.push(typePid);
    else cat.paymentTypePids.splice(idx, 1);
    return null;
  },
};

const mockTypesApi = {
  list: async () => {
    await delay(80);
    return JSON.parse(JSON.stringify(mockTypes));
  },
};

const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';
const categoriesApi = USE_MOCK ? mockCategoriesApi : realCategoriesApi;
const typesApi = USE_MOCK ? mockTypesApi : realTypesApi;

if (USE_MOCK) {
  // eslint-disable-next-line no-console
  console.info('[categories] Работает в MOCK-режиме (VITE_USE_MOCK=1)');
}

// =============================================================
// УТИЛИТЫ
// =============================================================

/** Проверяем что категория привязана к типу. Поддерживаем два варианта
 *  ответа бэка: либо у категории есть массив paymentTypePids (числа),
 *  либо paymentTypes (массив объектов с pid). */
function isBound(category, typePid) {
  if (!category) return false;
  if (Array.isArray(category.paymentTypePids)) {
    return category.paymentTypePids.includes(typePid);
  }
  if (Array.isArray(category.paymentTypes)) {
    return category.paymentTypes.some((t) => t.pid === typePid);
  }
  return false;
}

/** Локальное переключение связи в объекте категории (для оптимистичного UI). */
function toggleBound(category, typePid) {
  if (Array.isArray(category.paymentTypePids)) {
    const idx = category.paymentTypePids.indexOf(typePid);
    const next = [...category.paymentTypePids];
    if (idx === -1) next.push(typePid);
    else next.splice(idx, 1);
    return { ...category, paymentTypePids: next };
  }
  if (Array.isArray(category.paymentTypes)) {
    const has = category.paymentTypes.some((t) => t.pid === typePid);
    const next = has
      ? category.paymentTypes.filter((t) => t.pid !== typePid)
      : [...category.paymentTypes, { pid: typePid }];
    return { ...category, paymentTypes: next };
  }
  // Если бэк прислал ничего из этого — создаём поле paymentTypePids
  return { ...category, paymentTypePids: [typePid] };
}

// =============================================================
// МОДАЛКА СОЗДАНИЯ КАТЕГОРИИ
// =============================================================

function CategoryCreateModal({ onClose, onSubmit, isSubmitting }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>
            <i className="fas fa-layer-group" aria-hidden="true"></i>
            Новая категория
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field">
              <label>
                Название категории <span className="required">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="Введите название категории"
                autoFocus
                disabled={isSubmitting}
                className={error ? 'invalid' : ''}
              />
              {error && (
                <div className="hint hint-error">Название обязательно</div>
              )}
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
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Сохранение…' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================
// МОДАЛКА УДАЛЕНИЯ КАТЕГОРИИ
// =============================================================

function CategoryDeleteModal({ category, onClose, onConfirm, isSubmitting }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header modal-header-danger">
          <h2>
            <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
            Подтверждение удаления
          </h2>
        </div>
        <div className="modal-body">
          <p className="confirm-text">
            Вы действительно хотите удалить категорию «{category.name}»?
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
            {isSubmitting ? 'Удаление…' : 'Да, удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// =============================================================

export default function App() {
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // Загружаем оба списка параллельно при старте
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, tps] = await Promise.all([
        categoriesApi.list(),
        typesApi.list(),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setTypes(Array.isArray(tps) ? tps : []);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Клик по чекбоксу: меняем UI сразу, потом шлём запрос.
  // Если запрос упал — откатываем UI обратно.
  const handleToggleBinding = async (catPid, typePid) => {
    const prev = categories;
    setCategories((cats) =>
      cats.map((c) => (c.pid === catPid ? toggleBound(c, typePid) : c))
    );
    try {
      await categoriesApi.toggleBinding(catPid, typePid);
    } catch (err) {
      setCategories(prev); // откат
      alert('Не удалось изменить привязку: ' + (err.message || ''));
    }
  };

  const handleCreate = async (name) => {
    setIsSubmitting(true);
    try {
      const created = await categoriesApi.create(name);
      // Если бэк вернул объект — добавляем его. Если null — перезагружаем список.
      if (created && created.pid != null) {
        setCategories((cats) => [...cats, created]);
      } else {
        await loadAll();
      }
      setShowCreate(false);
    } catch (err) {
      alert('Не удалось создать категорию: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsSubmitting(true);
    try {
      await categoriesApi.remove(toDelete.pid);
      setCategories((cats) => cats.filter((c) => c.pid !== toDelete.pid));
      setToDelete(null);
    } catch (err) {
      alert('Не удалось удалить категорию: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <header className="page-header">
          <h1>
            <i className="fas fa-layer-group" aria-hidden="true"></i>
            Категории типов оплаты
          </h1>
          <button
            type="button"
            className="btn-add"
            onClick={() => setShowCreate(true)}
            aria-label="Добавить категорию"
            title="Добавить категорию"
          >
            <i className="fas fa-plus" aria-hidden="true"></i>
          </button>
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

          {!loading && !error && categories.length === 0 && (
            <div className="state state-empty">
              <i className="fas fa-inbox" aria-hidden="true"></i>
              <span>Категорий нет. Нажмите «+» чтобы создать первую.</span>
            </div>
          )}

          {!loading && !error && categories.length > 0 && (
            <div className="table-wrapper">
              <table className="cat-table">
                <thead>
                  <tr>
                    <th className="col-cat-name">Категория / Тип оплаты</th>
                    {types.map((t) => (
                      <th key={t.pid} className="col-type">
                        {t.name}
                      </th>
                    ))}
                    <th aria-label="Удаление" className="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.pid}>
                      <td className="cell-cat-name" title={cat.name}>
                        {cat.name}
                      </td>
                      {types.map((t) => (
                        <td key={t.pid} className="cell-checkbox">
                          <input
                            type="checkbox"
                            checked={isBound(cat, t.pid)}
                            onChange={() => handleToggleBinding(cat.pid, t.pid)}
                            aria-label={`Привязать ${cat.name} к ${t.name}`}
                          />
                        </td>
                      ))}
                      <td className="cell-action">
                        <button
                          type="button"
                          className="btn-delete"
                          onClick={() => setToDelete(cat)}
                          aria-label={`Удалить категорию ${cat.name}`}
                          title="Удалить"
                        >
                          <i className="fas fa-times-circle" aria-hidden="true"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {showCreate && (
        <CategoryCreateModal
          onClose={() => !isSubmitting && setShowCreate(false)}
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      )}

      {toDelete && (
        <CategoryDeleteModal
          category={toDelete}
          onClose={() => !isSubmitting && setToDelete(null)}
          onConfirm={handleDelete}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
