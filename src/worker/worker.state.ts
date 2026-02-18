const ports = new Set();

export let globalState = {
    connectionStatus: 'disconnected', // 'connected' | 'disconnected' | 'reconnecting'
    operatorStatus: 'ready',         // 'ready' | 'lunch' | 'dnd' | 'offline'
    activeCall: null,                // { id, state, phoneNumber, startTime } or null
    tabsCount: 0
};

/**
 * Обновление глобального состояния и рассылка всем портам
 */
export function updateState(updates) {
    globalState = { ...globalState, ...updates };
    broadcast({
        type: 'SYNC_STATE',
        payload: globalState
    });
}

export function addPort(port) {
    ports.add(port);
    updateState({ tabsCount: ports.size });
}

export function removePort(port) {
    ports.delete(port);
    updateState({ tabsCount: ports.size });
}

export function getPortsCount() {
    return ports.size;
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
        }
    });

    // Проверка рассинхрона счетчика
    if (ports.size !== globalState.tabsCount) {
        setTimeout(() => {
            updateState({ tabsCount: ports.size });
        }, 0);
    }
}
