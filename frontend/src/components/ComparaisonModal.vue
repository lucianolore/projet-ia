<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTerritoireStore } from '@/stores/territoire'
import { fetchTerritoireData } from '@/services/rei'
import type { TerritoireData } from '@/types/territoire'

const store = useTerritoireStore()

const data2024 = ref<TerritoireData | null>(null)
const data2025 = ref<TerritoireData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const animated = ref(false)

onMounted(async () => {
  if (!store.selected) return
  try {
    const [r24, r25] = await Promise.all([
      fetchTerritoireData(store.selected, '2024'),
      fetchTerritoireData(store.selected, '2025'),
    ])
    data2024.value = r24
    data2025.value = r25
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erreur de chargement'
  } finally {
    loading.value = false
    setTimeout(() => { animated.value = true }, 60)
  }
})

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

const fmtEvol = (v24: number | null, v25: number | null): { text: string; sign: 'up' | 'down' | 'eq' } | null => {
  if (v24 == null || v25 == null || v24 === 0) return null
  const pct = ((v25 - v24) / v24) * 100
  if (Math.abs(pct) < 0.05) return { text: '=', sign: 'eq' }
  const sign = pct > 0 ? 'up' : 'down'
  return { text: (pct > 0 ? '+' : '') + pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %', sign }
}

interface ChartRow {
  label: string
  section: string
  var: string
  format: 'rate' | 'amount'
}

const CHART_ROWS: ChartRow[] = [
  { label: 'Taux TFB commune',  section: 'Foncier bâti',       var: 'E12', format: 'rate' },
  { label: 'Produit TFB',       section: 'Foncier bâti',       var: 'E13', format: 'amount' },
  { label: 'Base nette TFB',    section: 'Foncier bâti',       var: 'E11', format: 'amount' },
  { label: 'Taux TFNB commune', section: 'Foncier non bâti',   var: 'B12', format: 'rate' },
  { label: 'Produit TFNB',      section: 'Foncier non bâti',   var: 'B13', format: 'amount' },
  { label: 'Taux TEOM',         section: 'TEOM',               var: 'F22', format: 'rate' },
  { label: 'Produit TEOM',      section: 'TEOM',               var: 'F23', format: 'amount' },
]

interface BarItem {
  label: string
  section: string
  v24: number | null
  v25: number | null
  pct24: number
  pct25: number
  fmt24: string
  fmt25: string
  evol: ReturnType<typeof fmtEvol>
}

const bars = computed((): BarItem[] => {
  if (!data2024.value || !data2025.value) return []
  const ind24 = data2024.value.indicateurs
  const ind25 = data2025.value.indicateurs

  return CHART_ROWS
    .map(row => {
      const v24 = ind24[row.var]?.valeur ?? null
      const v25 = ind25[row.var]?.valeur ?? null
      if (v24 == null && v25 == null) return null

      const max = Math.max(v24 ?? 0, v25 ?? 0)
      const pct24 = max > 0 && v24 != null ? (v24 / max) * 100 : 0
      const pct25 = max > 0 && v25 != null ? (v25 / max) * 100 : 0
      const fmt = row.format === 'rate' ? fmtRate : fmtAmount

      return {
        label: row.label,
        section: row.section,
        v24, v25, pct24, pct25,
        fmt24: fmt(v24),
        fmt25: fmt(v25),
        evol: fmtEvol(v24, v25),
      }
    })
    .filter((b): b is BarItem => b !== null)
})

const sections = computed(() => {
  const map = new Map<string, BarItem[]>()
  for (const b of bars.value) {
    if (!map.has(b.section)) map.set(b.section, [])
    map.get(b.section)!.push(b)
  }
  return map
})
</script>

<template>
  <Transition name="modal">
    <div class="modal-backdrop" @click.self="store.closeComparaison()">
      <div class="modal-panel" role="dialog" aria-modal="true">
        <div class="modal-accent-bar" />

        <!-- Header -->
        <header class="modal-header">
          <div>
            <h2 class="modal-title">Évolution fiscale</h2>
            <p class="modal-sub">
              {{ store.data?.meta.libcom ?? store.selected?.name }}
              <span class="modal-years">2024 → 2025</span>
            </p>
          </div>
          <button class="modal-close" aria-label="Fermer" @click="store.closeComparaison()">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <!-- Legend -->
        <div class="modal-legend">
          <span class="legend-item legend-item--24">
            <span class="legend-swatch legend-swatch--24" />
            2024
          </span>
          <span class="legend-item legend-item--25">
            <span class="legend-swatch legend-swatch--25" />
            2025
          </span>
        </div>

        <div class="modal-divider" />

        <!-- Loading -->
        <div v-if="loading" class="modal-loading">
          <div v-for="i in 6" :key="i" class="skeleton skeleton--bar" :style="{ '--w': `${55 + i * 7}%` }" />
        </div>

        <!-- Error -->
        <div v-else-if="error" class="modal-error">{{ error }}</div>

        <!-- Charts -->
        <div v-else class="modal-body">
          <div v-for="[section, items] in sections" :key="section" class="chart-section">
            <h3 class="chart-section-title">{{ section }}</h3>

            <div v-for="bar in items" :key="bar.label" class="chart-row">
              <div class="chart-label">{{ bar.label }}</div>

              <div class="chart-bars">
                <!-- 2024 -->
                <div class="bar-line">
                  <span class="bar-year-tag bar-year-tag--24">24</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill bar-fill--24"
                      :style="{ width: animated ? bar.pct24 + '%' : '0%' }"
                    />
                  </div>
                  <span class="bar-val">{{ bar.fmt24 }}</span>
                </div>
                <!-- 2025 -->
                <div class="bar-line">
                  <span class="bar-year-tag bar-year-tag--25">25</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill bar-fill--25"
                      :style="{ width: animated ? bar.pct25 + '%' : '0%' }"
                    />
                  </div>
                  <span class="bar-val bar-val--25">{{ bar.fmt25 }}</span>
                </div>
              </div>

              <!-- Évolution badge -->
              <div class="chart-evol">
                <span
                  v-if="bar.evol"
                  class="evol-badge"
                  :class="`evol-badge--${bar.evol.sign}`"
                >{{ bar.evol.text }}</span>
              </div>
            </div>
          </div>

          <div v-if="!sections.size" class="modal-empty">
            Aucune donnée disponible pour cette comparaison.
          </div>
        </div>

        <!-- Footer -->
        <footer class="modal-footer">
          <span>Source : REI / DGFiP via OFGL</span>
          <span>Données définitives 2024 · Données 2025</span>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* --- Transition --- */
.modal-enter-active {
  transition: opacity 300ms ease;
}
.modal-enter-active .modal-panel {
  transition: opacity 300ms ease, transform 380ms cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-leave-active {
  transition: opacity 200ms ease;
}
.modal-leave-active .modal-panel {
  transition: opacity 150ms ease, transform 150ms ease-in;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}

/* --- Backdrop + panel --- */
.modal-backdrop {
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

.modal-panel {
  position: relative;
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 560px;
  max-height: 80vh;
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

/* --- Header --- */
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 26px 28px 0;
  gap: 16px;
}

.modal-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.modal-sub {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-years {
  font-family: var(--font-data);
  font-size: 11px;
  background: rgba(240, 62, 142, 0.1);
  color: var(--text-gold);
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(240, 62, 142, 0.2);
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
  margin-top: 2px;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.modal-close:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

/* --- Legend --- */
.modal-legend {
  display: flex;
  gap: 16px;
  padding: 12px 28px 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-swatch {
  width: 12px;
  height: 8px;
  border-radius: 2px;
}
.legend-swatch--24 { background: rgba(240, 62, 142, 0.3); }
.legend-swatch--25 { background: var(--shell-accent); }

.modal-divider {
  height: 1px;
  background: var(--border-light);
  margin: 14px 0 0;
}

/* --- Body --- */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.chart-section {
  padding: 16px 28px 0;
}

.chart-section + .chart-section {
  border-top: 1px solid var(--border-light);
  margin-top: 16px;
  padding-top: 18px;
}

.chart-section-title {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 14px;
}

.chart-row {
  display: grid;
  grid-template-columns: 150px 1fr 72px;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-light);
}
.chart-row:last-child { border-bottom: none; }

.chart-label {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Bars */
.chart-bars {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.bar-line {
  display: flex;
  align-items: center;
  gap: 7px;
}

.bar-year-tag {
  font-family: var(--font-data);
  font-size: 9px;
  letter-spacing: 0.04em;
  width: 16px;
  text-align: right;
  flex-shrink: 0;
}
.bar-year-tag--24 { color: var(--text-muted); }
.bar-year-tag--25 { color: var(--text-gold); }

.bar-track {
  flex: 1;
  height: 8px;
  background: var(--chip-bg);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 600ms cubic-bezier(0.16, 1, 0.3, 1);
}
.bar-fill--24 { background: rgba(240, 62, 142, 0.35); }
.bar-fill--25 { background: var(--shell-accent); }

.bar-val {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 60px;
  text-align: right;
}
.bar-val--25 { color: var(--text-primary); font-weight: 500; }

/* Evolution badge */
.chart-evol {
  display: flex;
  justify-content: flex-end;
}

.evol-badge {
  font-family: var(--font-data);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.evol-badge--up   { background: rgba(39, 103, 73, 0.1); color: #276749; }
.evol-badge--down { background: rgba(185, 28, 28, 0.08); color: #991B1B; }
.evol-badge--eq   { background: var(--chip-bg); color: var(--text-muted); }

/* --- Loading --- */
.modal-loading {
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton--bar {
  height: 18px;
  width: var(--w, 70%);
  background: linear-gradient(90deg, var(--chip-bg) 25%, var(--border-light) 50%, var(--chip-bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* --- Error / Empty --- */
.modal-error,
.modal-empty {
  padding: 32px 28px;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-muted);
}

/* --- Footer --- */
.modal-footer {
  padding: 12px 28px;
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}
</style>
