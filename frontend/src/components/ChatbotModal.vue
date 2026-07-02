<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true })
function renderMd(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string)
}

const emit = defineEmits<{ close: [] }>()

const API = 'http://localhost:3000'
const SESSION_ID = 'chatbot-modal'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

const messages = ref<Message[]>([
  {
    role: 'assistant',
    text: 'Bonjour ! Posez-moi une question sur la fiscalité locale d\'une commune, d\'un EPCI ou comparez des territoires.',
  },
])
const input = ref('')
const loading = ref(false)
const scrollEl = ref<HTMLElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', text })
  input.value = ''
  loading.value = true
  await scrollToBottom()

  try {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: SESSION_ID }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    messages.value.push({ role: 'assistant', text: json.response })
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      text: `Erreur serveur IA : ${e instanceof Error ? e.message : 'inconnue'}. Vérifiez que node local-server.js tourne sur le port 3000.`,
    })
  }

  loading.value = false
  await scrollToBottom()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <Transition name="modal">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Assistant fiscal">
        <div class="modal-accent-bar" />

        <header class="modal-header">
          <div class="modal-header-left">
            <div class="modal-avatar">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.2"/>
                <path d="M5 9.5C5.5 10.5 6.6 11 8 11s2.5-.5 3-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <circle cx="5.5" cy="7" r="0.8" fill="currentColor"/>
                <circle cx="10.5" cy="7" r="0.8" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <h2 class="modal-title">Assistant fiscal</h2>
              <p class="modal-sub">Loré IA · données REI / DGFiP</p>
            </div>
          </div>
          <button class="modal-close" aria-label="Fermer" @click="emit('close')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <div class="modal-divider" />

        <div ref="scrollEl" class="messages">
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="msg-row"
            :class="`msg-row--${msg.role}`"
          >
            <div
              class="msg-bubble"
              :class="`msg-bubble--${msg.role}`"
              v-html="renderMd(msg.text)"
            />
          </div>

          <div v-if="loading" class="msg-row msg-row--assistant">
            <div class="msg-bubble msg-bubble--assistant msg-bubble--typing">
              <span class="dot" /><span class="dot" /><span class="dot" />
            </div>
          </div>
        </div>

        <div class="modal-divider" />

        <div class="input-row">
          <textarea
            v-model="input"
            class="chat-input"
            placeholder="Ex : Quel est le taux de TFB à Lyon en 2025 ?"
            rows="1"
            :disabled="loading"
            @keydown="onKeydown"
          />
          <button
            class="send-btn"
            :disabled="!input.trim() || loading"
            aria-label="Envoyer"
            @click="send"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M13 7.5L2 2l2.5 5.5L2 13l11-5.5z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active {
  transition: opacity 280ms ease;
}
.modal-enter-active .modal-panel {
  transition: opacity 280ms ease, transform 360ms cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-leave-active {
  transition: opacity 180ms ease;
}
.modal-leave-active .modal-panel {
  transition: opacity 140ms ease-in, transform 140ms ease-in;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  opacity: 0;
  transform: translateY(20px) scale(0.97);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(10, 15, 28, 0.5);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 24px;
  padding-bottom: 96px;
}

.modal-panel {
  position: relative;
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.2);
  width: 420px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-accent-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--shell-accent) 0%, rgba(240,62,142,0.2) 100%);
  z-index: 1;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 22px 16px;
  gap: 12px;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 11px;
}

.modal-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(240, 62, 142, 0.1);
  border: 1px solid rgba(240, 62, 142, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-gold);
  flex-shrink: 0;
}

.modal-title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
}

.modal-sub {
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 3px;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--text-muted);
  border-radius: 8px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.modal-close:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.modal-divider {
  height: 1px;
  background: var(--border-light);
  flex-shrink: 0;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.msg-row {
  display: flex;
}

.msg-row--user {
  justify-content: flex-end;
}

.msg-row--assistant {
  justify-content: flex-start;
}

.msg-bubble {
  max-width: 80%;
  padding: 9px 13px;
  border-radius: 12px;
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.5;
}

.msg-bubble--user {
  background: rgba(240, 62, 142, 0.12);
  border: 1px solid rgba(240, 62, 142, 0.22);
  color: var(--text-primary);
  border-bottom-right-radius: 3px;
}

.msg-bubble--assistant {
  background: var(--chip-bg);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  border-bottom-left-radius: 3px;
}

.msg-bubble--typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 11px 16px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: bounce 1.2s ease-in-out infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30%           { transform: translateY(-5px); }
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 14px 14px;
}

.chat-input {
  flex: 1;
  background: var(--chip-bg);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 9px 12px;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-primary);
  resize: none;
  outline: none;
  line-height: 1.45;
  min-height: 38px;
  max-height: 100px;
  transition: border-color 150ms ease;
}
.chat-input::placeholder {
  color: var(--text-muted);
}
.chat-input:focus {
  border-color: rgba(240, 62, 142, 0.4);
}
.chat-input:disabled {
  opacity: 0.5;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--shell-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 150ms ease, background 150ms ease;
}
.send-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.send-btn:not(:disabled):hover {
  background: var(--text-gold);
}
</style>
