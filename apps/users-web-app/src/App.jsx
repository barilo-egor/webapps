import { useEffect, useMemo, useState } from 'react';

/* ============================================================
   Пользователи — веб-апп админки. ПРОД-версия (без mock).

   Роль текущего оператора берём с бэка: GET /api/users/role/{myChatId},
   где myChatId — из Telegram initData. От неё зависит доступ к действиям.
   Правами всё равно рулит и бэк (проверяет initiatorId на изменяющих запросах).
   ============================================================ */


const PAGE_SIZE = 50;

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
  async searchUsers(f, page) {
    const q = new URLSearchParams();
    if (f.chatId) q.set('chatId', f.chatId);
    if (f.username) q.set('username', f.username);
    if (f.isBanned !== '') q.set('isBanned', f.isBanned);
    if (f.isAutoConfirmOn !== '') q.set('isAutoConfirmOn', f.isAutoConfirmOn);
    if (f.activityDays) q.set('activityDays', f.activityDays);
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

/* ================= Модалка изменения баланса ================= */

function BalanceModal({ mode, current, onClose, onApply }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const titles = { add: 'Добавить к балансу', sub: 'Уменьшить баланс', set: 'Новое значение баланса' };

  const apply = async () => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    // Дельту/новое значение считает бэк — шлём сумму операции как есть.
    setBusy(true);
    try {
      await onApply(mode, n);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="modal sm">
        <div className="modal-head">
          <h2>{titles[mode]}</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Сумма</label>
            <input type="number" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            <span className="hint">Текущий баланс: {fmtNum(current)}</span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={apply} disabled={busy || value === ''}>Подтвердить</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ================= Профиль пользователя ================= */

function ProfileModal({ initialUser, roles, currentRole, templates, onClose, onUpdated, showToast }) {
  const [user, setUser] = useState(initialUser); // закоммиченное состояние
  const [ref, setRef] = useState(null);
  const [loadingRef, setLoadingRef] = useState(true);
  const [form, setForm] = useState({
    isAutoConfirmOn: initialUser.isAutoConfirmOn,
    isBanned: initialUser.isBanned,
    userRole: initialUser.userRole,
    comment: initialUser.comment ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [balanceMode, setBalanceMode] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [confirmMsg, setConfirmMsg] = useState(false);
  const [pickTemplate, setPickTemplate] = useState(false);
  const [refFilter, setRefFilter] = useState({ chatId: '', minDeals: '' });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingRef(true);
      try {
        const data = await api.getReferral(initialUser.chatId);
        if (alive) setRef(data);
      } catch {
        if (alive) setRef(null);
      } finally {
        if (alive) setLoadingRef(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialUser.chatId]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Прочие (небалансовые) поля берём из закоммиченного состояния — чтобы
  // операция с балансом не сохраняла неподтверждённые правки роли/комментария.
  const committedEditable = () => ({
    chatId: user.chatId,
    initiatorId: myChatId(),
    isAutoConfirmOn: user.isAutoConfirmOn,
    isBanned: user.isBanned,
    userRole: user.userRole,
    comment: user.comment ?? '',
  });

  // mode: 'add' | 'sub' | 'set' -> тип аудита для бэка.
  const AUDIT = { add: 'MANUAL_ADDITION', sub: 'MANUAL_DEBITING', set: 'MANUAL' };

  const applyBalance = async (mode, amount) => {
    try {
      const updated = await api.patchUser({
        ...committedEditable(),
        balanceAuditType: AUDIT[mode],
        balanceAmount: amount,
      });
      setUser(updated);
      onUpdated?.(updated);
      setBalanceMode(null);
      showToast('Баланс обновлён', 'success');
    } catch (e) {
      showToast('Не удалось изменить баланс: ' + (e.message || 'ошибка'), 'error');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Обычное «Сохранить» баланс не трогает — поля balance* не шлём.
      const updated = await api.patchUser({
        chatId: user.chatId,
        initiatorId: myChatId(),
        isAutoConfirmOn: form.isAutoConfirmOn,
        isBanned: form.isBanned,
        userRole: form.userRole,
        comment: form.comment,
      });
      setUser(updated);
      setForm({
        isAutoConfirmOn: updated.isAutoConfirmOn,
        isBanned: updated.isBanned,
        userRole: updated.userRole,
        comment: updated.comment ?? '',
      });
      onUpdated?.(updated);
      showToast('Изменения сохранены', 'success');
    } catch (e) {
      showToast('Не удалось сохранить: ' + (e.message || 'ошибка'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const doSend = async () => {
    try {
      await api.sendMessage(user.chatId, msgText.trim());
      setConfirmMsg(false);
      setMsgText('');
      showToast('Сообщение отправлено', 'success');
    } catch (e) {
      showToast('Не удалось отправить: ' + (e.message || 'ошибка'), 'error');
    }
  };

  const referrals = (ref?.referrals || []).filter((r) => {
    if (refFilter.chatId && !String(r.chatId).includes(refFilter.chatId)) return false;
    if (refFilter.minDeals && Number(r.dealsCount) < Number(refFilter.minDeals)) return false;
    return true;
  });

  const roleName = (name) => roles.find((r) => r.name === name)?.displayName || name;

  return (
    <Overlay onClose={onClose}>
      <div className="modal">
        <div className="modal-head">
          <h2>Профиль пользователя</h2>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Часть 1 */}
          <div className="prof-section-title"><i className="fa-solid fa-id-card" /> Основное</div>

          <div className="prow"><span className="k">Telegram ID</span>
            <span className="v"><Copyable value={user.chatId} showToast={showToast} /></span>
          </div>
          <div className="prow"><span className="k">Username</span>
            <span className="v">
              {user.username
                ? <a className="tg-link" href={'https://t.me/' + user.username} target="_blank" rel="noreferrer">@{user.username}</a>
                : <span className="dash">Отсутствует</span>}
            </span>
          </div>
          <div className="prow"><span className="k">Кто привёл</span>
            <span className="v">
              {user.fromChatId
                ? <Copyable value={user.fromChatId} showToast={showToast} />
                : <span className="dash">Отсутствует</span>}
            </span>
          </div>
          <div className="prow"><span className="k">Дата регистрации</span><span className="v">{user.registrationDate || '—'}</span></div>
          <div className="prow"><span className="k">Дата первого обмена</span>
            <span className="v">{loadingRef ? '…' : (ref?.firstDealDate || '—')}</span>
          </div>
          <div className="prow"><span className="k">Кол-во обменов</span><span className="v">{fmtNum(user.dealsCount)}</span></div>
          <div className="prow"><span className="k">Общий объём</span>
            <span className="v">{loadingRef ? '…' : `${fmtNum(ref?.totalRubAmount)} RUB · ${fmtNum(ref?.totalBynAmount)} BYN`}</span>
          </div>
          <div className="prow"><span className="k">Последняя активность</span><span className="v">{user.lastActivityDate || '—'}</span></div>
          <div className="prow"><span className="k">Выигрышей в лотерею</span><span className="v">{fmtNum(user.lotteryCount)}</span></div>

          <div className="prow" style={{ borderBottom: 'none' }}>
            <span className="k">Реферальный баланс</span>
            <span className="v"><b>{fmtNum(user.referralBalance)}</b></span>
          </div>
          <div className="balance-btns">
            {can.balanceAddSub(currentRole) && <button className="btn btn-secondary btn-sm" onClick={() => setBalanceMode('add')}>Добавить</button>}
            {can.balanceAddSub(currentRole) && <button className="btn btn-secondary btn-sm" onClick={() => setBalanceMode('sub')}>Уменьшить</button>}
            {can.balanceSet(currentRole) && <button className="btn btn-secondary btn-sm" onClick={() => setBalanceMode('set')}>Новое значение</button>}
          </div>

          <div className="prow" style={{ marginTop: 10 }}>
            <span className="k">Автоподтверждение</span>
            <span className="v">
              {can.autoConfirm(currentRole) ? (
                <label className="switch">
                  <input type="checkbox" checked={form.isAutoConfirmOn} onChange={(e) => setF('isAutoConfirmOn', e.target.checked)} />
                  <span className="track" /><span className="thumb" />
                </label>
              ) : (
                <span className={form.isAutoConfirmOn ? 'ac-on' : 'ac-off'}>{form.isAutoConfirmOn ? 'Вкл' : 'Выкл'}</span>
              )}
            </span>
          </div>
          <div className="prow"><span className="k">Забанен</span>
            <span className="v">
              {can.ban(currentRole) ? (
                <select style={{ width: 'auto' }} value={form.isBanned ? 'true' : 'false'} onChange={(e) => setF('isBanned', e.target.value === 'true')}>
                  <option value="false">Нет</option>
                  <option value="true">Да</option>
                </select>
              ) : (form.isBanned ? 'Да' : 'Нет')}
            </span>
          </div>
          <div className="prow"><span className="k">Роль</span>
            <span className="v">
              {can.role(currentRole) ? (
                <select style={{ width: 'auto' }} value={form.userRole || ''} onChange={(e) => setF('userRole', e.target.value)}>
                  {roles.map((r) => <option key={r.name} value={r.name}>{r.displayName}</option>)}
                </select>
              ) : roleName(form.userRole)}
            </span>
          </div>

          {/* Часть 2 */}
          <div className="prof-section-title"><i className="fa-solid fa-users" /> Рефералы</div>
          <div className="prow"><span className="k">Всего рефералов</span>
            <span className="v">{loadingRef ? '…' : fmtNum(ref?.referrals?.length || 0)}</span>
          </div>

          <div className="ref-table-wrap">
            <table className="ref">
              <thead>
                <tr>
                  <th>
                    <div className="col-title">Telegram ID</div>
                    <input type="text" placeholder="фильтр" value={refFilter.chatId} onChange={(e) => setRefFilter((s) => ({ ...s, chatId: e.target.value }))} />
                  </th>
                  <th>
                    <div className="col-title">Кол-во обменов</div>
                    <input type="number" placeholder="N и более" title="Рефералы с этим количеством обменов и более" value={refFilter.minDeals} onChange={(e) => setRefFilter((s) => ({ ...s, minDeals: e.target.value }))} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingRef && <tr><td colSpan={2} className="hint">Загрузка…</td></tr>}
                {!loadingRef && referrals.length === 0 && <tr><td colSpan={2} className="hint">Нет рефералов</td></tr>}
                {referrals.map((r) => (
                  <tr key={r.chatId}>
                    <td><Copyable value={r.chatId} showToast={showToast} /></td>
                    <td>{fmtNum(r.dealsCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="prow" style={{ marginTop: 10 }}><span className="k">Начислено от рефералов</span><span className="v">{loadingRef ? '…' : fmtNum(ref?.referralAccruedAmount)}</span></div>
          <div className="prow"><span className="k">Получено бонусов вручную</span><span className="v">{loadingRef ? '…' : fmtNum(ref?.manuallyReceivedAmount)}</span></div>
          <div className="prow"><span className="k">Списано на сделку</span><span className="v">{loadingRef ? '…' : fmtNum(ref?.dealDebitedAmount)}</span></div>
          <div className="prow"><span className="k">Списано вручную</span><span className="v">{loadingRef ? '…' : fmtNum(ref?.manuallyDebitedAmount)}</span></div>

          {/* Часть 3 */}
          <div className="prof-section-title"><i className="fa-regular fa-comment" /> Комментарий</div>
          <div className="field">
            <textarea value={form.comment} onChange={(e) => setF('comment', e.target.value)} />
            <div className="comment-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setPickTemplate(true)}>Вставить шаблон</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setF('comment', '')}>Очистить</button>
            </div>
          </div>

          {/* Отправить сообщение */}
          <div className="prof-section-title" style={{ marginTop: 18 }}>
            <span className={'collapse-head' + (sendOpen ? ' open' : '')} style={{ flex: 1 }} onClick={() => setSendOpen((v) => !v)}>
              Отправить сообщение пользователю
              <i className="fa-solid fa-chevron-down chev" />
            </span>
          </div>
          {sendOpen && (
            <div className="field">
              <textarea placeholder="Текст сообщения" value={msgText} onChange={(e) => setMsgText(e.target.value)} />
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 8, alignSelf: 'flex-start' }}
                onClick={() => (msgText.trim() ? setConfirmMsg(true) : showToast('Введите текст сообщения', 'error'))}>
                <i className="fa-solid fa-paper-plane" /> Отправить
              </button>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {balanceMode && (
        <BalanceModal mode={balanceMode} current={user.referralBalance} onClose={() => setBalanceMode(null)} onApply={applyBalance} />
      )}

      {pickTemplate && (
        <Overlay onClose={() => setPickTemplate(false)}>
          <div className="modal sm">
            <div className="modal-head"><h2>Вставить шаблон</h2><button className="close-x" onClick={() => setPickTemplate(false)}>×</button></div>
            <div className="modal-body">
              {templates.length === 0 && <div className="hint">Шаблонов нет.</div>}
              {templates.map((t) => (
                <div className="tmpl-pick" key={t.pid} onClick={() => { setF('comment', form.comment ? form.comment + '\n' + t.text : t.text); setPickTemplate(false); }}>
                  {t.text}
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {confirmMsg && (
        <Overlay onClose={() => setConfirmMsg(false)}>
          <div className="modal sm">
            <div className="modal-head"><h2>Подтверждение</h2><button className="close-x" onClick={() => setConfirmMsg(false)}>×</button></div>
            <div className="modal-body">
              <div>Отправить сообщение с текстом, отображённым ниже?</div>
              <div className="msg-preview">{msgText}</div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirmMsg(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={doSend}>Отправить</button>
            </div>
          </div>
        </Overlay>
      )}
    </Overlay>
  );
}

/* ================= Главный экран ================= */

export default function App() {
  const [roles, setRoles] = useState([]);
  const [currentRole, setCurrentRole] = useState(null); // роль оператора с бэка
  const [templates, setTemplates] = useState([]);
  const [filterOpen, setFilterOpen] = useState(true);
  const [filters, setFilters] = useState({ chatId: '', username: '', isBanned: '', isAutoConfirmOn: '', activityDays: '' });
  const [applied, setApplied] = useState({ chatId: '', username: '', isBanned: '', isAutoConfirmOn: '', activityDays: '' });
  const [page, setPage] = useState(0);
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

  const loadUsers = async (f, p) => {
    setLoading(true);
    setError(null);
    try {
      const { items, total: t } = await api.searchUsers(f, p);
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
    const empty = { chatId: '', username: '', isBanned: '', isAutoConfirmOn: '', activityDays: '' };
    setFilters(empty);
    setApplied(empty);
    setPage(0);
    loadUsers(empty, 0);
  };
  const goPage = (p) => {
    setPage(p);
    loadUsers(applied, p);
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
                    <th>Telegram ID</th><th>Username</th><th>Обменов</th>
                    <th>Последняя активность</th><th>Забанен</th><th>Автоподтв.</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.chatId} onDoubleClick={() => setProfile(u)} title="Двойной клик — профиль">
                      <td>{u.chatId}</td>
                      <td>{u.username ? '@' + u.username : <span className="dash">—</span>}</td>
                      <td>{fmtNum(u.dealsCount)}</td>
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
        <ProfileModal
          initialUser={profile}
          roles={roles}
          currentRole={currentRole}
          templates={templates}
          onClose={() => setProfile(null)}
          onUpdated={onUserUpdated}
          showToast={showToast}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
