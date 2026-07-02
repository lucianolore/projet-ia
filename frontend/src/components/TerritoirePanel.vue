<script setup lang="ts">
import { computed } from 'vue'
import { useTerritoireStore } from '@/stores/territoire'
import type { TerritoireData, IndicateurBoolean, IndicateurCategorical } from '@/types/territoire'
import ComparaisonModal from '@/components/ComparaisonModal.vue'
import ComparaisonVilles from '@/components/ComparaisonVilles.vue'
import ComparaisonEpci from '@/components/ComparaisonEpci.vue'

const store = useTerritoireStore()

const STRATE_LABELS: Record<number, string> = {
  1: '< 500 hab', 2: '500–999 hab', 3: '1 000–1 999 hab',
  4: '2 000–4 999 hab', 5: '5 000–9 999 hab', 6: '10 000–19 999 hab',
  7: '20 000–49 999 hab', 8: '50 000–99 999 hab', 9: '100 000–249 999 hab',
  10: '≥ 250 000 hab',
}

const FORJ_LABELS: Record<string, string> = {
  CC: 'Communauté de Communes',
  CA: 'Communauté d\'Agglomération',
  CU: 'Communauté Urbaine',
  MET: 'Métropole',
  EPT: 'Établissement Public Territorial',
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

const isCommune = computed(() => store.selected?.type === 'commune')

const strateLabel = computed(() => {
  if (!isCommune.value || !store.data) return ''
  return STRATE_LABELS[store.data.meta.strate] ?? `Strate ${store.data.meta.strate}`
})

const epciLabel = computed(() => {
  if (!isCommune.value) return null
  const meta = store.data?.meta
  if (!meta?.gfp_ept || meta.gfp_ept === 'null') return null
  const forj = FORJ_LABELS[meta.forjepci] ?? meta.forjepci
  const opt = meta.optepci === 'FPU' ? ' · FPU' : ''
  return { name: meta.gfp_ept, type: `${forj}${opt}`, siren: meta.sirepci }
})

function navigateToEpci() {
  const label = epciLabel.value
  if (!label?.siren || label.siren === 'null') return
  store.select({
    id: label.siren,
    name: label.name,
    type: 'epci',
    region: store.data?.meta.libreg ?? '',
    code: label.siren,
  })
}

interface Section {
  title: string
  rows: Array<{ label: string; value: string; highlight?: boolean }>
}

const sections = computed((): Section[] => {
  const d = store.data
  if (!d) return []
  const ind = d.indicateurs
  const result: Section[] = []

  if (!isCommune.value) {
    // EPCI (GFP) — intercommunality fiscal vars
    const fbRows = []
    if (ind.E32) fbRows.push({ label: 'Taux net', value: fmtRate(ind.E32.valeur), highlight: true })
    if (ind.E32VOTE) fbRows.push({ label: 'Taux voté', value: fmtRate(ind.E32VOTE.valeur) })
    if (ind.E31) fbRows.push({ label: 'Base nette', value: fmtAmount(ind.E31.valeur) })
    if (ind.E33) fbRows.push({ label: 'Produit', value: fmtAmount(ind.E33.valeur) })
    if (fbRows.length) result.push({ title: 'Foncier bâti (GFP)', rows: fbRows })

    const fnbRows = []
    if (ind.B32) fnbRows.push({ label: 'Taux net', value: fmtRate(ind.B32.valeur), highlight: true })
    if (ind.B32VOTE) fnbRows.push({ label: 'Taux voté', value: fmtRate(ind.B32VOTE.valeur) })
    if (ind.B31) fnbRows.push({ label: 'Base nette', value: fmtAmount(ind.B31.valeur) })
    if (ind.B33) fnbRows.push({ label: 'Produit', value: fmtAmount(ind.B33.valeur) })
    if (fnbRows.length) result.push({ title: 'Foncier non bâti (GFP)', rows: fnbRows })

    const cfeRows = []
    if (ind.P32) cfeRows.push({ label: 'Taux net', value: fmtRate(ind.P32.valeur), highlight: true })
    if (ind.P32VOTE) cfeRows.push({ label: 'Taux voté', value: fmtRate(ind.P32VOTE.valeur) })
    if (ind.P31) cfeRows.push({ label: 'Base nette', value: fmtAmount(ind.P31.valeur) })
    if (ind.P33) cfeRows.push({ label: 'Produit', value: fmtAmount(ind.P33.valeur) })
    if (cfeRows.length) result.push({ title: 'CFE (GFP)', rows: cfeRows })

    const teomGfpRows = []
    if (ind.F22GFP) teomGfpRows.push({ label: 'Taux TEOM', value: fmtRate(ind.F22GFP.valeur), highlight: true })
    if (ind.F23GFP) teomGfpRows.push({ label: 'Produit net lissé', value: fmtAmount(ind.F23GFP.valeur) })
    if (teomGfpRows.length) result.push({ title: 'TEOM (GFP)', rows: teomGfpRows })

    return result
  }

  // Commune sections
  const tfbRows = []
  if (ind.E12) tfbRows.push({ label: 'Taux commune', value: fmtRate(ind.E12.valeur), highlight: true })
  if (ind.E11) tfbRows.push({ label: 'Base nette', value: fmtAmount(ind.E11.valeur) })
  if (ind.E13) tfbRows.push({ label: 'Produit', value: fmtAmount(ind.E13.valeur) })
  if (tfbRows.length) result.push({ title: 'Foncier bâti', rows: tfbRows })

  const fnbRows = []
  if (ind.B12) fnbRows.push({ label: 'Taux commune', value: fmtRate(ind.B12.valeur), highlight: true })
  if (ind.B11) fnbRows.push({ label: 'Base nette', value: fmtAmount(ind.B11.valeur) })
  if (ind.B13) fnbRows.push({ label: 'Produit', value: fmtAmount(ind.B13.valeur) })
  if (fnbRows.length) result.push({ title: 'Foncier non bâti', rows: fnbRows })

  const teomRows = []
  if (ind.F22) teomRows.push({ label: 'Taux TEOM', value: fmtRate(ind.F22.valeur), highlight: true })
  if (ind.F23) teomRows.push({ label: 'Produit net lissé', value: fmtAmount(ind.F23.valeur) })
  if (teomRows.length) result.push({ title: 'TEOM', rows: teomRows })

  const thRows = []
  if (ind.H13THS) thRows.push({ label: 'Produit THS', value: fmtAmount(ind.H13THS.valeur) })
  if (thRows.length) result.push({ title: "Taxe d'habitation (sec.)", rows: thRows })

  const ta = d.ta
  if (ta && (ta.communale != null || ta.departementale != null || ta.regionale != null)) {
    const taRows = []
    if (ta.communale != null) taRows.push({ label: 'Part communale', value: fmtRate(ta.communale), highlight: true })
    if (ta.departementale != null) taRows.push({ label: 'Part départementale', value: fmtRate(ta.departementale) })
    if (ta.regionale != null) taRows.push({ label: 'Part régionale', value: fmtRate(ta.regionale) })
    result.push({ title: `Taxe d'aménagement${ta.hasMultipleZones ? ' *' : ''}`, rows: taRows })
  }

  return result
})

type DispositifRow =
  | { label: string; kind: 'boolean'; valeur: boolean | null }
  | { label: string; kind: 'categorical'; valeur: string | null }
  | { label: string; kind: 'rate'; valeur: number }

const dispositifRows = computed((): DispositifRow[] => {
  if (!isCommune.value || !store.data) return []
  const { dispositifs, indicateurs } = store.data
  const rows: DispositifRow[] = []

  const zt = dispositifs.ZT as IndicateurBoolean | undefined
  if (zt) rows.push({ label: 'Zone tendue', kind: 'boolean', valeur: zt.valeur })

  const regime = dispositifs.REGIME as IndicateurCategorical | undefined
  if (regime) rows.push({ label: 'Régime logements vacants', kind: 'categorical', valeur: regime.valeur })

  const thrsInst = dispositifs.THRS_INST as IndicateurBoolean | undefined
  if (thrsInst) rows.push({ label: 'Majoration THRS instaurée', kind: 'boolean', valeur: thrsInst.valeur })

  const txMaj = indicateurs.TXMAJOTHRS
  if (txMaj?.valeur != null && txMaj.valeur > 0) {
    rows.push({ label: 'Taux majoration THRS', kind: 'rate', valeur: txMaj.valeur })
  }

  return rows
})
</script>

<template>
  <Transition name="panel">
    <aside v-if="store.selected" class="territoire-panel">
      <div class="panel-accent-bar" />

      <!-- Header -->
      <header class="tp-header">
        <div class="tp-title-block">
          <h2 class="tp-name">
            {{ store.data?.meta.libcom ?? store.selected.name }}
          </h2>
          <span class="tp-type-badge" :class="`tp-type-badge--${store.selected.type}`">
            {{ store.selected.type === 'commune' ? 'Commune' : 'EPCI' }}
          </span>
        </div>
        <button class="tp-close" aria-label="Fermer" @click="store.close()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </header>

      <!-- Meta -->
      <div v-if="store.data" class="tp-meta">
        <span class="tp-meta-region">{{ store.data.meta.libreg }}</span>
        <span class="tp-meta-sep">·</span>
        <span>{{ store.data.meta.libdep }}</span>
        <span v-if="strateLabel" class="tp-meta-sep">·</span>
        <span v-if="strateLabel" class="tp-meta-strate">{{ strateLabel }}</span>
      </div>

      <!-- EPCI membership -->
      <div v-if="epciLabel" class="tp-epci-badge" role="button" tabindex="0" @click="navigateToEpci()" @keydown.enter="navigateToEpci()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div>
          <span class="tp-epci-name">{{ epciLabel.name }}</span>
          <span class="tp-epci-type">{{ epciLabel.type }}</span>
        </div>
      </div>

      <!-- Divider -->
      <div class="tp-divider" />

      <!-- Year switcher -->
      <div class="tp-year-row">
        <span class="tp-year-label">Données REI</span>
        <div class="tp-year-switcher">
          <button
            v-for="yr in store.availableYears"
            :key="yr"
            class="tp-year-btn"
            :class="{ 'tp-year-btn--active': store.annee === yr }"
            :disabled="store.loading"
            @click="store.setAnnee(yr)"
          >
            {{ yr }}
          </button>
          <button
            class="tp-chart-btn"
            :disabled="store.loading"
            title="Comparer les années"
            @click="store.openComparaison()"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="7" width="2.5" height="5" rx="1" fill="currentColor"/>
              <rect x="5.25" y="4" width="2.5" height="8" rx="1" fill="currentColor"/>
              <rect x="9.5" y="1" width="2.5" height="11" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Compare action -->
      <div v-if="store.data && !store.loading" class="tp-compare-row">
        <button v-if="isCommune" class="tp-compare-btn" @click="store.openComparaisonVilles()">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="2" width="4.5" height="9" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
            <rect x="7.5" y="2" width="4.5" height="9" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          Comparer avec une commune similaire
        </button>
        <button v-else class="tp-compare-btn" @click="store.openComparaisonEpci()">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="2" width="4.5" height="9" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
            <rect x="7.5" y="2" width="4.5" height="9" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          Comparer avec un EPCI similaire
        </button>
      </div>

      <!-- Loading -->
      <div v-if="store.loading" class="tp-loading">
        <div v-for="i in 3" :key="i" class="skeleton-section">
          <div class="skeleton skeleton--title" />
          <div class="skeleton skeleton--row" />
          <div class="skeleton skeleton--row" />
          <div class="skeleton skeleton--row" />
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="store.error" class="tp-error">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10 6v5M10 13.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <p>{{ store.error }}</p>
      </div>

      <!-- Indicators -->
      <div v-else-if="store.data" class="tp-sections">
        <div v-for="section in sections" :key="section.title" class="tp-section">
          <h3 class="tp-section-title">{{ section.title }}</h3>
          <div class="tp-section-rows">
            <div v-for="row in section.rows" :key="row.label" class="tp-row">
              <span class="tp-row-label">{{ row.label }}</span>
              <span class="tp-row-value" :class="{ 'tp-row-value--highlight': row.highlight }">
                {{ row.value }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="!sections.length" class="tp-empty">
          Aucun indicateur disponible pour cette période.
        </div>

        <!-- Dispositifs fiscaux -->
        <div v-if="dispositifRows.length" class="tp-section tp-section--dispositifs">
          <h3 class="tp-section-title">Dispositifs fiscaux</h3>
          <div class="tp-section-rows">
            <div v-for="row in dispositifRows" :key="row.label" class="tp-row">
              <span class="tp-row-label">{{ row.label }}</span>
              <span v-if="row.kind === 'boolean'" class="tp-bool-pill" :class="row.valeur === true ? 'tp-bool-pill--yes' : row.valeur === false ? 'tp-bool-pill--no' : 'tp-bool-pill--unknown'">
                {{ row.valeur === true ? 'Oui' : row.valeur === false ? 'Non' : '—' }}
              </span>
              <span v-else-if="row.kind === 'categorical'" class="tp-categorical-tag">
                {{ row.valeur ?? '—' }}
              </span>
              <span v-else class="tp-row-value tp-row-value--highlight">
                {{ fmtRate(row.valeur) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="tp-footer">
        <div class="tp-footer-left">
          <span class="tp-footer-source">REI / DGFiP · TA / DGFiP</span>
          <span v-if="store.data?.ta?.hasMultipleZones" class="tp-footer-zones">
            * TA : taux principal — zones multiples sur ce territoire
          </span>
        </div>
        <span class="tp-footer-code">
          {{ isCommune ? store.data?.meta.idcom : store.data?.meta.sirepci }}
        </span>
      </footer>
    </aside>
  </Transition>

  <ComparaisonModal v-if="store.showComparaison" />
  <ComparaisonVilles v-if="store.showComparaisonVilles" />
  <ComparaisonEpci v-if="store.showComparaisonEpci" />
</template>

<style scoped>
/* --- Transition --- */
.panel-enter-active {
  transition: opacity 350ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-leave-active {
  transition: opacity 200ms ease, transform 200ms ease-in;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

/* --- Panel shell --- */
.territoire-panel {
  position: absolute;
  right: 20px;
  top: 20px;
  bottom: 20px;
  width: 520px;
  z-index: 10;
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, rgba(184,145,74,0.2) 0%, var(--shell-accent) 100%);
  z-index: 1;
}

/* --- Header --- */
.tp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 26px 24px 0;
  gap: 12px;
}

.tp-title-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.tp-name {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.2;
}

.tp-type-badge {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  width: fit-content;
}

.tp-type-badge--commune {
  background: rgba(44, 82, 130, 0.1);
  color: #2C5282;
}
.tp-type-badge--epci {
  background: rgba(39, 103, 73, 0.1);
  color: #276749;
}

.tp-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: var(--text-muted);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.tp-close:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

/* --- Meta --- */
.tp-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 24px 0;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-secondary);
}
.tp-meta-region { font-weight: 500; }
.tp-meta-sep { color: var(--border-muted); }
.tp-meta-strate {
  font-family: var(--font-data);
  font-size: 11px;
  background: var(--chip-bg);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
}

/* --- EPCI badge --- */
.tp-epci-badge {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 24px 0;
  padding: 10px 12px;
  background: rgba(184, 145, 74, 0.06);
  border: 1px solid rgba(184, 145, 74, 0.18);
  border-radius: 8px;
  color: var(--text-gold);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.tp-epci-badge:hover {
  background: rgba(184, 145, 74, 0.12);
  border-color: rgba(184, 145, 74, 0.35);
}
.tp-epci-badge svg { margin-top: 2px; flex-shrink: 0; }
.tp-epci-name {
  display: block;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.tp-epci-type {
  display: block;
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-gold);
  margin-top: 1px;
}

/* --- Divider / Year --- */
.tp-divider {
  height: 1px;
  background: var(--border-light);
  margin: 16px 0 0;
}
.tp-year-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px 0;
}
.tp-year-label {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tp-year-switcher {
  display: flex;
  gap: 4px;
}

.tp-year-btn {
  font-family: var(--font-data);
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid var(--border-muted);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tp-year-btn:hover:not(:disabled) {
  border-color: var(--shell-accent);
  color: var(--text-secondary);
}

.tp-year-btn--active {
  background: rgba(184, 145, 74, 0.1);
  border-color: rgba(184, 145, 74, 0.35) !important;
  color: var(--text-gold) !important;
}

.tp-year-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tp-chart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border-muted);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-left: 2px;
}

.tp-chart-btn:hover:not(:disabled) {
  border-color: var(--shell-accent);
  color: var(--shell-accent);
  background: rgba(184, 145, 74, 0.06);
}

.tp-chart-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* --- Compare row --- */
.tp-compare-row {
  padding: 10px 24px 0;
}

.tp-compare-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px dashed var(--border-muted);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tp-compare-btn:hover {
  border-color: rgba(184, 145, 74, 0.45);
  color: var(--text-gold);
  background: rgba(184, 145, 74, 0.04);
}

/* --- Sections --- */
.tp-sections {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.tp-section {
  padding: 14px 24px 0;
}

.tp-section + .tp-section {
  border-top: 1px solid var(--border-light);
  margin-top: 14px;
  padding-top: 16px;
}

.tp-section-title {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.tp-section-rows {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tp-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--border-light);
}
.tp-row:last-child { border-bottom: none; }

.tp-row-label {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-secondary);
}

.tp-row-value {
  font-family: var(--font-data);
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 400;
  text-align: right;
}

.tp-row-value--highlight {
  font-size: 16px;
  color: var(--text-gold);
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* --- Loading skeleton --- */
.tp-loading {
  flex: 1;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.skeleton-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton {
  border-radius: 4px;
  background: linear-gradient(90deg, var(--chip-bg) 25%, var(--border-light) 50%, var(--chip-bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
.skeleton--title { height: 12px; width: 40%; }
.skeleton--row { height: 22px; width: 100%; }

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* --- Error --- */
.tp-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  padding: 32px 24px;
  text-align: center;
}
.tp-error p {
  font-family: var(--font-ui);
  font-size: 13px;
}

/* --- Dispositifs --- */
.tp-section--dispositifs {
  border-top: 1px solid var(--border-light);
  margin-top: 14px;
  padding-top: 16px;
}

.tp-bool-pill {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.03em;
}

.tp-bool-pill--yes {
  background: rgba(39, 103, 73, 0.12);
  color: #276749;
}

.tp-bool-pill--no {
  background: rgba(180, 50, 50, 0.1);
  color: #b43232;
}

.tp-bool-pill--unknown {
  background: var(--chip-bg);
  color: var(--text-muted);
}

.tp-categorical-tag {
  font-family: var(--font-data);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--chip-bg);
  padding: 3px 8px;
  border-radius: 4px;
}

/* --- Empty --- */
.tp-empty {
  padding: 32px 24px;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
}

/* --- Footer --- */
.tp-footer {
  padding: 12px 24px;
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tp-footer-source {
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.tp-footer-code {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
}

.tp-footer-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tp-footer-zones {
  font-family: var(--font-ui);
  font-size: 9px;
  color: var(--text-gold);
  font-style: italic;
}
</style>
