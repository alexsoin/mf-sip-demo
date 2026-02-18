import type { GlobalState } from './worker.types';

const ports = new Set<MessagePort>();

export let globalState: GlobalState = {
    connectionStatus: 'disconnected',
    operatorStatus: 'ready',
    activeCall: null,
    tabsCount: 0
};

/**
 * Обновление глобального состояния и рассылка всем портам
 */
export function updateState(updates: Partial<GlobalState>) {
    globalState = { ...globalState, ...updates };
    broadcast({
        type: 'SYNC_STATE',
        payload: globalState
    });
}

export function addPort(port: MessagePort) {
    ports.add(port);
    updateState({ tabsCount: ports.size });
}

export function removePort(port: MessagePort) {
    ports.delete(port);
    updateState({ tabsCount: ports.size });
}

export function getPortsCount(): number {
    return ports.size;
}

/**
 * Рассылка сообщения всем подключенным портам
 */
function broadcast(message: any) {
    ports.forEach(port => {
        try {
            port.postMessage(message);
        } catch (e) {
            console.error('[SIP-Worker] Error posting to port', e);
            ports.delete(port);
        }
    });

    // Проверка рассинхрона счетчика
    if (ports.size !== globalState.tabsCount) {
        setTimeout(() => {
            updateState({ tabsCount: ports.size });
        }, 0);
    }
}
