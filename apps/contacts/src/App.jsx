import React, { useEffect, useState, useCallback, useRef } from 'react';
import './App.css';

// =============================================================
// API CLIENT
// =============================================================
// Все запросы идут с заголовком X-TG-Init-Data — Telegram.WebApp.initData.
// Бэкенд обязан валидировать его подпись (HMAC-SHA256) до любых операций.
//
// API_BASE по умолчанию относительный (`/api/contacts`). Это URL за которым
// nginx проксирует запросы на бэкенд. Если у вас другой префикс —
// задайте VITE_API_BASE_URL в .env при сборке.
//
// Контракт бэкенда:
// Контракт бэкенда:
//   GET    /api/contacts        -> [{ pid, label, url }, ...]
//   POST   /api/contacts        -> { pid, label, url }   (тело: { label, url })
//   PATCH  /api/contacts        -> { pid, label, url }   (тело: { pid, label, url })
//   DELETE /api/contacts/{pid}  -> 200 / 204
// =============================================================
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/contacts';

const getInitData = () => {
  try {
    return window.Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
};

// Бэкенд отдаёт данные напрямую, без обёртки:
//   GET    /api/contacts       -> [ {pid, label, url}, ... ]
//   POST   /api/contacts       -> { pid, label, url }
//   PATCH  /api/contacts       -> { pid, label, url }
//   DELETE /api/contacts/{pid} -> 200 / 204
//
// Об ошибках сообщает HTTP-статусом (4xx/5xx) и текстом в теле.
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
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;

  return res.json();
};

const contactsApi = {
  list: () => apiFetch(API_BASE),
  create: (data) =>
      apiFetch(API_BASE, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  update: (data) =>
      apiFetch(API_BASE, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  remove: (pid) => apiFetch(`${API_BASE}/${pid}`, { method: 'DELETE' }),
  // Сохранение нового порядка: PATCH полным контактом с обновлённым order
  // (бэк ждёт { pid, label, url, order }).
  setOrder: (contact) =>
      apiFetch(API_BASE, {
        method: 'PATCH',
        body: JSON.stringify({
          pid: contact.pid,
          label: contact.label,
          url: contact.url,
          order: contact.order,
        }),
      }),
};

// =============================================================
// УТИЛИТЫ
// =============================================================
const isValidUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
};

// =============================================================
// MODAL: добавление контакта
// =============================================================
function ContactFormModal({ initial, onClose, onSubmit, isSubmitting }) {
  const isEdit = Boolean(initial && initial.pid != null);
  const [label, setLabel] = useState(initial?.label || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [errors, setErrors] = useState({ label: false, url: false });

  const handleSave = () => {
    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    const newErrors = {
      label: !trimmedLabel,
      url: !trimmedUrl || !isValidUrl(trimmedUrl),
    };
    setErrors(newErrors);
    if (newErrors.label || newErrors.url) return;
    if (isEdit) {
      onSubmit({ pid: initial.pid, label: trimmedLabel, url: trimmedUrl });
    } else {
      onSubmit({ label: trimmedLabel, url: trimmedUrl });
    }
  };

  return (
      <div className="modal-overlay" onClick={onClose} role="presentation">
        <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-form-title"
        >
          <div className="modal-header">
            <h2 id="contact-form-title">
              <i
                  className={isEdit ? 'fas fa-pen-to-square' : 'fas fa-user-plus'}
                  aria-hidden="true"
              ></i>
              {isEdit ? 'Редактирование контакта' : 'Новый контакт'}
            </h2>
          </div>

          <div className="modal-body">
            <div className="field">
              <label htmlFor="contact-label">
                Название <span className="required">*</span>
              </label>
              <input
                  id="contact-label"
                  type="text"
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    if (errors.label) setErrors((p) => ({ ...p, label: false }));
                  }}
                  className={errors.label ? 'invalid' : ''}
                  placeholder="Например: Поддержка"
                  autoFocus
                  maxLength={255}
              />
            </div>

            <div className="field">
              <label htmlFor="contact-url">
                Ссылка <span className="required">*</span>
              </label>
              <input
                  id="contact-url"
                  type="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (errors.url) setErrors((p) => ({ ...p, url: false }));
                  }}
                  className={errors.url ? 'invalid' : ''}
                  placeholder="https://example.com"
                  inputMode="url"
                  maxLength={2048}
              />
              {errors.url && url.trim() && !isValidUrl(url.trim()) && (
                  <div className="hint hint-error">
                    Введите корректный URL (https://)
                  </div>
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
            <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSubmitting}
            >
              {isSubmitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                    Сохранение...
                  </>
              ) : (
                  <>
                    <i className="fas fa-check" aria-hidden="true"></i>
                    Сохранить
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
function DeleteConfirmModal({ contact, onClose, onConfirm, isSubmitting }) {
  return (
      <div className="modal-overlay" onClick={onClose} role="presentation">
        <div
            className="modal modal-sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
        >
          <div className="modal-header modal-header-danger">
            <h2 id="delete-confirm-title">
              <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
              Подтверждение
            </h2>
          </div>

          <div className="modal-body">
            <p className="confirm-text">
              Вы уверены, что хотите удалить контакт{' '}
              <strong>«{contact.label}»</strong>?
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
// MAIN APP
// =============================================================
export default function App() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [contactToEdit, setContactToEdit] = useState(null);
  const [contactToDelete, setContactToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ref на <tbody> для SortableJS и счётчик-версия списка:
  // после дропа меняем версию → tbody перемонтируется и React перерисует
  // строки из state (DOM, который подвигал Sortable, отбрасывается — нет рассинхрона).
  const tbodyRef = useRef(null);
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await contactsApi.list();
      // список уже приходит отсортированным по order с бэка — берём как есть
      setContacts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Не удалось загрузить контакты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Применяет новый порядок: оптимистично обновляет state и сохраняет на бэк
  // (PATCH { pid, order }) для всех контактов, у которых order изменился.
  const applyReorder = useCallback((oldIndex, newIndex) => {
    if (oldIndex === newIndex || newIndex == null || oldIndex == null) return;
    setContacts((prev) => {
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);

      // переназначаем order = позиция (0-based) и сохраняем изменившиеся
      const changed = [];
      next.forEach((c, i) => {
        if (c.order !== i) {
          c.order = i;
          changed.push(c);
        }
      });
      Promise.all(changed.map((c) => contactsApi.setOrder(c))).catch((e) => {
        alert('Не удалось сохранить порядок: ' + (e.message || ''));
        loadContacts(); // откат к серверному порядку
      });
      return next;
    });
    // форсируем перемонтирование списка, чтобы DOM Sortable не конфликтовал с React
    setListVersion((v) => v + 1);
  }, [loadContacts]);

  // Инициализация SortableJS на <tbody>. Перезапускается при смене данных/версии.
  useEffect(() => {
    const Sortable = window.Sortable;
    const el = tbodyRef.current;
    if (!Sortable || !el || contacts.length === 0) return;
    const sortable = Sortable.create(el, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: (evt) => applyReorder(evt.oldIndex, evt.newIndex),
    });
    return () => sortable.destroy();
  }, [contacts, listVersion, applyReorder]);

  const handleAddContact = async ({ label, url }) => {
    setIsSubmitting(true);
    try {
      const created = await contactsApi.create({ label, url });
      if (created && created.pid != null) {
        setContacts((prev) => [...prev, created]);
      } else {
        // Если бэк не вернул объект — перечитаем список целиком
        await loadContacts();
      }
      setShowAddModal(false);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Ошибка при сохранении контакта: ' + (e.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditContact = async ({ pid, label, url }) => {
    setIsSubmitting(true);
    try {
      const updated = await contactsApi.update({ pid, label, url });
      // Если бэк вернул обновлённый объект — берём его, иначе подставляем то,
      // что отправили (бэк мог ответить пустым success-телом).
      const next = updated && updated.pid != null
          ? updated
          : { pid, label, url };
      setContacts((prev) => prev.map((c) => (c.pid === pid ? next : c)));
      setContactToEdit(null);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Ошибка при сохранении контакта: ' + (e.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete) return;
    setIsSubmitting(true);
    try {
      await contactsApi.remove(contactToDelete.pid);
      setContacts((prev) => prev.filter((c) => c.pid !== contactToDelete.pid));
      setContactToDelete(null);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
    } catch (e) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error');
      alert('Ошибка при удалении: ' + (e.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
      <div className="app">
        <div className="container">
          <header className="page-header">
            <h1>
              <i className="fas fa-address-book" aria-hidden="true"></i>
              Управление контактами
            </h1>
            <button
                type="button"
                className="btn-add"
                onClick={() => setShowAddModal(true)}
                aria-label="Добавить контакт"
                title="Добавить контакт"
            >
              <i className="fas fa-plus" aria-hidden="true"></i>
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
                  <button className="btn btn-secondary" onClick={loadContacts}>
                    <i className="fas fa-rotate" aria-hidden="true"></i>
                    Повторить
                  </button>
                </div>
            )}

            {!loading && !error && contacts.length === 0 && (
                <div className="state state-empty">
                  <i className="fas fa-inbox" aria-hidden="true"></i>
                  <span>Нет контактов</span>
                </div>
            )}

            {!loading && !error && contacts.length > 0 && (
                <div className="table-wrapper">
                  <table className="contacts-table">
                    <thead>
                    <tr>
                      <th aria-label="Перетаскивание" className="col-drag"></th>
                      <th>Название</th>
                      <th>
                        <div className="th-with-hint">
                          <span>Ссылка</span>
                          <span className="th-hint">
                          Для редактирования дважды кликните по строке контакта.
                        </span>
                        </div>
                      </th>
                      <th aria-label="Удаление" className="col-action"></th>
                    </tr>
                    </thead>
                    <tbody key={listVersion} ref={tbodyRef}>
                    {contacts.map((c) => (
                        <tr
                            key={c.pid}
                            className="row-editable"
                            onDoubleClick={() => setContactToEdit(c)}
                            title="Двойной клик — редактировать"
                        >
                          <td className="cell-drag">
                            <span
                                className="drag-handle"
                                aria-label="Перетащить"
                                title="Перетащите, чтобы изменить порядок"
                                onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <i className="fas fa-grip-vertical" aria-hidden="true"></i>
                            </span>
                          </td>
                          <td className="cell-name" title={c.label}>
                            {c.label}
                          </td>
                          <td className="cell-url">
                            <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={c.url}
                                onDoubleClick={(e) => e.stopPropagation()}
                            >
                              {c.url}
                            </a>
                          </td>
                          <td className="cell-action">
                            <button
                                type="button"
                                className="btn-delete"
                                onClick={() => setContactToDelete(c)}
                                onDoubleClick={(e) => e.stopPropagation()}
                                aria-label={`Удалить контакт ${c.label}`}
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
          </main>
        </div>

        {showAddModal && (
            <ContactFormModal
                onClose={() => !isSubmitting && setShowAddModal(false)}
                onSubmit={handleAddContact}
                isSubmitting={isSubmitting}
            />
        )}

        {contactToEdit && (
            <ContactFormModal
                initial={contactToEdit}
                onClose={() => !isSubmitting && setContactToEdit(null)}
                onSubmit={handleEditContact}
                isSubmitting={isSubmitting}
            />
        )}

        {contactToDelete && (
            <DeleteConfirmModal
                contact={contactToDelete}
                onClose={() => !isSubmitting && setContactToDelete(null)}
                onConfirm={handleDeleteContact}
                isSubmitting={isSubmitting}
            />
        )}
      </div>
  );
}