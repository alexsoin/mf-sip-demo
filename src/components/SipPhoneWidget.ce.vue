<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted, watch, getCurrentInstance } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useSipStore } from '../store';
import { useSipWorker } from '../composables/useSipWorker';

// Инициализация Pinia локально для этого компонента
const pinia = createPinia();
setActivePinia(pinia);
const store = useSipStore();
const { initWorker, connectSip, disconnectSip, dial, answer, hangup, setStatus } = useSipWorker();

// Логика таймера
const timerRef = ref(0);
let timerInterval: number | undefined;

const duration = computed(() => {
    if (!store.activeCall?.startTime) return '00:00';
    const seconds = Math.floor((timerRef.value - store.activeCall.startTime) / 1000);
    if (seconds < 0) return 'Подключение...';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
});

onMounted(() => {
  initWorker();

  // Обработчик перед закрытием вкладки
  window.addEventListener('beforeunload', (e) => {
      // Подтверждаем только если это последняя вкладка и мы подключены
      if (store.tabsCount <= 1 && store.connectionStatus === 'connected') {
          e.preventDefault();
          e.returnValue = 'Вы уверены, что хотите выйти? Это приведет к разлогину и завершению звонков.';
      }
  });

  // Обработчик скрытия/выгрузки страницы для логаута
  window.addEventListener('pagehide', () => {
      // Воркер сам обработает закрытие порта при выгрузке страницы, так как порт будет закрыт браузером или onUnmounted
      // Но явный дисконнект в воркер можно не слать, если мы полагаемся на порты.
      // В старом коде был CMD_DISCONNECT. В composable мы закрываем порт.

      if (store.tabsCount <= 1 && store.connectionStatus === 'connected') {
          // Отправка Beacon для надежной доставки при выгрузке
          const url = 'http://localhost:8000/api/auth/logout';
          const success = navigator.sendBeacon(url);
          if (!success) {
               fetch(url, { method: 'POST', keepalive: true });
          }
      }
  });

  timerInterval = setInterval(() => {
      if (store.activeCall?.startTime) {
          timerRef.value = Date.now();
      }
  }, 1000);
});


onUnmounted(() => {
    clearInterval(timerInterval);
});

// Действия
const dialNumber = ref('');
const showStatusMenu = ref(false);

const handleDial = () => {
  if (!dialNumber.value) return;
  dial(dialNumber.value);
};

const handleAnswer = () => {
  answer();
};

const handleHangup = () => {
  hangup();
  dialNumber.value = ''; 
};

const handleSetStatus = (s: string) => {
    setStatus(s);
    showStatusMenu.value = false;
};

const appendDigit = (digit: string) => {
    dialNumber.value += digit;
};
const backspace = () => {
    dialNumber.value = dialNumber.value.slice(0, -1);
};

const statusLabel = computed(() => {
    const map: Record<string, string> = {
        ready: 'Готов',
        lunch: 'Обед',
        dnd: 'Не беспокоить',
        offline: 'Оффлайн'
    };
    return map[store.operatorStatus] || store.operatorStatus;
});

const statusColor = computed(() => {
    const map: Record<string, string> = {
        ready: '#4caf50',
        lunch: '#ff9800',
        dnd: '#f44336',
        offline: '#9e9e9e'
    };
    return map[store.operatorStatus] || '#9e9e9e';
});

// Для отображения экрана подключения
const showConnectScreen = computed(() => {
    return store.connectionStatus === 'disconnected' 
        || store.connectionStatus === 'connecting' 
        || store.connectionStatus === 'reconnecting';
});
const isConnecting = computed(() => store.connectionStatus === 'connecting');
const isReconnecting = computed(() => store.connectionStatus === 'reconnecting');

// Сброс локального состояния при отключении
watch(() => store.connectionStatus, (newStatus) => {
    if (newStatus === 'disconnected') {
        dialNumber.value = '';
        showStatusMenu.value = false;
    }
});

// --- Host Interaction ---
const instance = getCurrentInstance();
// eslint-disable-next-line vue/valid-define-emits
const emit = defineEmits<{
  (e: 'state-changed', payload: any): void
}>();

const emitState = () => {
    const state = {
        connectionStatus: store.connectionStatus,
        operatorStatus: store.operatorStatus,
        activeCall: store.activeCall ? JSON.parse(JSON.stringify(store.activeCall)) : null,
        tabsCount: store.tabsCount
    };
    
    // Vue's defineCustomElement automatically dispatches events declared in emits
    emit('state-changed', state);
};

// Слушаем изменения в сторе и отправляем наружу
watch(() => [store.connectionStatus, store.operatorStatus, store.activeCall, store.tabsCount], () => {
    emitState();
}, { deep: true });

onMounted(() => {
    // Access the host element to attach listeners
    // In defineCustomElement, vnode.el is the shadow root content, so we need to traverse up
    const internalElement = instance?.vnode.el as HTMLElement | undefined;
    const host = (internalElement?.getRootNode() as ShadowRoot)?.host as HTMLElement;

    if (host) {
        host.addEventListener('sip-call', ((e: CustomEvent) => {
            const detail = e.detail;
            if (store.connectionStatus !== 'connected') {
                console.warn('[SipWidget] Cannot dial: Not connected.');
                return;
            }

            if (detail && detail.number) {
                 dial(detail.number);
            }
        }) as EventListener);

        host.addEventListener('sip-request-state', () => {
            emitState();
        });
        
        // Initial state emit
        emitState();
    }
});
// --- Host Interaction END ---

</script>

<template>
  <div class="sip-widget" :class="{ 'has-call': !!store.activeCall }">
    <!-- Header -->
    <div class="header">
        <div class="connection-status" :class="store.connectionStatus" :title="'Статус соединения (Tabs: ' + store.tabsCount + ')'"></div>
        
        <div class="status-dropdown" v-if="!showConnectScreen">
            <button class="status-btn" @click="showStatusMenu = !showStatusMenu">
                <span class="status-dot" :style="{ background: statusColor }"></span>
                {{ statusLabel }}
                <span class="chevron">▼</span>
            </button>
            <div class="status-menu" v-if="showStatusMenu">
                <div class="menu-item" @click="handleSetStatus('ready')"><span class="dot" style="background: #4caf50"></span>Готов</div>
                <div class="menu-item" @click="handleSetStatus('lunch')"><span class="dot" style="background: #ff9800"></span>Обед</div>
                <div class="menu-item" @click="handleSetStatus('dnd')"><span class="dot" style="background: #f44336"></span>Не беспокоить</div>
                <div class="menu-item" @click="handleSetStatus('offline')"><span class="dot" style="background: #9e9e9e"></span>Оффлайн</div>
                <div class="menu-divider"></div>
                <div class="menu-item danger" @click="disconnectSip">
                    <span class="dot" style="background: #fa5252"></span>Отключиться
                </div>
            </div>
        </div>
        <div class="header-title" v-else>
            SIP Phone
        </div>
    </div>

    <!-- Call Panel -->
    <div class="call-panel">
        
        <transition name="fade" mode="out-in">
            <!-- Состояние ПОДКЛЮЧЕНИЯ -->
            <div v-if="showConnectScreen" class="view-connect" key="connect">
                <div class="connect-icon">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                </div>
                <p class="connect-text" v-if="isReconnecting">Потеря связи. Попытка восстановить соединение...</p>
                <p class="connect-text" v-else>Требуется подключение к серверу телефонии</p>
                
                <button class="btn-connect" @click="connectSip" :disabled="isConnecting || isReconnecting">
                    <span v-if="isConnecting">Подключение...</span>
                    <span v-else-if="isReconnecting">Переподключение...</span>
                    <span v-else>Подключиться</span>
                </button>
            </div>

            <!-- Состояние ОЖИДАНИЯ / НАБОРА -->
            <div v-else-if="!store.activeCall" class="view-idle" key="idle">
                <div class="display-area">
                    <input 
                        v-model="dialNumber" 
                        placeholder="Введите номер..." 
                        @keyup.enter="handleDial" 
                        class="number-input"
                    />
                    <button v-if="dialNumber" @click="backspace" class="btn-backspace">⌫</button>
                </div>
                
                <div class="keypad">
                    <button v-for="n in ['1','2','3','4','5','6','7','8','9','*','0','#']" :key="n" @click="appendDigit(n)" class="key">
                        {{ n }}
                    </button>
                </div>

                <div class="actions-row">
                    <button @click="handleDial" :disabled="!dialNumber" class="btn-call">
                        <!-- Исправленная иконка телефона (трубка под углом) -->
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 .55 0 .45 2.14.25 3.32-.24.64 0 1.09-.32 1.34l-2.2 2.2z"/></svg>
                    </button>
                </div>
            </div>

            <!-- Состояние ВХОДЯЩЕГО звонка -->
            <div v-else-if="store.activeCall.state === 'incoming'" class="view-incoming" key="incoming">
                <div class="avatar-placeholder">{{ store.activeCall.phoneNumber[0] || '?' }}</div>
                <div class="caller-name">Неизвестный</div>
                <div class="caller-number">{{ store.activeCall.phoneNumber }}</div>
                <div class="incoming-label">Входящий звонок...</div>
                
                <div class="call-actions">
                    <button class="btn-action btn-hangup" @click="handleHangup">
                         <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.7-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                    </button>
                    <button class="btn-action btn-answer" @click="handleAnswer">
                         <!-- Исправленная иконка телефона -->
                         <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 .55 0 .45 2.14.25 3.32-.24.64 0 1.09-.32 1.34l-2.2 2.2z"/></svg>
                    </button>
                </div>
            </div>

            <!-- Состояние РАЗГОВОРА / НАБОРА -->
            <div v-else class="view-active" key="active">
                 <div class="avatar-placeholder small">{{ store.activeCall.phoneNumber[0] || '?' }}</div>
                 <div class="status-text blink" v-if="store.activeCall.state === 'dialing'">Набор номера...</div>
                 <div class="status-text" v-else>Разговор</div>
                 
                 <div class="call-number">{{ store.activeCall.phoneNumber }}</div>
                 <div class="timer" v-if="store.activeCall.state === 'talking'">{{ duration }}</div>
                 
                 <div class="call-actions">
                     <button class="btn-action btn-hangup" @click="handleHangup">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.7-.29L.29 13.08a.956.956 0 01-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                     </button>
                 </div>
            </div>

        </transition>

    </div>
  </div>
</template>

<style lang="scss">
@use "sass:color";

:host {
    all: initial;
    display: block;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
}

/* Переменные */
$bg-color: #1a1b1e;
$surface-color: #25262b;
$primary-color: #228be6;
$success-color: #40c057;
$danger-color: #fa5252;
$text-color: #e9ecef;
$text-dim: #909296;

.sip-widget {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    width: 280px;
    background: $bg-color;
    color: $text-color;
    border-radius: 16px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05);
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.header {
    background: rgba(255,255,255,0.03);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}

.connection-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $text-dim;
    transition: background 0.3s;
    
    &.connected { background: $success-color; box-shadow: 0 0 8px rgba($success-color, 0.4); }
    &.reconnecting { background: #fab005; }
    &.disconnected { background: $danger-color; }
}

/* Выпадающий список статуса */
.status-dropdown {
    position: relative;
}

.status-btn {
    background: transparent;
    border: none;
    color: $text-color;
    cursor: pointer;
    font-size: 0.9em;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    
    &:hover { background: rgba(255,255,255,0.05); }
    
    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }
    
    .chevron { font-size: 0.7em; opacity: 0.5; }
}

.status-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    background: $surface-color;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 4px;
    width: 120px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10;
    
    .menu-item {
        padding: 8px 12px;
        font-size: 0.9em;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 4px;
        
        &:hover { background: rgba(255,255,255,0.05); }
        
        
        .dot { width: 6px; height: 6px; border-radius: 50%; }
        
        &.danger {
            color: $danger-color;
            &:hover { background: rgba($danger-color, 0.1); }
        }
    }
    
    .menu-divider {
        height: 1px;
        background: rgba(255,255,255,0.05);
        margin: 4px 0;
    }
}

/* Макеты */
.call-panel {
    min-height: 320px;
    display: flex;
    flex-direction: column;
}

.view-idle, .view-incoming, .view-active {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
}

/* Состояние ожидания */
.display-area {
    display: flex;
    align-items: center;
    background: rgba(0,0,0,0.2);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 20px;
    border: 1px solid rgba(255,255,255,0.05);
    
    &:focus-within { border-color: $primary-color; }
}

.number-input {
    flex: 1;
    background: transparent;
    border: none;
    color: white;
    font-size: 1.2em;
    outline: none;
    width: 100%;
    
    &::placeholder { color: rgba(255,255,255,0.2); font-size: 0.8em; }
}

.btn-backspace {
    background: transparent;
    border: none;
    color: $text-dim;
    cursor: pointer;
    font-size: 1.2em;
    padding: 0 4px;
    &:hover { color: $text-color; }
}

.keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 24px;
}

.key {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.02);
    color: $text-color;
    font-size: 1.4em;
    padding: 12px 0;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.1s;
    user-select: none;
    
    &:active { background: rgba(255,255,255,0.1); transform: scale(0.95); }
    &:hover { background: rgba(255,255,255,0.06); }
}

.actions-row {
    display: flex;
    justify-content: center;
}

.btn-call {
    background: $success-color;
    color: white;
    border: none;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba($success-color, 0.4);
    transition: all 0.2s;
    
    &:disabled { background: $surface-color; color: $text-dim; box-shadow: none; cursor: not-allowed; }
    &:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba($success-color, 0.5); }
    &:not(:disabled):active { transform: translateY(0); }
}

/* Общие стили для входящего/активного звонка */
.avatar-placeholder {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-color, color.scale($primary-color, $lightness: -10%));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5em;
    font-weight: bold;
    margin: 0 auto 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    
    &.small { width: 60px; height: 60px; font-size: 1.8em; }
}

.caller-name {
    font-size: 1.1em;
    font-weight: 600;
    text-align: center;
    margin-bottom: 4px;
}

.caller-number {
    color: $text-dim;
    text-align: center;
    margin-bottom: 8px;
}

.incoming-label {
    text-align: center;
    color: $primary-color;
    font-size: 0.9em;
    margin-bottom: 32px;
    animation: blink 2s infinite;
}

.status-text {
    text-align: center;
    margin-bottom: 8px;
    font-size: 0.9em;
    color: $success-color;
    
    &.blink { animation: blink 1.5s infinite; color: $text-dim; }
}

.timer {
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.4em;
    color: $text-color;
    margin-top: 8px;
    margin-bottom: 32px;
}

.call-actions {
    display: flex;
    justify-content: center;
    gap: 32px;
    margin-top: auto;
    padding-bottom: 16px;
}

.btn-action {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: white;
    transition: transform 0.2s;
    
    &:hover { transform: scale(1.1); }
    &:active { transform: scale(0.95); }
    
    &.btn-answer { background: $success-color; box-shadow: 0 4px 12px rgba($success-color, 0.4); }
    &.btn-hangup { background: $danger-color; box-shadow: 0 4px 12px rgba($danger-color, 0.4); }
}

/* Анимации */
@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Экран подключения */
.view-connect {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 20px;
}

.connect-icon {
    margin-bottom: 16px;
    color: $primary-color;
    animation: pulse 2s infinite;
}

.connect-text {
    margin-bottom: 24px;
    color: $text-dim;
    font-size: 0.9em;
}

.btn-connect {
    background: $primary-color;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    
    &:disabled { opacity: 0.7; cursor: not-allowed; }
    &:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba($primary-color, 0.4); }
}

.header-title {
    font-weight: 600;
    font-size: 0.95em;
    color: $text-color;
}

@keyframes pulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
}
</style>
