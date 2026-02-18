import { defineStore } from 'pinia';
import type { GlobalState } from './worker/worker.types';

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
    }
});
