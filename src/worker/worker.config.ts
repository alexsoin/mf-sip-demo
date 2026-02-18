import type { ConnectionConfig } from './worker.types';

export let apiBase: string = 'http://localhost:8000'; // Fallback

export const connectionConfig: ConnectionConfig = {
    url: '', // Полный URL для SSE
    login: ''
};

export function setApiBase(url: string) {
    apiBase = url;
}

export function setConnectionConfig(login: string, url: string) {
    connectionConfig.login = login;
    connectionConfig.url = url;
}
