<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useTerritoireStore } from '@/stores/territoire'
import { fetchSimilarEpcis, fetchSimilarCommunes, searchTerritoires } from '@/services/geo'
import type { Territory, TerritoireData } from '@/types/territoire'

const store = useTerritoireStore()

const step = ref<'pick' | 'compare'>('pick')
const searchQuery = ref('')
const searchResults = ref<Territory[]>([])
const searchLoading = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
const suggestions = ref<Territory[]>([])
const suggestionsLoading = ref(false)

const FORJ_LABELS: Record<string, string> = {
  CC: 'Communauté de Communes',
  CA: "Communauté d'Agglomération",
  CU: 'Communauté Urbaine',
  MET: 'Métropole',
  EPT: 'Établissement Public Territorial',
}
const OPTEPCI_LABELS: Record<string, string> = {
  FPU: 'Fiscalité Professionnelle Unique',
  FA: 'Fiscalité Additionnelle',
  FPZ: 'Fiscalité Professionnelle de Zone',
  FPE: 'Fiscalité Éolienne Unique',
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtRate = (v: number) =>
  v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'

const fmtAmount = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Md €'
  if (abs >= 1_000_000) return (v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M €'
  if (abs >= 1_000) return (v / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' k€'
  return v.toLocaleString('fr-FR') + ' €'
}

// ── Row definitions ───────────────────────────────────────────────────────────

type RowFmt = 'rate' | 'amount'
type MultiRowDef =
  | { kind: 'var'; label: string; key: string; fmt: RowFmt }
  | { kind: 'produit_hab'; label: string; produitKey: string }
  | { kind: 'epci_info'; label: string; field: 'population' | 'nbCommunes' | 'surface' }
  | { kind: 'epci_meta'; label: string; field: 'forjepci' | 'optepci' }

interface SectionDef { title: string; rows: MultiRowDef[] }

const EPCI_SECTIONS: SectionDef[] = [
  {
    title: 'Infos',
    rows: [
      { kind: 'epci_meta', label: 'Type', field: 'forjepci' },
      { kind: 'epci_meta', label: 'Fiscalité', field: 'optepci' },
      { kind: 'epci_info', label: 'Population', field: 'population' },
      { kind: 'epci_info', label: 'Communes', field: 'nbCommunes' },
      { kind: 'epci_info', label: 'Surface', field: 'surface' },
    ],
  },
  {
    title: 'TFPB',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'E32', fmt: 'rate' },
      { kind: 'var', label: 'Taux voté', key: 'E32VOTE', fmt: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'E31', fmt: 'amount' },
      { kind: 'var', label: 'Produit', key: 'E33', fmt: 'amount' },
      { kind: 'produit_hab', label: 'Produit/hab', produitKey: 'E33' },
    ],
  },
  {
    title: 'TFPNB',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'B32', fmt: 'rate' },
      { kind: 'var', label: 'Taux voté', key: 'B32VOTE', fmt: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'B31', fmt: 'amount' },
      { kind: 'var', label: 'Produit', key: 'B33', fmt: 'amount' },
      { kind: 'produit_hab', label: 'Produit/hab', produitKey: 'B33' },
    ],
  },
  {
    title: 'CFE',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'P32', fmt: 'rate' },
      { kind: 'var', label: 'Taux voté', key: 'P32VOTE', fmt: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'P31', fmt: 'amount' },
      { kind: 'var', label: 'Produit', key: 'P33', fmt: 'amount' },
      { kind: 'produit_hab', label: 'Produit/hab', produitKey: 'P33' },
    ],
  },
  {
    title: 'TEOM',
    rows: [
      { kind: 'var', label: 'Taux', key: 'F22GFP', fmt: 'rate' },
      { kind: 'var', label: 'Produit', key: 'F23GFP', fmt: 'amount' },
      { kind: 'produit_hab', label: 'Produit/hab', produitKey: 'F23GFP' },
    ],
  },
  {
    title: 'IFER',
    rows: [
      { kind: 'var', label: 'Produit', key: 'IFERGFP', fmt: 'amount' },
      { kind: 'produit_hab', label: 'Produit/hab', produitKey: 'IFERGFP' },
    ],
  },
]

const COMMUNE_SECTIONS: SectionDef[] = [
  {
    title: 'TFPB',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'E11', fmt: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'E12', fmt: 'amount' },
      { kind: 'var', label: 'Produit', key: 'E13', fmt: 'amount' },
    ],
  },
  {
    title: 'TFPNB',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'B11', fmt: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'B12', fmt: 'amount' },
      { kind: 'var', label: 'Produit', key: 'B13', fmt: 'amount' },
    ],
  },
  {
    title: 'THRS',
    rows: [
      { kind: 'var', label: 'Taux', key: 'H13THS', fmt: 'rate' },
    ],
  },
  {
    title: 'TEOM',
    rows: [
      { kind: 'var', label: 'Taux', key: 'F22', fmt: 'rate' },
      { kind: 'var', label: 'Produit', key: 'F23', fmt: 'amount' },
    ],
  },
]

// ── Store refs ────────────────────────────────────────────────────────────────

const territoryType = computed(() => store.selected?.type ?? 'commune')
const sections = computed<SectionDef[]>(() =>
  territoryType.value === 'epci' ? EPCI_SECTIONS : COMMUNE_SECTIONS,
)
const targets = computed(() => store.multiTargets)
const dataItems = computed(() => store.multiData)
const multiErrors = computed(() => store.multiErrors)
const loadingIdx = computed(() => store.multiLoadingIdx)
const allLoading = computed(() => store.multiLoadingIdx !== null)
const canAddMore = computed(() => targets.value.length < 5 && !allLoading.value)
const canCompare = computed(() =>
  targets.value.length >= 2 &&
  !allLoading.value &&
  dataItems.value.every(d => d !== null) &&
  multiErrors.value.slice(1).every(e => e === null),
)
const colCount = computed(() => targets.value.length)
const typeLabel = computed(() => territoryType.value === 'epci' ? 'EPCI' : 'commune')

// ── Suggestions & search ──────────────────────────────────────────────────────

onMounted(async () => {
  const meta = store.data?.meta
  if (!meta) return
  suggestionsLoading.value = true
  try {
    if (territoryType.value === 'epci') {
      if (!meta.sirepci || !meta.forjepci || !meta.libreg) return
      suggestions.value = await fetchSimilarEpcis(meta.sirepci, meta.forjepci, meta.libreg, 6)
    } else {
      if (!meta.idcom || !meta.strate) return
      const result = await fetchSimilarCommunes(meta.idcom, meta.strate, meta.idcom, 6)
      suggestions.value = result.results
    }
  } finally {
    suggestionsLoading.value = false
  }
})

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim() || q.trim().length < 2) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    searchLoading.value = true
    try {
      searchResults.value = await searchTerritoires(q, territoryType.value, 8)
    } finally {
      searchLoading.value = false
    }
  }, 300)
})

// ── Actions ───────────────────────────────────────────────────────────────────

async function addTarget(territory: Territory) {
  if (!canAddMore.value || isAlreadyAdded(territory.code)) return
  await store.addMultiTarget(territory)
}

function removeTarget(index: number) {
  store.removeMultiTarget(index)
}

function goCompare() {
  if (canCompare.value) step.value = 'compare'
}

function goBack() {
  step.value = 'pick'
  searchQuery.value = ''
  searchResults.value = []
}

// ── Rendering ─────────────────────────────────────────────────────────────────

type RenderedCell = { text: string; raw: number | null; mark: 'min' | 'max' | null; isText: boolean }
type RenderedRow = { label: string; cells: RenderedCell[] }
type RenderedSection = { title: string; rows: RenderedRow[] }

function getRaw(row: MultiRowDef, d: TerritoireData): number | null {
  if (row.kind === 'var') return d.indicateurs[row.key]?.valeur ?? null
  if (row.kind === 'produit_hab') {
    const p = d.indicateurs[row.produitKey]?.valeur ?? null
    const pop = d.epciDetails?.population ?? null
    return p != null && pop != null && pop > 0 ? (p * 1000) / pop : null
  }
  if (row.kind === 'epci_info') {
    if (row.field === 'population') return d.epciDetails?.population ?? null
    if (row.field === 'nbCommunes') return d.epciDetails?.nbCommunes ?? null
    return d.epciDetails?.surface ?? null
  }
  return null
}

function getFmt(row: MultiRowDef, raw: number): string {
  if (row.kind === 'var') return row.fmt === 'rate' ? fmtRate(raw) : fmtAmount(raw)
  if (row.kind === 'produit_hab') return raw.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €/hab'
  if (row.kind === 'epci_info') {
    if (row.field === 'population') return raw.toLocaleString('fr-FR') + ' hab.'
    if (row.field === 'nbCommunes') return raw.toLocaleString('fr-FR')
    return raw.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' km²'
  }
  return String(raw)
}

const renderedSections = computed((): RenderedSection[] => {
  const ds = dataItems.value
  if (ds.some(d => d === null)) return []
  const data = ds as TerritoireData[]

  return sections.value.map(section => {
    const rows: RenderedRow[] = []

    for (const row of section.rows) {
      if (row.kind === 'epci_meta') {
        const cells: RenderedCell[] = data.map(d => {
          const raw = row.field === 'forjepci' ? d.meta.forjepci : d.meta.optepci
          const labelMap = row.field === 'forjepci' ? FORJ_LABELS : OPTEPCI_LABELS
          const text = raw && raw !== 'null' ? raw : '—'
          return { text, raw: null, mark: null, isText: true, title: text !== '—' ? (labelMap[text] ?? '') : '' }
        })
        if (cells.every(c => c.text === '—')) continue
        rows.push({ label: row.label, cells })
        continue
      }

      const raws = data.map(d => getRaw(row, d))
      if (raws.every(r => r === null)) continue

      const nonNull = raws.filter((r): r is number => r !== null)
      const minVal = Math.min(...nonNull)
      const maxVal = Math.max(...nonNull)
      const hasVariation = nonNull.length >= 2 && minVal !== maxVal

      let minMarked = false
      let maxMarked = false
      const cells: RenderedCell[] = raws.map(raw => {
        if (raw === null) return { text: '—', raw: null, mark: null, isText: false }
        let mark: 'min' | 'max' | null = null
        if (hasVariation) {
          if (raw === minVal && !minMarked) { mark = 'min'; minMarked = true }
          else if (raw === maxVal && !maxMarked) { mark = 'max'; maxMarked = true }
        }
        return { text: getFmt(row, raw), raw, mark, isText: false }
      })
      rows.push({ label: row.label, cells })
    }

    if (!rows.length) return null
    return { title: section.title, rows }
  }).filter((s): s is RenderedSection => s !== null)
})

const displayList = computed(() =>
  searchQuery.value.trim().length >= 2 ? searchResults.value : suggestions.value,
)
const listLoading = computed(() =>
  searchQuery.value.trim().length >= 2 ? searchLoading.value : suggestionsLoading.value,
)
const isAlreadyAdded = (code: string) => targets.value.some(t => t.code === code)
</script>

<template>
  <Transition name="cm-modal">
    <div class="cm-backdrop" @click.self="store.closeMultiComparaison()">
      <div class="cm-panel" role="dialog" aria-modal="true">
        <div class="cm-accent-bar" />

        <!-- ── PICK ── -->
        <template v-if="step === 'pick'">
          <header class="cm-header">
            <div>
              <h2 class="cm-title">Comparer des {{ typeLabel }}s</h2>
              <p class="cm-sub">2 à 5 territoires · min et max mis en évidence</p>
            </div>
            <button class="cm-close" aria-label="Fermer" @click="store.closeMultiComparaison()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div class="cm-chips-wrap">
            <div
              v-for="(t, i) in targets"
              :key="t.code"
              class="cm-chip"
              :class="[i === 0 && 'cm-chip--ref', multiErrors[i] && 'cm-chip--error']"
            >
              <span class="cm-chip-dot" :class="i === 0 && 'cm-chip-dot--ref'" />
              <span class="cm-chip-name" :title="t.name">{{ t.name }}</span>
              <svg v-if="loadingIdx === i" class="cm-chip-spinner" width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="16" stroke-dashoffset="6"/>
              </svg>
              <button v-else-if="i > 0" class="cm-chip-remove" :title="`Retirer ${t.name}`" @click="removeTarget(i)">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div v-if="canAddMore" class="cm-chip-slot">
              + {{ 5 - targets.length }} emplacement{{ 5 - targets.length > 1 ? 's' : '' }}
            </div>
          </div>

          <div class="cm-divider" />

          <div class="cm-search-wrap">
            <svg class="cm-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <input
              v-model="searchQuery"
              class="cm-search"
              type="text"
              :placeholder="`Rechercher un ${typeLabel}…`"
              autocomplete="off"
            />
          </div>

          <div class="cm-list-header">
            <span class="cm-list-label">{{ searchQuery.trim().length >= 2 ? 'Résultats' : `${typeLabel}s similaires` }}</span>
          </div>

          <div class="cm-list">
            <div v-if="listLoading" class="cm-list-loading">
              <div v-for="i in 4" :key="i" class="skeleton cm-skeleton" />
            </div>
            <template v-else-if="displayList.length">
              <button
                v-for="territory in displayList"
                :key="territory.code"
                class="cm-suggestion"
                :disabled="isAlreadyAdded(territory.code) || !canAddMore"
                @click="addTarget(territory)"
              >
                <div class="cm-sug-body">
                  <span class="cm-sug-name">{{ territory.name }}</span>
                  <span class="cm-sug-region">{{ territory.region }}</span>
                </div>
                <svg v-if="isAlreadyAdded(territory.code)" class="cm-sug-check" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <svg v-else class="cm-sug-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </template>
            <div v-else-if="searchQuery.trim().length >= 2" class="cm-empty">
              Aucun résultat pour « {{ searchQuery }} »
            </div>
            <div v-else class="cm-empty">
              Aucun {{ typeLabel }} similaire trouvé.
            </div>
          </div>

          <footer class="cm-footer">
            <span class="cm-footer-count">{{ targets.length }}/5 sélectionné{{ targets.length > 1 ? 's' : '' }}</span>
            <button class="cm-go-btn" :disabled="!canCompare" @click="goCompare">
              Comparer
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </footer>
        </template>

        <!-- ── COMPARE ── -->
        <template v-else>
          <header class="cm-header cm-header--compare">
            <button class="cm-back" @click="goBack()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L3 7l6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="cm-compare-title">
              <span class="cm-compare-n">{{ colCount }} territoires</span>
              <span class="cm-compare-hint">
                <span class="cm-dot cm-dot--min" />min
                <span class="cm-dot cm-dot--max" />max
              </span>
            </div>
            <button class="cm-close" aria-label="Fermer" @click="store.closeMultiComparaison()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div class="cm-col-heads" :style="`grid-template-columns: 160px repeat(${colCount}, minmax(0, 1fr))`">
            <div />
            <div
              v-for="(t, i) in targets"
              :key="t.code"
              class="cm-col-head"
              :class="i === 0 ? 'cm-col-head--ref' : 'cm-col-head--other'"
              :title="t.name"
            >{{ t.name }}</div>
          </div>

          <div class="cm-divider" />

          <div v-if="renderedSections.length === 0" class="cm-loading">
            <div v-for="i in 5" :key="i" class="skeleton cm-skeleton-row" :style="`width: ${40 + i * 10}%`" />
          </div>

          <div v-else class="cm-table" :style="`--col-count: ${colCount}`">
            <div v-for="section in renderedSections" :key="section.title" class="cm-section">
              <h3 class="cm-section-title">{{ section.title }}</h3>
              <div v-for="row in section.rows" :key="row.label" class="cm-row">
                <span class="cm-row-label">{{ row.label }}</span>
                <span
                  v-for="(cell, i) in row.cells"
                  :key="i"
                  class="cm-cell"
                  :class="[
                    i === 0 && 'cm-cell--ref',
                    cell.isText && 'cm-cell--text',
                    cell.mark === 'min' && 'cm-cell--min',
                    cell.mark === 'max' && 'cm-cell--max',
                  ]"
                >{{ cell.text }}</span>
              </div>
            </div>
          </div>

          <footer class="cm-footer">
            <span>REI / DGFiP — {{ store.annee }}</span>
          </footer>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cm-modal-enter-active { transition: opacity 300ms ease; }
.cm-modal-enter-active .cm-panel { transition: opacity 300ms ease, transform 380ms cubic-bezier(0.16, 1, 0.3, 1); }
.cm-modal-leave-active { transition: opacity 200ms ease; }
.cm-modal-leave-active .cm-panel { transition: opacity 150ms ease, transform 150ms ease-in; }
.cm-modal-enter-from, .cm-modal-leave-to { opacity: 0; }
.cm-modal-enter-from .cm-panel, .cm-modal-leave-to .cm-panel { opacity: 0; transform: translateY(16px) scale(0.98); }

.cm-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(10,15,28,0.55); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.cm-panel {
  position: relative; background: var(--panel-bg); border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.2);
  width: 100%; max-width: 900px; max-height: 82vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.cm-accent-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 2px; z-index: 1;
  background: linear-gradient(90deg, var(--shell-accent) 0%, rgba(240,62,142,0.15) 100%);
}

.cm-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 26px 28px 0; gap: 16px; }
.cm-header--compare { align-items: center; padding: 20px 28px 0; }
.cm-title { font-family: var(--font-display); font-size: 22px; font-weight: 400; letter-spacing: -0.02em; color: var(--text-primary); }
.cm-sub { margin-top: 4px; font-family: var(--font-ui); font-size: 12px; color: var(--text-muted); }
.cm-close, .cm-back {
  background: none; border: none; cursor: pointer; padding: 8px; color: var(--text-muted);
  border-radius: 8px; display: flex; align-items: center; flex-shrink: 0;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.cm-close:hover, .cm-back:hover { color: var(--text-primary); background: var(--surface-hover); }
.cm-compare-title { flex: 1; display: flex; align-items: center; justify-content: center; gap: 14px; }
.cm-compare-n { font-family: var(--font-display); font-size: 18px; font-weight: 400; letter-spacing: -0.01em; color: var(--text-primary); }
.cm-compare-hint { display: flex; align-items: center; gap: 5px; font-family: var(--font-data); font-size: 10px; color: var(--text-muted); }
.cm-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.cm-dot--min { background: #1D4ED8; opacity: 0.7; }
.cm-dot--max { background: #CA8A04; opacity: 0.8; }

/* ── Chips ── */
.cm-chips-wrap { display: flex; gap: 8px; flex-wrap: wrap; padding: 16px 28px 0; }
.cm-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; border-radius: 6px;
  border: 1px solid var(--border-light); background: var(--chip-bg);
  font-family: var(--font-ui); font-size: 12px; color: var(--text-primary); max-width: 200px;
}
.cm-chip--ref { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.03); }
.cm-chip--error { border-color: rgba(185,28,28,0.4); }
.cm-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(240,62,142,0.5); flex-shrink: 0; }
.cm-chip-dot--ref { background: var(--text-secondary); }
.cm-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.cm-chip-remove {
  background: none; border: none; cursor: pointer; padding: 2px; border-radius: 3px;
  color: var(--text-muted); display: flex; align-items: center; flex-shrink: 0;
  transition: color var(--transition-fast);
}
.cm-chip-remove:hover { color: #991B1B; }
.cm-chip-slot { padding: 4px 10px; border-radius: 6px; border: 1px dashed var(--border-muted); font-family: var(--font-ui); font-size: 11px; color: var(--text-muted); }
@keyframes spin { to { transform: rotate(360deg); } }
.cm-chip-spinner { color: var(--shell-accent); flex-shrink: 0; animation: spin 0.8s linear infinite; }

.cm-divider { height: 1px; background: var(--border-light); margin: 14px 0 0; flex-shrink: 0; }

/* ── Search ── */
.cm-search-wrap { position: relative; padding: 14px 28px 0; flex-shrink: 0; }
.cm-search-icon { position: absolute; left: 40px; top: 50%; transform: translateY(-15%); color: var(--text-muted); pointer-events: none; }
.cm-search {
  width: 100%; padding: 9px 12px 9px 34px; border-radius: 8px;
  border: 1px solid var(--border-muted); background: var(--chip-bg);
  color: var(--text-primary); font-family: var(--font-ui); font-size: 13px;
  outline: none; transition: border-color var(--transition-fast); box-sizing: border-box;
}
.cm-search:focus { border-color: rgba(240,62,142,0.45); }
.cm-search::placeholder { color: var(--text-muted); }

.cm-list-header { display: flex; align-items: center; padding: 12px 28px 4px; flex-shrink: 0; }
.cm-list-label { font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }

.cm-list { flex: 1; overflow-y: auto; padding: 4px 28px 8px; scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }
.cm-suggestion {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  padding: 11px 12px; border-radius: 8px; border: 1px solid var(--border-light);
  background: transparent; cursor: pointer; text-align: left; margin-bottom: 6px;
  transition: all var(--transition-fast);
}
.cm-suggestion:hover:not(:disabled) { border-color: rgba(240,62,142,0.35); background: rgba(240,62,142,0.04); }
.cm-suggestion:disabled { opacity: 0.5; cursor: not-allowed; }
.cm-sug-body { display: flex; flex-direction: column; gap: 2px; }
.cm-sug-name { font-family: var(--font-ui); font-size: 14px; font-weight: 500; color: var(--text-primary); }
.cm-sug-region { font-family: var(--font-data); font-size: 11px; color: var(--text-muted); }
.cm-sug-arrow { color: var(--text-muted); opacity: 0; transition: opacity var(--transition-fast); flex-shrink: 0; }
.cm-sug-check { color: #276749; flex-shrink: 0; }
.cm-suggestion:hover:not(:disabled) .cm-sug-arrow { opacity: 1; color: var(--shell-accent); }

.cm-list-loading { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
.skeleton { border-radius: 4px; background: linear-gradient(90deg, var(--chip-bg) 25%, var(--border-light) 50%, var(--chip-bg) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
.cm-skeleton { height: 52px; }
.cm-skeleton-row { height: 18px; margin-bottom: 6px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.cm-empty { padding: 24px 0; text-align: center; font-family: var(--font-ui); font-size: 13px; color: var(--text-muted); }

/* ── Footer ── */
.cm-footer {
  padding: 12px 28px; border-top: 1px solid var(--border-light);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  font-family: var(--font-data); font-size: 10px; color: var(--text-muted); flex-shrink: 0;
}
.cm-footer-count { font-family: var(--font-ui); font-size: 11px; color: var(--text-secondary); }
.cm-go-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 16px; border-radius: 8px;
  border: 1px solid rgba(240,62,142,0.4); background: rgba(240,62,142,0.08);
  color: var(--shell-accent); font-family: var(--font-ui); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all var(--transition-fast);
}
.cm-go-btn:hover:not(:disabled) { background: rgba(240,62,142,0.15); border-color: rgba(240,62,142,0.7); }
.cm-go-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Compare step ── */
.cm-col-heads { display: grid; padding: 10px 28px 0; gap: 4px; flex-shrink: 0; }
.cm-col-head {
  font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: 0.05em;
  text-transform: uppercase; text-align: right;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cm-col-head--ref { color: var(--text-secondary); }
.cm-col-head--other { color: var(--shell-accent); }

.cm-loading { padding: 24px 28px; display: flex; flex-direction: column; gap: 10px; }
.cm-table { flex: 1; overflow-y: auto; padding: 8px 0; scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }
.cm-section { padding: 14px 28px 0; }
.cm-section + .cm-section { border-top: 1px solid var(--border-light); margin-top: 14px; padding-top: 16px; }
.cm-section-title { font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }

.cm-row {
  display: grid;
  grid-template-columns: 160px repeat(var(--col-count, 3), minmax(0, 1fr));
  align-items: center; gap: 4px; padding: 5px 0;
  border-bottom: 1px solid var(--border-light);
}
.cm-row:last-child { border-bottom: none; }
.cm-row-label { font-family: var(--font-ui); font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-cell {
  font-family: var(--font-data); font-size: 11px; color: var(--text-primary);
  text-align: right; padding: 3px 4px; border-radius: 4px;
}
.cm-cell--ref { font-weight: 500; }
.cm-cell--text { font-family: var(--font-ui); font-size: 11px; color: var(--text-secondary); }
.cm-cell--min { background: rgba(29,78,216,0.06); color: #1D4ED8; }
.cm-cell--max { background: rgba(202,138,4,0.07); color: #92400E; }
</style>
