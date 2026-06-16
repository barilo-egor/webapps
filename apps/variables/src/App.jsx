import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './App.css';

// =============================================================
// API КЛИЕНТ
// =============================================================

const apiFetch = async (url, options = {}) => {
  const initData = window.Telegram?.WebApp?.initData || '';
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-TG-Init-Data': initData,
      ...(options.headers || {}),
    },
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
  // GET /api/variables/types — список ВСЕХ возможных переменных с метой
  listTypes: () => apiFetch('/api/variables/types'),
  // GET /api/variables — ТЕКУЩИЕ значения для этого бота
  listValues: () => apiFetch('/api/variables'),
  // POST /api/variables — сохранить значение (для текущего бота)
  save: (payload) =>
      apiFetch('/api/variables', { method: 'POST', body: JSON.stringify(payload) }),
  // POST /api/variables?isGlobalSave=true — сохранить глобально на всех ботах
  saveGlobal: (payload) =>
      apiFetch('/api/variables?isGlobalSave=true', { method: 'POST', body: JSON.stringify(payload) }),
};

// =============================================================
// MOCK API (для локальной разработки без бэкенда)
// =============================================================

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const mockTypes = [
  { id: 'USD_COURSE', displayName: 'Курс доллара', config: { hasDealType: true, hasFiatCurrency: true, hasCryptoCurrency: true, type: 'java.math.BigDecimal' } },
  { id: 'USDT_COURSE', displayName: 'Курс USDT', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.math.BigDecimal' } },
  { id: 'USD_RUB_COURSE', displayName: 'Курс рос.рубля к доллару', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.math.BigDecimal' } },
  { id: 'BYN_RUB_COURSE', displayName: 'Курс BYN к RUB', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.math.BigDecimal' } },
  { id: 'RUB_BYN_COURSE', displayName: 'Курс RUB к BYN', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.math.BigDecimal' } },
  { id: 'FIX', displayName: 'Фикс рублей', config: { hasDealType: true, hasFiatCurrency: true, hasCryptoCurrency: true, type: 'java.lang.Integer' } },
  { id: 'FIX_COMMISSION', displayName: 'Фикс комиссия', config: { hasDealType: true, hasFiatCurrency: true, hasCryptoCurrency: true, type: 'java.lang.Integer' } },
  { id: 'FIX_COMMISSION_VIP', displayName: 'Фикс комиссия для вип', config: { hasDealType: true, hasFiatCurrency: true, hasCryptoCurrency: true, type: 'java.lang.Integer' } },
  { id: 'COMMISSION', displayName: 'Комиссия', config: { hasDealType: true, hasFiatCurrency: true, hasCryptoCurrency: true, type: 'java.math.BigDecimal' } },
  { id: 'TRANSACTION_COMMISSION', displayName: 'Транз.комиссия', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: true, type: 'java.math.BigDecimal' } },
  { id: 'MIN_SUM', displayName: 'Мин.сумма сделки', config: { hasDealType: true, hasFiatCurrency: false, hasCryptoCurrency: true, type: 'java.math.BigDecimal' } },
  { id: 'REFERRAL_MIN_SUM', displayName: 'Мин.сумма вывода', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'DEAL_MAX_ENTERED_SUM', displayName: 'Максимальная сумма в крипте', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: true, type: 'java.math.BigDecimal' } },
  { id: 'MAX_SUM', displayName: 'Максимальная сумма обмена', config: { hasDealType: false, hasFiatCurrency: true, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'PERMISSIBLE_EXCHANGE_RATE_DIFFERENCE', displayName: 'Допустимая разница курса', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: true, type: 'java.math.BigDecimal' } },
  { id: 'MAX_AUTO_CONFIRM_AMOUNT', displayName: 'Макс.сумма автоподтверждения', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'REFERRAL_PERCENT', displayName: 'Процент рефералов', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.math.BigDecimal' } },
  { id: 'PROBABILITY', displayName: 'Шанс лотереи', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.math.BigDecimal' } },
  { id: 'PROMO_CODE_DISCOUNT', displayName: 'Скидка от промокода', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.math.BigDecimal' } },
  { id: 'PROMO_CODE_NAME', displayName: 'Название промокода', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.String' } },
  { id: 'REF_BALANCE_PROMO_CODE_ACTIVE_TIME', displayName: 'Кол-во часов активности промокода', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'DEAL_RANK_DISCOUNT_ENABLE', displayName: 'Ранговая скидка для всех', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Boolean' } },
  { id: 'MIN_AMOUNT_FOR_REFERRAL_DISCOUNT', displayName: 'Мин.сумма сделки для реф.скидки', config: { hasDealType: false, hasFiatCurrency: true, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'DEALS_COUNT_CAPTCHA_CHECK', displayName: 'Макс.кол-во сделок для капчи', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'DEALS_CAPTCHA_OPTIONS_COUNT', displayName: 'Кол-во вариантов ответа для капчи сделок', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'DEALS_CAPTCHA_TRY_COUNT', displayName: 'Кол-во попыток ответа для капчи сделок', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'MAX_ABS_DETAILS_COUNT', displayName: 'Макс.кол-во реквизитов ABS', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'DEALS_COUNT_ANTI_BLOCK_DETAILS', displayName: 'Кол-во сделок для ABDS', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'CHANNEL_CHAT_ID', displayName: 'Айди канала', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Long' } },
  { id: 'REVIEW_PRISE', displayName: 'Вознаграждение', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'REVIEW_PUBLISH_MINUTES_INTERVAL', displayName: 'Промежуток в минутах публикации отзывов', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
  { id: 'WALLET', displayName: 'Кошелек крипты', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: true, type: 'java.lang.String' } },
  { id: 'IS_REGISTRATION_OPENED', displayName: 'Доступ к регистрации', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Boolean' } },
  { id: 'OPERATOR_LINK', displayName: 'Ссылка на оператора', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.String' } },
  { id: 'DEAL_ACTIVE_TIME', displayName: 'Время активности заявки', config: { hasDealType: false, hasFiatCurrency: false, hasCryptoCurrency: false, type: 'java.lang.Integer' } },
];

// Базовый набор значений для mock
let mockValues = [
  { variableType: 'USDT_COURSE', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: '0.9' },
  { variableType: 'USD_RUB_COURSE', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: '92.5' },
  { variableType: 'BYN_RUB_COURSE', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: '31.2' },
  { variableType: 'RUB_BYN_COURSE', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: '0.032' },
  { variableType: 'USD_COURSE', fiatCurrency: 'RUB', dealType: 'BUY', cryptoCurrency: 'BITCOIN', value: '98' },
  { variableType: 'USD_COURSE', fiatCurrency: 'RUB', dealType: 'SELL', cryptoCurrency: 'BITCOIN', value: '88' },
  { variableType: 'USD_COURSE', fiatCurrency: 'BYN', dealType: 'BUY', cryptoCurrency: 'USDT', value: '3.67' },
  { variableType: 'TRANSACTION_COMMISSION', fiatCurrency: null, dealType: null, cryptoCurrency: 'USDT', value: '1' },
  { variableType: 'TRANSACTION_COMMISSION', fiatCurrency: null, dealType: null, cryptoCurrency: 'BITCOIN', value: '0' },
  { variableType: 'WALLET', fiatCurrency: null, dealType: null, cryptoCurrency: 'BITCOIN', value: 'bc1qxr4whk3dgzx0yaclvl0ca2f2v4w6cglhrfyfmy' },
  { variableType: 'WALLET', fiatCurrency: null, dealType: null, cryptoCurrency: 'USDT', value: 'TAuTEdXDwu2j8z6zHoHuo23UhBXexfFYEX' },
  { variableType: 'MAX_SUM', fiatCurrency: 'RUB', dealType: null, cryptoCurrency: null, value: '400000' },
  { variableType: 'MAX_SUM', fiatCurrency: 'BYN', dealType: null, cryptoCurrency: null, value: '8000' },
  { variableType: 'PROMO_CODE_DISCOUNT', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: '25' },
  { variableType: 'PROMO_CODE_NAME', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: 'NEWUSER30' },
  { variableType: 'REF_BALANCE_PROMO_CODE_ACTIVE_TIME', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: '72' },
  { variableType: 'IS_REGISTRATION_OPENED', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: 'true' },
  { variableType: 'DEAL_RANK_DISCOUNT_ENABLE', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: 'false' },
  { variableType: 'OPERATOR_LINK', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: 'https://t.me/BULBA_BTC' },
  { variableType: 'DEAL_ACTIVE_TIME', fiatCurrency: null, dealType: null, cryptoCurrency: null, value: '25' },
];

const findValueIdx = (payload) =>
    mockValues.findIndex(
        (v) =>
            v.variableType === payload.variableType &&
            (v.fiatCurrency ?? null) === (payload.fiatCurrency ?? null) &&
            (v.dealType ?? null) === (payload.dealType ?? null) &&
            (v.cryptoCurrency ?? null) === (payload.cryptoCurrency ?? null)
    );

const mockApi = {
  listTypes: async () => {
    await delay(150);
    return JSON.parse(JSON.stringify(mockTypes));
  },
  listValues: async () => {
    await delay(150);
    return JSON.parse(JSON.stringify(mockValues));
  },
  save: async (payload) => {
    await delay(200);
    const idx = findValueIdx(payload);
    const record = {
      variableType: payload.variableType,
      fiatCurrency: payload.fiatCurrency ?? null,
      dealType: payload.dealType ?? null,
      cryptoCurrency: payload.cryptoCurrency ?? null,
      value: String(payload.value),
    };
    if (idx === -1) mockValues.push(record);
    else mockValues[idx] = record;
    return record;
  },
  saveGlobal: async (payload) => {
    // В mock-режиме различия нет — то же что обычное сохранение
    return mockApi.save(payload);
  },
};

const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';
const api = USE_MOCK ? mockApi : realApi;
if (USE_MOCK) {
  // eslint-disable-next-line no-console
  console.info('[variables] Работает в MOCK-режиме (VITE_USE_MOCK=1)');
}

// =============================================================
// СТРУКТУРА БЛОКОВ И ПОДБЛОКОВ
// =============================================================
// Группировка переменных по блокам/подблокам — задана на фронте.
// (Бэк не присылает поле "block", поэтому маппим вручную.)
// Переменные которых нет в маппинге автоматически попадают в "Прочее".

const BLOCKS = [
  {
    id: 'financial',
    label: 'Финансовые',
    icon: 'fas fa-chart-line',
    subBlocks: [
      { id: 'rates', label: 'Курсы', icon: 'fas fa-dollar-sign' },
      { id: 'commissions', label: 'Комиссии', icon: 'fas fa-percent' },
      { id: 'fin_other', label: 'Прочее', icon: 'fas fa-calculator' },
    ],
  },
  { id: 'promo', label: 'Промокод', icon: 'fas fa-tags' },
  { id: 'discounts', label: 'Скидки', icon: 'fas fa-gift' },
  { id: 'captcha', label: 'Капча', icon: 'fas fa-shield-alt' },
  { id: 'abs', label: 'ABS', icon: 'fas fa-address-card' },
  { id: 'reviews', label: 'Отзывы', icon: 'fas fa-star' },
  { id: 'other', label: 'Прочее', icon: 'fas fa-cogs' },
];

// id переменной → [blockId, subBlockId?] (subBlockId опционально)
const VAR_TO_BLOCK = {
  // Финансовые / Курсы
  USD_COURSE: ['financial', 'rates'],
  USDT_COURSE: ['financial', 'rates'],
  USD_RUB_COURSE: ['financial', 'rates'],
  BYN_RUB_COURSE: ['financial', 'rates'],
  RUB_BYN_COURSE: ['financial', 'rates'],
  // Финансовые / Комиссии
  FIX: ['financial', 'commissions'],
  FIX_COMMISSION: ['financial', 'commissions'],
  FIX_COMMISSION_VIP: ['financial', 'commissions'],
  COMMISSION: ['financial', 'commissions'],
  TRANSACTION_COMMISSION: ['financial', 'commissions'],
  // Финансовые / Прочее
  MIN_SUM: ['financial', 'fin_other'],
  REFERRAL_MIN_SUM: ['financial', 'fin_other'],
  DEAL_MAX_ENTERED_SUM: ['financial', 'fin_other'],
  MAX_SUM: ['financial', 'fin_other'],
  PERMISSIBLE_EXCHANGE_RATE_DIFFERENCE: ['financial', 'fin_other'],
  MAX_AUTO_CONFIRM_AMOUNT: ['financial', 'fin_other'],
  REFERRAL_PERCENT: ['financial', 'fin_other'],
  PROBABILITY: ['financial', 'fin_other'],
  // Промокод
  PROMO_CODE_DISCOUNT: ['promo'],
  PROMO_CODE_NAME: ['promo'],
  REF_BALANCE_PROMO_CODE_ACTIVE_TIME: ['promo'],
  // Скидки
  DEAL_RANK_DISCOUNT_ENABLE: ['discounts'],
  MIN_AMOUNT_FOR_REFERRAL_DISCOUNT: ['discounts'],
  // Капча
  DEALS_COUNT_CAPTCHA_CHECK: ['captcha'],
  DEALS_CAPTCHA_OPTIONS_COUNT: ['captcha'],
  DEALS_CAPTCHA_TRY_COUNT: ['captcha'],
  // ABS
  MAX_ABS_DETAILS_COUNT: ['abs'],
  DEALS_COUNT_ANTI_BLOCK_DETAILS: ['abs'],
  // Отзывы
  CHANNEL_CHAT_ID: ['reviews'],
  REVIEW_PRISE: ['reviews'],
  REVIEW_PUBLISH_MINUTES_INTERVAL: ['reviews'],
  // Прочее
  WALLET: ['other'],
  IS_REGISTRATION_OPENED: ['other'],
  OPERATOR_LINK: ['other'],
  DEAL_ACTIVE_TIME: ['other'],
};

// Лейблы криптовалют и фиатов (отображаемые имена).
// Список крипт берётся динамически из реальных данных (см. collectAxes).
const CRYPTO_LABEL = {
  BITCOIN: 'BTC',
  USDT: 'USDT',
  ETHEREUM: 'ETH',
  TRON: 'TRX',
  LITECOIN: 'LTC',
  MONERO: 'XMR',
};
const FIAT_LABEL = {
  RUB: 'RUB',
  BYN: 'BYN',
  USD: 'USD',
  EUR: 'EUR',
};

// =============================================================
// УТИЛИТЫ
// =============================================================

/** Уникальный ключ ячейки = type|fiat|deal|crypto. Null нормализуем в пустую строку. */
function valueKey({ variableType, fiatCurrency, dealType, cryptoCurrency }) {
  return [
    variableType,
    fiatCurrency || '',
    dealType || '',
    cryptoCurrency || '',
  ].join('|');
}

/** Превращает массив значений в Map по ключу — для быстрого поиска. */
function buildValueMap(values) {
  const map = new Map();
  for (const v of values) map.set(valueKey(v), v.value);
  return map;
}

/** По значениям собирает уникальные крипты и фиаты которые реально встречаются.
 *  Это нужно чтобы матрицы и строки рисовались по тем валютам что есть на бэке. */
function collectAxes(values) {
  const cryptos = new Set();
  const fiats = new Set();
  for (const v of values) {
    if (v.cryptoCurrency) cryptos.add(v.cryptoCurrency);
    if (v.fiatCurrency) fiats.add(v.fiatCurrency);
  }
  // Сортируем по предпочтительному порядку (BTC, USDT, ETH, TRX, LTC, XMR)
  const cryptoOrder = ['BITCOIN', 'USDT', 'ETHEREUM', 'TRON', 'LITECOIN', 'MONERO'];
  const fiatOrder = ['RUB', 'BYN', 'USD', 'EUR'];
  const sortBy = (arr, order) => {
    return [...arr].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  };
  return {
    cryptos: sortBy([...cryptos], cryptoOrder),
    fiats: sortBy([...fiats], fiatOrder),
  };
}

/** Определяет какой inputMode подходит для java-типа. */
function inputModeForJavaType(javaType) {
  if (javaType === 'java.math.BigDecimal') return 'decimal';
  if (javaType === 'java.lang.Integer' || javaType === 'java.lang.Long')
    return 'numeric';
  return 'text';
}

/** Возвращает true если строка похожа на валидное число. Пустая строка тоже ОК. */
function isValidNumber(str, allowDecimal) {
  if (str === '' || str == null) return true;
  if (allowDecimal) return /^-?\d*\.?\d*$/.test(str);
  return /^-?\d*$/.test(str);
}

// =============================================================
// TOAST (всплывающие уведомления)
// =============================================================

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
      <div className="toast">
        {message}
      </div>
  );
}

// =============================================================
// КНОПКИ ДЕЙСТВИЯ (✓ ✓✓ ✕) — показываются когда значение изменено
// =============================================================

function FieldActions({ visible, onLocal, onGlobal, onCancel, disabled }) {
  if (!visible) return null;
  return (
      <div className="field-actions">
        <button
            type="button"
            className="action-btn action-local"
            onClick={onLocal}
            disabled={disabled}
            title="Сохранить (только для этого бота)"
            aria-label="Сохранить для этого бота"
        >
          <i className="fas fa-check" aria-hidden="true"></i>
        </button>
        <button
            type="button"
            className="action-btn action-global"
            onClick={onGlobal}
            disabled={disabled}
            title="Сохранить на всех ботах"
            aria-label="Сохранить на всех ботах"
        >
          <i className="fas fa-check-double" aria-hidden="true"></i>
        </button>
        <button
            type="button"
            className="action-btn action-cancel"
            onClick={onCancel}
            disabled={disabled}
            title="Отменить изменения"
            aria-label="Отменить изменения"
        >
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
  );
}

// =============================================================
// ХУК useFieldState: хранит current и saved, считает изменено-ли
// =============================================================

function useFieldState(initialValue) {
  const [savedValue, setSavedValue] = useState(initialValue ?? '');
  const [currentValue, setCurrentValue] = useState(initialValue ?? '');
  // Если initialValue изменился извне (например, перезагрузка данных) — синхронизируем
  const initialRef = useRef(initialValue);
  useEffect(() => {
    if (initialRef.current !== initialValue) {
      initialRef.current = initialValue;
      setSavedValue(initialValue ?? '');
      setCurrentValue(initialValue ?? '');
    }
  }, [initialValue]);

  const isModified =
      String(currentValue ?? '') !== String(savedValue ?? '');

  return {
    currentValue,
    setCurrentValue,
    savedValue,
    setSavedValue,
    isModified,
    revert: () => setCurrentValue(savedValue),
    commit: (v) => {
      setSavedValue(v);
      setCurrentValue(v);
    },
  };
}

// =============================================================
// SCALAR FIELD — одно поле (число/строка/boolean)
// =============================================================

function ScalarField({ type, savedValue, onSave }) {
  const javaType = type.config.type;
  const isBool = javaType === 'java.lang.Boolean';
  const allowDecimal = javaType === 'java.math.BigDecimal';
  const isNumeric =
      javaType === 'java.math.BigDecimal' ||
      javaType === 'java.lang.Integer' ||
      javaType === 'java.lang.Long';

  const fs = useFieldState(savedValue);
  const [busy, setBusy] = useState(false);

  const handleInputChange = (e) => {
    const v = e.target.value;
    if (isNumeric) {
      // Заменяем запятую на точку для удобства ввода
      const normalized = v.replace(',', '.');
      if (isValidNumber(normalized, allowDecimal)) {
        fs.setCurrentValue(normalized);
      }
    } else {
      fs.setCurrentValue(v);
    }
  };

  const submit = async (global) => {
    setBusy(true);
    try {
      await onSave(fs.currentValue, global);
      fs.commit(fs.currentValue);
    } catch (err) {
      alert('Не удалось сохранить: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  // Динамическая ширина инпута — подстраивается под длину содержимого.
  // Минимум 8ch (чтобы пустой инпут было видно), максимум 60ch (длинные URL).
  // Юнит "ch" = ширина символа "0" текущего шрифта.
  const valueLength = String(fs.currentValue ?? '').length;
  const dynamicWidth = `${Math.max(8, Math.min(60, valueLength + 4))}ch`;

  return (
      <div className="variable-row">
        <div className="variable-label">{type.displayName}</div>
        <div className="variable-control">
          {isBool ? (
              <select
                  value={fs.currentValue}
                  onChange={(e) => fs.setCurrentValue(e.target.value)}
                  disabled={busy}
                  className="select"
              >
                <option value="true">Да</option>
                <option value="false">Нет</option>
              </select>
          ) : (
              <input
                  type="text"
                  value={fs.currentValue}
                  onChange={handleInputChange}
                  inputMode={inputModeForJavaType(javaType)}
                  disabled={busy}
                  className="input input-auto-width"
                  style={{ width: dynamicWidth }}
              />
          )}
          <FieldActions
              visible={fs.isModified}
              disabled={busy}
              onLocal={() => submit(false)}
              onGlobal={() => submit(true)}
              onCancel={fs.revert}
          />
        </div>
      </div>
  );
}

// =============================================================
// ROW CELL — одна ячейка в строке/матрице (со своими кнопками)
// =============================================================

function RowCell({ type, savedValue, coords, onSave }) {
  const javaType = type.config.type;
  const allowDecimal = javaType === 'java.math.BigDecimal';
  const isNumeric =
      javaType === 'java.math.BigDecimal' ||
      javaType === 'java.lang.Integer' ||
      javaType === 'java.lang.Long';
  const isString = javaType === 'java.lang.String';

  const fs = useFieldState(savedValue);
  const [busy, setBusy] = useState(false);

  const handleInputChange = (e) => {
    const v = e.target.value;
    if (isNumeric) {
      const normalized = v.replace(',', '.');
      if (isValidNumber(normalized, allowDecimal)) {
        fs.setCurrentValue(normalized);
      }
    } else {
      fs.setCurrentValue(v);
    }
  };

  const submit = async (global) => {
    setBusy(true);
    try {
      await onSave(fs.currentValue, global, coords);
      fs.commit(fs.currentValue);
    } catch (err) {
      alert('Не удалось сохранить: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
      <div className="cell-with-actions">
        <div className="cell-input-wrap">
          <input
              type="text"
              value={fs.currentValue}
              onChange={handleInputChange}
              inputMode={isString ? 'text' : inputModeForJavaType(javaType)}
              disabled={busy}
              className="input cell-input"
          />
          {isString && fs.currentValue && (
              <div className="cell-tooltip" role="tooltip">
                {fs.currentValue}
              </div>
          )}
        </div>
        <FieldActions
            visible={fs.isModified}
            disabled={busy}
            onLocal={() => submit(false)}
            onGlobal={() => submit(true)}
            onCancel={fs.revert}
        />
      </div>
  );
}

// =============================================================
// ROW FIELD — таблица одной строки (по криптам или по фиатам)
// =============================================================

function RowField({ type, valuesMap, axes, onSaveCell }) {
  const { config } = type;
  // Определяем по какой оси разворачиваем
  const isByCrypto = config.hasCryptoCurrency;
  const isByFiat = config.hasFiatCurrency;
  const items = isByCrypto ? axes.cryptos : isByFiat ? axes.fiats : [];
  const labelMap = isByCrypto ? CRYPTO_LABEL : FIAT_LABEL;
  // Для строковых значений (адреса кошельков) применяем фикс. ширину ячейки.
  // Для чисел (фиаты, крипты) — равномерное растяжение по ширине контейнера.
  const isStringValues = config.type === 'java.lang.String';
  const wrapperClass = isStringValues ? 'row-table row-table-strings' : 'row-table';

  return (
      <div className="variable-block">
        <div className="variable-block-title">{type.displayName}</div>
        <div className={wrapperClass}>
          <div className="row-table-header">
            {items.map((it) => (
                <div className="row-table-cell row-table-th" key={it}>
                  {labelMap[it] || it}
                </div>
            ))}
          </div>
          <div className="row-table-body">
            {items.map((it) => {
              const coords = {
                variableType: type.id,
                fiatCurrency: isByFiat ? it : null,
                cryptoCurrency: isByCrypto ? it : null,
                dealType: null,
              };
              const saved = valuesMap.get(valueKey(coords)) ?? '';
              return (
                  <div className="row-table-cell" key={it}>
                    <RowCell
                        type={type}
                        savedValue={saved}
                        coords={coords}
                        onSave={onSaveCell}
                    />
                  </div>
              );
            })}
          </div>
        </div>
      </div>
  );
}

// =============================================================
// MATRIX FIELD — полная матрица fiat × crypto × deal
// или двумерная crypto × deal (для MIN_SUM)
// =============================================================

function MatrixField({ type, valuesMap, axes, onSaveCell }) {
  const { config } = type;
  const hasFiat = config.hasFiatCurrency;
  const hasCrypto = config.hasCryptoCurrency;
  const hasDeal = config.hasDealType;

  // Поддерживаем:
  // 1) fiat × crypto × deal (USD_COURSE, FIX, COMMISSION...)
  // 2) crypto × deal (MIN_SUM)

  const cryptos = axes.cryptos;
  const fiats = hasFiat ? axes.fiats : [null];
  const dealTypes = hasDeal ? ['BUY', 'SELL'] : [null];

  // Лейблы для шапки крипты
  const cryptoLabel = (c) => CRYPTO_LABEL[c] || c;

  return (
      <div className="variable-block">
        <div className="variable-block-title">{type.displayName}</div>
        <div className="matrix-wrapper">
          <table className="matrix-table">
            <thead>
            <tr>
              <th className="matrix-corner">
                {hasFiat ? 'Фиат \\ Крипта' : 'Тип сделки / Крипта'}
              </th>
              {cryptos.map((c) => (
                  <th
                      key={c}
                      className="matrix-crypto-head"
                      colSpan={hasDeal ? dealTypes.length : 1}
                  >
                    {cryptoLabel(c)}
                  </th>
              ))}
            </tr>
            {hasDeal && (
                <tr>
                  <th className="matrix-corner"></th>
                  {cryptos.map((c) =>
                      dealTypes.map((dt) => (
                          <th key={`${c}-${dt}`} className="matrix-deal-head">
                            {dt === 'BUY' ? 'Покупка' : 'Продажа'}
                          </th>
                      ))
                  )}
                </tr>
            )}
            </thead>
            <tbody>
            {hasFiat
                ? // строки — фиаты
                fiats.map((f) => (
                    <tr key={f}>
                      <th className="matrix-row-head">{FIAT_LABEL[f] || f}</th>
                      {cryptos.map((c) =>
                          dealTypes.map((dt) => {
                            const coords = {
                              variableType: type.id,
                              fiatCurrency: f,
                              cryptoCurrency: c,
                              dealType: dt,
                            };
                            const saved = valuesMap.get(valueKey(coords)) ?? '';
                            return (
                                <td key={`${c}-${dt}`} className="matrix-cell">
                                  <RowCell
                                      type={type}
                                      savedValue={saved}
                                      coords={coords}
                                      onSave={onSaveCell}
                                  />
                                </td>
                            );
                          })
                      )}
                    </tr>
                ))
                : // строки — типы сделок (для MIN_SUM)
                dealTypes.map((dt) => (
                    <tr key={dt}>
                      <th className="matrix-row-head">
                        {dt === 'BUY' ? 'Покупка' : 'Продажа'}
                      </th>
                      {cryptos.map((c) => {
                        const coords = {
                          variableType: type.id,
                          fiatCurrency: null,
                          cryptoCurrency: c,
                          dealType: dt,
                        };
                        const saved = valuesMap.get(valueKey(coords)) ?? '';
                        return (
                            <td key={c} className="matrix-cell">
                              <RowCell
                                  type={type}
                                  savedValue={saved}
                                  coords={coords}
                                  onSave={onSaveCell}
                              />
                            </td>
                        );
                      })}
                    </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
  );
}

// =============================================================
// VARIABLE RENDERER — выбирает нужный компонент по флагам config
// =============================================================

function VariableRenderer({ type, valuesMap, axes, onSaveCell }) {
  const { hasDealType, hasFiatCurrency, hasCryptoCurrency } = type.config;

  // Сколько осей у переменной?
  const axesCount =
      (hasDealType ? 1 : 0) + (hasFiatCurrency ? 1 : 0) + (hasCryptoCurrency ? 1 : 0);

  // 0 осей — скаляр
  if (axesCount === 0) {
    const coords = {
      variableType: type.id,
      fiatCurrency: null,
      dealType: null,
      cryptoCurrency: null,
    };
    const saved = valuesMap.get(valueKey(coords)) ?? '';
    return (
        <ScalarField
            type={type}
            savedValue={saved}
            onSave={(value, global) => onSaveCell(value, global, coords)}
        />
    );
  }

  // 1 ось — строка (по фиатам или по криптам)
  if (axesCount === 1 && !hasDealType) {
    return (
        <RowField
            type={type}
            valuesMap={valuesMap}
            axes={axes}
            onSaveCell={onSaveCell}
        />
    );
  }

  // 2+ осей — матрица
  return (
      <MatrixField
          type={type}
          valuesMap={valuesMap}
          axes={axes}
          onSaveCell={onSaveCell}
      />
  );
}

// =============================================================
// BLOCK / SUBBLOCK — сворачиваемые карточки
// =============================================================

function CollapsibleSection({ icon, label, level = 0, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
      <div className={`section section-level-${level} ${open ? 'section-open' : ''}`}>
        <button
            type="button"
            className="section-header"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
        >
          {icon && <i className={`${icon} section-icon`} aria-hidden="true"></i>}
          <span className="section-title">{label}</span>
          <i
              className={`fas fa-chevron-right section-chevron ${open ? 'open' : ''}`}
              aria-hidden="true"
          ></i>
        </button>
        {open && <div className="section-body">{children}</div>}
      </div>
  );
}

// =============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// =============================================================

export default function App() {
  const [types, setTypes] = useState([]);
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // Загружаем оба списка параллельно
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ts, vs] = await Promise.all([api.listTypes(), api.listValues()]);
      setTypes(Array.isArray(ts) ? ts : []);
      setValues(Array.isArray(vs) ? vs : []);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить переменные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const valuesMap = useMemo(() => buildValueMap(values), [values]);
  const axes = useMemo(() => collectAxes(values), [values]);

  // Сохранение одной ячейки/переменной
  const handleSaveCell = useCallback(async (value, global, coords) => {
    const payload = {
      variableType: coords.variableType,
      value,
    };
    if (coords.fiatCurrency) payload.fiatCurrency = coords.fiatCurrency;
    if (coords.dealType) payload.dealType = coords.dealType;
    if (coords.cryptoCurrency) payload.cryptoCurrency = coords.cryptoCurrency;

    if (global) {
      await api.saveGlobal(payload);
      setToast({ message: '✓✓ Переменная обновлена на всех ботах' });
    } else {
      await api.save(payload);
      setToast({ message: '✓ Переменная обновлена' });
    }

    // Локально обновляем values (чтобы повторный F5 не понадобился)
    setValues((prev) => {
      const idx = prev.findIndex(
          (v) =>
              v.variableType === coords.variableType &&
              (v.fiatCurrency ?? null) === (coords.fiatCurrency ?? null) &&
              (v.dealType ?? null) === (coords.dealType ?? null) &&
              (v.cryptoCurrency ?? null) === (coords.cryptoCurrency ?? null)
      );
      const record = {
        variableType: coords.variableType,
        fiatCurrency: coords.fiatCurrency ?? null,
        dealType: coords.dealType ?? null,
        cryptoCurrency: coords.cryptoCurrency ?? null,
        value: String(value),
      };
      if (idx === -1) return [...prev, record];
      const next = [...prev];
      next[idx] = record;
      return next;
    });
  }, []);

  // Группируем типы по блокам/подблокам
  const groupedTypes = useMemo(() => {
    const result = {};
    for (const block of BLOCKS) {
      result[block.id] = block.subBlocks
          ? Object.fromEntries(block.subBlocks.map((sb) => [sb.id, []]))
          : { __direct: [] };
    }
    for (const t of types) {
      const mapping = VAR_TO_BLOCK[t.id];
      if (mapping) {
        const [blockId, subBlockId] = mapping;
        if (subBlockId) {
          result[blockId][subBlockId].push(t);
        } else {
          if (!result[blockId].__direct) result[blockId].__direct = [];
          result[blockId].__direct.push(t);
        }
      } else {
        // Переменная не в маппинге — кладём в "Прочее"
        if (!result.other.__direct) result.other.__direct = [];
        result.other.__direct.push(t);
      }
    }
    return result;
  }, [types]);

  return (
      <div className="app">
        <div className="container">
          <header className="page-header">
            <h1>
              <i className="fas fa-robot" aria-hidden="true"></i>
              Управление переменными бота
            </h1>
          </header>

          <main>
            {loading && (
                <div className="state">
                  <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  <span>Загрузка…</span>
                </div>
            )}

            {!loading && error && (
                <div className="state state-error">
                  <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                  <span>{error}</span>
                  <button type="button" className="btn btn-secondary" onClick={loadAll}>
                    Повторить
                  </button>
                </div>
            )}

            {!loading && !error && types.length === 0 && (
                <div className="state state-empty">
                  <i className="fas fa-inbox" aria-hidden="true"></i>
                  <span>Переменных нет</span>
                </div>
            )}

            {!loading && !error && types.length > 0 && (
                <div className="blocks-list">
                  {BLOCKS.map((block) => {
                    const groups = groupedTypes[block.id];
                    // Считаем сколько переменных в блоке
                    const hasContent = block.subBlocks
                        ? block.subBlocks.some((sb) => (groups[sb.id] || []).length > 0)
                        : (groups.__direct || []).length > 0;
                    if (!hasContent) return null;

                    return (
                        <CollapsibleSection
                            key={block.id}
                            icon={block.icon}
                            label={block.label}
                            level={0}
                        >
                          {block.subBlocks
                              ? block.subBlocks.map((sb) => {
                                const items = groups[sb.id] || [];
                                if (items.length === 0) return null;
                                return (
                                    <CollapsibleSection
                                        key={sb.id}
                                        icon={sb.icon}
                                        label={sb.label}
                                        level={1}
                                    >
                                      {items.map((t) => (
                                          <VariableRenderer
                                              key={t.id}
                                              type={t}
                                              valuesMap={valuesMap}
                                              axes={axes}
                                              onSaveCell={handleSaveCell}
                                          />
                                      ))}
                                    </CollapsibleSection>
                                );
                              })
                              : (groups.__direct || []).map((t) => (
                                  <VariableRenderer
                                      key={t.id}
                                      type={t}
                                      valuesMap={valuesMap}
                                      axes={axes}
                                      onSaveCell={handleSaveCell}
                                  />
                              ))}
                        </CollapsibleSection>
                    );
                  })}
                </div>
            )}
          </main>
        </div>

        {toast && (
            <Toast message={toast.message} onDone={() => setToast(null)} />
        )}
      </div>
  );
}