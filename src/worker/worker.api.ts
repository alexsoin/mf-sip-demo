import { apiBase } from './config.js';
import { globalState, updateState } from './state.js';

export function apiDial(phone) {
    fetch(`${apiBase}/api/sip/call/dial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
    }).catch(err => console.error('Dial error:', err));

    updateState({
        activeCall: {
            id: 'call_' + Date.now(),
            state: 'dialing',
            phoneNumber: phone,
            startTime: Date.now()
        }
    });
}

export function apiAnswer() {
    fetch(`${apiBase}/api/sip/call/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: globalState.activeCall?.id })
    }).catch(err => console.error('Answer error:', err));

    if (globalState.activeCall) {
        updateState({
            activeCall: {
                ...globalState.activeCall,
                state: 'talking',
                startTime: Date.now()
            }
        });
    }
}

export function apiHangup() {
    fetch(`${apiBase}/api/sip/call/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: globalState.activeCall?.id })
    }).catch(err => console.error('Hangup error:', err));

    updateState({ activeCall: null });
}

export function apiSetStatus(status) {
    fetch(`${apiBase}/api/sip/operator/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    }).catch(err => console.error('Status error:', err));

    updateState({ operatorStatus: status });
}

export function apiLogout() {
    fetch(`${apiBase}/api/auth/logout`, {
        method: 'POST'
    }).catch(err => console.error('Logout error:', err));
}
