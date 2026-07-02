<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useTerritoireStore } from '@/stores/territoire'

marked.setOptions({ breaks: true })

function renderMd(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string)
}

const store = useTerritoireStore()

const API = 'http://localhost:3000'

interface Message {
  role: 'user' | 'assistant'
  text: string
  isAnalysis?: boolean
}

const messages = ref<Message[]>([])
const input = ref('')
const loading = ref(false)
const scrollEl = ref<HTMLElement | null>(null)

const sessionId = store.selected?.code
  ? `${store.selected.code}-${store.data?.annee ?? 'chat'}`
  : 'default'

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(`${API}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: store.data,
        sessionId,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    messages.value = [{ role: 'assistant', text: json.response, isAnalysis: true }]
  } catch (e) {
    messages.value = [{
      role: 'assistant',
      text: `Impossible de contacter le serveur IA (localhost:3000).\nVérifiez que le chatbot tourne : node local-server.js`,
      isAnalysis: true,
    }]
  } finally {
    loading.value = false
  }
  await scrollToBottom()
})

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
      body: JSON.stringify({ message: text, sessionId }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    messages.value.push({ role: 'assistant', text: json.response })
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      text: `Erreur serveur IA : ${e instanceof Error ? e.message : 'inconnue'}`,
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
  <Transition name="ai-fade">
    <div class="ai-backdrop" @click.self="store.closeAiChat()">
      <div class="ai-modal" role="dialog" aria-label="Assistant IA fiscal">

        <header class="ai-header">
          <div class="ai-header-left">
            <div class="ai-avatar">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.2"/>
                <circle cx="5.5" cy="6.5" r="1" fill="currentColor"/>
                <circle cx="10.5" cy="6.5" r="1" fill="currentColor"/>
                <path d="M4.5 10C5 11 6.3 11.5 8 11.5s3-.5 3.5-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </div>
            <div>
              <h2 class="ai-title">Assistant fiscal</h2>
              <p class="ai-sub">Géofiscal IA · REI / DGFiP</p>
            </div>
          </div>
          <button class="ai-close" aria-label="Fermer" @click="store.closeAiChat()">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <div class="ai-divider" />

        <div ref="scrollEl" class="ai-messages">
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="msg-row"
            :class="`msg-row--${msg.role}`"
          >
            <div
              class="msg-bubble"
              :class="[`msg-bubble--${msg.role}`, { 'msg-bubble--analysis': msg.isAnalysis }]"
              v-html="renderMd(msg.text)"
            />
          </div>

          <div v-if="loading" class="msg-row msg-row--assistant">
            <div class="msg-bubble msg-bubble--assistant msg-bubble--typing">
              <span class="dot" /><span class="dot" /><span class="dot" />
            </div>
          </div>
        </div>

        <div class="ai-divider" />

        <div class="ai-input-row">
          <textarea
            v-model="input"
            class="ai-input"
            placeholder="Ex : Comparez le taux CFE avec la médiane nationale…"
            rows="1"
            :disabled="loading"
            @keydown="onKeydown"
          />
          <button
            class="ai-send"
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
/* ─── Transition ─────────────────────────────────────────────────────────── */
.ai-fade-enter-active {
  transition: opacity 220ms ease;
}
.ai-fade-leave-active {
  transition: opacity 180ms ease;
}
.ai-fade-enter-active .ai-modal {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease;
}
.ai-fade-leave-active .ai-modal {
  transition: transform 180ms ease-in, opacity 180ms ease;
}
.ai-fade-enter-from,
.ai-fade-leave-to {
  opacity: 0;
}
.ai-fade-enter-from .ai-modal,
.ai-fade-leave-to .ai-modal {
  transform: scale(0.96);
  opacity: 0;
}

/* ─── Backdrop ───────────────────────────────────────────────────────────── */
.ai-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(22, 8, 14, 0.52);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
.ai-modal {
  width: 560px;
  max-width: calc(100vw - 40px);
  max-height: 85vh;
  background: #FFFCFC;
  border-radius: 20px;
  box-shadow: 0 8px 60px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(240, 62, 142, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Header ─────────────────────────────────────────────────────────────── */
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 14px;
  gap: 10px;
  flex-shrink: 0;
}

.ai-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(240, 62, 142, 0.08);
  border: 1px solid rgba(240, 62, 142, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--shell-accent);
  flex-shrink: 0;
}

.ai-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
}

.ai-sub {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 3px;
  letter-spacing: 0.04em;
}

.ai-close {
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
.ai-close:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

/* ─── Divider ────────────────────────────────────────────────────────────── */
.ai-divider {
  height: 1px;
  background: var(--border-light);
  flex-shrink: 0;
}

/* ─── Messages ───────────────────────────────────────────────────────────── */
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.msg-row { display: flex; }
.msg-row--user      { justify-content: flex-end; }
.msg-row--assistant { justify-content: flex-start; }

.msg-bubble {
  max-width: 88%;
  padding: 9px 13px;
  border-radius: 12px;
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.55;
}

.msg-bubble--user {
  background: rgba(240, 62, 142, 0.08);
  border: 1px solid rgba(240, 62, 142, 0.18);
  color: var(--text-primary);
  border-bottom-right-radius: 3px;
}

.msg-bubble--assistant {
  background: #F9F4F7;
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  border-bottom-left-radius: 3px;
}

.msg-bubble--analysis {
  font-size: 12.5px;
  max-width: 100%;
  background: rgba(240, 62, 142, 0.03);
  border-color: rgba(240, 62, 142, 0.12);
  color: var(--text-primary);
  line-height: 1.65;
}

/* Markdown rendered content */
.msg-bubble :deep(h1),
.msg-bubble :deep(h2),
.msg-bubble :deep(h3) {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  margin: 10px 0 4px;
  line-height: 1.25;
}
.msg-bubble :deep(h1) { font-size: 15px; }
.msg-bubble :deep(h2) { font-size: 13.5px; }
.msg-bubble :deep(h3) { font-size: 12.5px; }
.msg-bubble :deep(p) { margin: 4px 0; }
.msg-bubble :deep(p:first-child) { margin-top: 0; }
.msg-bubble :deep(p:last-child)  { margin-bottom: 0; }
.msg-bubble :deep(strong) { font-weight: 600; color: var(--text-primary); }
.msg-bubble :deep(code) {
  font-family: var(--font-data);
  font-size: 11.5px;
  background: rgba(240, 62, 142, 0.08);
  border: 1px solid rgba(240, 62, 142, 0.14);
  border-radius: 4px;
  padding: 1px 5px;
}
.msg-bubble :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 12px;
}
.msg-bubble :deep(th) {
  background: rgba(240, 62, 142, 0.07);
  color: var(--text-primary);
  font-weight: 600;
  padding: 5px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-muted);
}
.msg-bubble :deep(td) {
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
}
.msg-bubble :deep(tr:last-child td) { border-bottom: none; }
.msg-bubble :deep(ul),
.msg-bubble :deep(ol) { margin: 4px 0; padding-left: 18px; }
.msg-bubble :deep(li) { margin: 2px 0; }
.msg-bubble :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-light);
  margin: 8px 0;
}
.msg-bubble :deep(blockquote) {
  border-left: 3px solid rgba(240, 62, 142, 0.4);
  margin: 6px 0;
  padding: 4px 10px;
  color: var(--text-muted);
  font-style: italic;
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

/* ─── Input ──────────────────────────────────────────────────────────────── */
.ai-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 14px 14px;
  flex-shrink: 0;
}

.ai-input {
  flex: 1;
  background: #F5EDF2;
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
.ai-input::placeholder { color: var(--text-muted); }
.ai-input:focus { border-color: rgba(240, 62, 142, 0.4); }
.ai-input:disabled { opacity: 0.5; }

.ai-send {
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
  transition: opacity 150ms ease;
}
.ai-send:disabled { opacity: 0.35; cursor: default; }
.ai-send:not(:disabled):hover { opacity: 0.85; }

/* ─── Markdown content ───────────────────────────────────────────────────── */
.msg-bubble :deep(p) { margin: 0 0 8px; }
.msg-bubble :deep(p:last-child) { margin-bottom: 0; }
.msg-bubble :deep(strong) { font-weight: 600; color: var(--text-primary); }
.msg-bubble :deep(em) { font-style: italic; }
.msg-bubble :deep(h1), .msg-bubble :deep(h2), .msg-bubble :deep(h3) {
  font-family: var(--font-display); font-weight: 500; letter-spacing: -0.01em;
  color: var(--text-primary); margin: 12px 0 6px;
}
.msg-bubble :deep(h1) { font-size: 15px; }
.msg-bubble :deep(h2) { font-size: 13px; }
.msg-bubble :deep(h3) { font-size: 12px; }
.msg-bubble :deep(h1:first-child), .msg-bubble :deep(h2:first-child), .msg-bubble :deep(h3:first-child) { margin-top: 0; }
.msg-bubble :deep(ul), .msg-bubble :deep(ol) { padding-left: 18px; margin: 4px 0 8px; }
.msg-bubble :deep(li) { margin-bottom: 3px; }
.msg-bubble :deep(li:last-child) { margin-bottom: 0; }
.msg-bubble :deep(code) {
  font-family: var(--font-data); font-size: 11px;
  background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 4px;
}
.msg-bubble :deep(pre) {
  background: rgba(0,0,0,0.05); border-radius: 6px; padding: 10px 12px;
  overflow-x: auto; margin: 6px 0;
}
.msg-bubble :deep(pre code) { background: none; padding: 0; font-size: 11px; }
.msg-bubble :deep(table) {
  border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 11px;
}
.msg-bubble :deep(th) {
  font-family: var(--font-ui); font-weight: 600; font-size: 10px;
  letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted);
  border-bottom: 1px solid var(--border-light); padding: 5px 8px; text-align: left;
}
.msg-bubble :deep(td) {
  font-family: var(--font-data); padding: 5px 8px;
  border-bottom: 1px solid var(--border-light); color: var(--text-primary);
}
.msg-bubble :deep(tr:last-child td) { border-bottom: none; }
.msg-bubble :deep(tr:nth-child(even) td) { background: rgba(0,0,0,0.02); }
.msg-bubble :deep(blockquote) {
  border-left: 2px solid rgba(240,62,142,0.3); padding-left: 10px;
  margin: 6px 0; color: var(--text-secondary);
}
.msg-bubble :deep(hr) { border: none; border-top: 1px solid var(--border-light); margin: 10px 0; }
</style>
