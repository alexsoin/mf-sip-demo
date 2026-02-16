/**
 * Shared Worker SIP-телефона
 * Выступает в роли центрального хаба для всех вкладок браузера, управляя единственным SSE-соединением
 * и синхронизируя состояние между всеми экземплярами.
 */

const ports = new Set();

// Начальное глобальное состояние
let globalState = {
    connectionStatus: 'disconnected', // 'connected' | 'disconnected' | 'reconnecting'
    operatorStatus: 'ready',         // 'ready' | 'lunch' | 'dnd' | 'offline'
    activeCall: null,                // { id, state, phoneNumber, startTime } or null
    tabsCount: 0
};

// Экземпляр SSE EventSource
let eventSource = null;
let reconnectTimer = null;

// Константы
const API_BASE = 'http://localhost:8000';
const SSE_URL = `${API_BASE}/api/sip/events`;
const RECONNECT_DELAY = 5000;

/**
 * Подключение к бэкенду через SSE
 */
function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    try {
        eventSource = new EventSource(SSE_URL);

        eventSource.onopen = () => {
            console.log('[SIP-Worker] SSE Connected');
            updateState({ connectionStatus: 'connected' });
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };

        eventSource.onerror = (err) => {
            console.error('[SIP-Worker] SSE Connection Error. State:', eventSource.readyState);
            updateState({ connectionStatus: 'disconnected' });
            eventSource.close();
            eventSource = null;

            // Попытка переподключения
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    console.log('[SIP-Worker] Attempting reconnect...');
                    updateState({ connectionStatus: 'reconnecting' });
                    connectSSE();
                }, RECONNECT_DELAY);
            }
        };

        // --- Слушатели событий ---

        eventSource.addEventListener('status_change', (e) => {
            try {
                const data = JSON.parse(e.data);
                updateState({ operatorStatus: data.status });
            } catch (err) {
                console.error('[SIP-Worker] Parse error on status_change', err);
            }
        });

        eventSource.addEventListener('call_incoming', (e) => {
            try {
                const data = JSON.parse(e.data);
                updateState({
                    activeCall: {
                        id: data.call_id,
                        state: 'incoming',
                        phoneNumber: data.number,
                        startTime: Date.now()
                    }
                });
            } catch (err) {
                console.error('[SIP-Worker] Parse error on call_incoming', err);
            }
        });

        eventSource.addEventListener('call_connected', (e) => {
            if (!globalState.activeCall) return;
            try {
                const data = JSON.parse(e.data);
                updateState({
                    activeCall: {
                        ...globalState.activeCall,
                        state: 'talking',
                        startTime: data.start_time || Date.now()
                    }
                });
            } catch (err) {
                console.error('[SIP-Worker] Parse error on call_connected', err);
            }
        });

        eventSource.addEventListener('call_ended', (e) => {
            updateState({ activeCall: null });
        });

    } catch (e) {
        console.error('[SIP-Worker] Exception setting up SSE', e);
    }
}

/**
 * Обновление глобального состояния и рассылка всем портам
 */
function updateState(updates) {
    globalState = { ...globalState, ...updates };
    broadcast({
        type: 'SYNC_STATE',
        payload: globalState
    });
}

/**
 * Рассылка сообщения всем подключенным портам
 */
function broadcast(message) {
    ports.forEach(port => {
        try {
            port.postMessage(message);
        } catch (e) {
            console.error('[SIP-Worker] Error posting to port', e);
            ports.delete(port);
            // Обновление счетчика вкладок здесь сложнее, так как мы внутри broadcast.
            // Идеально было бы вызвать отдельное обновление.
        }
    });

    // Проверка необходимости обновления счетчика вкладок после очистки broadcast
    if (ports.size !== globalState.tabsCount) {
        // Запланировать обновление на следующем тике, чтобы избежать рекурсии, если вызвано из updateState
        setTimeout(() => {
            updateState({ tabsCount: ports.size });
        }, 0);
    }
}

/**
 * Обработка подключения от вкладки
 */
self.onconnect = (e) => {
    const port = e.ports[0];
    ports.add(port);
    console.log('[SIP-Worker] New connection. Ports:', ports.size);

    // Обновление счетчика вкладок
    updateState({ tabsCount: ports.size });

    if (ports.size === 1 && !eventSource) {
        connectSSE();
    }

    port.onmessage = (event) => {
        const { type, payload } = event.data;
        console.log('[SIP-Worker] Received:', type, payload);

        switch (type) {
            case 'INIT_PORT':
                port.postMessage({ type: 'SYNC_STATE', payload: globalState });
                break;

            case 'CMD_DIAL':
                fetch(`${API_BASE}/api/sip/call/dial`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: payload.phone })
                }).catch(err => console.error('Dial error:', err));

                updateState({
                    activeCall: {
                        id: 'call_' + Date.now(),
                        state: 'dialing',
                        phoneNumber: payload.phone,
                        startTime: Date.now()
                    }
                });
                break;

            case 'CMD_ANSWER':
                fetch(`${API_BASE}/api/sip/call/answer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ call_id: globalState.activeCall?.id })
                }).catch(err => console.error('Answer error:', err));

                if (globalState.activeCall) {
                    updateState({
                        activeCall: {
                            ...globalState.activeCall,
                            state: 'talking',
                            startTime: Date.now()
                        }
                    });
                }
                break;

            case 'CMD_HANGUP':
                fetch(`${API_BASE}/api/sip/call/hangup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ call_id: globalState.activeCall?.id })
                }).catch(err => console.error('Hangup error:', err));

                updateState({ activeCall: null });
                break;

            case 'CMD_STATUS':
                fetch(`${API_BASE}/api/sip/operator/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: payload.status })
                }).catch(err => console.error('Status error:', err));

                updateState({ operatorStatus: payload.status });
                break;

            case 'CMD_DISCONNECT':
                ports.delete(port);
                updateState({ tabsCount: ports.size });
                break;

            default:
                console.warn('[SIP-Worker] Unknown message type:', type);
        }
    };

    port.start();
};

self.onerror = (e) => {
    console.error('[SIP-Worker] Ошибка выполнения', e);
};
