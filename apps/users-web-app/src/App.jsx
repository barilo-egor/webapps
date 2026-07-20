import { useEffect, useMemo, useState } from 'react';
import UserProfile from '../../shared/UserProfile.jsx';

/* ============================================================

   Роль текущего оператора берём с бэка: GET /api/users/role/{myChatId},
   где myChatId — из Telegram initData. От неё зависит доступ к действиям.
   Правами всё равно рулит и бэк (проверяет initiatorId на изменяющих запросах).
   ============================================================ */


const PAGE_SIZE = 50;

/* ---- Поиск по количеству обменов (контракт бэка) ----
   dealsCount          — значение (для RANGE это «от»)
   maxDealsCount       — «до» (только для RANGE)
   comparisonOperator  — EQUAL | GREATER_THAN | LESS_THAN | RANGE
   Фильтрация и сортировка выполняются НА СЕРВЕРЕ: на клиенте лежит
   только текущая страница (50 записей), локально фильтровать нельзя. */
const CMP = {
  eq: 'EQUAL',
  gt: 'GREATER_THAN',
  lt: 'LESS_THAN',
  range: 'RANGE',
};

/* Сортировка (контракт бэка, Spring-стиль): ?sort=<поле>,<asc|desc>
   Пример рабочего запроса: /users?...&sort=dealsCount,asc
   Поля берём из ответа API — они же колонки таблицы. */
const SORTABLE = {
  chatId: 'chatId',
  username: 'username',
  dealsCount: 'dealsCount',
  lastActivityDate: 'lastActivityDate',
  isBanned: 'isBanned',
  isAutoConfirmOn: 'isAutoConfirmOn',
};

// chatId текущего оператора (кто открыл апп) — из Telegram initData.
const myChatId = () => window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;

// Права по ролям (из ТЗ).
const can = {
  balanceAddSub: (r) => ['ADMIN', 'OPERATOR', 'CHAT_ADMIN'].includes(r),
  balanceSet: (r) => ['ADMIN', 'OPERATOR'].includes(r),
  autoConfirm: (r) => r === 'ADMIN',
  ban: (r) => ['ADMIN', 'OPERATOR'].includes(r),
  role: (r) => r === 'ADMIN',
};

const fmtNum = (n) => (n == null || n === '' ? '0' : Number(n).toLocaleString('ru-RU'));

async function copyText(text, showToast) {
  try {
    await navigator.clipboard.writeText(String(text));
    showToast('Скопировано', 'info');
  } catch {
    showToast('Не удалось скопировать', 'error');
  }
}

/* ---------------- API ---------------- */

const headers = () => ({
  'Content-Type': 'application/json',
  'X-TG-Init-Data': window.Telegram?.WebApp?.initData || '',
});

const realApi = {
  async searchUsers(f, page, sort) {
    const q = new URLSearchParams();
    if (f.chatId) q.set('chatId', f.chatId);
    if (f.username) q.set('username', f.username);
    if (f.isBanned !== '') q.set('isBanned', f.isBanned);
    if (f.isAutoConfirmOn !== '') q.set('isAutoConfirmOn', f.isAutoConfirmOn);
    if (f.activityDays) q.set('activityDays', f.activityDays);

    // Поиск по количеству обменов: comparisonOperator + dealsCount [+ maxDealsCount]
    const dm = f.dealsMode;
    if (dm === 'range') {
      if (f.dealsFrom !== '' && f.dealsTo !== '') {
        q.set('comparisonOperator', CMP.range);
        q.set('dealsCount', f.dealsFrom);
        q.set('maxDealsCount', f.dealsTo);
      }
    } else if (dm && f.dealsValue !== '') {
      q.set('comparisonOperator', CMP[dm]);
      q.set('dealsCount', f.dealsValue);
    }

    // Сортировка: ?sort=<поле>,<asc|desc>
    if (sort && sort.field && sort.dir) {
      q.set('sort', `${sort.field},${sort.dir}`);
    }

    q.set('page', page);
    q.set('size', PAGE_SIZE);
    const r = await fetch('/api/users?' + q.toString(), { headers: headers() });
    if (!r.ok) throw new Error('users ' + r.status);
    const items = await r.json();
    const total = parseInt(r.headers.get('X-Total-Count') || items.length, 10);
    return { items: items || [], total };
  },
  async getReferral(chatId) {
    const r = await fetch('/api/users/' + encodeURIComponent(chatId), { headers: headers() });
    if (!r.ok) throw new Error('referral ' + r.status);
    return r.json();
  },
  async getRoles() {
    const r = await fetch('/api/users/roles', { headers: headers() });
    if (!r.ok) throw new Error('roles ' + r.status);
    return r.json();
  },
  async getMyRole(chatId) {
    const r = await fetch('/api/users/role/' + encodeURIComponent(chatId), { headers: headers() });
    if (!r.ok) throw new Error('my role ' + r.status);
    return r.json(); // строка, напр. "ADMIN"
  },
  async getTemplates() {
    const r = await fetch('/api/users/comment-templates', { headers: headers() });
    if (!r.ok) throw new Error('templates ' + r.status);
    return r.json();
  },
  async createTemplate(text) {
    const r = await fetch('/api/users/comment-templates?text=' + encodeURIComponent(text), {
      method: 'POST',
      headers: headers(),
    });
    if (!r.ok) throw new Error('create template ' + r.status);
    return r.json().catch(() => null);
  },
  async deleteTemplate(pid) {
    const r = await fetch('/api/users/comment-templates/' + encodeURIComponent(pid), {
      method: 'DELETE',
      headers: headers(),
    });
    if (!r.ok) throw new Error('delete template ' + r.status);
    return true;
  },
  async patchUser(body) {
    const r = await fetch('/api/users', { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('patch user ' + r.status);
    return r.json();
  },
  async sendMessage(chatId, text) {
    const r = await fetch('/api/users/message/' + encodeURIComponent(chatId) + '?text=' + encodeURIComponent(text), {
      method: 'POST',
      headers: headers(),
    });
    if (!r.ok) throw new Error('send message ' + r.status);
    return true;
  },
};


const api = realApi;

/* ================= UI helpers ================= */

function Overlay({ children, onClose }) {
  return (
      <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
        {children}
      </div>
  );
}

function Copyable({ value, children, showToast }) {
  return (
      <span className="copyable" onClick={() => copyText(value, showToast)} title="Копировать">
      {children ?? value} <i className="fa-regular fa-copy" />
    </span>
  );
}

/* ================= Шаблоны комментариев ================= */

function TemplatesModal({ templates, onClose, onCreate, onDelete, showToast }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!text.trim()) {
      showToast('Введите текст шаблона', 'error');
      return;
    }
    setBusy(true);
    try {
      await onCreate(text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
      <Overlay onClose={onClose}>
        <div className="modal">
          <div className="modal-head">
            <h2>Шаблоны комментариев</h2>
            <button className="close-x" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            {templates.length === 0 && <div className="hint">Шаблонов пока нет.</div>}
            {templates.map((t) => (
                <div className="tmpl-row" key={t.pid}>
                  <div className="txt">{t.text}</div>
                  <button className="icon-btn" title="Удалить" onClick={() => onDelete(t.pid)}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
            ))}
            <div className="field" style={{ marginTop: 14 }}>
              <textarea placeholder="Текст шаблона" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
            <button className="btn btn-primary" onClick={add} disabled={busy}>
              <i className="fa-solid fa-plus" /> Добавить
            </button>
          </div>
        </div>
      </Overlay>
  );
}

/* Заголовок сортируемой колонки: клик — возр. → убыв. → выкл. */
function Th({ field, sort, onSort, className = '', children }) {
  const active = sort && sort.field === field;
  const ico = !active ? 'fa-solid fa-sort sort-ico dim'
      : sort.dir === 'asc' ? 'fa-solid fa-arrow-up-long sort-ico'
          : 'fa-solid fa-arrow-down-long sort-ico';
  return (
      <th className={`${className} sortable${active ? ' active' : ''}`}
          onClick={() => onSort(field)}
          title="Сортировать по этой колонке">
        {children} <i className={ico} />
      </th>
  );
}

/* ================= Главный экран ================= */

export default function App() {
  const [roles, setRoles] = useState([]);
  const [currentRole, setCurrentRole] = useState(null); // роль оператора с бэка
  const [templates, setTemplates] = useState([]);
  const [filterOpen, setFilterOpen] = useState(true);
  const [filters, setFilters] = useState({ chatId: '', username: '', isBanned: '', isAutoConfirmOn: '', activityDays: '', dealsMode: '', dealsValue: '', dealsFrom: '', dealsTo: '' });
  const [applied, setApplied] = useState({ chatId: '', username: '', isBanned: '', isAutoConfirmOn: '', activityDays: '', dealsMode: '', dealsValue: '', dealsFrom: '', dealsTo: '' });
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(null); // null | { field, dir: 'asc'|'desc' }
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadUsers = async (f, p, srt = sort) => {
    setLoading(true);
    setError(null);
    try {
      const { items, total: t } = await api.searchUsers(f, p, srt);
      setUsers(items);
      setTotal(t);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const reloadTemplates = async () => {
    try {
      setTemplates(await api.getTemplates());
    } catch {
      /* тосты не нужны при фоновой загрузке */
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setRoles(await api.getRoles());
      } catch { /* роли не критичны для списка */ }
    })();
    (async () => {
      try {
        const id = myChatId();
        if (id != null) setCurrentRole(await api.getMyRole(id));
      } catch { /* без роли действия просто будут скрыты */ }
    })();
    reloadTemplates();
    loadUsers(applied, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = () => {
    setApplied(filters);
    setPage(0);
    loadUsers(filters, 0);
  };
  const doReset = () => {
    const empty = { chatId: '', username: '', isBanned: '', isAutoConfirmOn: '', activityDays: '', dealsMode: '', dealsValue: '', dealsFrom: '', dealsTo: '' };
    setFilters(empty);
    setApplied(empty);
    setPage(0);
    setSort(null);
    loadUsers(empty, 0, null);
  };
  const goPage = (p) => {
    setPage(p);
    loadUsers(applied, p);
  };
  // Клик по заголовку колонки: возр. → убыв. → без сортировки.
  const toggleSort = (field) => {
    let next;
    if (!sort || sort.field !== field) next = { field, dir: 'asc' };
    else if (sort.dir === 'asc') next = { field, dir: 'desc' };
    else next = null;
    setSort(next);
    setPage(0);
    loadUsers(applied, 0, next);
  };

  const onTemplateCreate = async (text) => {
    try {
      await api.createTemplate(text);
      await reloadTemplates();
    } catch (e) {
      showToast('Не удалось создать шаблон: ' + (e.message || 'ошибка'), 'error');
    }
  };
  const onTemplateDelete = async (pid) => {
    try {
      await api.deleteTemplate(pid);
      await reloadTemplates();
    } catch (e) {
      showToast('Не удалось удалить шаблон: ' + (e.message || 'ошибка'), 'error');
    }
  };

  const onUserUpdated = (u) => {
    setUsers((list) => list.map((x) => (x.chatId === u.chatId ? { ...x, ...u } : x)));
  };

  const setF = (k, v) => setFilters((s) => ({ ...s, [k]: v }));

  return (
      <div className="app">
        <div className="header">
          <div className="icon"><i className="fa-solid fa-users" /></div>
          <h1>Пользователи</h1>
        </div>

        <div className="toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => setTemplatesOpen(true)}>
            <i className="fa-regular fa-comment-dots" /> Шаблоны комментариев
          </button>
        </div>

        {/* Фильтр */}
        <div className="card">
          <div className={'filter-head' + (filterOpen ? ' open' : '')} onClick={() => setFilterOpen((v) => !v)}>
            <span><i className="fa-solid fa-filter" /> Фильтр</span>
            <i className="fa-solid fa-chevron-down chev" />
          </div>
          {filterOpen && (
              <>
                <div className="filter-grid">
                  <div className="field"><label>Chat ID</label><input type="text" value={filters.chatId} onChange={(e) => setF('chatId', e.target.value)} /></div>
                  <div className="field"><label>Username</label><input type="text" value={filters.username} onChange={(e) => setF('username', e.target.value)} /></div>
                  <div className="field"><label>Забанен</label>
                    <select value={filters.isBanned} onChange={(e) => setF('isBanned', e.target.value)}>
                      <option value="">Все</option><option value="false">Нет</option><option value="true">Да</option>
                    </select>
                  </div>
                  <div className="field"><label>Автоподтверждение</label>
                    <select value={filters.isAutoConfirmOn} onChange={(e) => setF('isAutoConfirmOn', e.target.value)}>
                      <option value="">Все</option><option value="true">Вкл</option><option value="false">Выкл</option>
                    </select>
                  </div>
                  <div className="field"><label>Активность за последние, дней</label>
                    <input type="number" inputMode="numeric" min="1" value={filters.activityDays} onChange={(e) => setF('activityDays', e.target.value)} />
                  </div>
                  <div className="field"><label>Количество обменов</label>
                    <select value={filters.dealsMode} onChange={(e) => setF('dealsMode', e.target.value)}>
                      <option value="">Не важно</option>
                      <option value="eq">Равно</option>
                      <option value="gt">Больше</option>
                      <option value="lt">Меньше</option>
                      <option value="range">Диапазон</option>
                    </select>
                  </div>
                  {filters.dealsMode && filters.dealsMode !== 'range' && (
                      <div className="field"><label>Обменов — значение</label>
                        <input type="number" inputMode="numeric" min="0" value={filters.dealsValue}
                               onChange={(e) => setF('dealsValue', e.target.value)} />
                      </div>
                  )}
                  {filters.dealsMode === 'range' && (
                      <div className="field"><label>Обменов: от / до</label>
                        <div className="range-row">
                          <input type="number" inputMode="numeric" min="0" placeholder="от" value={filters.dealsFrom}
                                 onChange={(e) => setF('dealsFrom', e.target.value)} />
                          <span className="range-dash">—</span>
                          <input type="number" inputMode="numeric" min="0" placeholder="до" value={filters.dealsTo}
                                 onChange={(e) => setF('dealsTo', e.target.value)} />
                        </div>
                      </div>
                  )}
                </div>
                <div className="filter-actions">
                  <button className="btn btn-primary btn-sm" onClick={doSearch}><i className="fa-solid fa-magnifying-glass" /> Поиск</button>
                  <button className="btn btn-secondary btn-sm" onClick={doReset}>Сбросить</button>
                </div>
              </>
          )}
        </div>

        {/* Список */}
        <div className="card">
          <div className="filter-head" style={{ cursor: 'default', marginBottom: 8 }}>
            <span>Список пользователей</span>
            {!loading && !error && <span className="hint">Всего: {fmtNum(total)}</span>}
          </div>

          {loading ? (
              <div className="state"><div className="spinner" /><div>Загрузка…</div></div>
          ) : error ? (
              <div className="state">
                <i className="fa-solid fa-triangle-exclamation" />
                <div>Не удалось загрузить список.</div>
                <div className="hint">{error}</div>
                <button className="btn btn-secondary btn-sm" onClick={() => loadUsers(applied, page)}>Повторить</button>
              </div>
          ) : users.length === 0 ? (
              <div className="state"><i className="fa-regular fa-face-meh" /><div>Ничего не найдено</div></div>
          ) : (
              <>
                <div className="table-wrap">
                  <table className="grid">
                    <thead>
                    <tr>
                      <Th field={SORTABLE.chatId} sort={sort} onSort={toggleSort} className="col-id">Telegram ID</Th>
                      <Th field={SORTABLE.username} sort={sort} onSort={toggleSort} className="col-user">Username</Th>
                      <Th field={SORTABLE.dealsCount} sort={sort} onSort={toggleSort} className="col-deals">Обменов</Th>
                      <Th field={SORTABLE.lastActivityDate} sort={sort} onSort={toggleSort}>Последняя активность</Th>
                      <Th field={SORTABLE.isBanned} sort={sort} onSort={toggleSort}>Забанен</Th>
                      <Th field={SORTABLE.isAutoConfirmOn} sort={sort} onSort={toggleSort}>Автоподтв.</Th>
                    </tr>
                    </thead>
                    <tbody>
                    {users.map((u) => (
                        <tr key={u.chatId} onDoubleClick={() => setProfile(u)} title="Двойной клик — профиль">
                          <td className="col-id mono">{u.chatId}</td>
                          <td className="col-user">{u.username ? '@' + u.username : <span className="dash">—</span>}</td>
                          <td className="col-deals">{fmtNum(u.dealsCount)}</td>
                          <td>{u.lastActivityDate || '—'}</td>
                          <td>{u.isBanned ? <span className="badge yes">Да</span> : <span className="badge no">Нет</span>}</td>
                          <td>{u.isAutoConfirmOn ? <i className="fa-solid fa-circle-check ac-on" /> : <i className="fa-regular fa-circle ac-off" />}</td>
                        </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <button className="btn btn-secondary btn-sm" disabled={page <= 0} onClick={() => goPage(page - 1)}>
                    <i className="fa-solid fa-chevron-left" />
                  </button>
                  <span className="info">страница {page + 1} из {totalPages}</span>
                  <button className="btn btn-secondary btn-sm" disabled={page + 1 >= totalPages} onClick={() => goPage(page + 1)}>
                    <i className="fa-solid fa-chevron-right" />
                  </button>
                </div>
              </>
          )}
        </div>

        {templatesOpen && (
            <TemplatesModal
                templates={templates}
                onClose={() => setTemplatesOpen(false)}
                onCreate={onTemplateCreate}
                onDelete={onTemplateDelete}
                showToast={showToast}
            />
        )}

        {profile && (
            <UserProfile
                user={profile}
                onClose={() => setProfile(null)}
                onUpdated={onUserUpdated}
            />
        )}

        {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      </div>
  );
}