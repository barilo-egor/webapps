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
     body        — объект (сам сериализуется), строка или FormData
     params      — объект query-параметров; пустые/null отбрасываются
     headers     — дополнительные заголовки (перекрывают базовые)
     nullOn404   — 404 считать штатным «нет данных», а не ошибкой
     withTotal   — вернуть {items, total} из X-Total-Count вместо массива
     raw         — вернуть объект Response как есть (для файлов/blob)

   Перенаправления (302) не выполняются: бэк отвечает ими, когда не
   принял авторизацию, и уводит на страницу входа. Если пойти следом,
   браузер получит HTML этой страницы со статусом 200, и запрос
   выглядел бы успешным — например, «Настройки сохранены», хотя ничего
   не сохранилось. Поэтому и перенаправление, и HTML вместо данных
   считаются ошибкой. Исключение — raw (файлы): их перенаправление
   выполняется как обычно.
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

function buildHeaders(extra, isForm) {
  const h = { 'X-TG-Init-Data': initData() };
  // Для FormData заголовок Content-Type ставит сам браузер: ему нужно
  // добавить boundary, и вручную его задавать нельзя.
  if (!isForm) h['Content-Type'] = 'application/json';
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
    nullOn404 = false, withTotal = false, raw = false,
    ...rest
  } = options;

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const res = await fetch(buildUrl(url, params), {
    // Не идём по перенаправлению — см. примечание в шапке файла.
    // Файлы (raw) — исключение: их бэк вправе отдавать через перенаправление.
    redirect: raw ? 'follow' : 'manual',
    ...rest,
    headers: buildHeaders(headers, isForm),
    ...(body !== undefined
        ? { body: isForm || typeof body === 'string' ? body : JSON.stringify(body) }
        : {}),
  });

  // Бэк перенаправил на страницу входа — запрос не выполнен.
  if (!raw && (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400))) {
    throw authError(res.status || 302);
  }

  // Штатное «данных нет» (напр. активной рулетки не существует).
  if (nullOn404 && res.status === 404) {
    return withTotal ? { items: [], total: 0 } : null;
  }

  // Сырой ответ — для файлов, которые читаются как blob.
  if (raw) {
    if (!res.ok) {
      const err = new Error(`Ошибка ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  const ct = res.headers.get('content-type') || '';

  // HTML вместо данных — почти наверняка та же страница входа (например,
  // если перенаправление выполнил прокси). Успехом это не считаем.
  if (ct.includes('text/html')) throw authError(res.status);

  // application/json и application/problem+json — оба JSON.
  const data = ct.includes('json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);

  if (!res.ok) {
    // Бэк присылает ошибки как {"error":"текст"} — показываем текст пользователю.
    const msg = (data && typeof data === 'object' && (data.error || data.message || data.description))
        || `Ошибка ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (!withTotal) return data;

  const items = Array.isArray(data) ? data : [];
  const rawTotal = res.headers.get('X-Total-Count');
  const total = rawTotal != null && rawTotal !== '' ? parseInt(rawTotal, 10) : items.length;
  return { items, total: Number.isFinite(total) ? total : items.length };
}

/* Ошибка «сервер не принял авторизацию». Отдельный текст, чтобы было
   понятно: дело не в введённых данных, а в доступе. */
function authError(status) {
  const err = new Error('Нет доступа: сервер не принял авторизацию. Откройте веб-апп заново из бота');
  err.status = status;
  err.unauthorized = true;
  return err;
}

// chatId текущего оператора (для аудита/будущих действий).
export const myChatId = () => window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;