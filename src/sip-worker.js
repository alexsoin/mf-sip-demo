/**
 * Shared Worker SIP-телефона
 * Entry point that coordinates state, config, SSE, and API modules.
 */

import { globalState, addPort, removePort } from './worker/state.js';
import { setApiBase, setConnectionConfig } from './worker/config.js';
import { connectSSE, disconnectSSE, resetReconnectAttempts } from './worker/sse.js';
import { apiDial, apiAnswer, apiHangup, apiSetStatus } from './worker/api.js';

self.onconnect = (e) => {
    const port = e.ports[0];
    addPort(port);
    console.log('[SIP-Worker] New connection. Ports:', globalState.tabsCount);

    port.onmessage = (event) => {
        const { type, payload } = event.data;
        console.log('[SIP-Worker] Received:', type, payload);

        switch (type) {
            case 'INIT_PORT':
                port.postMessage({ type: 'SYNC_STATE', payload: globalState });
                break;

            case 'CMD_CONNECT_SSE':
                if (payload.login && payload.domain) {
                    setConnectionConfig(payload.login, `${payload.domain}/api/sip/events`);
                    setApiBase(payload.domain);

                    resetReconnectAttempts();
                    connectSSE();
                } else {
                    console.error('[SIP-Worker] CMD_CONNECT_SSE missing login or domain');
                }
                break;

            case 'CMD_DIAL':
                apiDial(payload.phone);
                break;

            case 'CMD_ANSWER':
                apiAnswer();
                break;

            case 'CMD_HANGUP':
                apiHangup();
                break;

            case 'CMD_STATUS':
                apiSetStatus(payload.status);
                break;

            case 'CMD_DISCONNECT_SSE':
                disconnectSSE();
                break;

            case 'CMD_DISCONNECT':
                removePort(port);
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

