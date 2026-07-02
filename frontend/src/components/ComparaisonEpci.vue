<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useTerritoireStore } from '@/stores/territoire'
import { fetchSimilarEpcis, searchTerritoires } from '@/services/geo'
import type { Territory, TerritoireData } from '@/types/territoire'

const store = useTerritoireStore()

const step = ref<'pick' | 'compare'>('pick')

const suggestions = ref<Territory[]>([])
const suggestionsLoading = ref(false)

const searchQuery = ref('')
const searchResults = ref<Territory[]>([])
const searchLoading = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

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

const fmtPop = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('fr-FR') + ' hab.'

const fmtCount = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('fr-FR')

const fmtSurface = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' km²'

function fmtProduitHab(produit: number | null, pop: number | null): string {
  if (produit == null || pop == null || pop === 0) return '—'
  const val = (produit * 1000) / pop
  return val.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €/hab'
}

type RowFormat = 'rate' | 'amount'

function fmt(v: number | null, format: RowFormat) {
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

function produitHabValues(d: TerritoireData, key: string): number | null {
  const produit = d.indicateurs[key]?.valeur ?? null
  const pop = d.epciDetails?.population ?? null
  if (produit == null || pop == null || pop === 0) return null
  return (produit * 1000) / pop
}

onMounted(async () => {
  const meta = store.data?.meta
  if (!meta?.sirepci || !meta.forjepci || !meta.libreg) return
  suggestionsLoading.value = true
  try {
    suggestions.value = await fetchSimilarEpcis(meta.sirepci, meta.forjepci, meta.libreg, 5)
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
  searchTimer = setTimeout(async () => {
    searchLoading.value = true
    try {
      searchResults.value = await searchTerritoires(q, 'epci', 8)
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

type CompareRowDef =
  | { kind: 'var'; label: string; key: string; format: RowFormat; highlight?: boolean }
  | { kind: 'produit_hab'; label: string; produitKey: string }
  | { kind: 'produit_sum_hab'; label: string; keys: string[] }
  | { kind: 'epci_info'; label: string; field: 'population' | 'nbCommunes' | 'surface' }
  | { kind: 'epci_meta'; label: string; field: 'forjepci' | 'optepci' }

interface CompareSectionDef { title: string; rows: CompareRowDef[] }

const COMPARE_SECTIONS: CompareSectionDef[] = [
  {
    title: 'TFPB (GFP)',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'E32', format: 'rate', highlight: true },
      { kind: 'var', label: 'Taux voté', key: 'E32VOTE', format: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'E31', format: 'amount' },
      { kind: 'var', label: 'Produit', key: 'E33', format: 'amount' },
      { kind: 'produit_hab', label: 'Produit / habitant', produitKey: 'E33' },
    ],
  },
  {
    title: 'TFPNB (GFP)',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'B32', format: 'rate', highlight: true },
      { kind: 'var', label: 'Taux voté', key: 'B32VOTE', format: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'B31', format: 'amount' },
      { kind: 'var', label: 'Produit', key: 'B33', format: 'amount' },
      { kind: 'produit_hab', label: 'Produit / habitant', produitKey: 'B33' },
    ],
  },
  {
    title: 'CFE (GFP)',
    rows: [
      { kind: 'var', label: 'Taux net', key: 'P32', format: 'rate', highlight: true },
      { kind: 'var', label: 'Taux voté', key: 'P32VOTE', format: 'rate' },
      { kind: 'var', label: 'Base nette', key: 'P31', format: 'amount' },
      { kind: 'var', label: 'Produit', key: 'P33', format: 'amount' },
      { kind: 'produit_hab', label: 'Produit / habitant', produitKey: 'P33' },
    ],
  },
  {
    title: 'TEOM (GFP)',
    rows: [
      { kind: 'var', label: 'Taux TEOM', key: 'F22GFP', format: 'rate', highlight: true },
      { kind: 'var', label: 'Produit net lissé', key: 'F23GFP', format: 'amount' },
      { kind: 'produit_hab', label: 'Produit / habitant', produitKey: 'F23GFP' },
    ],
  },
  {
    title: 'GEMAPI',
    rows: [
      { kind: 'var', label: 'Taux FB', key: 'E52gGEMAPI', format: 'rate', highlight: true },
      { kind: 'var', label: 'Produit FB', key: 'E53gGEMAPI', format: 'amount' },
      { kind: 'var', label: 'Taux FNB', key: 'B52gGEMAPI', format: 'rate', highlight: true },
      { kind: 'var', label: 'Produit FNB', key: 'B53gGEMAPI', format: 'amount' },
      { kind: 'produit_sum_hab', label: 'Produit total / habitant', keys: ['E53gGEMAPI', 'B53gGEMAPI'] },
    ],
  },
  {
    title: 'IFER (GFP)',
    rows: [
      { kind: 'var', label: 'Produit', key: 'IFERGFP', format: 'amount', highlight: true },
      { kind: 'produit_hab', label: 'Produit / habitant', produitKey: 'IFERGFP' },
    ],
  },
]

type RenderedRow = {
  label: string
  fmtA: string
  fmtB: string
  highlight: boolean
  delta: { text: string; sign: 'up' | 'down' | 'eq' } | null
}

const compareSections = computed(() => {
  const dA = store.data
  const dB = store.comparaisonData
  if (!dA || !dB) return []

  return COMPARE_SECTIONS
    .map(section => {
      const rows = section.rows
        .map((row): RenderedRow | null => {
          if (row.kind === 'var') {
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
          }
          if (row.kind === 'produit_hab') {
            const vA = produitHabValues(dA, row.produitKey)
            const vB = produitHabValues(dB, row.produitKey)
            if (vA == null && vB == null) return null
            return {
              label: row.label,
              fmtA: fmtProduitHab(dA.indicateurs[row.produitKey]?.valeur ?? null, dA.epciDetails?.population ?? null),
              fmtB: fmtProduitHab(dB.indicateurs[row.produitKey]?.valeur ?? null, dB.epciDetails?.population ?? null),
              highlight: false,
              delta: delta(vA, vB),
            }
          }
          if (row.kind === 'produit_sum_hab') {
            const sumA = row.keys.reduce((s, k) => s + (dA.indicateurs[k]?.valeur ?? 0), 0)
            const sumB = row.keys.reduce((s, k) => s + (dB.indicateurs[k]?.valeur ?? 0), 0)
            const popA = dA.epciDetails?.population ?? null
            const popB = dB.epciDetails?.population ?? null
            const vA = sumA && popA ? (sumA * 1000) / popA : null
            const vB = sumB && popB ? (sumB * 1000) / popB : null
            if (vA == null && vB == null) return null
            return {
              label: row.label,
              fmtA: vA != null ? vA.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €/hab' : '—',
              fmtB: vB != null ? vB.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €/hab' : '—',
              highlight: false,
              delta: delta(vA, vB),
            }
          }
          if (row.kind === 'epci_meta') {
            const rawA = row.field === 'forjepci' ? dA.meta.forjepci : dA.meta.optepci
            const rawB = row.field === 'forjepci' ? dB.meta.forjepci : dB.meta.optepci
            const labelMap = row.field === 'forjepci' ? FORJ_LABELS : OPTEPCI_LABELS
            const vA = rawA && rawA !== 'null' ? rawA : null
            const vB = rawB && rawB !== 'null' ? rawB : null
            if (vA == null && vB == null) return null
            return {
              label: row.label,
              fmtA: vA ? (labelMap[vA] ?? vA) : '—',
              fmtB: vB ? (labelMap[vB] ?? vB) : '—',
              highlight: false,
              delta: null,
            }
          }
          // epci_info (population | nbCommunes | surface)
          const vA = row.field === 'population'
            ? (dA.epciDetails?.population ?? null)
            : row.field === 'nbCommunes'
              ? (dA.epciDetails?.nbCommunes ?? null)
              : (dA.epciDetails?.surface ?? null)
          const vB = row.field === 'population'
            ? (dB.epciDetails?.population ?? null)
            : row.field === 'nbCommunes'
              ? (dB.epciDetails?.nbCommunes ?? null)
              : (dB.epciDetails?.surface ?? null)
          if (vA == null && vB == null) return null
          const fmtInfoVal = (v: number | null) =>
            row.field === 'population' ? fmtPop(v)
            : row.field === 'surface' ? fmtSurface(v)
            : fmtCount(v)
          return {
            label: row.label,
            fmtA: fmtInfoVal(vA),
            fmtB: fmtInfoVal(vB),
            highlight: false,
            delta: row.field === 'population' ? delta(vA, vB) : null,
          }
        })
        .filter((r): r is RenderedRow => r !== null)
      if (!rows.length) return null
      return { title: section.title, rows }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
})

const CFE_TRANCHES = [
  { key: '1', label: '≤ 10 000 €' },
  { key: '2', label: '10 001 – 32 600 €' },
  { key: '3', label: '32 601 – 100 000 €' },
  { key: '4', label: '100 001 – 250 000 €' },
  { key: '5', label: '250 001 – 500 000 €' },
  { key: '6', label: '> 500 000 €' },
]

interface CfeBasesRow {
  tranche: string
  tcA: string; ptA: string
  tcB: string; ptB: string
  hasDelta: boolean
}

const cfeBasesComparison = computed((): CfeBasesRow[] => {
  const dA = store.data
  const dB = store.comparaisonData
  if (!dA || !dB) return []
  const rows = CFE_TRANCHES.map(t => ({
    tranche: t.label,
    tcA: fmtAmount(dA.cfeFocusVars[`BAMINTCT${t.key}`]?.valeur ?? null),
    ptA: t.key === '6' ? '—' : fmtAmount(dA.cfeFocusVars[`BAMINTPT${t.key}`]?.valeur ?? null),
    tcB: fmtAmount(dB.cfeFocusVars[`BAMINTCT${t.key}`]?.valeur ?? null),
    ptB: t.key === '6' ? '—' : fmtAmount(dB.cfeFocusVars[`BAMINTPT${t.key}`]?.valeur ?? null),
    hasDelta: false,
  }))
  return rows.filter(r => r.tcA !== '—' || r.tcB !== '—' || r.ptA !== '—' || r.ptB !== '—')
})

const nameA = computed(() => store.data?.meta.libcom ?? store.selected?.name ?? '')
const nameB = computed(() => store.comparaisonData?.meta.libcom ?? store.comparaisonTarget?.name ?? '')

const aiLoading = ref(false)

function analyzeWithAI() {
  // TODO: wire to AI analysis service once architecture is validated (see CLAUDE.md)
}

const forjLabel = computed(() => {
  const f = store.data?.meta.forjepci
  return f ? (FORJ_LABELS[f] ?? f) : null
})

const infoCard = computed(() => {
  const dA = store.data
  const dB = store.comparaisonData
  if (!dA || !dB) return null
  const make = (d: TerritoireData) => ({
    forjepci: d.meta.forjepci && d.meta.forjepci !== 'null' ? d.meta.forjepci : null,
    forjLabel: d.meta.forjepci && d.meta.forjepci !== 'null' ? (FORJ_LABELS[d.meta.forjepci] ?? d.meta.forjepci) : null,
    optepci: d.meta.optepci && d.meta.optepci !== 'null' ? d.meta.optepci : null,
    optLabel: d.meta.optepci && d.meta.optepci !== 'null' ? (OPTEPCI_LABELS[d.meta.optepci] ?? d.meta.optepci) : null,
    population: d.epciDetails?.population ?? null,
    nbCommunes: d.epciDetails?.nbCommunes ?? null,
    surface: d.epciDetails?.surface ?? null,
  })
  return { a: make(dA), b: make(dB) }
})

const displayList = computed(() =>
  searchQuery.value.trim().length >= 2 ? searchResults.value : suggestions.value
)
const listLoading = computed(() =>
  searchQuery.value.trim().length >= 2 ? searchLoading.value : suggestionsLoading.value
)
const listLabel = computed(() =>
  searchQuery.value.trim().length >= 2 ? 'Résultats' : 'EPCI similaires'
)
</script>

<template>
  <Transition name="cv-modal">
    <div class="cv-backdrop" @click.self="store.closeComparaisonEpci()">
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
            <button class="cv-close" aria-label="Fermer" @click="store.closeComparaisonEpci()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div class="cv-divider" />

          <div class="cv-search-wrap">
            <svg class="cv-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <input
              v-model="searchQuery"
              class="cv-search"
              type="text"
              placeholder="Rechercher un EPCI..."
              autocomplete="off"
            />
          </div>

          <div class="cv-list-header">
            <span class="cv-list-label">{{ listLabel }}</span>
            <span v-if="forjLabel && searchQuery.trim().length < 2" class="cv-strate-chip">{{ forjLabel }}</span>
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
              Aucun EPCI similaire trouvé dans la même région.
            </div>
          </div>

          <footer class="cv-footer">
            <span>EPCI de même nature · même région</span>
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
            <button class="cv-close" aria-label="Fermer" @click="store.closeComparaisonEpci()">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div class="cv-col-heads">
            <div class="cv-col-label-placeholder" />
            <div class="cv-col-head cv-col-head--a">{{ nameA }}</div>
            <div class="cv-col-head cv-col-delta" />
            <div class="cv-col-head cv-col-head--b">{{ nameB }}</div>
          </div>

          <div class="cv-divider" />

          <div v-if="infoCard && !store.comparaisonLoading && !store.comparaisonError" class="cv-info-cards">
            <div class="cv-info-card cv-info-card--a">
              <div class="cv-info-top">
                <span v-if="infoCard.a.forjepci" class="cv-info-badge cv-info-badge--forj" :title="infoCard.a.forjLabel || ''">{{ infoCard.a.forjepci }}</span>
                <span v-if="infoCard.a.optepci" class="cv-info-badge cv-info-badge--opt" :title="infoCard.a.optLabel || ''">{{ infoCard.a.optepci }}</span>
              </div>
              <div class="cv-info-row"><span class="cv-info-lbl">Population</span><span class="cv-info-val">{{ fmtPop(infoCard.a.population) }}</span></div>
              <div class="cv-info-row"><span class="cv-info-lbl">Communes</span><span class="cv-info-val">{{ fmtCount(infoCard.a.nbCommunes) }}</span></div>
              <div class="cv-info-row"><span class="cv-info-lbl">Surface</span><span class="cv-info-val">{{ fmtSurface(infoCard.a.surface) }}</span></div>
            </div>
            <div class="cv-info-card cv-info-card--b">
              <div class="cv-info-top">
                <span v-if="infoCard.b.forjepci" class="cv-info-badge cv-info-badge--forj" :title="infoCard.b.forjLabel || ''">{{ infoCard.b.forjepci }}</span>
                <span v-if="infoCard.b.optepci" class="cv-info-badge cv-info-badge--opt" :title="infoCard.b.optLabel || ''">{{ infoCard.b.optepci }}</span>
              </div>
              <div class="cv-info-row"><span class="cv-info-lbl">Population</span><span class="cv-info-val">{{ fmtPop(infoCard.b.population) }}</span></div>
              <div class="cv-info-row"><span class="cv-info-lbl">Communes</span><span class="cv-info-val">{{ fmtCount(infoCard.b.nbCommunes) }}</span></div>
              <div class="cv-info-row"><span class="cv-info-lbl">Surface</span><span class="cv-info-val">{{ fmtSurface(infoCard.b.surface) }}</span></div>
            </div>
          </div>

          <div v-if="store.comparaisonLoading" class="cv-loading">
            <div v-for="i in 6" :key="i" class="skeleton cv-skeleton-row" :style="{ '--w': `${50 + i * 8}%` }" />
          </div>

          <div v-else-if="store.comparaisonError" class="cv-error">
            {{ store.comparaisonError }}
          </div>

          <div v-else class="cv-table">
            <div v-for="section in compareSections" :key="section.title" class="cv-section">
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

            <!-- Bases minimum CFE barème -->
            <div v-if="cfeBasesComparison.length" class="cv-section cv-section--cfe-bases">
              <h3 class="cv-section-title">Bases minimum CFE — barème</h3>
              <div class="cv-cfe-header">
                <span>Tranche CA</span>
                <span class="cv-cfe-col--a">TC (A)</span>
                <span class="cv-cfe-col--b">TC (B)</span>
                <span class="cv-cfe-col--a">PT (A)</span>
                <span class="cv-cfe-col--b">PT (B)</span>
              </div>
              <div v-for="row in cfeBasesComparison" :key="row.tranche" class="cv-cfe-row">
                <span class="cv-cfe-tranche">{{ row.tranche }}</span>
                <span class="cv-cfe-val">{{ row.tcA }}</span>
                <span class="cv-cfe-val cv-cfe-val--b">{{ row.tcB }}</span>
                <span class="cv-cfe-val">{{ row.ptA }}</span>
                <span class="cv-cfe-val cv-cfe-val--b">{{ row.ptB }}</span>
              </div>
            </div>

            <div v-if="!compareSections.length && !cfeBasesComparison.length" class="cv-empty-table">
              Aucun indicateur disponible pour cette comparaison.
            </div>
          </div>

          <footer class="cv-footer">
            <span>REI / DGFiP — {{ store.annee }}</span>
            <button
              v-if="store.comparaisonData && !store.comparaisonError"
              class="cv-ai-btn"
              :disabled="aiLoading"
              @click="analyzeWithAI"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L7.2 4.2H10.5L7.9 6.1L8.9 9.3L6 7.4L3.1 9.3L4.1 6.1L1.5 4.2H4.8L6 1Z" fill="currentColor"/>
              </svg>
              {{ aiLoading ? 'Analyse en cours…' : 'Analyser avec l\'IA' }}
            </button>
          </footer>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cv-modal-enter-active { transition: opacity 300ms ease; }
.cv-modal-enter-active .cv-panel { transition: opacity 300ms ease, transform 380ms cubic-bezier(0.16, 1, 0.3, 1); }
.cv-modal-leave-active { transition: opacity 200ms ease; }
.cv-modal-leave-active .cv-panel { transition: opacity 150ms ease, transform 150ms ease-in; }
.cv-modal-enter-from, .cv-modal-leave-to { opacity: 0; }
.cv-modal-enter-from .cv-panel, .cv-modal-leave-to .cv-panel { opacity: 0; transform: translateY(16px) scale(0.98); }

.cv-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(10, 15, 28, 0.55);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}

.cv-panel {
  position: relative;
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.2);
  width: 100%; max-width: 760px; max-height: 82vh;
  display: flex; flex-direction: column; overflow: hidden;
}

.cv-accent-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--shell-accent) 0%, rgba(240,62,142,0.2) 100%);
  z-index: 1;
}

.cv-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 26px 28px 0; gap: 16px; }
.cv-header--compare { align-items: center; padding: 20px 28px 0; }

.cv-title { font-family: var(--font-display); font-size: 22px; font-weight: 400; letter-spacing: -0.02em; color: var(--text-primary); }
.cv-sub { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-family: var(--font-ui); font-size: 12px; color: var(--text-secondary); }
.cv-commune-a { font-weight: 600; color: var(--text-primary); }
.cv-sub-sep { color: var(--text-muted); }

.cv-close, .cv-back {
  background: none; border: none; cursor: pointer; padding: 8px;
  color: var(--text-muted); border-radius: 8px;
  display: flex; align-items: center; flex-shrink: 0;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.cv-close:hover, .cv-back:hover { color: var(--text-primary); background: var(--surface-hover); }

.cv-vs-header { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; justify-content: center; }
.cv-vs-name { font-family: var(--font-display); font-size: 16px; font-weight: 400; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.cv-vs-name--a { color: var(--text-primary); }
.cv-vs-name--b { color: var(--shell-accent); }
.cv-vs-sep { font-family: var(--font-data); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }

.cv-col-heads { display: grid; grid-template-columns: 1fr 110px 54px 110px; gap: 8px; padding: 12px 28px 0; }
.cv-col-head { font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cv-col-head--a { color: var(--text-secondary); }
.cv-col-head--b { color: var(--shell-accent); }

.cv-divider { height: 1px; background: var(--border-light); margin: 14px 0 0; }

.cv-search-wrap { position: relative; padding: 14px 28px 0; }
.cv-search-icon { position: absolute; left: 40px; top: 50%; transform: translateY(-15%); color: var(--text-muted); pointer-events: none; }
.cv-search { width: 100%; padding: 9px 12px 9px 34px; border-radius: 8px; border: 1px solid var(--border-muted); background: var(--chip-bg); color: var(--text-primary); font-family: var(--font-ui); font-size: 13px; outline: none; transition: border-color var(--transition-fast); box-sizing: border-box; }
.cv-search:focus { border-color: rgba(240, 62, 142, 0.45); }
.cv-search::placeholder { color: var(--text-muted); }

.cv-list-header { display: flex; align-items: center; gap: 8px; padding: 14px 28px 4px; }
.cv-list-label { font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.cv-strate-chip { font-family: var(--font-data); font-size: 10px; background: rgba(39, 103, 73, 0.08); color: #276749; border: 1px solid rgba(39, 103, 73, 0.2); padding: 2px 7px; border-radius: 4px; }

.cv-list { flex: 1; overflow-y: auto; padding: 4px 28px 8px; scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }
.cv-suggestion { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 11px 12px; border-radius: 8px; border: 1px solid var(--border-light); background: transparent; cursor: pointer; text-align: left; margin-bottom: 6px; transition: all var(--transition-fast); }
.cv-suggestion:hover:not(:disabled) { border-color: rgba(240, 62, 142, 0.35); background: rgba(240, 62, 142, 0.04); }
.cv-suggestion:disabled { opacity: 0.5; cursor: not-allowed; }
.cv-sug-body { display: flex; flex-direction: column; gap: 2px; }
.cv-sug-name { font-family: var(--font-ui); font-size: 14px; font-weight: 500; color: var(--text-primary); }
.cv-sug-region { font-family: var(--font-data); font-size: 11px; color: var(--text-muted); }
.cv-sug-arrow { color: var(--text-muted); flex-shrink: 0; opacity: 0; transition: opacity var(--transition-fast); }
.cv-suggestion:hover .cv-sug-arrow { opacity: 1; color: var(--text-gold); }

.cv-list-loading { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
.skeleton { border-radius: 4px; background: linear-gradient(90deg, var(--chip-bg) 25%, var(--border-light) 50%, var(--chip-bg) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
.cv-skeleton { height: 52px; }
.cv-skeleton-row { height: 20px; width: var(--w, 70%); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.cv-empty, .cv-error, .cv-empty-table { padding: 24px 0; text-align: center; font-family: var(--font-ui); font-size: 13px; color: var(--text-muted); }
.cv-error, .cv-empty-table { padding: 32px 28px; }

.cv-loading { padding: 24px 28px; display: flex; flex-direction: column; gap: 12px; }

.cv-table { flex: 1; overflow-y: auto; padding: 8px 0 8px; scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }
.cv-section { padding: 14px 28px 0; }
.cv-section + .cv-section { border-top: 1px solid var(--border-light); margin-top: 14px; padding-top: 16px; }
.cv-section-title { font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }

.cv-row { display: grid; grid-template-columns: 1fr 110px 54px 110px; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--border-light); }
.cv-row:last-child { border-bottom: none; }
.cv-row-label { font-family: var(--font-ui); font-size: 12px; color: var(--text-secondary); }
.cv-row-val { font-family: var(--font-data); font-size: 12px; color: var(--text-primary); text-align: right; white-space: nowrap; }
.cv-row-val--a.cv-row-val--gold { font-size: 15px; color: var(--text-primary); font-family: var(--font-display); font-weight: 500; }
.cv-row-val--b.cv-row-val--gold { font-size: 15px; color: var(--shell-accent); font-family: var(--font-display); font-weight: 500; }
.cv-row-delta { display: flex; justify-content: center; }
.cv-delta-badge { font-family: var(--font-data); font-size: 10px; padding: 2px 5px; border-radius: 4px; white-space: nowrap; }
.cv-delta-badge--up   { background: rgba(185, 28, 28, 0.08); color: #991B1B; }
.cv-delta-badge--down { background: rgba(39, 103, 73, 0.1); color: #276749; }
.cv-delta-badge--eq   { background: var(--chip-bg); color: var(--text-muted); }

.cv-footer { padding: 12px 28px; border-top: 1px solid var(--border-light); font-family: var(--font-data); font-size: 10px; letter-spacing: 0.03em; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }

.cv-ai-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 6px;
  border: 1px solid rgba(240,62,142,0.35);
  background: rgba(240,62,142,0.06);
  color: var(--shell-accent);
  font-family: var(--font-ui); font-size: 11px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.cv-ai-btn:hover:not(:disabled) { background: rgba(240,62,142,0.12); border-color: rgba(240,62,142,0.6); }
.cv-ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cv-section--cfe-bases { border-top: 1px solid var(--border-light); margin-top: 14px; padding-top: 16px; }

.cv-cfe-header {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr;
  padding: 5px 0;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  gap: 4px;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 2px;
}

.cv-cfe-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr;
  padding: 5px 0;
  border-bottom: 1px solid var(--border-light);
  gap: 4px;
  align-items: center;
}
.cv-cfe-row:last-child { border-bottom: none; }

.cv-cfe-tranche {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-secondary);
}

.cv-cfe-val {
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--text-primary);
  text-align: right;
}

.cv-cfe-val--b { color: var(--shell-accent); }
.cv-cfe-col--a { color: var(--text-secondary); text-align: right; }
.cv-cfe-col--b { color: var(--shell-accent); text-align: right; }

/* ── Info cards ──────────────────────────────────────────────── */
.cv-info-cards {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  padding: 14px 28px; border-bottom: 1px solid var(--border-light); flex-shrink: 0;
}
.cv-info-card {
  border-radius: 10px; border: 1px solid var(--border-light);
  padding: 12px 14px; display: flex; flex-direction: column; gap: 7px;
}
.cv-info-card--a { border-left: 2px solid rgba(255,255,255,0.1); }
.cv-info-card--b { border-left: 2px solid rgba(240,62,142,0.4); }
.cv-info-top { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 2px; }
.cv-info-badge {
  font-family: var(--font-data); font-size: 10px; font-weight: 700;
  letter-spacing: 0.05em; padding: 2px 7px; border-radius: 4px; cursor: default;
}
.cv-info-badge--forj { background: rgba(255,255,255,0.04); border: 1px solid var(--border-light); color: var(--text-secondary); }
.cv-info-badge--opt { background: rgba(39,103,73,0.08); border: 1px solid rgba(39,103,73,0.25); color: #276749; }
.cv-info-row { display: flex; justify-content: space-between; align-items: center; }
.cv-info-lbl { font-family: var(--font-ui); font-size: 11px; color: var(--text-muted); }
.cv-info-val { font-family: var(--font-data); font-size: 11px; color: var(--text-primary); }
</style>
