import { connectionConfig } from './worker.config';
import { updateState, globalState } from './worker.state';
import { apiLogout } from './worker.api';

let eventSource: EventSource | null = null;
let reconnectTimer: number | null = null;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;

export function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    if (!connectionConfig.url || !connectionConfig.login) {
        console.error('[SIP-Worker] Missing connection config');
        updateState({ connectionStatus: 'disconnected' });
        return;
    }

    try {
        const url = new URL(connectionConfig.url);
        url.searchParams.append('login', connectionConfig.login);

        console.log('[SIP-Worker] Connecting to SSE:', url.toString());
        eventSource = new EventSource(url.toString());

        updateState({ connectionStatus: 'connecting' });

        eventSource.onopen = () => {
            console.log('[SIP-Worker] SSE Connected');
            updateState({ connectionStatus: 'connected' });
            reconnectAttempts = 0;
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };

        eventSource.onerror = (err) => {
            console.error('[SIP-Worker] SSE Connection Error:', err, 'State:', eventSource?.readyState);
            eventSource?.close();
            eventSource = null;

            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.error('[SIP-Worker] Max reconnect attempts reached. Giving up.');
                updateState({
                    connectionStatus: 'disconnected',
                    activeCall: null,
                    operatorStatus: 'offline'
                });
                reconnectAttempts = 0;
                return;
            }

            updateState({ connectionStatus: 'reconnecting' });

            if (!reconnectTimer) {
                reconnectAttempts++;
                console.log(`[SIP-Worker] Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    connectSSE();
                }, RECONNECT_DELAY);
            }
        };

        // Слушатели событий
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

        eventSource.addEventListener('call_ended', () => {
            updateState({ activeCall: null });
        });

    } catch (e) {
        console.error('[SIP-Worker] Exception setting up SSE', e);
        updateState({ connectionStatus: 'disconnected' });
    }
}

export function disconnectSSE() {
    console.log('[SIP-Worker] Disconnecting SSE manually');

    // Сообщаем серверу о выходе
    apiLogout();

    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectAttempts = 0;
    updateState({
        connectionStatus: 'disconnected',
        activeCall: null,
        operatorStatus: 'offline'
    });
}

export function resetReconnectAttempts() {
    reconnectAttempts = 0;
}
