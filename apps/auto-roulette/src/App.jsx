import { useEffect, useState, useCallback, useRef } from 'react';
import UserProfile from '../../shared/UserProfile.jsx';
import {
  api, fullName, usernameOrHidden, fmtNum, fmtAmount,
} from './api.js';

/* ==================== Тосты ==================== */
function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, type = 'info') => {
    clearTimeout(timer.current);
    setToast({ text, type });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const node = toast ? (
      <div className={`toast toast-${toast.type}`}>{toast.text}</div>
  ) : null;
  return { show, node };
}

/* ==================== Overlay / модалка ==================== */
function Overlay({ children, onClose }) {
  return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        {children}
      </div>
  );
}

function ConfirmModal({ title, text, confirmText = 'Да', cancelText = 'Отмена', danger, onConfirm, onClose, busy }) {
  return (
      <Overlay onClose={busy ? undefined : onClose}>
        <div className="modal modal-sm">
          <div className="modal-head">
            <h2 className={danger ? 'danger' : ''}>{title}</h2>
            <button className="close-x" onClick={onClose} disabled={busy}>×</button>
          </div>
          <div className="modal-body"><p className="confirm-text">{text}</p></div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{cancelText}</button>
            <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
              {busy ? '...' : confirmText}
            </button>
          </div>
        </div>
      </Overlay>
  );
}

/* ==================== Вкладка «Текущая рулетка» ==================== */
function CurrentTab({ showToast, onOpenProfile }) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);      // объект инфо или null (нет активной)
  const [count, setCount] = useState(0);       // набрано участников
  const [autostart, setAutostart] = useState(false);
  const [parts, setParts] = useState([]);      // участники
  const [modal, setModal] = useState(null);    // 'start' | 'stop' | 'clear' | 'spin' | 'autostart'
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [inf, cnt] = await Promise.all([api.getInfo(), api.participantsCount()]);
      setInfo(inf);
      setCount(cnt);
      // участники — грузим, только если список не пуст (или рулетка активна)
      if (cnt > 0) {
        const { items } = await api.participants(0, 50);
        setParts(items);
      } else {
        setParts([]);
      }
    } catch (e) {
      showToast(e.message || 'Ошибка загрузки', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { api.getAutostart().then(setAutostart).catch(() => {}); }, []);

  // Состояние вкладки: 'active' | 'stopped' | 'none'
  const state = info ? 'active' : (count > 0 ? 'stopped' : 'none');
  const limit = info?.participantCount ?? 0;
  const reached = state === 'active' && limit > 0 && count >= limit;

  const doStart = async (participantCount, prizes) => {
    setBusy(true);
    try {
      await api.start(participantCount, prizes);
      setModal(null);
      showToast('Рулетка запущена', 'success');
      await reload();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const doStop = async () => {
    setBusy(true);
    try { await api.stop(); setModal(null); showToast('Рулетка остановлена', 'success'); await reload(); }
    catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };
  const doClear = async () => {
    setBusy(true);
    try { await api.clearParticipants(); setModal(null); showToast('Список участников очищен', 'success'); await reload(); }
    catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };
  const doSpin = async () => {
    setBusy(true);
    try { await api.spin(); setModal(null); showToast('Розыгрыш проведён', 'success'); await reload(); }
    catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };
  const toggleAutostart = async (next) => {
    // включение требует подтверждения (ТЗ); выключение — сразу
    if (next) { setModal('autostart'); return; }
    try { await api.setAutostart(false); setAutostart(false); showToast('Автостарт выключен', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const confirmAutostart = async () => {
    setBusy(true);
    try { await api.setAutostart(true); setAutostart(true); setModal(null); showToast('Автостарт включён', 'success'); }
    catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (loading) return <div className="state"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</div>;

  return (
      <div className="tab-pane">
        {/* Автостарт — карточка с описанием (как в макете) */}
        <div className="autostart-card">
          <div className="autostart-info">
            <div className="autostart-title">Автостарт</div>
            <div className="autostart-desc">После розыгрыша новая рулетка стартует автоматически с теми же лимитом и призами</div>
          </div>
          <label className={`switch ${autostart ? 'is-on' : 'is-off'}`}>
            <input type="checkbox" checked={autostart} onChange={(e) => toggleAutostart(e.target.checked)} />
            <span className="track" /><span className="thumb" />
          </label>
        </div>

        {/* Панель управления */}
        <div className="control-bar">
          <div className="control-left">
            {state === 'active' ? (
                <button className="btn btn-danger" onClick={() => setModal('stop')}>
                  <i className="fa-solid fa-stop" /> Остановить рулетку
                </button>
            ) : (
                <button className="btn btn-primary" onClick={() => setModal('start')}>
                  <i className="fa-solid fa-play" /> Запустить рулетку
                </button>
            )}
            {state === 'stopped' && (
                <button className="btn btn-secondary" onClick={() => setModal('clear')}>
                  <i className="fa-solid fa-trash" /> Очистить список участников
                </button>
            )}
          </div>
        </div>

        {/* Тело в зависимости от состояния */}
        {state === 'none' && (
            <div className="state state-empty"><i className="fa-solid fa-circle-info" /> Нет активной рулетки</div>
        )}

        {state === 'stopped' && (
            <div className="note">Рулетка остановлена. Список участников сохранён</div>
        )}

        {state === 'active' && (
            <div className="roulette-head">
              <div className="status-row">
                <span className="round-no">Рулетка №{info.roundNo}</span>
                <span className={`status-badge ${reached ? 'closed' : 'open'}`}>
              {reached ? 'Закрыта' : 'Открыта'}
            </span>
              </div>
              <div className="progress-block">
                <div className="progress-label">
                  <span>{fmtNum(count)} / {fmtNum(limit)} участников</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: limit ? `${Math.min(100, (count / limit) * 100)}%` : '0%' }} />
                </div>
              </div>
              {Array.isArray(info.prizes) && info.prizes.length > 0 && (
                  <div className="fixed-line">
                    Зафиксировано при запуске — Лимит участников: <b>{fmtNum(limit)}</b> · Призовые места: <b>{info.prizes.map((p) => fmtAmount(p)).join(', ')}</b>
                  </div>
              )}
              <button className="btn btn-primary btn-spin" disabled={!reached} onClick={() => setModal('spin')}>
                <i className="fa-solid fa-arrows-spin" /> Прокрутить рулетку
              </button>
              {!reached && <span className="spin-hint">Кнопка станет активной при достижении лимита участников</span>}
            </div>
        )}

        {/* Таблица участников (в активном и остановленном состоянии) */}
        {state !== 'none' && (
            <ParticipantsTable parts={parts} onOpenProfile={onOpenProfile} />
        )}

        {/* Модалки */}
        {modal === 'start' && (
            <StartModal busy={busy} onClose={() => setModal(null)} onStart={doStart} showToast={showToast} />
        )}
        {modal === 'stop' && (
            <ConfirmModal danger title="Остановить рулетку" busy={busy}
                          text="Текущая рулетка будет отменена без розыгрыша. Список участников сохранится — его можно очистить отдельно. Продолжить?"
                          confirmText="Остановить" onConfirm={doStop} onClose={() => setModal(null)} />
        )}
        {modal === 'clear' && (
            <ConfirmModal danger title="Очистить список" busy={busy}
                          text="Все участники остановленной рулетки будут удалены из списка. Продолжить?"
                          confirmText="Очистить" onConfirm={doClear} onClose={() => setModal(null)} />
        )}
        {modal === 'spin' && (
            <ConfirmModal title={`Прокрутить рулетку №${info?.roundNo}?`} busy={busy}
                          text="Будет проведён розыгрыш призов среди участников."
                          confirmText="Да" onConfirm={doSpin} onClose={() => setModal(null)} />
        )}
        {modal === 'autostart' && (
            <ConfirmModal title="Включить автостарт" busy={busy}
                          text="Рулетки будут запускаться автоматически с теми же лимитом и призовыми местами, что и в предыдущей рулетке. Вы действительно хотите включить автостарт?"
                          confirmText="Включить" onConfirm={confirmAutostart} onClose={() => setModal(null)} />
        )}
      </div>
  );
}

/* ---- Таблица участников ---- */
function ParticipantsTable({ parts, onOpenProfile }) {
  if (!parts.length) {
    return <div className="state state-empty"><i className="fa-solid fa-users" /> Участников пока нет</div>;
  }
  return (
      <div className="table-wrap">
        <table className="grid">
          <thead>
          <tr><th className="c-num">Номер</th><th className="c-id">Chat ID</th><th>Username</th><th>Имя</th></tr>
          </thead>
          <tbody>
          {parts.map((p) => {
            const u = p.user || {};
            return (
                <tr key={p.number} onDoubleClick={() => u.chatId != null && onOpenProfile(u.chatId)} title="Двойной клик — профиль">
                  <td className="c-num mono">{p.number}</td>
                  <td className="c-id mono">{u.chatId}</td>
                  <td className={u.username ? '' : 'muted'}>{usernameOrHidden(u)}</td>
                  <td>{fullName(u) || <span className="muted">—</span>}</td>
                </tr>
            );
          })}
          </tbody>
        </table>
      </div>
  );
}

/* ---- Модалка запуска рулетки ---- */
function StartModal({ busy, onClose, onStart, showToast }) {
  const [limit, setLimit] = useState('');
  const [places, setPlaces] = useState([{ amount: '' }]); // призовые места

  const setPlace = (i, v) => setPlaces((p) => p.map((x, idx) => idx === i ? { amount: v.replace(/[^\d.]/g, '') } : x));
  const addPlace = () => setPlaces((p) => [...p, { amount: '' }]);
  const removePlace = (i) => setPlaces((p) => p.filter((_, idx) => idx !== i));

  const submit = () => {
    const lim = Number(limit);
    const prizes = places.map((p) => Number(p.amount)).filter((n) => Number.isFinite(n) && n > 0);
    if (!(lim > 0) || prizes.length === 0) {
      showToast('Укажите лимит участников и хотя бы одно призовое место больше 0', 'error');
      return;
    }
    onStart(lim, prizes);
  };

  return (
      <Overlay onClose={busy ? undefined : onClose}>
        <div className="modal">
          <div className="modal-head">
            <h2>Запуск рулетки</h2>
            <button className="close-x" onClick={onClose} disabled={busy}>×</button>
          </div>
          <div className="modal-body">
            <p className="hint-text">Укажите лимит участников и призовые места. Значения фиксируются на старте и действуют для запускаемой рулетки.</p>
            <div className="field">
              <label>Лимит участников</label>
              <input type="text" inputMode="numeric" value={limit}
                     onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))} placeholder="напр. 300" />
            </div>
            <div className="places">
              <div className="places-head"><span>Призовые места</span></div>
              <table className="places-table">
                <thead><tr><th className="c-place">Место</th><th>Сумма приза</th><th className="c-del" /></tr></thead>
                <tbody>
                {places.map((p, i) => (
                    <tr key={i}>
                      <td className="c-place">{i + 1} место</td>
                      <td>
                        <input type="text" inputMode="decimal" value={p.amount}
                               onChange={(e) => setPlace(i, e.target.value)} placeholder="сумма" />
                      </td>
                      <td className="c-del">
                        <button className="del-btn" onClick={() => removePlace(i)}
                                disabled={places.length === 1} title="Удалить место">
                          <i className="fa-solid fa-circle-xmark" />
                        </button>
                      </td>
                    </tr>
                ))}
                </tbody>
              </table>
              <button className="btn btn-secondary btn-sm" onClick={addPlace}>
                <i className="fa-solid fa-plus" /> Добавить
              </button>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Отмена</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? '...' : 'Запустить'}
            </button>
          </div>
        </div>
      </Overlay>
  );
}

/* ==================== Вкладка «История победителей» ==================== */
function HistoryTab({ showToast, onOpenProfile }) {
  const empty = { roundNo: '', chatId: '', dateMode: 'equal', dateEqual: '', dateFrom: '', dateTo: '' };
  const [filters, setFilters] = useState(empty);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({}); // roundNo -> bool

  const buildBody = (f) => {
    const b = { page: 0, size: 50 };
    if (f.roundNo !== '') b.rouletteNumber = Number(f.roundNo);
    if (f.chatId !== '') b.winnerChatId = Number(f.chatId);
    // Даты — ISO-8601; бэк ищет без учёта времени.
    if (f.dateMode === 'equal') {
      if (f.dateEqual) {
        b.rouletteDrawnAt = `${f.dateEqual}T00:00:00.000Z`;
        b.rouletteDrawnTo = `${f.dateEqual}T23:59:59.999Z`;
      }
    } else {
      if (f.dateFrom) b.rouletteDrawnAt = `${f.dateFrom}T00:00:00.000Z`;
      if (f.dateTo) b.rouletteDrawnTo = `${f.dateTo}T23:59:59.999Z`;
    }
    return b;
  };

  const load = useCallback(async (f) => {
    setLoading(true);
    try { const { items } = await api.history(buildBody(f)); setRows(items); }
    catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(empty); }, [load]);

  const setF = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
  const reset = () => { setFilters(empty); load(empty); };

  return (
      <div className="tab-pane">
        <div className="filter-card">
          <div className="filter-grid">
            <div className="field"><label>Номер рулетки</label>
              <input type="text" inputMode="numeric" placeholder="напр. 41" value={filters.roundNo}
                     onChange={(e) => setF('roundNo', e.target.value.replace(/[^\d]/g, ''))} />
            </div>
            <div className="field"><label>Chat ID победителя</label>
              <input type="text" inputMode="numeric" placeholder="напр. 555000111" value={filters.chatId}
                     onChange={(e) => setF('chatId', e.target.value.replace(/[^\d]/g, ''))} />
            </div>
            <div className="field"><label>Дата розыгрыша</label>
              <select value={filters.dateMode} onChange={(e) => setF('dateMode', e.target.value)}>
                <option value="equal">Равна</option>
                <option value="range">Диапазон</option>
              </select>
            </div>
            {filters.dateMode === 'equal' ? (
                <div className="field"><label>Дата</label>
                  <input type="date" value={filters.dateEqual} onChange={(e) => setF('dateEqual', e.target.value)} />
                </div>
            ) : (
                <div className="field"><label>С / по</label>
                  <div className="range-row">
                    <input type="date" value={filters.dateFrom} onChange={(e) => setF('dateFrom', e.target.value)} />
                    <span className="range-dash">—</span>
                    <input type="date" value={filters.dateTo} onChange={(e) => setF('dateTo', e.target.value)} />
                  </div>
                </div>
            )}
          </div>
          <div className="filter-actions">
            <button className="btn btn-primary" onClick={() => load(filters)}><i className="fa-solid fa-magnifying-glass" /> Поиск</button>
            <button className="btn btn-secondary" onClick={reset}>Сбросить</button>
          </div>
        </div>

        {loading ? (
            <div className="state"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</div>
        ) : rows.length === 0 ? (
            <div className="state state-empty"><i className="fa-solid fa-clock-rotate-left" /> Нет разыгранных рулеток</div>
        ) : (
            <div className="history-list">
              {rows.map((r) => {
                const d = r.autoRouletteDTO || {};
                const wins = r.winners || [];
                const open = !!expanded[d.roundNo];
                return (
                    <div className="hist-item" key={d.id ?? d.roundNo}>
                      <button className="hist-head" onClick={() => setExpanded((p) => ({ ...p, [d.roundNo]: !open }))}>
                        <i className={`fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        <span className="hist-round">Рулетка №{d.roundNo}</span>
                        <span className="hist-date">{d.drawnAt}</span>
                        <span className="hist-count">{wins.length} побед.</span>
                      </button>
                      {open && (
                          <div className="table-wrap">
                            <table className="grid">
                              <thead>
                              <tr><th className="c-place">Место</th><th className="c-id">Chat ID</th><th>Username</th><th>Имя</th><th className="c-amt">Сумма приза</th></tr>
                              </thead>
                              <tbody>
                              {wins.map((w, i) => {
                                const u = w.user || {};
                                return (
                                    <tr key={i} onDoubleClick={() => u.chatId != null && onOpenProfile(u.chatId)} title="Двойной клик — профиль">
                                      <td className="c-place">{w.winnerPlace}</td>
                                      <td className="c-id mono">{u.chatId}</td>
                                      <td className={u.username ? '' : 'muted'}>{usernameOrHidden(u)}</td>
                                      <td>{fullName(u) || <span className="muted">—</span>}</td>
                                      <td className="c-amt mono">{fmtAmount(w.prizeAmount)}</td>
                                    </tr>
                                );
                              })}
                              </tbody>
                            </table>
                          </div>
                      )}
                    </div>
                );
              })}
            </div>
        )}
      </div>
  );
}

/* ==================== Вкладка «Топ» ==================== */
function TopTab({ showToast, onOpenProfile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const d = await api.winners(); setRows(Array.isArray(d) ? d : []); }
      catch (e) { showToast(e.message, 'error'); }
      finally { setLoading(false); }
    })();
  }, [showToast]);

  if (loading) return <div className="state"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</div>;
  if (!rows.length) return <div className="state state-empty"><i className="fa-solid fa-ranking-star" /> Пока нет победителей</div>;

  return (
      <div className="tab-pane">
        <div className="table-wrap">
          <table className="grid">
            <thead>
            <tr><th className="c-rank">№</th><th className="c-id">Chat ID</th><th>Username</th><th>Имя</th><th className="c-num">Выигрышей</th><th className="c-amt">Общая сумма</th></tr>
            </thead>
            <tbody>
            {rows.map((r, i) => {
              const u = r.user || {};
              return (
                  <tr key={u.chatId ?? i} onDoubleClick={() => u.chatId != null && onOpenProfile(u.chatId)} title="Двойной клик — профиль">
                    <td className="c-rank">{i + 1}</td>
                    <td className="c-id mono">{u.chatId}</td>
                    <td className={u.username ? '' : 'muted'}>{usernameOrHidden(u)}</td>
                    <td>{fullName(u) || <span className="muted">—</span>}</td>
                    <td className="c-num mono">{fmtNum(r.winCount)}</td>
                    <td className="c-amt mono">{fmtAmount(r.totalAmount)}</td>
                  </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
  );
}

/* ==================== Вкладка «Сообщения» ==================== */
const MESSAGES = [
  { code: 'ROULETTE_DRAW_MESSAGE', title: 'Розыгрыш состоялся (рассылка всем)', hint: 'Плейсхолдеры: %1$s — номер рулетки, %2$s — список победителей' },
  { code: 'ROULETTE_WINNER_MESSAGE', title: 'Личное оповещение победителю', hint: 'Плейсхолдеры: %1$s — номер, %2$s — место, %3$s — приз, %4$s — список победителей' },
  { code: 'ROULETTE_CLOSED_MESSAGE', title: 'Рулетка закрыта (рассылка всем)', hint: 'Плейсхолдер: %1$s — лимит участников' },
  { code: 'ROULETTE_NEW_MESSAGE', title: 'Старт новой рулетки (рассылка всем)', hint: 'Без плейсхолдеров' },
];

function MessagesTab({ showToast }) {
  const [vals, setVals] = useState({});      // code -> value
  const [ids, setIds] = useState({});        // code -> id (для PUT)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await Promise.all(MESSAGES.map((m) => api.getMessage(m.code)));
        const v = {}, id = {};
        res.forEach((r, i) => { v[MESSAGES[i].code] = r?.value ?? ''; id[MESSAGES[i].code] = r?.id ?? MESSAGES[i].code; });
        setVals(v); setIds(id);
      } catch (e) { showToast(e.message, 'error'); }
      finally { setLoading(false); }
    })();
  }, [showToast]);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all(MESSAGES.map((m) => api.saveMessage(ids[m.code], vals[m.code])));
      showToast('Сообщения сохранены', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="state"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</div>;

  return (
      <div className="tab-pane">
        <div className="msg-list">
          {MESSAGES.map((m) => (
              <div className="msg-item" key={m.code}>
                <label className="msg-title">{m.title}</label>
                <textarea rows={5} value={vals[m.code] ?? ''}
                          onChange={(e) => setVals((p) => ({ ...p, [m.code]: e.target.value }))} />
                <span className="msg-hint">{m.hint}</span>
              </div>
          ))}
        </div>
        <div className="msg-foot">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '...' : 'Сохранить сообщения'}
          </button>
        </div>
      </div>
  );
}

/* ==================== Приложение ==================== */
const TABS = [
  { id: 'current', label: 'Текущая рулетка', icon: 'fa-circle-play' },
  { id: 'history', label: 'История победителей', icon: 'fa-clock-rotate-left' },
  { id: 'top', label: 'Топ', icon: 'fa-ranking-star' },
  { id: 'messages', label: 'Сообщения', icon: 'fa-comment-dots' },
];

export default function App() {
  const { show, node: toastNode } = useToast();
  const [tab, setTab] = useState('current');
  const [profileChatId, setProfileChatId] = useState(null); // открытый профиль

  return (
      <div className="wrap">
        <header className="app-head">
          <div className="app-title">
            <span className="app-ico"><i className="fa-solid fa-dice" /></span>
            <h1>Управление авторулеткой</h1>
          </div>
        </header>

        <nav className="tabs">
          {TABS.map((t) => (
              <button
                  key={t.id}
                  className={`tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}
              >
                <i className={`fa-solid ${t.icon}`} /> <span>{t.label}</span>
              </button>
          ))}
        </nav>

        <main className="content">
          {tab === 'current' && <CurrentTab showToast={show} onOpenProfile={setProfileChatId} />}
          {tab === 'history' && <HistoryTab showToast={show} onOpenProfile={setProfileChatId} />}
          {tab === 'top' && <TopTab showToast={show} onOpenProfile={setProfileChatId} />}
          {tab === 'messages' && <MessagesTab showToast={show} />}
        </main>

        {profileChatId != null && (
            <UserProfile chatId={profileChatId} onClose={() => setProfileChatId(null)} />
        )}

        {toastNode}
      </div>
  );
}