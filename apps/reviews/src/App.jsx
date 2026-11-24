import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../../shared/request.js';
import { ConfirmModal } from './Modal.jsx';

const API = '/api/reviews';
const PAGE_SIZE = 25;

const TABS = [
  { key: 'new', label: 'Новые', isAccepted: false, empty: 'Новых отзывов нет' },
  { key: 'queue', label: 'В очереди на публикацию', isAccepted: true, empty: 'Отзывов в очереди нет' },
];

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

function PublishInterval({ value, saving, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    if (saving || value == null) return;
    setDraft(String(value));
    setEditing(true);
  };

  const finish = () => {
    setEditing(false);
    const s = draft.trim();
    if (!/^\d+$/.test(s)) return;
    const next = Number(s);
    if (next === value) return;
    onSave(next);
  };

  return (
    <div className="interval-bar">
      <span className="interval-label">Интервал публикации:</span>
      {editing ? (
        <input
          ref={inputRef}
          className="interval-input mono"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(String(value));
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="interval-value mono"
          onClick={startEdit}
          disabled={saving}
          title="Изменить интервал"
        >
          {value ?? '…'}
        </button>
      )}
      <span className="interval-unit">мин.</span>
      {saving ? (
        <i className="fa-solid fa-spinner fa-spin interval-ico" />
      ) : (
        !editing && (
          <button
            type="button"
            className="btn btn-icon interval-edit"
            onClick={startEdit}
            title="Изменить интервал"
            aria-label="Изменить интервал"
          >
            <i className="fa-solid fa-pen" />
          </button>
        )
      )}
    </div>
  );
}

function Username({ username }) {
  if (!username) return <span className="dim">—</span>;
  return (
    <a className="username" href={`https://t.me/${username}`} target="_blank" rel="noreferrer">
      @{username}
    </a>
  );
}

export default function App() {
  const [tabKey, setTabKey] = useState('new');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const [interval, setIntervalValue] = useState(null);
  const [intervalSaving, setIntervalSaving] = useState(false);

  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);

  const toast = useToast();
  const tab = TABS.find((t) => t.key === tabKey);
  const isNew = tab.key === 'new';

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  const loadList = useCallback(async (targetPage) => {
    setLoading(true);
    setError(null);
    try {
      const { items: data, total: totalCount } = await request(API, {
        params: { isAccepted: tab.isAccepted, page: targetPage, size: PAGE_SIZE },
        withTotal: true,
      });
      if (data.length === 0 && targetPage > 0) {
        setPage(targetPage - 1);
        return;
      }
      setItems(data);
      setTotal(totalCount);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить отзывы');
    } finally {
      setLoading(false);
    }
  }, [tab.isAccepted]);

  const loadInterval = useCallback(async () => {
    try {
      setIntervalValue(await request(`${API}/publish-interval`));
    } catch (err) {
      toast.show(err.message || 'Не удалось загрузить интервал публикации', 'error');
    }
  }, [toast.show]);

  useEffect(() => {
    loadList(page);
  }, [page, loadList]);

  useEffect(() => {
    loadInterval();
  }, [loadInterval]);

  const refresh = () => {
    setSelected(new Set());
    loadInterval();
    loadList(page);
  };

  const switchTab = (key) => {
    if (key === tabKey) return;
    setSelected(new Set());
    setItems([]);
    setTotal(0);
    setPage(0);
    setTabKey(key);
  };

  const saveInterval = async (next) => {
    if (next < 1) {
      toast.show('Минимальное значение интервала — 1 минута', 'error');
      return;
    }
    setIntervalSaving(true);
    try {
      const saved = await request(`${API}/publish-interval`, { method: 'POST', params: { interval: next } });
      setIntervalValue(saved ?? next);
      toast.show('Интервал публикации обновлён', 'success');
    } catch (err) {
      toast.show(err.message || 'Не удалось обновить интервал', 'error');
    } finally {
      setIntervalSaving(false);
    }
  };

  const pagePids = items.map((r) => r.pid);
  const selectedOnPage = pagePids.filter((pid) => selected.has(pid)).length;
  const allOnPage = pagePids.length > 0 && selectedOnPage === pagePids.length;

  const toggleOne = (pid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) pagePids.forEach((pid) => next.delete(pid));
      else pagePids.forEach((pid) => next.add(pid));
      return next;
    });
  };

  const afterAction = async (pids, message) => {
    setSelected((prev) => {
      const next = new Set(prev);
      pids.forEach((pid) => next.delete(pid));
      return next;
    });
    toast.show(message, 'success');
    await loadList(page);
  };

  const approveOne = (row) => setConfirmState({
    title: 'Публикация отзыва',
    message: 'Опубликовать этот отзыв?',
    confirmLabel: 'Одобрить',
    danger: false,
    action: async () => {
      await request(`${API}/${row.pid}`, { method: 'POST' });
      await afterAction([row.pid], 'Отзыв одобрен и поставлен в очередь на публикацию');
    },
  });

  const deleteOne = (row) => setConfirmState({
    title: 'Удаление отзыва',
    message: 'Вы уверены, что хотите удалить этот отзыв?',
    confirmLabel: 'Удалить',
    danger: true,
    action: async () => {
      await request(`${API}/${row.pid}`, { method: 'DELETE' });
      await afterAction([row.pid], 'Отзыв удалён');
    },
  });

  const approveSelected = () => {
    const pids = [...selected];
    setConfirmState({
      title: 'Публикация отзывов',
      message: `Опубликовать выбранные отзывы (${pids.length} шт.)?`,
      confirmLabel: 'Одобрить',
      danger: false,
      action: async () => {
        await request(API, { method: 'POST', body: pids });
        await afterAction(pids, 'Отзывы одобрены и поставлены в очередь на публикацию');
      },
    });
  };

  const deleteSelected = () => {
    const pids = [...selected];
    setConfirmState({
      title: 'Удаление отзывов',
      message: `Вы уверены, что хотите удалить выбранные отзывы (${pids.length} шт.)? Это действие необратимо.`,
      confirmLabel: 'Удалить',
      danger: true,
      action: async () => {
        await request(API, { method: 'DELETE', body: pids });
        await afterAction(pids, 'Отзывы удалены');
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <span className="icon">
            <i className="fa-solid fa-comments" />
          </span>
          <div>
            <h1>Отзывы</h1>
            <div className="last-update">Управление публикациями</div>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={refresh} disabled={loading}>
            <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>
      </header>

      <div className="card">
        <PublishInterval value={interval} saving={intervalSaving} onSave={saveInterval} />
      </div>

      <div className="tabs page-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab-btn${t.key === tabKey ? ' active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" className="btn" onClick={() => loadList(page)}>
            Повторить
          </button>
        </div>
      )}

      <div className="card">
        {selected.size > 0 && (
          <div className="selection-bar">
            <span className="selection-count">Выбрано: {selected.size}</span>
            <div className="selection-actions">
              {isNew && (
                <button type="button" className="btn btn-success-soft" onClick={approveSelected}>
                  <i className="fa-solid fa-check" />
                  <span>Одобрить</span>
                </button>
              )}
              <button type="button" className="btn btn-danger-soft" onClick={deleteSelected}>
                <i className="fa-solid fa-trash-can" />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="state-box">
            <i className="fa-solid fa-spinner fa-spin" />
            <span>Загрузка отзывов…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="state-box">
            <i className="fa-regular fa-folder-open" />
            <span>{tab.empty}</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="reviews-table">
              <colgroup>
                <col className="col-check" />
                <col className="col-pid" />
                <col className="col-chat" />
                <col className="col-username" />
                <col />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="check-col">
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={allOnPage}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedOnPage > 0 && !allOnPage;
                      }}
                      onChange={toggleAll}
                      title="Выделить все"
                      aria-label="Выделить все"
                    />
                  </th>
                  <th>№</th>
                  <th>Chat ID</th>
                  <th>Username</th>
                  <th>Текст</th>
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.pid} className={selected.has(row.pid) ? 'selected' : ''}>
                    <td className="check-col">
                      <input
                        type="checkbox"
                        className="row-check"
                        checked={selected.has(row.pid)}
                        onChange={() => toggleOne(row.pid)}
                        aria-label={`Выбрать отзыв ${row.pid}`}
                      />
                    </td>
                    <td className="mono">{row.pid}</td>
                    <td className="mono">{row.chatId}</td>
                    <td className="username-cell">
                      <Username username={row.username} />
                    </td>
                    <td className="review-text">{row.text}</td>
                    <td>
                      <div className="row-actions">
                        {isNew && (
                          <button
                            type="button"
                            className="btn btn-icon success"
                            title="Одобрить"
                            aria-label="Одобрить"
                            onClick={() => approveOne(row)}
                          >
                            <i className="fa-solid fa-check" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-icon danger"
                          title="Удалить"
                          aria-label="Удалить"
                          onClick={() => deleteOne(row)}
                        >
                          <i className="fa-solid fa-trash-can" />
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
