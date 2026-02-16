# Техническое Задание: Микрофронтенд «SIP-Phone Widget»

## 1. Общие сведения

**Цель:** Реализация изолированного микрофронтенда (widget) для управления телефонными звонками (интеграция с MicroSIP через бэкенд-прокси).
**Ключевая особенность:** Полная синхронизация состояния между множеством открытых вкладок браузера через **SharedWorker**, использование **Web Components** для изоляции стилей и логики.

## 2. Стек технологий

* **Framework:** Vue 3 (Composition API, `<script setup>`).
* **Format:** Web Components (`defineCustomElement`).
* **State Management:** Pinia (для реактивности внутри компонента).
* **Transport (Inter-tab):** SharedWorker API.
* **Transport (Server):** Server-Sent Events (SSE) — для входящих событий; REST API (Axios/Fetch) — для исходящих команд.
* **Styles:** CSS/SCSS (Scoped inside Shadow DOM).
* **Target:** Chrome 100+ (Desktop).

## 3. Архитектура решения

Система состоит из трех слоев:

1. **Transport Layer (SharedWorker):** «Мозг» приложения. Держит единственное соединение с сервером, управляет состоянием, рассылает данные вкладкам.
2. **State Layer (Pinia Store):** Реактивное зеркало данных из воркера внутри UI.
3. **View Layer (Vue Web Component):** Отображение интерфейса, изолированное в Shadow DOM.

---

## 4. Спецификация SharedWorker (Transport Layer)

Файл: `sip-worker.js`.
Это singleton-сущность для браузера. Даже если открыто 10 вкладок, воркер один.

### 4.1. Обязанности

1. **Управление SSE:** Инициализация `EventSource`, авто-реконнект при обрыве.
2. **Мультиплексирование:** Прием сообщения от любой вкладки и рассылка обновленного состояния **всем** подключенным портам.
3. **Единственный источник истины:** Хранит объект `GlobalState`.

### 4.2. Структура `GlobalState` (в памяти воркера)

```javascript
{
  connectionStatus: 'connected' | 'disconnected', // Статус SSE
  operatorStatus: 'ready' | 'lunch' | 'dnd' | 'offline',
  activeCall: {
    id: 'call_123',
    state: 'incoming' | 'talking' | 'dialing' | null,
    phoneNumber: '+79990000000',
    startTime: 1678900000 // Timestamp для синхронизации таймеров
  } | null
}

```

### 4.3. Протокол обмена (Worker <-> Tabs)

Сообщения типизированы. Пример: `{ type: string, payload: any }`.

| Type | Направление | Описание |
| --- | --- | --- |
| `INIT_PORT` | Tab -> Worker | Вкладка открылась, передает Port. |
| `SYNC_STATE` | Worker -> Tab | Полный слепок стейта (при подключении или ресинхронизации). |
| `SSE_EVENT` | Worker -> Tab | Частичное обновление (пришло событие с бэка). |
| `CMD_DIAL` | Tab -> Worker | Пользователь нажал "Позвонить". |
| `CMD_ANSWER` | Tab -> Worker | Пользователь нажал "Принять". |
| `CMD_STATUS` | Tab -> Worker | Пользователь сменил статус. |

---

## 5. Спецификация UI (View Layer & Pinia)

Компонент оборачивается в Web Component: `<sip-phone-widget></sip-phone-widget>`.

### 5.1. Интеграция Pinia

Так как Web Component изолирован, Pinia создается **внутри** `setup()` компонента, а не глобально в `main.js`.
*Стор Pinia работает в режиме "Slave" — он не меняет стейт сам, а только через мутации, вызываемые событиями от SharedWorker.*

### 5.2. Компоненты интерфейса

1. **StatusBar:**
* Отображает текущий статус (цветной индикатор).
* Dropdown для смены статуса.
* Индикатор соединения с сервером (зеленая/красная точка).


2. **CallPanel (Основной экран):**
* **Состояние Idle:** Keypad (набор номера) + Input.
* **Состояние Incoming:** Модальное окно/Оверлей "Входящий звонок" + кнопки (Зеленая/Красная).
* **Состояние Talking:** Таймер (считается локально на основе `startTime`), кнопка "Сбросить", "Mute", "Hold".



### 5.3. Особенности реализации Web Component

* Использовать расширение `.ce.vue`.
* Стили должны быть инлайновыми (Vue это делает автоматически для CE), чтобы попасть в Shadow DOM.
* Z-index оверлея звонка должен быть высоким, но локальным для Shadow Root.

---

## 6. Взаимодействие с Бэкендом (API)

### 6.1. SSE Events (Входящие)

Endpoint: `GET /api/sip/events`

* `event: status_change` -> `{ status: 'lunch' }`
* `event: call_incoming` -> `{ number: '...', call_id: '...' }`
* `event: call_connected` -> `{ start_time: 123456789 }`
* `event: call_ended` -> `{ duration: 120 }`

### 6.2. REST Methods (Исходящие из Worker)

* `POST /api/sip/call/dial` -> `{ phone: '...' }`
* `POST /api/sip/call/answer` -> `{ call_id: '...' }`
* `POST /api/sip/call/hangup` -> `{ call_id: '...' }`
* `POST /api/sip/operator/status` -> `{ status: '...' }`

---

## 7. Жизненный цикл и Сценарии (Flows)

### Сценарий А: Открытие первой вкладки

1. Вкладка загружает Web Component.
2. Компонент создает `new SharedWorker()`.
3. Worker стартует, видит, что он один -> открывает SSE c бэкендом.
4. Worker получает актуальный стейт от бэкенда.
5. Worker отправляет `SYNC_STATE` во вкладку.

### Сценарий Б: Открытие второй вкладки

1. Вкладка подключается к *существующему* Worker.
2. Отправляет `INIT_PORT`.
3. Worker *сразу* (не дергая бэкенд) отдает `SYNC_STATE` из своей памяти.
4. Интерфейс второй вкладки мгновенно синхронизируется с первой.

### Сценарий В: Входящий звонок

1. Бэкенд шлет SSE событие `call_incoming`.
2. Worker получает событие, обновляет `GlobalState`.
3. Worker делает `ports.forEach(p => p.postMessage(...))`.
4. **Все** вкладки одновременно показывают "Входящий звонок".
5. Пользователь жмет "Принять" на Вкладке №1.
6. Вкладка №1 шлет `CMD_ANSWER` в Worker.
7. Worker шлет запрос на бэкенд и (оптимистично или после ответа) рассылает всем `UPDATE: state=talking`.
8. На всех вкладках пропадает кнопка "Принять" и включается таймер.

---

## 8. Corner Cases (Граничные случаи)

1. **Обрыв сети:**
* Worker теряет SSE.
* Worker шлет всем вкладкам статус `connection: 'reconnecting'`.
* UI блокирует кнопки звонка, показывает спиннер.
* Worker пытается переподключиться (Exponential backoff).


2. **Закрытие вкладки во время звонка:**
* Так как звонок живет в Worker и на Бэке, закрытие вкладки **не сбрасывает** звонок.
* При повторном открытии вкладки пользователь увидит активный звонок.


3. **Hot Module Replacement (HMR) при разработке:**
* SharedWorker плохо обновляется при HMR. Рекомендуется при разработке использовать `?type=module` и хард-рефреш, либо убивать воркер через `chrome://inspect/#workers`.



---

## 9. План реализации

1. **Этап 1: Scaffolding.** Настройка сборки Vite для режима `defineCustomElement` + создание файла `worker.js`.
2. **Этап 2: Worker Logic.** Реализация SSE подключения и базового State-loop в воркере.
3. **Этап 3: UI Component.** Верстка виджета на Vue 3, настройка Pinia внутри.
4. **Этап 4: Binding.** Связка `postMessage` между UI и Worker.
5. **Этап 5: Testing.** Тест синхронизации на 2+ вкладках.
