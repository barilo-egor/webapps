/* ============================================================
   Единая точка входа для ВСЕХ запросов из веб-аппов.
   Заголовки, разбор ошибок и X-Total-Count живут здесь и только здесь.

   Заголовки, которые добавляются автоматически:
     X-TG-Init-Data  — initData из Telegram (подпись проверяет бэк)
     X-Bot-Username  — username бота из ?bot= в адресе (если параметр есть)

   Правило: в аппах не должно оставаться прямых вызовов fetch.
   Если бэку понадобится ещё один заголовок — правится ТОЛЬКО этот файл.

   options:
     method      — 'GET' по умолчанию
     body        — объект (сам сериализуется) или готовая строка
     params      — объект query-параметров; пустые/null отбрасываются
     headers     — дополнительные заголовки (перекрывают базовые)
     nullOn404   — 404 считать штатным «нет данных», а не ошибкой
     withTotal   — вернуть {items, total} из X-Total-Count вместо массива
   ============================================================ */

const BOT_STORAGE_KEY = 'botUsername';

// Username бота: сначала из ?bot= в адресе, затем из sessionStorage.
// Запоминаем, потому что апп могут открыть по адресу без параметра.
export function botUsername() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('bot');
    if (fromUrl) {
      try { sessionStorage.setItem(BOT_STORAGE_KEY, fromUrl); } catch { /* приватный режим */ }
      return fromUrl;
    }
  } catch { /* нет window.location — не критично */ }
  try { return sessionStorage.getItem(BOT_STORAGE_KEY) || ''; } catch { return ''; }
}

const initData = () => {
  try { return window.Telegram?.WebApp?.initData || ''; } catch { return ''; }
};

function buildHeaders(extra) {
  const h = {
    'Content-Type': 'application/json',
    'X-TG-Init-Data': initData(),
  };
  // Добавляем только если бот известен: пока Егор не начал открывать апп
  // ссылкой с ?bot=, запросы уходят ровно такими, как были раньше.
  const bot = botUsername();
  if (bot) h['X-Bot-Username'] = bot;
  return { ...h, ...(extra || {}) };
}

function buildUrl(url, params) {
  if (!params) return url;
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, v);
  });
  const s = q.toString();
  if (!s) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${s}`;
}

export async function request(url, options = {}) {
  const {
    params, body, headers,
    nullOn404 = false, withTotal = false,
    ...rest
  } = options;

  const res = await fetch(buildUrl(url, params), {
    ...rest,
    headers: buildHeaders(headers),
    ...(body !== undefined
        ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
        : {}),
  });

  // Штатное «данных нет» (напр. активной рулетки не существует).
  if (nullOn404 && res.status === 404) {
    return withTotal ? { items: [], total: 0 } : null;
  }

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);

  if (!res.ok) {
    // Бэк присылает ошибки как {"error":"текст"} — показываем текст пользователю.
    const msg = (data && typeof data === 'object' && (data.error || data.message))
        || `Ошибка ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (!withTotal) return data;

  const items = Array.isArray(data) ? data : [];
  const raw = res.headers.get('X-Total-Count');
  const total = raw != null && raw !== '' ? parseInt(raw, 10) : items.length;
  return { items, total: Number.isFinite(total) ? total : items.length };
}

// chatId текущего оператора (для аудита/будущих действий).
export const myChatId = () => window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;