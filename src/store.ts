import { defineStore } from 'pinia';

export interface CallState {
    id: string;
    state: 'incoming' | 'talking' | 'dialing' | null;
    phoneNumber: string;
    startTime: number;
}

export interface GlobalState {
    connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
    operatorStatus: 'ready' | 'lunch' | 'dnd' | 'offline';
    activeCall: CallState | null;
    tabsCount: number;
}

export const useSipStore = defineStore('sip', {
    state: (): GlobalState => ({
        connectionStatus: 'disconnected',
        operatorStatus: 'ready',
        activeCall: null,
        tabsCount: 1,
    }),
    actions: {
        // Это действие вызывается ТОЛЬКО при получении SYNC_STATE от воркера
        syncState(payload: GlobalState) {
            if (!payload) return;
            this.connectionStatus = payload.connectionStatus;
            this.operatorStatus = payload.operatorStatus;
            this.activeCall = payload.activeCall;
            this.tabsCount = payload.tabsCount || 1;
        },

        // Действия, отправляющие команды воркеру
        // Фактическое обновление состояния зависит от возврата SYNC_STATE от воркера
        // Однако воркер может оптимистично обновить и отправить sync.
        // Мы НЕ обновляем локальное состояние здесь напрямую, чтобы обеспечить единственный источник истины.
    }
});
