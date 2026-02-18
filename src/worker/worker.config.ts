export let apiBase = 'http://localhost:8000'; // Fallback

export const connectionConfig = {
    url: '', // Полный URL для SSE
    login: ''
};

export function setApiBase(url) {
    apiBase = url;
}

export function setConnectionConfig(login, url) {
    connectionConfig.login = login;
    connectionConfig.url = url;
}
