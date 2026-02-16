import { defineCustomElement } from 'vue'
import SipPhoneWidget from './components/SipPhoneWidget.ce.vue'
import './style.css'

const SipPhoneWidgetElement = defineCustomElement(SipPhoneWidget)
customElements.define('sip-phone-widget', SipPhoneWidgetElement)
