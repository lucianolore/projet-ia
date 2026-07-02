<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useTerritoireStore } from '@/stores/territoire'
import { fetchSimilarCommunes, searchCommunesByStrate } from '@/services/geo'
import type { SimilarScope } from '@/services/geo'
import type { Territory } from '@/types/territoire'

const store = useTerritoireStore()

const step = ref<'pick' | 'compare'>('pick')

const suggestions = ref<Territory[]>([])
const suggestionsScope = ref<SimilarScope>('departement')
const suggestionsLoading = ref(false)

const searchQuery = ref('')
const searchResults = ref<Territory[]>([])
const searchLoading = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const fmtRate = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'

const fmtAmount = (v: number | null) => {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Md €'
  if (abs >= 1_000_000) return (v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M €'
  if (abs >= 1_000) return (v / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' k€'
  return v.toLocaleString('fr-FR') + ' €'
}

function fmt(v: number | null, format: 'rate' | 'amount') {
  return format === 'rate' ? fmtRate(v) : fmtAmount(v)
}

function delta(a: number | null, b: number | null): { text: string; sign: 'up' | 'down' | 'eq' } | null {
  if (a == null || b == null || a === 0) return null
  const pct = ((b - a) / Math.abs(a)) * 100
  if (Math.abs(pct) < 0.05) return { text: '=', sign: 'eq' }
  return {
    text: (pct > 0 ? '+' : '') + pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %',
    sign: pct > 0 ? 'up' : 'down',
  }
}

onMounted(async () => {
  const meta = store.data?.meta
  const selected = store.selected
  if (!meta || !selected) return

  suggestionsLoading.value = true
  try {
    const result = await fetchSimilarCommunes(meta.idcom, meta.strate, selected.code, 5)
    suggestions.value = result.results
    suggestionsScope.value = result.scope
  } finally {
    suggestionsLoading.value = false
  }
})

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim() || q.trim().length < 2) {
    searchResults.value = []
    return
  }
  const strate = store.data?.meta.strate
  if (!strate) return
  searchTimer = setTimeout(async () => {
    searchLoading.value = true
    try {
      searchResults.value = await searchCommunesByStrate(q, strate, 6)
    } finally {
      searchLoading.value = false
    }
  }, 300)
})

async function selectTarget(territory: Territory) {
  await store.selectComparaisonTarget(territory)
  step.value = 'compare'
}

function goBack() {
  step.value = 'pick'
  searchQuery.value = ''
  searchResults.value = []
}

interface CompareSection {
  title: string
  rows: Array<{
    label: string
    key: string
    format: 'rate' | 'amount'
    highlight?: boolean
  }>
}

const COMPARE_SECTIONS: CompareSection[] = [
  {
    title: 'Foncier bâti',
    rows: [
      { label: 'Taux commune', key: 'E12', format: 'rate', highlight: true },
      { label: 'Base nette', key: 'E11', format: 'amount' },
      { label: 'Produit', key: 'E13', format: 'amount' },
    ],
  },
  {
    title: 'Foncier non bâti',
    rows: [
      { label: 'Taux commune', key: 'B12', format: 'rate', highlight: true },
      { label: 'Base nette', key: 'B11', format: 'amount' },
      { label: 'Produit', key: 'B13', format: 'amount' },
    ],
  },
  {
    title: 'TEOM',
    rows: [
      { label: 'Taux', key: 'F22', format: 'rate', highlight: true },
      { label: 'Produit net lissé', key: 'F23', format: 'amount' },
    ],
  },
]

const compareSections = computed(() => {
  const dA = store.data
  const dB = store.comparaisonData
  if (!dA || !dB) return []

  return COMPARE_SECTIONS
    .map(section => {
      const rows = section.rows
        .map(row => {
          const vA = dA.indicateurs[row.key]?.valeur ?? null
          const vB = dB.indicateurs[row.key]?.valeur ?? null
          if (vA == null && vB == null) return null
          return {
            label: row.label,
            fmtA: fmt(vA, row.format),
            fmtB: fmt(vB, row.format),
            highlight: row.highlight ?? false,
            delta: row.highlight ? delta(vA, vB) : null,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      if (!rows.length) return null
      return { title: section.title, rows }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
})

const taRows = computed(() => {
  const tA = store.data?.ta
  const tB = store.comparaisonData?.ta
  if (!tA && !tB) return null

  const rows = [
    { label: 'Part communale', vA: tA?.communale ?? null, vB: tB?.communale ?? null, highlight: true },
    { label: 'Part départementale', vA: tA?.departementale ?? null, vB: tB?.departementale ?? null, highlight: false },
    { label: 'Part régionale', vA: tA?.regionale ?? null, vB: tB?.regionale ?? null, highlight: false },
  ].filter(r => r.vA != null || r.vB != null)

  if (!rows.length) return null
  return rows.map(r => ({
    label: r.label,
    fmtA: fmtRate(r.vA),
    fmtB: fmtRate(r.vB),
    highlight: r.highlight,
    delta: r.highlight ? delta(r.vA, r.vB) : null,
  }))
})

const nameA = computed(() => store.data?.meta.libcom ?? store.selected?.name ?? '')
const nameB = computed(() => store.comparaisonData?.meta.libcom ?? store.comparaisonTarget?.name ?? '')
const strateLabel = computed(() => {
  const s = store.data?.meta.strate
  if (!s) return null
  const labels: Record<number, string> = {
    1: '< 500 hab', 2: '500–999', 3: '1 000–1 999', 4: '2 000–4 999',
    5: '5 000–9 999', 6: '10 000–19 999', 7: '20 000–49 999',
    8: '50 000–99 999', 9: '100 000–249 999', 10: '≥ 250 000',
  }
  return labels[s] ?? null
})

const displayList = computed(() =>
  searchQuery.value.trim().length >= 2 ? searchResults.value : suggestions.value
)
const listLoading = computed(() =>
  searchQuery.value.trim().length >= 2 ? searchLoading.value : suggestionsLoading.value
)
const listLabel = computed(() =>
  searchQuery.value.trim().length >= 2 ? 'Résultats' : 'Communes similaires'
)
</script>

<template>
  <Transition name="cv-modal">
    <div class="cv-backdrop" @click.self="store.closeComparaisonVilles()">
      <div class="cv-panel" role="dialog" aria-modal="true">
        <div class="cv-accent-bar" />

        <!-- STEP: PICK -->
        <template v-if="step === 'pick'">
          <header class="cv-header">
            <div>
              <h2 class="cv-title">Comparer</h2>
              <p class="cv-sub">
                <span class="cv-commune-a">{{ nameA }}</span>
                <span class="cv-sub-sep">avec...</span>
              </p>
            </div>
            <button class="cv-close" aria-label="Fermer" @click="store.closeComparaisonVilles()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div class="cv-divider" />

          <!-- Search -->
          <div class="cv-search-wrap">
            <svg class="cv-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <input
              v-model="searchQuery"
              class="cv-search"
              type="text"
              placeholder="Rechercher une commune..."
              autocomplete="off"
            />
          </div>

          <!-- List -->
          <div class="cv-list-header">
            <span class="cv-list-label">{{ listLabel }}</span>
            <span v-if="strateLabel" class="cv-strate-chip">{{ strateLabel }}</span>
          </div>

          <div class="cv-list">
            <div v-if="listLoading" class="cv-list-loading">
              <div v-for="i in 4" :key="i" class="skeleton cv-skeleton" />
            </div>

            <template v-else-if="displayList.length">
              <button
                v-for="territory in displayList"
                :key="territory.code"
                class="cv-suggestion"
                :disabled="store.comparaisonLoading"
                @click="selectTarget(territory)"
              >
                <div class="cv-sug-body">
                  <span class="cv-sug-name">{{ territory.name }}</span>
                  <span class="cv-sug-region">{{ territory.region }}</span>
                </div>
                <svg class="cv-sug-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </template>

            <div v-else-if="searchQuery.trim().length >= 2" class="cv-empty">
              Aucun résultat pour « {{ searchQuery }} »
            </div>

            <div v-else class="cv-empty">
              Aucune commune similaire trouvée.
            </div>
          </div>

          <footer class="cv-footer">
            <span>Communes de même strate démographique · {{ suggestionsScope === 'france' ? 'France entière' : 'même département' }}</span>
          </footer>
        </template>

        <!-- STEP: COMPARE -->
        <template v-else>
          <header class="cv-header cv-header--compare">
            <button class="cv-back" @click="goBack()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L3 7l6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="cv-vs-header">
              <span class="cv-vs-name cv-vs-name--a">{{ nameA }}</span>
              <span class="cv-vs-sep">vs</span>
              <span class="cv-vs-name cv-vs-name--b">{{ nameB }}</span>
            </div>
            <button class="cv-close" aria-label="Fermer" @click="store.closeComparaisonVilles()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <!-- Column headers -->
          <div class="cv-col-heads">
            <div class="cv-col-label-placeholder" />
            <div class="cv-col-head cv-col-head--a">{{ nameA }}</div>
            <div class="cv-col-head cv-col-delta" />
            <div class="cv-col-head cv-col-head--b">{{ nameB }}</div>
          </div>

          <div class="cv-divider" />

          <!-- Loading B -->
          <div v-if="store.comparaisonLoading" class="cv-loading">
            <div v-for="i in 6" :key="i" class="skeleton cv-skeleton-row" :style="{ '--w': `${50 + i * 8}%` }" />
          </div>

          <!-- Error B -->
          <div v-else-if="store.comparaisonError" class="cv-error">
            {{ store.comparaisonError }}
          </div>

          <!-- Table -->
          <div v-else class="cv-table">
            <div
              v-for="section in compareSections"
              :key="section.title"
              class="cv-section"
            >
              <h3 class="cv-section-title">{{ section.title }}</h3>
              <div
                v-for="row in section.rows"
                :key="row.label"
                class="cv-row"
                :class="{ 'cv-row--highlight': row.highlight }"
              >
                <span class="cv-row-label">{{ row.label }}</span>
                <span class="cv-row-val cv-row-val--a" :class="{ 'cv-row-val--gold': row.highlight }">
                  {{ row.fmtA }}
                </span>
                <span class="cv-row-delta">
                  <span
                    v-if="row.delta"
                    class="cv-delta-badge"
                    :class="`cv-delta-badge--${row.delta.sign}`"
                  >{{ row.delta.text }}</span>
                </span>
                <span class="cv-row-val cv-row-val--b" :class="{ 'cv-row-val--gold': row.highlight }">
                  {{ row.fmtB }}
                </span>
              </div>
            </div>

            <!-- TA section -->
            <div v-if="taRows" class="cv-section">
              <h3 class="cv-section-title">Taxe d'aménagement</h3>
              <div
                v-for="row in taRows"
                :key="row.label"
                class="cv-row"
                :class="{ 'cv-row--highlight': row.highlight }"
              >
                <span class="cv-row-label">{{ row.label }}</span>
                <span class="cv-row-val cv-row-val--a" :class="{ 'cv-row-val--gold': row.highlight }">
                  {{ row.fmtA }}
                </span>
                <span class="cv-row-delta">
                  <span
                    v-if="row.delta"
                    class="cv-delta-badge"
                    :class="`cv-delta-badge--${row.delta.sign}`"
                  >{{ row.delta.text }}</span>
                </span>
                <span class="cv-row-val cv-row-val--b" :class="{ 'cv-row-val--gold': row.highlight }">
                  {{ row.fmtB }}
                </span>
              </div>
            </div>

            <div v-if="!compareSections.length && !taRows" class="cv-empty-table">
              Aucun indicateur disponible pour cette comparaison.
            </div>
          </div>

          <footer class="cv-footer">
            <span>REI / DGFiP · TA / DGFiP — {{ store.annee }}</span>
          </footer>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* --- Transition --- */
.cv-modal-enter-active {
  transition: opacity 300ms ease;
}
.cv-modal-enter-active .cv-panel {
  transition: opacity 300ms ease, transform 380ms cubic-bezier(0.16, 1, 0.3, 1);
}
.cv-modal-leave-active {
  transition: opacity 200ms ease;
}
.cv-modal-leave-active .cv-panel {
  transition: opacity 150ms ease, transform 150ms ease-in;
}
.cv-modal-enter-from,
.cv-modal-leave-to { opacity: 0; }
.cv-modal-enter-from .cv-panel,
.cv-modal-leave-to .cv-panel {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}

/* --- Backdrop --- */
.cv-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(10, 15, 28, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* --- Panel --- */
.cv-panel {
  position: relative;
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 680px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cv-accent-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--shell-accent) 0%, rgba(240,62,142,0.2) 100%);
  z-index: 1;
}

/* --- Header --- */
.cv-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 26px 28px 0;
  gap: 16px;
}

.cv-header--compare {
  align-items: center;
  padding: 20px 28px 0;
}

.cv-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.cv-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-secondary);
}

.cv-commune-a {
  font-weight: 600;
  color: var(--text-primary);
}

.cv-sub-sep {
  color: var(--text-muted);
}

.cv-close {
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
.cv-close:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.cv-back {
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
.cv-back:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

/* VS header */
.cv-vs-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  justify-content: center;
}

.cv-vs-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 400;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.cv-vs-name--a { color: var(--text-primary); }
.cv-vs-name--b { color: var(--shell-accent); }

.cv-vs-sep {
  font-family: var(--font-data);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Column headers (compare step) */
.cv-col-heads {
  display: grid;
  grid-template-columns: 1fr 110px 54px 110px;
  gap: 8px;
  padding: 12px 28px 0;
}

.cv-col-label-placeholder { }

.cv-col-head {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cv-col-head--a { color: var(--text-secondary); }
.cv-col-head--b { color: var(--shell-accent); }
.cv-col-delta { }

/* --- Divider --- */
.cv-divider {
  height: 1px;
  background: var(--border-light);
  margin: 14px 0 0;
}

/* --- Search --- */
.cv-search-wrap {
  position: relative;
  padding: 14px 28px 0;
}

.cv-search-icon {
  position: absolute;
  left: 40px;
  top: 50%;
  transform: translateY(-15%);
  color: var(--text-muted);
  pointer-events: none;
}

.cv-search {
  width: 100%;
  padding: 9px 12px 9px 34px;
  border-radius: 8px;
  border: 1px solid var(--border-muted);
  background: var(--chip-bg);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  outline: none;
  transition: border-color var(--transition-fast);
  box-sizing: border-box;
}
.cv-search:focus {
  border-color: rgba(240, 62, 142, 0.45);
}
.cv-search::placeholder {
  color: var(--text-muted);
}

/* --- List header --- */
.cv-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px 4px;
}

.cv-list-label {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.cv-strate-chip {
  font-family: var(--font-data);
  font-size: 10px;
  background: rgba(240, 62, 142, 0.1);
  color: var(--text-gold);
  border: 1px solid rgba(240, 62, 142, 0.2);
  padding: 2px 7px;
  border-radius: 4px;
}

/* --- Suggestion list --- */
.cv-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 28px 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.cv-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 11px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: transparent;
  cursor: pointer;
  text-align: left;
  margin-bottom: 6px;
  transition: all var(--transition-fast);
}
.cv-suggestion:hover:not(:disabled) {
  border-color: rgba(240, 62, 142, 0.35);
  background: rgba(240, 62, 142, 0.04);
}
.cv-suggestion:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cv-sug-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cv-sug-name {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.cv-sug-region {
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--text-muted);
}

.cv-sug-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.cv-suggestion:hover .cv-sug-arrow {
  opacity: 1;
  color: var(--text-gold);
}

/* --- Loading skeletons --- */
.cv-list-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.skeleton {
  border-radius: 4px;
  background: linear-gradient(90deg, var(--chip-bg) 25%, var(--border-light) 50%, var(--chip-bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.cv-skeleton { height: 52px; }
.cv-skeleton-row { height: 20px; width: var(--w, 70%); }

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* --- Empty / error --- */
.cv-empty {
  padding: 24px 0;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
}

.cv-error {
  padding: 32px 28px;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
}

.cv-empty-table {
  padding: 32px 28px;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
}

/* --- Loading (compare step) --- */
.cv-loading {
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* --- Table (compare step) --- */
.cv-table {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.cv-section {
  padding: 14px 28px 0;
}

.cv-section + .cv-section {
  border-top: 1px solid var(--border-light);
  margin-top: 14px;
  padding-top: 16px;
}

.cv-section-title {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.cv-row {
  display: grid;
  grid-template-columns: 1fr 110px 54px 110px;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border-light);
}
.cv-row:last-child { border-bottom: none; }

.cv-row-label {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-secondary);
}

.cv-row-val {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--text-primary);
  text-align: right;
  white-space: nowrap;
}

.cv-row-val--a.cv-row-val--gold {
  font-size: 15px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-weight: 500;
}

.cv-row-val--b.cv-row-val--gold {
  font-size: 15px;
  color: var(--shell-accent);
  font-family: var(--font-display);
  font-weight: 500;
}

.cv-row-delta {
  display: flex;
  justify-content: center;
}

.cv-delta-badge {
  font-family: var(--font-data);
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
}
.cv-delta-badge--up   { background: rgba(185, 28, 28, 0.08); color: #991B1B; }
.cv-delta-badge--down { background: rgba(39, 103, 73, 0.1); color: #276749; }
.cv-delta-badge--eq   { background: var(--chip-bg); color: var(--text-muted); }

/* --- Footer --- */
.cv-footer {
  padding: 12px 28px;
  border-top: 1px solid var(--border-light);
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}
</style>
