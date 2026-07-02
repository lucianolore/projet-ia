<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ChatbotModal from '@/components/ChatbotModal.vue'

const chatOpen = ref(false)

const STORAGE_KEY = 'lore-chat-fab-pos'
const FAB_SIZE = 52

const pos = ref({ x: 0, y: 0 })
let dragStart = { mx: 0, my: 0, px: 0, py: 0 }
let didDrag = false

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function defaultPos() {
  return { x: window.innerWidth - 132, y: window.innerHeight - 80 }
}

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const p = JSON.parse(saved)
      pos.value = {
        x: clamp(p.x, 0, window.innerWidth - FAB_SIZE),
        y: clamp(p.y, 0, window.innerHeight - FAB_SIZE),
      }
    } catch {
      pos.value = defaultPos()
    }
  } else {
    pos.value = defaultPos()
  }
})

function startDrag(mx: number, my: number) {
  didDrag = false
  dragStart = { mx, my, px: pos.value.x, py: pos.value.y }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
}

function moveDrag(mx: number, my: number) {
  const dx = mx - dragStart.mx
  const dy = my - dragStart.my
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag = true
  pos.value = {
    x: clamp(dragStart.px + dx, 0, window.innerWidth - FAB_SIZE),
    y: clamp(dragStart.py + dy, 0, window.innerHeight - FAB_SIZE),
  }
}

function endDrag() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pos.value))
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
}

function onMouseDown(e: MouseEvent) {
  e.preventDefault()
  startDrag(e.clientX, e.clientY)
}

function onMouseMove(e: MouseEvent) { moveDrag(e.clientX, e.clientY) }
function onMouseUp() { endDrag() }

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  if (!t) return
  startDrag(t.clientX, t.clientY)
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault()
  const t = e.touches[0]
  if (!t) return
  moveDrag(t.clientX, t.clientY)
}

function onTouchEnd() { endDrag() }

function onClick() {
  if (!didDrag) chatOpen.value = true
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
})
</script>

<template>
  <RouterView />

  <button
    class="chat-fab"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    aria-label="Assistant fiscal"
    @mousedown="onMouseDown"
    @touchstart.passive="onTouchStart"
    @click="onClick"
  >
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 2C6.03 2 2 5.8 2 10.5c0 2.1.78 4 2.07 5.5L3 20l4.36-1.3A9.3 9.3 0 0011 19c4.97 0 9-3.8 9-8.5S15.97 2 11 2z" fill="currentColor" opacity="0.18"/>
      <path d="M11 2C6.03 2 2 5.8 2 10.5c0 2.1.78 4 2.07 5.5L3 20l4.36-1.3A9.3 9.3 0 0011 19c4.97 0 9-3.8 9-8.5S15.97 2 11 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor"/>
      <circle cx="11" cy="10.5" r="1" fill="currentColor"/>
      <circle cx="14.5" cy="10.5" r="1" fill="currentColor"/>
    </svg>
  </button>

  <ChatbotModal v-if="chatOpen" @close="chatOpen = false" />
</template>

<style>
.chat-fab {
  position: fixed;
  z-index: 50;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid rgba(184, 145, 74, 0.3);
  background: rgba(249, 246, 241, 0.92);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.22);
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease, box-shadow 150ms ease;
  user-select: none;
  touch-action: none;
}

.chat-fab:hover {
  border-color: var(--shell-accent);
  color: var(--text-gold);
  background: rgba(249, 246, 241, 0.98);
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.28);
}

.chat-fab:active {
  cursor: grabbing;
}
</style>
