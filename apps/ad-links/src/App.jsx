import React, { useEffect, useState, useCallback, useRef } from 'react';
import './App.css';
import UserProfile from '../../shared/UserProfile.jsx';

// =============================================================
// API КЛИЕНТ
// =============================================================
const apiFetch = async (url, options = {}) => {
  const initData = window.Telegram?.WebApp?.initData || '';
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData, ...(options.headers || {}) },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch {}
    throw new Error(`${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
  }
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

const realApi = {
  // GET /api/ad-links -> { adLinks:[{id,code,comment?}], bot }
  list: () => apiFetch('/api/ad-links'),
  // POST /api/ad-links (тело {} или {comment}) -> создаёт ссылку
  create: () => apiFetch('/api/ad-links', { method: 'POST', body: JSON.stringify({}) }),
  // PATCH /api/ad-links/{id} { comment }
  updateComment: (id, comment) =>
      apiFetch(`/api/ad-links/${id}`, { method: 'PATCH', body: JSON.stringify({ comment }) }),
  // GET /api/ad-links/{id}/statistic?dealsCount=N&dayActivity=N
  statistic: (id, params = {}) => {
    const qs = new URLSearchParams();
    if (params.dealsCount != null && params.dealsCount !== '') qs.set('dealsCount', params.dealsCount);
    if (params.dayActivity != null && params.dayActivity !== '') qs.set('dayActivity', params.dayActivity);
    const q = qs.toString();
    return apiFetch(`/api/ad-links/${id}/statistic${q ? '?' + q : ''}`);
  },
  // DELETE /api/ad-links/{id}?force=false|true
  // 204 → удалено. 409 (есть пользователи) → { registeredUsers: N }, удаления не было.
  remove: async (id, force = false) => {
    const initData = window.Telegram?.WebApp?.initData || '';
    const res = await fetch(`/api/ad-links/${id}?force=${force}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
    });
    if (res.status === 204) return { deleted: true };
    if (res.status === 409) {
      let body = {};
      try { body = await res.json(); } catch {}
      return { deleted: false, registeredUsers: body.registeredUsers ?? 0 };
    }
    let detail = '';
    try { detail = await res.text(); } catch {}
    throw new Error(`${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
  },
};

const api = realApi;

// =============================================================
// УТИЛИТЫ
// =============================================================
function linkUrl(bot, code) { return `https://t.me/${bot}?start=${code}`; }

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function formatAmount(v) {
  if (v == null) return '0';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU');
}

// =============================================================
// TOAST
// =============================================================
function Toast({ toast }) {
  if (!toast) return null;
  return (
      <div className={`toast toast-${toast.type}`}>
        <i className={`fas ${toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} aria-hidden="true"></i>
        {toast.text}
      </div>
  );
}

// =============================================================
// МОДАЛКА комментария
// =============================================================
function CommentModal({ link, bot, onClose, onSave }) {
  const [value, setValue] = useState(link.comment || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSave(value.trim()); onClose(); }
    finally { setBusy(false); }
  };
  return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3><i className="fas fa-comment-dots" aria-hidden="true"></i> Комментарий к ссылке</h3>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><i className="fas fa-xmark"></i></button>
          </div>
          <a className="modal-link" href={linkUrl(bot, link.code)} target="_blank" rel="noreferrer">{linkUrl(bot, link.code)}</a>
          <textarea className="textarea" value={value} onChange={(e) => setValue(e.target.value)} rows={4} placeholder="Введите комментарий" autoFocus />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Отмена</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              <i className="fas fa-check" aria-hidden="true"></i> Сохранить
            </button>
          </div>
        </div>
      </div>
  );
}

// =============================================================
// МОДАЛКА удаления
// =============================================================
function DeleteModal({ usersCount, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const loading = usersCount == null;              // N ещё добирается
  const n = Number(usersCount) || 0;
  const text = loading
      ? 'Проверяем зарегистрированных пользователей…'
      : n > 0
          ? `По ссылке уже зарегистрировано ${n.toLocaleString('ru-RU')} пользователей. Вы всё равно хотите удалить ссылку?`
          : 'Вы точно хотите удалить ссылку?';
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); }
    finally { setBusy(false); }
  };
  return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="danger-title"><i className="fas fa-triangle-exclamation" aria-hidden="true"></i> Удаление ссылки</h3>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><i className="fas fa-xmark"></i></button>
          </div>
          <p className="modal-text">{text}</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Отмена</button>
            <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy || loading}>
              <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-trash-can'}`} aria-hidden="true"></i> Удалить
            </button>
          </div>
        </div>
      </div>
  );
}

// =============================================================
// ЭКРАН: СПИСОК ССЫЛОК
// =============================================================
function LinksScreen({ onOpenStats, showToast }) {
  const [links, setLinks] = useState([]);
  const [bot, setBot] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editLink, setEditLink] = useState(null);
  const [deleteLink, setDeleteLink] = useState(null); // { ...link, usersCount }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.list();
      setLinks(Array.isArray(res?.adLinks) ? res.adLinks : []);
      setBot(res?.bot || '');
    } catch (e) {
      setError(e.message || 'Не удалось загрузить ссылки');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try { await api.create(); await load(); showToast('success', 'Ссылка создана'); }
    catch { showToast('error', 'Не удалось создать ссылку'); }
    finally { setCreating(false); }
  };

  const copyLink = async (link) => {
    const url = linkUrl(bot, link.code);
    try {
      await navigator.clipboard.writeText(url);
      showToast('success', 'Ссылка скопирована');
    } catch {
      // запасной способ
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast('success', 'Ссылка скопирована'); }
      catch { showToast('error', 'Не удалось скопировать'); }
      document.body.removeChild(ta);
    }
  };

  const saveComment = async (comment) => {
    await api.updateComment(editLink.id, comment);
    await load();
    showToast('success', 'Комментарий сохранён');
  };

  // По ТЗ клик всегда открывает модалку подтверждения. Текст зависит от числа
  // зарегистрированных: берём из поля списка, иначе добираем из статистики (adUsersCount).
  const askDelete = async (link) => {
    const known = link.usersCount ?? link.registeredUsersCount ?? link.adUsersCount;
    if (known != null) { setDeleteLink({ ...link, usersCount: known }); return; }
    setDeleteLink({ ...link, usersCount: null });
    try {
      const s = await api.statistic(link.id);
      setDeleteLink((cur) => (cur && cur.id === link.id ? { ...cur, usersCount: s?.adUsersCount ?? 0 } : cur));
    } catch {
      setDeleteLink((cur) => (cur && cur.id === link.id ? { ...cur, usersCount: 0 } : cur));
    }
  };

  // Подтверждение — принудительное удаление (force=true): пользователь уже подтвердил, зная про N.
  const confirmDelete = async () => {
    await api.remove(deleteLink.id, true);
    await load();
    showToast('success', 'Ссылка удалена');
  };

  return (
      <div className="results-area">
        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            <i className={`fas ${creating ? 'fa-spinner fa-spin' : 'fa-plus'}`} aria-hidden="true"></i> Создать
          </button>
        </div>

        {loading && <div className="state"><i className="fas fa-spinner fa-spin"></i><span>Загрузка…</span></div>}

        {!loading && error && (
            <div className="state state-error">
              <i className="fas fa-exclamation-circle"></i><span>{error}</span>
              <button type="button" className="btn btn-secondary" onClick={load}>Повторить</button>
            </div>
        )}

        {!loading && !error && (
            <div className="card">
              <div className="card-head">
                <span className="card-title"><i className="fas fa-link" aria-hidden="true"></i> Список ссылок</span>
                <span className="card-hint">Клик по ссылке — копировать · по комментарию — редактировать · двойной клик по строке — статистика</span>
              </div>

              {links.length === 0 ? (
                  <div className="state state-empty"><i className="fas fa-inbox"></i><span>Ссылок пока нет</span></div>
              ) : (
                  <div className="ltable">
                    <div className="ltrow lthead">
                      <div className="lcell">Ссылка</div>
                      <div className="lcell">Комментарий</div>
                      <div className="lcell lcell-del" aria-hidden="true"></div>
                    </div>
                    {links.map((l) => (
                        <div className="ltrow" key={l.id} onDoubleClick={() => onOpenStats(l, bot)}>
                          <div className="lcell">
                            <button type="button" className="link-btn" onClick={() => copyLink(l)} title="Копировать ссылку">
                              <span className="link-text">{linkUrl(bot, l.code)}</span>
                              <i className="fas fa-copy link-copy" aria-hidden="true"></i>
                            </button>
                          </div>
                          <div className="lcell">
                            <button type="button" className={`comment-btn ${l.comment ? '' : 'comment-empty'}`} onClick={() => setEditLink(l)}>
                              {l.comment ? l.comment : '+ добавить комментарий'}
                            </button>
                          </div>
                          <div className="lcell lcell-del">
                            <button type="button" className="del-btn" onClick={() => askDelete(l)} aria-label="Удалить ссылку" title="Удалить ссылку">
                              <i className="fas fa-xmark" aria-hidden="true"></i>
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
              )}
            </div>
        )}

        {editLink && (
            <CommentModal link={editLink} bot={bot} onClose={() => setEditLink(null)} onSave={saveComment} />
        )}
        {deleteLink && (
            <DeleteModal usersCount={deleteLink.usersCount} onClose={() => setDeleteLink(null)} onConfirm={confirmDelete} />
        )}
      </div>
  );
}

// =============================================================
// ЭКРАН: СТАТИСТИКА
// =============================================================
function StatGroup({ title, children }) {
  return (
      <div className="stat-group">
        <div className="stat-group-title">{title}</div>
        {children}
      </div>
  );
}
function StatRow({ label, value, total }) {
  return (
      <div className={`stat-row ${total ? 'stat-row-total' : ''}`}>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </div>
  );
}

function VolumeTable({ users, referrals, total }) {
  // объединяем валюты из всех трёх объектов
  const fiats = Array.from(new Set([
    ...Object.keys(users || {}), ...Object.keys(referrals || {}), ...Object.keys(total || {}),
  ]));
  if (fiats.length === 0) return null;
  const row = (label, obj, isTotal) => (
      <div className={`vt-row ${isTotal ? 'vt-total' : ''}`}>
        <div className="vt-cell vt-label">{label}</div>
        {fiats.map((f) => <div className="vt-cell vt-num" key={f}>{formatAmount(obj?.[f])}</div>)}
      </div>
  );
  return (
      <div className="vtable" style={{ '--fiat-cols': fiats.length }}>
        <div className="vt-row vt-head">
          <div className="vt-cell"></div>
          {fiats.map((f) => <div className="vt-cell vt-num" key={f}>{f}</div>)}
        </div>
        {row('Пользователи', users)}
        {row('Рефералы', referrals)}
        {row('Всего', total, true)}
      </div>
  );
}

function StatsScreen({ link, bot, onBack, showToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dealsCount, setDealsCount] = useState('1');
  const [dayActivity, setDayActivity] = useState('1');
  const [byDealBusy, setByDealBusy] = useState(false);
  const [byActBusy, setByActBusy] = useState(false);
  const [profileChatId, setProfileChatId] = useState(null); // открытый профиль пользователя

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Полные данные (верхние счётчики, оборот, пользователи) — БЕЗ параметров:
      // бэк применяет dealsCount/dayActivity ко всему ответу, поэтому их тут не шлём.
      const full = await api.statistic(link.id);
      let byDeal = full.adLinkStatisticByDeal;
      let byAct = full.adLinkStatisticByActivity;
      // Блоки «по N» считаем отдельными запросами. Бэк может вернуть под-объект напрямую.
      try {
        const d = await api.statistic(link.id, { dealsCount });
        byDeal = d?.adLinkStatisticByDeal ?? (d && 'usersCountBy' in d ? d : byDeal);
      } catch {}
      try {
        const a = await api.statistic(link.id, { dayActivity });
        byAct = a?.adLinkStatisticByActivity ?? (a && 'usersCountBy' in a ? a : byAct);
      } catch {}
      setStats({ ...full, adLinkStatisticByDeal: byDeal, adLinkStatisticByActivity: byAct });
    } catch (e) { setError(e.message || 'Не удалось загрузить статистику'); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.id]);

  useEffect(() => { load(); }, [load]);

  const recalcDeals = async () => {
    setByDealBusy(true);
    try {
      const s = await api.statistic(link.id, { dealsCount });
      // бэк на запрос с параметром может вернуть либо полный объект (с adLinkStatisticByDeal),
      // либо сразу под-объект { usersCountBy, referralsCountBy, totalUsersBy }
      const block = s?.adLinkStatisticByDeal ?? (s && 'usersCountBy' in s ? s : null);
      if (block) setStats((prev) => ({ ...prev, adLinkStatisticByDeal: block }));
    } catch { showToast('error', 'Ошибка пересчёта'); }
    finally { setByDealBusy(false); }
  };
  const recalcActivity = async () => {
    setByActBusy(true);
    try {
      const s = await api.statistic(link.id, { dayActivity });
      const block = s?.adLinkStatisticByActivity ?? (s && 'usersCountBy' in s ? s : null);
      if (block) setStats((prev) => ({ ...prev, adLinkStatisticByActivity: block }));
    } catch { showToast('error', 'Ошибка пересчёта'); }
    finally { setByActBusy(false); }
  };

  const openUser = (u) => {
    // Открываем общий компонент профиля (тот же, что в аппе «Пользователи»).
    setProfileChatId(u.chatId);
  };

  return (
      <div className="results-area">
        <div className="stats-topbar">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            <i className="fas fa-arrow-left" aria-hidden="true"></i> Назад
          </button>
          <a className="stats-link" href={linkUrl(bot, link.code)} target="_blank" rel="noreferrer">{linkUrl(bot, link.code)}</a>
        </div>

        {loading && <div className="state"><i className="fas fa-spinner fa-spin"></i><span>Загрузка…</span></div>}

        {!loading && error && (
            <div className="state state-error">
              <i className="fas fa-exclamation-circle"></i><span>{error}</span>
              <button type="button" className="btn btn-secondary" onClick={load}>Повторить</button>
            </div>
        )}

        {!loading && !error && stats && (
            <div className="card">
              <div className="card-head">
                <span className="card-title"><i className="fas fa-chart-column" aria-hidden="true"></i> Статистика по ссылке</span>
              </div>

              <div className="stats-body">
                <StatGroup title="Пользователи и рефералы">
                  <StatRow label="Зарегистрированных пользователей" value={formatAmount(stats.adUsersCount)} />
                  <StatRow label="Рефералов (рекурсивно)" value={formatAmount(stats.referralsCount)} />
                  <StatRow label="Всего" value={formatAmount(stats.totalUsersCount)} total />
                </StatGroup>

                <StatGroup title="Совершённые сделки">
                  <StatRow label="Сделок пользователями" value={formatAmount(stats.usersCountDeals)} />
                  <StatRow label="Сделок рефералами" value={formatAmount(stats.referralsCountDeals)} />
                  <StatRow label="Всего" value={formatAmount(stats.totalUsersDeals)} total />
                </StatGroup>

                <StatGroup title="Оборот по сделкам">
                  <VolumeTable users={stats.usersDealsVolume} referrals={stats.referralsDealsVolume} total={stats.totalUsersDealsVolume} />
                </StatGroup>

                <StatGroup title="По количеству сделок">
                  <div className="recalc-field">
                    <label>Кол-во сделок:</label>
                    <input type="text" inputMode="numeric" className="input input-num" value={dealsCount}
                           onChange={(e) => setDealsCount(e.target.value.replace(/[^\d]/g, ''))} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={recalcDeals} disabled={byDealBusy}>
                      <i className={`fas ${byDealBusy ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i>
                    </button>
                  </div>
                  <StatRow label={`Пользователей, совершивших ${dealsCount || 0} сделок`} value={formatAmount(stats.adLinkStatisticByDeal?.usersCountBy)} />
                  <StatRow label={`Рефералов, совершивших ${dealsCount || 0} сделок`} value={formatAmount(stats.adLinkStatisticByDeal?.referralsCountBy)} />
                  <StatRow label="Всего" value={formatAmount(stats.adLinkStatisticByDeal?.totalUsersBy)} total />
                </StatGroup>

                <StatGroup title="По активности">
                  <div className="recalc-field">
                    <label>Активность за последние, дней:</label>
                    <input type="text" inputMode="numeric" className="input input-num" value={dayActivity}
                           onChange={(e) => setDayActivity(e.target.value.replace(/[^\d]/g, ''))} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={recalcActivity} disabled={byActBusy}>
                      <i className={`fas ${byActBusy ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i>
                    </button>
                  </div>
                  <StatRow label="Активных пользователей" value={formatAmount(stats.adLinkStatisticByActivity?.usersCountBy)} />
                  <StatRow label="Активных рефералов" value={formatAmount(stats.adLinkStatisticByActivity?.referralsCountBy)} />
                  <StatRow label="Всего" value={formatAmount(stats.adLinkStatisticByActivity?.totalUsersBy)} total />
                </StatGroup>

                <StatGroup title="Пользователи">
                  <div className="utable-wrap">
                    <div className="utable">
                      <div className="utrow uthead">
                        <div className="ucell">Telegram ID</div>
                        <div className="ucell">Username</div>
                        <div className="ucell">Дата регистрации</div>
                        <div className="ucell ucell-right">Сделок</div>
                      </div>
                      {(stats.adUsers || []).map((u) => (
                          <div className="utrow" key={u.chatId} onDoubleClick={() => openUser(u)} title="Двойной клик — профиль пользователя">
                            <div className="ucell mono">{u.chatId}</div>
                            <div className="ucell">{u.userName ? <span className="uname">@{u.userName}</span> : '—'}</div>
                            <div className="ucell mono">{formatDateTime(u.registrationDate)}</div>
                            <div className="ucell ucell-right mono">{formatAmount(u.dealsCount)}</div>
                          </div>
                      ))}
                    </div>
                  </div>
                </StatGroup>
              </div>
            </div>
        )}

        {profileChatId != null && (
            <UserProfile chatId={profileChatId} onClose={() => setProfileChatId(null)} />
        )}
      </div>
  );
}

// =============================================================
// КОРНЕВОЙ КОМПОНЕНТ
// =============================================================
export default function App() {
  const [screen, setScreen] = useState({ name: 'list' }); // {name:'list'} | {name:'stats', link, bot}
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
    return () => clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((type, text) => {
    setToast({ type, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
      <div className="app">
        <Toast toast={toast} />
        <div className="container">
          <header className="page-header">
            <h1><i className="fas fa-bullhorn" aria-hidden="true"></i> Рекламные ссылки</h1>
          </header>
          <main>
            {screen.name === 'list' ? (
                <LinksScreen
                    showToast={showToast}
                    onOpenStats={(link, bot) => setScreen({ name: 'stats', link, bot })}
                />
            ) : (
                <StatsScreen
                    link={screen.link}
                    bot={screen.bot}
                    showToast={showToast}
                    onBack={() => setScreen({ name: 'list' })}
                />
            )}
          </main>
        </div>
      </div>
  );
}