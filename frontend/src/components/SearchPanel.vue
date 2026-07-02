<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Territory } from '@/types/territoire'
import { useTerritoireStore } from '@/stores/territoire'
import { searchTerritoires, fetchDefaultEpcis } from '@/services/geo'

const store = useTerritoireStore()

const DEFAULTS: Territory[] = [
  { id: '75056', name: 'Paris', type: 'commune', region: 'Île-de-France', code: '75056' },
  { id: '69123', name: 'Lyon', type: 'commune', region: 'Auvergne-Rhône-Alpes', code: '69123' },
  { id: '13055', name: 'Marseille', type: 'commune', region: 'Provence-Alpes-Côte d\'Azur', code: '13055' },
  { id: '33063', name: 'Bordeaux', type: 'commune', region: 'Nouvelle-Aquitaine', code: '33063' },
  { id: '31555', name: 'Toulouse', type: 'commune', region: 'Occitanie', code: '31555' },
  { id: '44109', name: 'Nantes', type: 'commune', region: 'Pays de la Loire', code: '44109' },
]

const query = ref('')
const filter = ref<'all' | 'commune' | 'epci'>('all')
const isFocused = ref(false)
const isReady = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const suggestions = ref<Territory[]>(DEFAULTS)
const loading = ref(false)
const epciDefaults = ref<Territory[]>([])

let debounceTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  setTimeout(() => { isReady.value = true }, 80)
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

watch(filter, async (f) => {
  if (f === 'epci' && epciDefaults.value.length === 0) {
    loading.value = true
    epciDefaults.value = await fetchDefaultEpcis()
    loading.value = false
    if (query.value.trim().length < 2) {
      suggestions.value = epciDefaults.value
    }
  }
})

watch([query, filter], () => {
  if (debounceTimer) clearTimeout(debounceTimer)

  const q = query.value.trim()

  if (q.length < 2) {
    if (filter.value === 'epci') {
      suggestions.value = epciDefaults.value
    } else if (filter.value === 'all') {
      suggestions.value = [...DEFAULTS, ...epciDefaults.value]
    } else {
      suggestions.value = DEFAULTS
    }
    loading.value = false
    return
  }

  loading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      suggestions.value = await searchTerritoires(q, filter.value)
    } catch {
      suggestions.value = []
    } finally {
      loading.value = false
    }
  }, 250)
})

function clearQuery() {
  query.value = ''
  inputRef.value?.focus()
}
</script>

<template>
  <aside class="search-panel" :class="{ 'is-ready': isReady }">
    <div class="panel-accent-bar" />

    <!-- Header -->
    <header class="panel-header">
      <div class="brand">
        <span class="brand-name">loré</span>
        <span class="brand-tag">fiscalité locale</span>
      </div>
    </header>

    <!-- Hero -->
    <div class="panel-hero">
      <h1 class="hero-title">
        Explorez les données<br>fiscales de France.
      </h1>
      <p class="hero-sub">Communes, EPCI — 36 000+ territoires</p>
    </div>

    <!-- Search -->
    <div class="search-wrap" :class="{ 'is-focused': isFocused }">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        class="search-input"
        type="text"
        placeholder="Commune ou EPCI…"
        autocomplete="off"
        spellcheck="false"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />
      <button v-if="query" class="search-clear" @click="clearQuery" aria-label="Effacer">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <span v-else class="search-hint">⌘K</span>
      <div class="search-underline" />
    </div>

    <!-- Filters -->
    <div class="filter-chips">
      <button
        v-for="{ key, label } in [{ key: 'all', label: 'Tous' }, { key: 'commune', label: 'Communes' }, { key: 'epci', label: 'EPCI' }]"
        :key="key"
        class="chip"
        :class="{ 'chip--active': filter === key }"
        @click="filter = key as typeof filter"
      >
        {{ label }}
      </button>
    </div>

    <!-- Separator -->
    <div class="panel-sep" />

    <!-- Suggestions -->
    <ul class="suggestions" role="listbox">
      <li v-if="loading" class="suggestion-loading">
        <span class="loading-dot" /><span class="loading-dot" /><span class="loading-dot" />
      </li>
      <li v-else-if="suggestions.length === 0 && query.length >= 2" class="suggestion-empty">
        Aucun résultat pour « {{ query }} »
      </li>
      <li
        v-for="(item, i) in suggestions"
        :key="item.id"
        class="suggestion-item"
        :class="{ 'suggestion-item--active': store.selected?.id === item.id }"
        :style="{ '--delay': `${i * 55}ms` }"
        role="option"
        tabindex="0"
        @click="store.select(item)"
        @keydown.enter="store.select(item)"
      >
        <span class="territory-dot" :class="`territory-dot--${item.type}`" />
        <div class="territory-info">
          <span class="territory-name">{{ item.name }}</span>
          <div class="territory-meta">
            <span class="territory-type" :class="`territory-type--${item.type}`">
              {{ item.type === 'commune' ? 'Commune' : 'EPCI' }}
            </span>
            <span class="territory-region">{{ item.region }}</span>
            <span class="territory-code">{{ item.code }}</span>
          </div>
        </div>
        <svg class="item-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7H11M11 7L7.5 3.5M11 7L7.5 10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </li>
    </ul>

    <!-- Footer -->
    <footer class="panel-footer">
      <div class="footer-stats">
        <span class="stat">
          <span class="stat-value">36 628</span>
          <span class="stat-label">communes</span>
        </span>
        <span class="stat-dot">·</span>
        <span class="stat">
          <span class="stat-value">1 254</span>
          <span class="stat-label">EPCI</span>
        </span>
      </div>
      <span class="footer-year">REI 2023</span>
    </footer>
  </aside>
</template>

<style scoped>
/* --- Panel shell --- */
.search-panel {
  position: absolute;
  left: 20px;
  top: 20px;
  bottom: 20px;
  width: 390px;
  z-index: 10;
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateX(-16px);
  transition: opacity 500ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 500ms cubic-bezier(0.16, 1, 0.3, 1);
}

.search-panel.is-ready {
  opacity: 1;
  transform: translateX(0);
}

/* Gold top accent */
.panel-accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--shell-accent) 0%, rgba(184, 145, 74, 0.2) 100%);
  z-index: 1;
}

/* --- Header --- */
.panel-header {
  padding: 24px 24px 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.brand-tag {
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-gold);
  background: rgba(184, 145, 74, 0.1);
  padding: 3px 7px;
  border-radius: 4px;
  border: 1px solid rgba(184, 145, 74, 0.2);
}

/* --- Hero --- */
.panel-hero {
  padding: 20px 24px 0;
}

.hero-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 400;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.hero-sub {
  margin-top: 8px;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

/* --- Search --- */
.search-wrap {
  position: relative;
  margin: 22px 24px 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
}

.search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
  transition: color var(--transition-fast);
}

.search-wrap.is-focused .search-icon {
  color: var(--shell-accent);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--font-ui);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  caret-color: var(--shell-accent);
  min-width: 0;
}

.search-input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
}

.search-hint {
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--text-muted);
  background: var(--chip-bg);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.search-clear {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.search-clear:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

/* Animated underline */
.search-underline {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-muted);
  border-radius: 1px;
}

.search-underline::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--shell-accent);
  border-radius: 1px;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.search-wrap.is-focused .search-underline::after {
  transform: scaleX(1);
}

/* --- Filter chips --- */
.filter-chips {
  display: flex;
  gap: 6px;
  padding: 14px 24px 0;
}

.chip {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid var(--border-muted);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.chip:hover {
  background: var(--surface-hover);
  border-color: var(--border-light);
}

.chip--active {
  background: var(--shell-accent);
  border-color: var(--shell-accent);
  color: #fff;
}

/* --- Separator --- */
.panel-sep {
  height: 1px;
  background: var(--border-light);
  margin: 16px 0 0;
}

/* --- Suggestions --- */
.suggestions {
  list-style: none;
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 24px;
  cursor: pointer;
  border-radius: 0;
  transition: background var(--transition-fast);
  opacity: 0;
  animation: item-in 300ms cubic-bezier(0.16, 1, 0.3, 1) var(--delay, 0ms) forwards;
}

@keyframes item-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.suggestion-item:hover,
.suggestion-item--active {
  background: var(--surface-hover);
}

.suggestion-item--active {
  border-left: 2px solid var(--shell-accent);
  padding-left: 22px;
}

.suggestion-item:hover .item-arrow,
.suggestion-item--active .item-arrow {
  opacity: 1;
  transform: translateX(0);
}

/* Colored dot */
.territory-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.territory-dot--commune { background: #2C5282; }
.territory-dot--epci    { background: #276749; }

/* Info */
.territory-info {
  flex: 1;
  min-width: 0;
}

.territory-name {
  display: block;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.territory-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.territory-type {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
}

.territory-type--commune {
  background: rgba(44, 82, 130, 0.1);
  color: #2C5282;
}

.territory-type--epci {
  background: rgba(39, 103, 73, 0.1);
  color: #276749;
}

.territory-region {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.territory-code {
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Loading / empty */
.suggestion-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 20px 24px;
  list-style: none;
}

.loading-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--shell-accent);
  opacity: 0.4;
  animation: dot-pulse 1.2s ease-in-out infinite;
}

.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-pulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40%            { opacity: 1;   transform: scale(1);   }
}

.suggestion-empty {
  padding: 20px 24px;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
  list-style: none;
}

/* Arrow */
.item-arrow {
  color: var(--shell-accent);
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  flex-shrink: 0;
}

/* --- Footer --- */
.panel-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.stat-value {
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 400;
  color: var(--text-primary);
}

.stat-label {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-muted);
}

.stat-dot {
  color: var(--border-muted);
  font-size: 14px;
}

.footer-year {
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  text-transform: uppercase;
}
</style>
