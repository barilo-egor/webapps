/* ============================================================
   API-слой веб-аппа «Авторулетка».
   Сеть, заголовки и разбор ошибок — в ../../shared/request.js.
   Здесь только адреса эндпоинтов и форматирование данных.

   Контракт:
     GET    /api/auto-roulette                     -> {id, roundNo, participantCount(=лимит), prizes[]}
                                                      404 — активной рулетки нет
     POST   /api/auto-roulette                      <- {participantCount, prizes:[...]}  (запуск)
     DELETE /api/auto-roulette                      (остановить активную)
     POST   /api/auto-roulette/spin                 (прокрутить/розыгрыш)
     DELETE /api/auto-roulette/participants         (очистить список участников)
     GET    /api/auto-roulette/participants?page&size&sort=number,asc
                                                    -> [{number, user:{chatId,username,firstName,lastName,...}}]
     GET    /api/auto-roulette/participants/count   -> число
     GET    /api/auto-roulette/winners              -> [{user, totalAmount, winCount}]  (ТОП за всё время)
     POST   /api/auto-roulette/history              <- {page,size, rouletteNumber?, winnerChatId?, rouletteDrawnAt?, rouletteDrawnTo?}
                                                    -> [{autoRouletteDTO:{roundNo,drawnAt,prizes}, winners:[{user,prizeAmount,winnerPlace}]}]
   Сообщения (рассылки): GET /api/messages/{CODE}, PUT /api/messages {id, value}
   Автостарт: переменная ROULETTE_AUTOSTART в /api/variables
   ============================================================ */

import { request } from '../../shared/request.js';

const API = '/api/auto-roulette';

export const api = {
  // --- Текущая рулетка ---
  // null, если активной рулетки нет (бэк отвечает 404 — это штатно).
  getInfo: () => request(API, { nullOn404: true }),

  start: (participantCount, prizes) =>
      request(API, { method: 'POST', body: { participantCount, prizes } }),
  stop: () => request(API, { method: 'DELETE' }),
  spin: () => request(`${API}/spin`, { method: 'POST' }),
  clearParticipants: () => request(`${API}/participants`, { method: 'DELETE' }),

  async participantsCount() {
    const d = await request(`${API}/participants/count`);
    return typeof d === 'number' ? d : Number(d?.count ?? 0);
  },

  // Возвращает {items, total} — total из X-Total-Count (для пагинации).
  participants: (page = 0, size = 50) =>
      request(`${API}/participants`, {
        params: { page, size, sort: 'number,asc' },
        withTotal: true,
      }),

  // --- Топ ---
  winners: () => request(`${API}/winners`),

  // --- История победителей ---
  history: (body) =>
      request(`${API}/history`, { method: 'POST', body, withTotal: true }),

  // --- Сообщения (рассылки) ---
  getMessage: (code) => request(`/api/messages/${encodeURIComponent(code)}`),
  saveMessage: (id, value) =>
      request('/api/messages', { method: 'PUT', body: { id, value } }),

  // --- Автостарт (переменная ROULETTE_AUTOSTART) ---
  // Переменные приходят как {variableType, value, ...}; value — строка "true"/"false".
  async getAutostart() {
    const data = await request('/api/variables');
    const list = Array.isArray(data) ? data : [];
    const v = list.find((x) => x.variableType === 'ROULETTE_AUTOSTART');
    return String(v?.value).toLowerCase() === 'true';
  },
  // Запись — одиночным объектом, НЕ массивом (подтверждено на dev).
  setAutostart: (on) =>
      request('/api/variables', {
        method: 'POST',
        body: { variableType: 'ROULETTE_AUTOSTART', value: on ? 'true' : 'false' },
      }),
};

// chatId оператора — реэкспорт из shared, чтобы аппу хватало одного импорта.
export { myChatId } from '../../shared/request.js';

// --- Форматирование (к сети не относится) ---

// Имя пользователя: firstName + lastName (любое может отсутствовать).
export const fullName = (u) => {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
};

// Username с правилом ТЗ: null -> «Скрыт».
export const usernameOrHidden = (u) => (u?.username ? '@' + u.username : 'Скрыт');

export const fmtNum = (n) =>
    n == null || n === '' ? '0' : Number(n).toLocaleString('ru-RU');

export const fmtAmount = (n) =>
    n == null || n === '' ? '0' : Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });