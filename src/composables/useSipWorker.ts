import { ref, onUnmounted } from 'vue';
import { useSipStore } from '../store';

export function useSipWorker() {
    const store = useSipStore();
    const worker = ref<SharedWorker | null>(null);
    const port = ref<MessagePort | null>(null);

    const initWorker = () => {
        try {
            worker.value = new SharedWorker(new URL('../sip-worker.js', import.meta.url), { type: 'module' });
            port.value = worker.value.port;

            port.value.onmessage = (event) => {
                const { type, payload } = event.data;
                if (type === 'SYNC_STATE') {
                    store.syncState(payload);
                    // Если получили состояние, значит мы подключены к воркеру
                    // Проверяем, подключен ли воркер к SSE, если нет - можно инициировать?
                    // Нет, это должно быть явным действием пользователя или авто-подключением если уже были подключены.
                    // Но задача говорит "не должно происходить соединение с SSE при открытии страницы".
                }
            };

            port.value.start();
            port.value.postMessage({ type: 'INIT_PORT' });
        } catch (e) {
            console.error('Failed to init SharedWorker:', e);
        }
    };

    const disconnectWorker = () => {
        if (port.value) {
            port.value.postMessage({ type: 'CMD_DISCONNECT' });
            port.value.close();
        }
    };

    // Отправка команд
    const sendCmd = (type: string, payload: any = {}) => {
        port.value?.postMessage({ type, payload });
    };

    const connectSip = () => {
        const login = import.meta.env.VITE_SIP_USER_LOGIN;
        const apiDomain = import.meta.env.VITE_SIP_API_DOMAIN;

        if (!login || !apiDomain) {
            console.error('Missing VITE_SIP_USER_LOGIN or VITE_SIP_API_DOMAIN in env');
            return;
        }

        // Предполагаем http по умолчанию, если не указан протокол
        let baseUrl = apiDomain;
        if (!baseUrl.startsWith('http')) {
            baseUrl = `http://${baseUrl}`;
        }
        // Удаляем trailing slash если есть
        baseUrl = baseUrl.replace(/\/$/, '');

        sendCmd('CMD_CONNECT_SSE', {
            login,
            domain: baseUrl
        });
    };

    const disconnectSip = () => sendCmd('CMD_DISCONNECT_SSE');

    const dial = (phone: string) => sendCmd('CMD_DIAL', { phone });
    const answer = () => sendCmd('CMD_ANSWER');
    const hangup = () => sendCmd('CMD_HANGUP');
    const setStatus = (status: string) => sendCmd('CMD_STATUS', { status });

    onUnmounted(() => {
        if (port.value) {
            port.value.close();
        }
    });

    return {
        initWorker,
        disconnectWorker,
        connectSip,
        disconnectSip,
        dial,
        answer,
        hangup,
        setStatus
    };
}
