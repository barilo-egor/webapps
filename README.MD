# webapps

Telegram WebApp'ы для бота. Каждый апп — папка в `apps/`.

## Структура

```
webapps/
├── apps/
│   └── contacts/         ← апп управления контактами
│       ├── src/
│       │   ├── App.jsx   ← основной код (компоненты, логика, API)
│       │   ├── App.css
│       │   └── main.jsx
│       ├── index.html
│       ├── package.json
│       └── vite.config.js
├── .gitignore
└── README.md
```

## Что нужно для работы

1. **Node.js 20+** — скачать LTS с https://nodejs.org/

## Цикл разработки

В IntelliJ IDEA откройте терминал (`Alt+F12`), перейдите в папку аппа:

```bash
cd apps/contacts
```

**Первый раз** — установить зависимости:
```bash
npm install
```

**Сборка для прода** (получаете готовые файлы в `dist/`):
```bash
npm run build
```

Файлы из `dist/assets/` после сборки нужно будет положить на сервер.

**Dev-сервер** (для отладки, открывается в браузере с hot-reload):
```bash
npm run dev
```

Откройте http://localhost:5173.

В dev-режиме `Telegram.WebApp` не работает (вы не внутри Telegram), но
интерфейс и стили посмотреть можно. API-запросы идут на `localhost:8080`
(прокси в `vite.config.js`).

## Добавить новый апп в будущем

Скопировать папку `apps/contacts/` → переименовать → поправить код.

