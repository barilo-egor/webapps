import { useEffect, useMemo, useState } from 'react';

/* ============================================================
   UserProfile — САМОДОСТАТОЧНЫЙ компонент профиля пользователя.
   Используется и в аппе «Пользователи», и в «Рекламных ссылках».

   Внутри всё своё: разметка, модалки, запросы к API и стили
   (инжектятся один раз, заскоуплены под .uwrap — не конфликтуют
   с CSS вмещающего аппа).

   Открытие:
     <UserProfile user={row} onClose={..} onUpdated={..} />   // готовая строка
     <UserProfile chatId={12345} onClose={..} />              // только chatId (сам догрузит)

   Права по ролям и запись в аудит проверяет бэк; клиент лишь прячет действия.
   ============================================================ */

/* ---------------- служебное ---------------- */

const myChatId = () => window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;

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

const headers = () => ({
  'Content-Type': 'application/json',
  'X-TG-Init-Data': window.Telegram?.WebApp?.initData || '',
});

const api = {
  async searchByChatId(chatId) {
    const q = new URLSearchParams({ chatId: String(chatId), page: '0', size: '50' });
    const r = await fetch('/api/users?' + q.toString(), { headers: headers() });
    if (!r.ok) throw new Error('users ' + r.status);
    return r.json();
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
    return r.json();
  },
  async getTemplates() {
    const r = await fetch('/api/users/comment-templates', { headers: headers() });
    if (!r.ok) throw new Error('templates ' + r.status);
    return r.json();
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

/* ---------------- стили (инжект один раз, скоуп .uwrap) ---------------- */

const STYLE_ID = 'userprofile-uwrap-styles';
const CSS = `
.uwrap {
  --tg-bg: var(--tg-theme-bg-color, #17212b);
  --tg-secondary-bg: var(--tg-theme-secondary-bg-color, #232e3c);
  --tg-text: var(--tg-theme-text-color, #f5f5f5);
  --tg-hint: var(--tg-theme-hint-color, #90a4b8);
  --tg-link: var(--tg-theme-link-color, #6ab3f3);
  --tg-button: var(--tg-theme-button-color, #4a90d9);
  --tg-button-text: var(--tg-theme-button-text-color, #ffffff);
  --tg-danger: #e26363;
  --tg-success: #4bb371;
  --tg-border: rgba(255,255,255,.08);
  --tg-row-hover: rgba(255,255,255,.04);
  --tg-radius: 12px;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.uwrap *, .uwrap *::before, .uwrap *::after { box-sizing: border-box; }
.uwrap .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; animation: uw-fade .15s ease-out; }
@keyframes uw-fade { from { opacity: 0; } to { opacity: 1; } }
.uwrap .modal { width: 100%; max-width: 560px; max-height: 90vh; display: flex; flex-direction: column; background: var(--tg-secondary-bg); color: var(--tg-text); border: 1px solid var(--tg-border); border-radius: 14px; overflow: hidden; font-size: 14px; line-height: 1.45; }
.uwrap .modal.sm { max-width: 400px; }
.uwrap .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--tg-border); }
.uwrap .modal-head h2 { margin: 0; font-size: 16px; font-weight: 800; }
.uwrap .modal-body { padding: 16px; overflow-y: auto; }
.uwrap .modal-foot { padding: 12px 16px; border-top: 1px solid var(--tg-border); display: flex; gap: 8px; justify-content: flex-end; }
.uwrap .close-x { background: transparent; border: none; color: var(--tg-hint); font-size: 20px; cursor: pointer; line-height: 1; padding: 2px 6px; }
.uwrap .close-x:hover { color: var(--tg-text); }
.uwrap .field { display: flex; flex-direction: column; gap: 5px; }
.uwrap .field label { font-weight: 600; font-size: 13px; }
.uwrap .hint { color: var(--tg-hint); font-size: 12px; }
.uwrap input[type='text'], .uwrap input[type='number'], .uwrap textarea, .uwrap select {
  width: 100%; background: var(--tg-bg); color: var(--tg-text); border: 1px solid var(--tg-border);
  border-radius: 9px; padding: 9px 11px; font-family: inherit; font-size: 14px; outline: none; transition: border-color .15s;
}
.uwrap input:focus, .uwrap textarea:focus, .uwrap select:focus { border-color: var(--tg-button); }
.uwrap textarea { resize: vertical; min-height: 72px; }
.uwrap select { appearance: none; cursor: pointer; }
.uwrap .btn { appearance: none; border: none; border-radius: 9px; padding: 10px 14px; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; transition: opacity .15s, transform .05s; white-space: nowrap; }
.uwrap .btn:active { transform: scale(.99); }
.uwrap .btn:disabled { opacity: .5; cursor: default; }
.uwrap .btn-primary { background: var(--tg-button); color: var(--tg-button-text); }
.uwrap .btn-secondary { background: transparent; color: var(--tg-text); border: 1px solid var(--tg-border); }
.uwrap .btn-sm { padding: 7px 11px; font-size: 13px; border-radius: 8px; }
.uwrap .prof-section-title { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--tg-hint); margin: 18px 0 8px; display: flex; align-items: center; gap: 7px; }
.uwrap .prof-section-title:first-child { margin-top: 0; }
.uwrap .prow { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--tg-border); }
.uwrap .prow .k { color: var(--tg-hint); font-size: 13px; flex: none; }
.uwrap .prow .v { text-align: right; word-break: break-word; }
.uwrap .copyable { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.uwrap .copyable:hover { color: var(--tg-link); }
.uwrap .copyable i { font-size: 11px; opacity: .6; }
.uwrap a.tg-link { color: var(--tg-link); text-decoration: none; }
.uwrap a.tg-link:hover { text-decoration: underline; }
.uwrap .dash { color: var(--tg-hint); }
.uwrap .balance-btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; margin-top: 6px; }
.uwrap .switch { --w: 46px; --h: 26px; position: relative; width: var(--w); height: var(--h); flex: none; cursor: pointer; display: inline-block; }
.uwrap .switch input { display: none; }
.uwrap .switch .track { position: absolute; inset: 0; border-radius: 999px; background: rgba(255,255,255,.10); border: 1px solid var(--tg-hint); transition: background .2s, border-color .2s; }
.uwrap .switch.is-off .track { background: rgba(226,99,99,.18); border-color: var(--tg-danger); }
.uwrap .switch.is-off .thumb { background: var(--tg-hint); }
.uwrap .switch-wrap { display: inline-flex; align-items: center; gap: 9px; }
.uwrap .switch-state { font-size: 12.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.uwrap .switch-state.on { color: var(--tg-success); background: rgba(75,179,113,.14); }
.uwrap .switch-state.off { color: var(--tg-danger); background: rgba(226,99,99,.14); }
.uwrap .err-hint { color: var(--tg-danger); font-size: 12px; }
.uwrap .switch .thumb { position: absolute; top: 3px; left: 3px; width: calc(var(--h) - 6px); height: calc(var(--h) - 6px); border-radius: 50%; background: #fff; transition: transform .2s; }
.uwrap .switch input:checked ~ .track { background: var(--tg-success); border-color: var(--tg-success); }
.uwrap .switch input:checked ~ .thumb { transform: translateX(calc(var(--w) - var(--h))); }
.uwrap .ac-on { color: var(--tg-success); }
.uwrap .ac-off { color: var(--tg-hint); }
.uwrap .ref-table-wrap { max-height: 240px; overflow-y: auto; border: 1px solid var(--tg-border); border-radius: 10px; }
.uwrap table.ref { width: 100%; border-collapse: collapse; font-size: 13px; }
.uwrap table.ref thead th { position: sticky; top: 0; background: var(--tg-secondary-bg); padding: 8px; border-bottom: 1px solid var(--tg-border); text-align: left; }
.uwrap table.ref thead th .col-title { color: var(--tg-hint); font-size: 12px; font-weight: 600; margin-bottom: 5px; }
.uwrap table.ref thead th input { padding: 6px 8px; font-size: 12.5px; }
.uwrap table.ref tbody td { padding: 8px; border-bottom: 1px solid var(--tg-border); }
.uwrap table.ref tbody tr:last-child td { border-bottom: none; }
.uwrap .comment-actions { display: flex; gap: 8px; margin-top: 8px; }
.uwrap .collapse-head { display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-weight: 700; font-size: 14px; user-select: none; }
.uwrap .collapse-head .chev { color: var(--tg-hint); transition: transform .2s; }
.uwrap .collapse-head.open .chev { transform: rotate(180deg); }
.uwrap .msg-preview { background: var(--tg-bg); border: 1px solid var(--tg-border); border-radius: 9px; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; margin: 10px 0; max-height: 200px; overflow-y: auto; }
.uwrap .tmpl-pick { cursor: pointer; padding: 10px 12px; border: 1px solid var(--tg-border); border-radius: 9px; margin-bottom: 8px; }
.uwrap .tmpl-pick:hover { background: var(--tg-row-hover); border-color: var(--tg-button); }
.uwrap .state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--tg-hint); text-align: center; padding: 40px 20px; }
.uwrap .spinner { width: 28px; height: 28px; border: 3px solid var(--tg-border); border-top-color: var(--tg-button); border-radius: 50%; animation: uw-spin .8s linear infinite; }
@keyframes uw-spin { to { transform: rotate(360deg); } }
.uwrap .toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: 90%; background: #2b3746; color: #fff; border: 1px solid var(--tg-border); border-radius: 10px; padding: 10px 15px; font-size: 13.5px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.35); z-index: 1100; display: flex; align-items: center; gap: 8px; animation: uw-toast-in .2s ease-out; }
.uwrap .toast.success { border-left: 3px solid var(--tg-success); }
.uwrap .toast.error { border-left: 3px solid var(--tg-danger); }
.uwrap .toast.info { border-left: 3px solid var(--tg-link); }
@keyframes uw-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ---------------- мелкие части ---------------- */

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

function BalanceModal({ mode, current, onClose, onApply, showToast }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const titles = { add: 'Добавить к балансу', sub: 'Уменьшить баланс', set: 'Новое значение баланса' };

  const n = Number(value);
  const valid = value !== '' && Number.isFinite(n);
  // Итог операции — для проверки, что баланс не станет отрицательным.
  const result = !valid ? null
      : mode === 'add' ? Number(current) + n
          : mode === 'sub' ? Number(current) - n
              : n;
  const negativeAmount = valid && n < 0;
  const wouldGoNegative = result != null && result < 0;
  const blocked = !valid || negativeAmount || wouldGoNegative;

  const apply = async () => {
    if (blocked) return;
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
              <input type="number" inputMode="decimal" min="0" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
              <span className="hint">Текущий баланс: {fmtNum(current)}</span>
              {valid && !negativeAmount && !wouldGoNegative && (
                  <span className="hint">Станет: {fmtNum(result)}</span>
              )}
              {negativeAmount && <span className="err-hint">Сумма не может быть отрицательной</span>}
              {!negativeAmount && wouldGoNegative && (
                  <span className="err-hint">Баланс не может быть отрицательным (получится {fmtNum(result)})</span>
              )}
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary" onClick={apply} disabled={busy || blocked}>Подтвердить</button>
          </div>
        </div>
      </Overlay>
  );
}

/* ---------------- сам профиль ---------------- */

function ProfileBody({ initialUser, roles, currentRole, templates, onClose, onUpdated, showToast }) {
  const [user, setUser] = useState(initialUser);
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
    return () => { alive = false; };
  }, [initialUser.chatId]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const committedEditable = () => ({
    chatId: user.chatId,
    initiatorId: myChatId(),
    isAutoConfirmOn: user.isAutoConfirmOn,
    isBanned: user.isBanned,
    userRole: user.userRole,
    comment: user.comment ?? '',
  });

  const AUDIT = { add: 'MANUAL_ADDITION', sub: 'MANUAL_DEBITING', set: 'MANUAL' };

  const applyBalance = async (mode, amount) => {
    try {
      const updated = await api.patchUser({ ...committedEditable(), balanceAuditType: AUDIT[mode], balanceAmount: amount });
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
                  <span className="switch-wrap">
                  <span className={'switch-state ' + (form.isAutoConfirmOn ? 'on' : 'off')}>
                    {form.isAutoConfirmOn ? 'Вкл' : 'Выкл'}
                  </span>
                  <label className={'switch ' + (form.isAutoConfirmOn ? 'is-on' : 'is-off')}>
                    <input type="checkbox" checked={form.isAutoConfirmOn} onChange={(e) => setF('isAutoConfirmOn', e.target.checked)} />
                    <span className="track" /><span className="thumb" />
                  </label>
                </span>
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

            <div className="prof-section-title"><i className="fa-regular fa-comment" /> Комментарий</div>
            <div className="field">
              <textarea value={form.comment} onChange={(e) => setF('comment', e.target.value)} />
              <div className="comment-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setPickTemplate(true)}>Вставить шаблон</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setF('comment', '')}>Очистить</button>
              </div>
            </div>

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
            <BalanceModal mode={balanceMode} current={user.referralBalance} onClose={() => setBalanceMode(null)} onApply={applyBalance} showToast={showToast} />
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

/* ---------------- обёртка: сама грузит зависимости ---------------- */

export default function UserProfile({ chatId, user: userProp, onClose, onUpdated }) {
  ensureStyles();

  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(userProp || null);
  const [roles, setRoles] = useState([]);
  const [currentRole, setCurrentRole] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  };

  const targetChatId = userProp?.chatId ?? chatId;

  useEffect(() => {
    let alive = true;
    (async () => {
      setReady(false);
      setErr(null);
      try {
        const [rls, tpls] = await Promise.all([
          api.getRoles().catch(() => []),
          api.getTemplates().catch(() => []),
        ]);
        let role = null;
        try {
          const id = myChatId();
          if (id != null) role = await api.getMyRole(id);
        } catch { /* без роли — действия просто скрыты */ }

        let u = userProp || null;
        if (!u && targetChatId != null) {
          const list = await api.searchByChatId(targetChatId);
          u = (list || []).find((x) => String(x.chatId) === String(targetChatId)) || (list || [])[0] || null;
        }
        if (!alive) return;
        setRoles(rls);
        setTemplates(tpls);
        setCurrentRole(role);
        setUser(u);
        if (!u) setErr('Пользователь не найден');
        setReady(true);
      } catch (e) {
        if (alive) { setErr(e.message || 'Ошибка загрузки'); setReady(true); }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetChatId]);

  return (
      <div className="uwrap">
        {!ready ? (
            <Overlay onClose={onClose}>
              <div className="modal sm"><div className="modal-body"><div className="state"><div className="spinner" /><div>Загрузка профиля…</div></div></div></div>
            </Overlay>
        ) : !user ? (
            <Overlay onClose={onClose}>
              <div className="modal sm">
                <div className="modal-head"><h2>Профиль</h2><button className="close-x" onClick={onClose}>×</button></div>
                <div className="modal-body"><div className="state"><i className="fa-solid fa-triangle-exclamation" /><div>{err || 'Пользователь не найден'}</div></div></div>
              </div>
            </Overlay>
        ) : (
            <ProfileBody
                initialUser={user}
                roles={roles}
                currentRole={currentRole}
                templates={templates}
                onClose={onClose}
                onUpdated={(u) => { setUser(u); onUpdated?.(u); }}
                showToast={showToast}
            />
        )}
        {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      </div>
  );
}