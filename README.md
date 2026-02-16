# SIP-Phone Widget

Микрофронтенд виджет телефонии с использованием SharedWorker для синхронизации вкладок.

## Запуск

### Бэкенд (Python)
```bash
python3 server.py
# Запустится на http://localhost:8000
```

### Фронтенд (Vite)
```bash
npm install
npm run dev
# Открыть http://localhost:5173
```

## Структура
*   `src/sip-worker.js` - Логика транспорта и синхронизации.
*   `src/components/SipPhoneWidget.ce.vue` - UI компонент (Web Component).
*   `SHARED_WORKER.md` - Подробная документация архитектуры.
