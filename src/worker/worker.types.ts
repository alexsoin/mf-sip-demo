export interface SipCall {
    id: string;
    state: 'dialing' | 'incoming' | 'talking' | 'ended';
    phoneNumber: string;
    startTime: number;
}

export type OperatorStatus = 'ready' | 'lunch' | 'dnd' | 'offline';
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'connecting';

export interface GlobalState {
    connectionStatus: ConnectionStatus;
    operatorStatus: OperatorStatus;
    activeCall: SipCall | null;
    tabsCount: number;
}

export interface WorkerMessage {
    type: string;
    payload?: any;
}

export interface ConnectionConfig {
    url: string;
    login: string;
}
