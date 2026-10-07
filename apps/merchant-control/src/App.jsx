import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../../shared/request.js';

/* ============================================================
   Веб-апп «Контроль мерчантов».

   Суммы сделок мерчантов со всех ботов с момента последнего сброса
   (таблица deal БД merchant_control). Эндпоинты (коллекция rce,
   папка «Контроль мерчантов»):
     GET    /api/merchant-control[?merchant=…]   — список
     POST   /api/merchant-control/chat  <- { dealLastDate, merchant }  — «В чат»
     DELETE /api/merchant-control       <- { dealLastDate, merchant }  — «Сброс»

   dealLastDate — граница строки: дата последней сделки, вошедшей в
   показанную сумму. «В чат» и «Сброс» трогают только сделки до неё,
   поэтому сделки, пришедшие после чтения строки, не отправляются и
   не удаляются (так требует ТЗ).
   В ответе бэк присылает её в UTC+3, а в запросах ждёт UTC+0.
   ============================================================ */

const API = '/api/merchant-control';

/* ---------- Ответ бэка → строка таблицы ----------
   Живой ответ dev1 (07.10.2026):
     { merchant: "EXTASY_PAY", totalAmount: 12346,
       dealLastDate: "05.06.2026 21:50:07",              // UTC+3; у мерчанта без сделок поля нет
       dealIdsByAppId: { "rce-dev3": [115, 115] } }      // номера сделок по ботам
   Отдельного поля с количеством нет — «Сделок» = сколько номеров во всех ботах. */
function dealCount(byApp) {
  if (!byApp || typeof byApp !== 'object') return 0;
  return Object.values(byApp).reduce((n, ids) => n + (Array.isArray(ids) ? ids.length : 0), 0);
}

function toRow(raw) {
  return {
    merchant: raw.merchant,
    count: dealCount(raw.dealIdsByAppId),
    sum: Number(raw.totalAmount ?? 0),
    dealLastDate: raw.dealLastDate || null,
    readAt: Date.now(), // «Данные на» — когда строка прочитана
  };
}

const emptyRow = (merchant) => ({ merchant, count: 0, sum: 0, dealLastDate: null, readAt: Date.now() });

/* dealLastDate из ответа (UTC+3, «дд.мм.гггг чч:мм:сс») → UTC+0 ISO для запроса.
   Понимает и ISO-вид (2026-06-05T21:50:07[.мс]) на случай, если бэк сменит формат.
   Доли секунды, если придут, переносим строкой как есть: если их отрезать,
   граница сдвинется назад и последняя сделка не войдёт ни в «В чат», ни в сброс. */
const MSK_OFFSET_H = 3;
export function mskToUtc(value) {
  if (!value) return null;
  const s = String(value).trim();
  // Если бэк всё-таки прислал зону (Z или +03:00) — доверяем ей.
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  let y, mo, d, h, mi, sec, frac;
  let m = s.match(/^(\d\d)\.(\d\d)\.(\d{4})[ T](\d\d):(\d\d)(?::(\d\d))?(\.\d+)?$/);
  if (m) [, d, mo, y, h, mi, sec = '00', frac = ''] = m;
  else {
    m = s.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?(\.\d+)?$/);
    if (!m) return null;
    [, y, mo, d, h, mi, sec = '00', frac = ''] = m;
  }
  const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h - MSK_OFFSET_H, +mi, +sec));
  return `${utc.toISOString().slice(0, 19)}${frac}Z`;
}

/* ---------- Форматирование ---------- */
const fmtSum = (v) => `${Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

function fmtTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- Справочник мерчантов: код → название ---------- */
function useMerchantNames() {
  const [names, setNames] = useState({});
  useEffect(() => {
    request('/api/constants/merchant')
        .then((d) => {
          const list = Array.isArray(d) ? d : Array.isArray(d?.merchants) ? d.merchants : [];
          const map = {};
          list.forEach((m) => {
            if (typeof m === 'string') map[m] = m;
            else if (m?.name) map[m.name] = m.displayName || m.name;
          });
          setNames(map);
        })
        .catch(() => { /* без справочника покажем коды */ });
  }, []);
  return names;
}

/* ---------- Тост ---------- */
function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((message, type = 'info') => {
    window.clearTimeout(timer.current);
    setToast({ message, type, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  const node = toast ? <div key={toast.key} className={`toast ${toast.type}`}>{toast.message}</div> : null;
  return { show, node };
}

/* ---------- Подтверждение сброса ---------- */
function ResetModal({ row, name, busy, onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="modal-head">
            <h2 id="reset-title"><i className="fa-solid fa-triangle-exclamation" /> Сброс истории сделок</h2>
          </div>
          <div className="modal-body">
            <p>Сбросить историю сделок мерчанта <b>{name}</b>?</p>
            <p>Будут удалены <b>{row.count}</b> записей на сумму <b>{fmtSum(row.sum)}</b> — по всем ботам.</p>
            <p className="modal-note">Сами сделки не удаляются — удаляются только записи учёта. Действие необратимо.</p>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Отмена</button>
            <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
              {busy ? <><i className="fa-solid fa-spinner fa-spin" /> Сбрасываем…</> : 'Сбросить'}
            </button>
          </div>
        </div>
      </div>
  );
}

/* ==================== Приложение ==================== */
export default function App() {
  const names = useMerchantNames();
  const { show: showToast, node: toastNode } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [rowBusy, setRowBusy] = useState({}); // merchant -> 'refresh' | 'chat' | 'reset'
  const [filterOpen, setFilterOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [resetRow, setResetRow] = useState(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
  }, []);

  const nameOf = useCallback((code) => names[code] || code, [names]);

  const loadAll = useCallback(async () => {
    const d = await request(API);
    const list = Array.isArray(d) ? d : [];
    setRows(list.map(toRow));
  }, []);

  // Первая загрузка
  useEffect(() => {
    (async () => {
      try { await loadAll(); setError(null); }
      catch (e) { setError(e.message || 'Не удалось загрузить данные'); }
      finally { setLoading(false); }
    })();
  }, [loadAll]);

  const refreshAll = async () => {
    setRefreshingAll(true);
    try { await loadAll(); setError(null); showToast('Данные обновлены', 'success'); }
    catch (e) { showToast(e.message || 'Не удалось обновить', 'error'); }
    finally { setRefreshingAll(false); }
  };

  const setBusy = (merchant, v) => setRowBusy((p) => ({ ...p, [merchant]: v }));

  // Перечитать одну строку. Бэк ищет по подстроке, поэтому берём точное совпадение.
  const reloadRow = useCallback(async (merchant) => {
    const d = await request(API, { params: { merchant } });
    const found = (Array.isArray(d) ? d : []).find((r) => r.merchant === merchant);
    const next = found ? toRow(found) : emptyRow(merchant);
    setRows((prev) => prev.map((r) => (r.merchant === merchant ? next : r)));
    return next;
  }, []);

  const refreshRow = async (merchant) => {
    setBusy(merchant, 'refresh');
    try { await reloadRow(merchant); }
    catch (e) { showToast(e.message || 'Не удалось обновить строку', 'error'); }
    finally { setBusy(merchant, null); }
  };

  const boundary = (row) => ({ merchant: row.merchant, dealLastDate: mskToUtc(row.dealLastDate) });

  const sendToChat = async (row) => {
    const body = boundary(row);
    if (!body.dealLastDate) { showToast('Нет данных о последней сделке — обновите строку', 'error'); return; }
    setBusy(row.merchant, 'chat');
    try {
      await request(`${API}/chat`, { method: 'POST', body });
      showToast('Список сделок отправлен в чат', 'success');
    } catch (e) {
      showToast(e.message || 'Не удалось отправить в чат', 'error');
    } finally {
      setBusy(row.merchant, null);
    }
  };

  const confirmReset = async () => {
    const row = resetRow;
    const body = boundary(row);
    if (!body.dealLastDate) { showToast('Нет данных о последней сделке — обновите строку', 'error'); return; }
    setBusy(row.merchant, 'reset');
    try {
      await request(API, { method: 'DELETE', body });
      setResetRow(null);
      showToast('История сделок сброшена', 'success');
      // После сброса в строке остаются только сделки, пришедшие после чтения.
      try { await reloadRow(row.merchant); } catch { /* строку обновят кнопкой */ }
    } catch (e) {
      showToast(e.message || 'Не удалось сбросить историю', 'error');
    } finally {
      setBusy(row.merchant, null);
    }
  };

  // Порядок строк — как отдаёт бэк (порядок мерчантов из «Управления мерчантами»).
  // Поиск по подстроке без учёта регистра — и по названию, и по коду.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
        nameOf(r.merchant).toLowerCase().includes(q) || String(r.merchant).toLowerCase().includes(q));
  }, [rows, query, nameOf]);

  return (
      <div className="app">
        <header className="header">
          <div className="header-title">
            <span className="icon"><i className="fa-solid fa-chart-column" /></span>
            <h1>Контроль сделок мерчантов</h1>
          </div>
          <button type="button" className="btn btn-secondary" onClick={refreshAll}
                  disabled={loading || refreshingAll}>
            <i className={`fa-solid fa-rotate-right${refreshingAll ? ' fa-spin' : ''}`} /> Обновить все
          </button>
        </header>

        <section className="card filter">
          <button type="button" className="filter-head" onClick={() => setFilterOpen((v) => !v)}
                  aria-expanded={filterOpen}>
            <span>Фильтр</span>
            <i className={`fa-solid fa-chevron-${filterOpen ? 'up' : 'down'}`} />
          </button>
          {filterOpen && (
              <div className="search">
                <i className="fa-solid fa-magnifying-glass" />
                <input type="text" placeholder="Поиск мерчанта" value={query}
                       onChange={(e) => setQuery(e.target.value)} />
                {query && (
                    <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Очистить">
                      <i className="fa-solid fa-xmark" />
                    </button>
                )}
              </div>
          )}
        </section>

        <p className="info">Суммы по всем ботам с момента последнего сброса. В строке показана сумма на момент последнего обновления</p>

        <div className="warning">
          <b>Заявку на вывод создавайте именно на ту сумму, которая показана в строке.</b>{' '}
          Сделки, поступившие после обновления строки, в неё не входят и при сбросе сохранятся.
          Полный список сделок можно получить кнопкой «В чат».
        </div>

        {loading ? (
            <div className="state"><i className="fa-solid fa-spinner fa-spin" /> Загрузка…</div>
        ) : error ? (
            <div className="state state-error">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{error}</span>
              <button type="button" className="btn btn-secondary" onClick={refreshAll}>Повторить</button>
            </div>
        ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                <tr>
                  <th className="c-num">№</th>
                  <th>Мерчант</th>
                  <th className="c-right">Сделок</th>
                  <th className="c-right">Сумма</th>
                  <th>Данные на</th>
                  <th className="c-act" aria-label="Действия" />
                </tr>
                </thead>
                <tbody>
                {visible.length === 0 ? (
                    <tr><td colSpan={6} className="empty">Мерчанты не найдены</td></tr>
                ) : visible.map((r, i) => {
                  const busy = rowBusy[r.merchant];
                  const noDeals = !(r.count > 0);
                  return (
                      <tr key={r.merchant}>
                        <td className="c-num">{i + 1}</td>
                        <td className="c-name" title={r.merchant}>{nameOf(r.merchant)}</td>
                        <td className="c-right mono">{r.count}</td>
                        <td className="c-right mono c-sum">{fmtSum(r.sum)}</td>
                        <td className="mono c-time">{fmtTime(r.readAt)}</td>
                        <td className="c-act">
                          <div className="row-actions">
                            <button type="button" className="btn btn-sm btn-outline" onClick={() => sendToChat(r)}
                                    disabled={noDeals || !!busy} title="Отправить список сделок в чат бота">
                              {busy === 'chat' ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
                              <span className="btn-chat-label">В чат</span>
                            </button>
                            <button type="button" className="btn btn-sm btn-outline btn-icon" onClick={() => refreshRow(r.merchant)}
                                    disabled={!!busy} title="Обновить строку" aria-label="Обновить строку">
                              <i className={`fa-solid fa-rotate-right${busy === 'refresh' ? ' fa-spin' : ''}`} />
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setResetRow(r)}
                                    disabled={noDeals || !!busy} title="Сбросить историю сделок">
                              Сброс
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

        {resetRow && (
            <ResetModal
                row={resetRow}
                name={nameOf(resetRow.merchant)}
                busy={rowBusy[resetRow.merchant] === 'reset'}
                onConfirm={confirmReset}
                onClose={() => setResetRow(null)}
            />
        )}

        {toastNode}
      </div>
  );
}
