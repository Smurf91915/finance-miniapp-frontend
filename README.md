# Finance Mini App Frontend

Мобильный `React + Vite` frontend для Telegram Mini App.

## Что уже есть

- нижняя навигация;
- главная сводка;
- добавление расхода, дохода, накопления и инвестиции;
- экран истории;
- аналитика по расходам;
- экран целей;
- блок регулярных трат;
- интеграция с Telegram WebApp API.

## Подготовка

Создай `.env` на основе `.env.example`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

## Запуск

```bash
cd /Users/n.smurova/finance-miniapp-frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

## Что нужно для Telegram

- backend должен быть доступен браузеру Mini App;
- `MINI_APP_URL` в backend-боте должен смотреть на адрес этого фронтенда;
- backend должен знать `BOT_TOKEN`, чтобы валидировать `Telegram.WebApp.initData`;
- для локальной разработки можно открыть приложение обычной ссылкой в браузере.

## Railway без туннелей

В репозитории есть production runtime для Railway:

- `railway.toml` задает build/start команды
- `server.mjs` раздает собранный `dist/` и поддерживает SPA fallback

Что нужно в Railway service:

```env
VITE_API_BASE_URL=https://<api-domain>/api/v1
```

После деплоя возьми публичный домен frontend service и пропиши его:

- в `MINI_APP_URL` у bot service
- в `CORS_ALLOWED_ORIGINS` у API service
