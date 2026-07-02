<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import maplibregl from 'maplibre-gl'
import type { CartoRecord, Taxe, Metrique, Niveau, Perimetre, RegionInfo, CartoMode, DispositifCarte } from '@/types/cartographie'
import {
  REGIONS,
  fetchCartoData,
  fetchCartoEvolution,
  computeDisplayValue,
  getAvailableMetriques,
  getAvailableTaxes,
  buildTlvThlvCartoData,
} from '@/services/cartographie'
import {
  fetchCommunesGeojsonByRegion,
  fetchCommunesGeojsonByDept,
  fetchEpciGeojsonByRegion,
  fetchEpciGeojsonByDept,
  fetchDepartementsForRegion,
} from '@/services/geo'

const router = useRouter()

// ─── Constants ────────────────────────────────────────────────────────────────

const TAXE_LABELS: Record<Taxe, string> = {
  TFPB: 'TFPB', TFPNB: 'TFPNB', THRS: 'THRS', CFE: 'CFE', TEOM: 'TEOM',
}

const TAXE_SUBTITLES: Record<Taxe, string> = {
  TFPB:  'Foncier bâti',
  TFPNB: 'Foncier non bâti',
  THRS:  'Hab. résid. sec.',
  CFE:   'Cotis. foncière entr.',
  TEOM:  'Ordures ménagères',
}

const METRIQUE_LABELS: Record<Metrique, string> = {
  taux: 'Taux', base: 'Base', produit: 'Produit',
  produit_hab: 'Produit / hab', base_hab: 'Base / hab', evolution: 'Évolution',
  majoration: 'Majoration THRS', produit_etab: 'Produit / établissement',
}

const MAJO_CLASSES = [
  { code: 0,  color: '#E4EAF2', label: 'Aucune (0 %)' },
  { code: 20, color: '#92B4D6', label: '20 %' },
  { code: 30, color: '#5585B5', label: '30 %' },
  { code: 40, color: '#2E6A9E', label: '40 %' },
  { code: 50, color: '#1A4E78', label: '50 %' },
] as const

const DISPOSITIF_CLASSES: Record<DispositifCarte, Array<{ code: number; color: string; label: string }>> = {
  TLV_THLV: [
    { code: 2, color: '#C0392B', label: 'Zone tendue — TLV' },
    { code: 0, color: '#8E9AAF', label: 'Hors zone tendue — THLV applicable' },
  ],
}

const STRATES = [
  { id: 1, label: '< 500' },      { id: 2, label: '500–999' },
  { id: 3, label: '1k–2k' },      { id: 4, label: '2k–5k' },
  { id: 5, label: '5k–10k' },     { id: 6, label: '10k–20k' },
  { id: 7, label: '20k–50k' },    { id: 8, label: '50k–100k' },
  { id: 9, label: '100k–250k' },  { id: 10, label: '≥ 250k' },
]

const EPCI_TYPES = [
  { key: 'CC', label: 'CC' }, { key: 'CA', label: 'CA' },
  { key: 'CU', label: 'CU' }, { key: 'MET', label: 'Métropole' },
]

const YEARS = ['2025', '2024'] as const
type Annee = (typeof YEARS)[number]

const SEQUENTIAL_COLORS = ['#D9EDD5', '#85C17E', '#3B8A4A', '#1A5730']
const EVOLUTION_COLORS  = ['#D4552B', '#E8A87C', '#85C17E', '#1A5730']
const NO_DATA_COLOR = '#D5CFCA'
const METRO_BOUNDS: maplibregl.LngLatBoundsLike = [[-8, 39.5], [12, 52.5]]

const METRO_REGIONS = REGIONS.filter(r => !r.dom)
const DOM_REGIONS   = REGIONS.filter(r => r.dom)

// ─── State ────────────────────────────────────────────────────────────────────

const mapContainer = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
let pendingGeojson: object | null = null
 
let cachedGeojson: { features: Array<{ properties?: Record<string, unknown> }> } | null = null

const perimetreType    = ref<'region' | 'departement' | null>(null)
const selectedRegion   = ref<RegionInfo | null>(null)
const selectedDeptRegion = ref<RegionInfo | null>(null)
const selectedDept     = ref<{ code: string; nom: string } | null>(null)
const selectedNiveau   = ref<Niveau | null>(null)
const cartoMode        = ref<CartoMode>('fiscal')
const selectedDispositifCarte = ref<DispositifCarte | null>(null)
const selectedTaxe     = ref<Taxe | null>(null)
const selectedMetrique = ref<Metrique | null>(null)
const selectedAnnee    = ref<Annee>('2024')
const selectedStrates  = ref<number[]>([])
const selectedTypeEpci = ref<string | null>(null)

const depts        = ref<Array<{ code: string; nom: string }>>([])
const deptsLoading = ref(false)
const geoLoading   = ref(false)
const dataLoading  = ref(false)
const loadError    = ref<string | null>(null)
const styleLoaded  = ref(false)
const geoLoaded    = ref(false)

const cartoData = ref<Map<string, CartoRecord>>(new Map())

const tooltip = ref({ visible: false, x: 0, y: 0, name: '', value: null as number | null, valeurN1Display: null as number | null, categLabel: null as string | null })
let hoveredId: string | null = null

const modalClass = ref<number | null>(null)

// ─── Computed ─────────────────────────────────────────────────────────────────

const perimetre = computed<Perimetre | null>(() => {
  if (!perimetreType.value) return null
  if (perimetreType.value === 'region' && selectedRegion.value) {
    return { type: 'region', code: selectedRegion.value.code, label: selectedRegion.value.label }
  }
  if (perimetreType.value === 'departement' && selectedDept.value) {
    return { type: 'departement', code: selectedDept.value.code, label: selectedDept.value.nom }
  }
  return null
})

const isReady = computed(() => {
  if (!perimetre.value || !selectedNiveau.value) return false
  if (cartoMode.value === 'dispositif') return selectedDispositifCarte.value !== null
  return selectedTaxe.value !== null && selectedMetrique.value !== null
})

const availableTaxes    = computed(() => selectedNiveau.value ? getAvailableTaxes(selectedNiveau.value) : [])
const availableMetriques = computed(() =>
  selectedTaxe.value && selectedNiveau.value
    ? getAvailableMetriques(selectedTaxe.value, selectedNiveau.value)
    : [],
)

const classColors = computed(() =>
  selectedMetrique.value === 'evolution' ? EVOLUTION_COLORS : SEQUENTIAL_COLORS,
)

const displayValues = computed((): Map<string, number | null> => {
  if (!selectedMetrique.value) return new Map()
  const out = new Map<string, number | null>()
  for (const [code, rec] of cartoData.value) {
    out.set(code, computeDisplayValue(rec, selectedMetrique.value))
  }
  return out
})

const sortedVals = computed(() =>
  [...displayValues.value.values()].filter((v): v is number => v != null).sort((a, b) => a - b),
)

const breaks = computed((): [number, number, number] => {
  const v = sortedVals.value
  if (v.length < 4) return [0, 0, 0]
  const n = v.length
  return [v[Math.floor(n * 0.25)]!, v[Math.floor(n * 0.5)]!, v[Math.floor(n * 0.75)]!]
})

const stats = computed(() => {
  const v = sortedVals.value
  if (!v.length) return null
  const n = v.length
  const mid = Math.floor(n / 2)
  const median = n % 2 === 0 ? ((v[mid - 1]! + v[mid]!) / 2) : v[mid]!
  return { min: v[0]!, max: v[n - 1]!, median, count: n }
})

const legendClasses = computed(() => {
  const v = sortedVals.value
  const [q1, q2, q3] = breaks.value
  const colors = classColors.value
  const min = v[0] ?? 0
  const max = v[v.length - 1] ?? 0
  const f = formatVal
  return [
    { color: colors[0]!, label: `${f(min)} – ${f(q1)}`, count: v.filter(x => x < q1).length },
    { color: colors[1]!, label: `${f(q1)} – ${f(q2)}`, count: v.filter(x => x >= q1 && x < q2).length },
    { color: colors[2]!, label: `${f(q2)} – ${f(q3)}`, count: v.filter(x => x >= q2 && x < q3).length },
    { color: colors[3]!, label: `${f(q3)} – ${f(max)}`, count: v.filter(x => x >= q3).length },
  ]
})

const majoLegendClasses = computed(() => {
  if (selectedMetrique.value !== 'majoration') return null
  const vals = displayValues.value
  return MAJO_CLASSES.map(cls => ({
    ...cls,
    count: [...vals.values()].filter(v => v === cls.code).length,
  }))
})

const dispositifLegendClasses = computed(() => {
  if (cartoMode.value !== 'dispositif' || !selectedDispositifCarte.value) return null
  const data = cartoData.value
  return DISPOSITIF_CLASSES[selectedDispositifCarte.value].map(cls => ({
    ...cls,
    count: [...data.values()].filter(r => r.valeur === cls.code).length,
  }))
})

const currentLabel = computed(() => {
  if (cartoMode.value === 'dispositif') {
    if (selectedDispositifCarte.value === 'TLV_THLV') return 'TLV / THLV — Logements vacants'
    return ''
  }
  if (!selectedTaxe.value || !selectedMetrique.value) return ''
  return `${TAXE_LABELS[selectedTaxe.value]} · ${METRIQUE_LABELS[selectedMetrique.value]}`
})

const isLoading = computed(() => geoLoading.value || dataLoading.value)

const modalItems = computed((): Array<{ name: string; code: string; value: number }> => {
  if (modalClass.value === null) return []
  const idx = modalClass.value
  const items: Array<{ name: string; code: string; value: number }> = []

  if (selectedMetrique.value === 'majoration') {
    const targetCode = MAJO_CLASSES[idx]?.code
    if (targetCode === undefined) return []
    for (const [code, val] of displayValues.value) {
      if (val !== targetCode) continue
      const rec = cartoData.value.get(code)
      items.push({ name: rec?.name ?? code, code, value: val })
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }

  const [q1, q2, q3] = breaks.value
  for (const [code, val] of displayValues.value) {
    if (val === null) continue
    const inClass =
      idx === 0 ? val < q1 :
      idx === 1 ? val >= q1 && val < q2 :
      idx === 2 ? val >= q2 && val < q3 :
      val >= q3
    if (inClass) {
      const rec = cartoData.value.get(code)
      items.push({ name: rec?.name ?? code, code, value: val })
    }
  }
  return items.sort((a, b) => a.value - b.value)
})

// ─── Navigation ───────────────────────────────────────────────────────────────

function openTerritoireTab(item: { name: string; code: string }) {
  const type = selectedNiveau.value === 'epci' ? 'epci' : 'commune'
  const url = router.resolve({ path: '/', query: { territoire: item.code, type, nom: item.name } }).href
  window.open(url, '_blank', 'noopener')
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatVal(v: number | null): string {
  if (v == null) return '—'
  const m = selectedMetrique.value
  const loc = (n: number, dec = 2) =>
    n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  if (!m) return loc(v)
  switch (m) {
    case 'taux':    return `${loc(v)} %`
    case 'base':
    case 'produit': {
      const abs = Math.abs(v)
      if (abs >= 1_000_000_000) return (v / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Md €'
      if (abs >= 1_000_000)     return (v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M €'
      if (abs >= 1_000)         return (v / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' k€'
      return loc(v, 0) + ' €'
    }
    case 'base_hab':
    case 'produit_hab': return `${loc(v, 2)} €/hab`
    case 'evolution': return `${v >= 0 ? '+' : ''}${loc(v)} %`
    case 'majoration': return v === 0 ? 'Aucune' : `${loc(v, 0)} %`
    case 'produit_etab': return `${loc(v, 2)} €/étab`
  }
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

const SOURCE_ID = 'territories'
const FILL_ID   = 'territories-fill'
const LINE_ID   = 'territories-line'

function colorExpr(): unknown[] {
  if (cartoMode.value === 'dispositif' && selectedDispositifCarte.value) {
    const classes = DISPOSITIF_CLASSES[selectedDispositifCarte.value]
    const args: unknown[] = ['match', ['coalesce', ['feature-state', 'value'], -1]]
    for (const cls of classes) { args.push(cls.code, cls.color) }
    args.push(NO_DATA_COLOR)
    return args
  }
  if (selectedMetrique.value === 'majoration') {
    const args: unknown[] = ['match', ['coalesce', ['feature-state', 'value'], -1]]
    for (const cls of MAJO_CLASSES) { args.push(cls.code, cls.color) }
    args.push(NO_DATA_COLOR)
    return args
  }
  const [q1, q2, q3] = breaks.value
  const colors = classColors.value

  // Si les breaks ne sont pas strictement croissants (ex: données insuffisantes ou uniformes),
  // MapLibre rejetterait l'expression step avec des stops dupliqués.
  if (q1 === q2 || q2 === q3 || q1 === q3) {
    // Fallback : 2 classes autour de la médiane (ou 0 pour l'évolution)
    const pivot = sortedVals.value.length > 0
      ? sortedVals.value[Math.floor(sortedVals.value.length / 2)]!
      : 0
    return [
      'step',
      ['coalesce', ['feature-state', 'value'], -9999],
      NO_DATA_COLOR,
      -9998, colors[0],
      pivot,  colors[3],
    ]
  }

  return [
    'step',
    ['coalesce', ['feature-state', 'value'], -9999],
    NO_DATA_COLOR,
    -9998, colors[0],
    q1,    colors[1],
    q2,    colors[2],
    q3,    colors[3],
  ]
}

function removeLayers() {
  if (!map) return
  if (map.getLayer(FILL_ID)) map.removeLayer(FILL_ID)
  if (map.getLayer(LINE_ID)) map.removeLayer(LINE_ID)
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  geoLoaded.value = false
}

function addLayers(geojson: object) {
  if (!map || !styleLoaded.value) return
  removeLayers()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedGeojson = geojson as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.addSource(SOURCE_ID, { type: 'geojson', data: geojson as any, promoteId: 'code' })

  map.addLayer({
    id: FILL_ID,
    type: 'fill',
    source: SOURCE_ID,
    paint: {
      'fill-color': NO_DATA_COLOR,
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.94, 0.78],
    },
  })

  map.addLayer({
    id: LINE_ID,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': [
        'case', ['boolean', ['feature-state', 'hover'], false],
        '#F03E8E', 'rgba(255,255,255,0.35)',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.0, 0.5],
    },
  })

  map.on('mousemove', FILL_ID, handleMouseMove)
  map.on('mouseleave', FILL_ID, handleMouseLeave)
  geoLoaded.value = true
}

function handleMouseMove(e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
  if (!e.features?.length || !map) return
  const f = e.features[0]!
  const id = String(f.id ?? '')

  if (hoveredId !== null && hoveredId !== id) {
    map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false })
  }
  hoveredId = id
  map.setFeatureState({ source: SOURCE_ID, id }, { hover: true })

  const code = String(f.properties?.code ?? id)
  const rec = cartoData.value.get(code)

  let val: number | null = null
  let valeurN1Display: number | null = null
  let categLabel: string | null = null

  if (cartoMode.value === 'dispositif') {
    val = rec?.valeur ?? null
    const dispClasses = selectedDispositifCarte.value ? DISPOSITIF_CLASSES[selectedDispositifCarte.value] : []
    categLabel = dispClasses.find(c => c.code === val)?.label ?? null
  } else {
    val = rec && selectedMetrique.value ? computeDisplayValue(rec, selectedMetrique.value) : null
    valeurN1Display = rec && selectedMetrique.value && selectedMetrique.value !== 'evolution' && rec.valeurN1 != null
      ? computeDisplayValue({ ...rec, valeur: rec.valeurN1 }, selectedMetrique.value)
      : null
  }

  tooltip.value = { visible: true, x: e.point.x + 14, y: e.point.y, name: f.properties?.nom ?? code, value: val, valeurN1Display, categLabel }
  map.getCanvas().style.cursor = 'pointer'
}

function handleMouseLeave() {
  if (hoveredId !== null && map) {
    map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false })
    hoveredId = null
  }
  tooltip.value.visible = false
  if (map) map.getCanvas().style.cursor = ''
}

function updateMapData() {
  if (!map || !geoLoaded.value) return
  map.removeFeatureState({ source: SOURCE_ID })

  if (cartoMode.value === 'dispositif') {
    for (const [code, rec] of cartoData.value) {
      if (rec.valeur !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: code }, { value: rec.valeur })
      }
    }
  } else {
    for (const [code, rec] of cartoData.value) {
      const val = selectedMetrique.value ? computeDisplayValue(rec, selectedMetrique.value) : null
      map.setFeatureState({ source: SOURCE_ID, id: code }, { value: val ?? null })
    }
  }

  if (map.getLayer(FILL_ID)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setPaintProperty(FILL_ID, 'fill-color', colorExpr() as any)
  }
}

function flyToRegion(r: RegionInfo) {
  if (!map) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (r.dom) map.setMaxBounds(null as any)
  else map.setMaxBounds(METRO_BOUNDS)
  map.flyTo({ center: r.center, zoom: r.zoom, duration: 800 })
}

function computeGeojsonBounds(
  geojson: { features: unknown[] },
): [[number, number], [number, number]] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity

  function scan(c: unknown): void {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number') {
      const [lng, lat] = c as [number, number]
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    } else { for (const item of c) scan(item) }
  }

  for (const f of geojson.features as Array<{ geometry?: { coordinates: unknown } }>) {
    if (f?.geometry?.coordinates) scan(f.geometry.coordinates)
  }
  return isFinite(minLng) ? [[minLng, minLat], [maxLng, maxLat]] : null
}

function zoomToDept(geojson: object) {
  if (!map) return
  const bounds = computeGeojsonBounds(geojson as { features: unknown[] })
  if (bounds) map.fitBounds(bounds as maplibregl.LngLatBoundsLike, { padding: 60, duration: 900 })
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadGeometry() {
  if (!perimetre.value || !selectedNiveau.value) return
  geoLoading.value = true
  loadError.value = null

  try {
    const p = perimetre.value
    const n = selectedNiveau.value
    let geojson: object

    if (n === 'communes') {
      geojson = p.type === 'region'
        ? await fetchCommunesGeojsonByRegion(p.code)
        : await fetchCommunesGeojsonByDept(p.code)
    } else {
      geojson = p.type === 'region'
        ? await fetchEpciGeojsonByRegion(p.code)
        : await fetchEpciGeojsonByDept(p.code)
    }

    if (styleLoaded.value) {
      addLayers(geojson)
      if (perimetreType.value === 'departement') zoomToDept(geojson)
    } else {
      pendingGeojson = geojson
    }
  } catch {
    loadError.value = 'Impossible de charger les contours géographiques.'
  } finally {
    geoLoading.value = false
  }
}

async function loadDispositifData() {
  if (!selectedDispositifCarte.value || !cachedGeojson) return
  dataLoading.value = true
  try {
    const codes = cachedGeojson.features.map(f => String(f.properties?.code ?? '')).filter(Boolean)
    if (selectedDispositifCarte.value === 'TLV_THLV') {
      cartoData.value = buildTlvThlvCartoData(codes)
    }
    updateMapData()
  } finally {
    dataLoading.value = false
  }
}

async function loadData() {
  if (!isReady.value || !perimetre.value) return

  if (cartoMode.value === 'dispositif') {
    await loadDispositifData()
    return
  }

  dataLoading.value = true
  loadError.value = null

  try {
    const filters = {
      perimetre: perimetre.value,
      niveau: selectedNiveau.value!,
      taxe: selectedTaxe.value!,
      metrique: selectedMetrique.value!,
      annee: selectedAnnee.value,
      strates: selectedStrates.value,
      typeEpci: selectedTypeEpci.value,
    }

    cartoData.value = selectedMetrique.value === 'evolution'
      ? await fetchCartoEvolution(filters)
      : await fetchCartoData(filters)
    updateMapData()
  } catch {
    loadError.value = 'Impossible de charger les données fiscales.'
  } finally {
    dataLoading.value = false
  }
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

// périmètre + niveau change → geometry + data
watch(
  () => `${perimetre.value?.type}:${perimetre.value?.code}:${selectedNiveau.value}`,
  async () => {
    if (!perimetre.value || !selectedNiveau.value) return
    cartoData.value = new Map()
    await loadGeometry()
    if (isReady.value) await loadData()
  },
)

// taxe change → validate métrique
watch(selectedTaxe, () => {
  if (!selectedTaxe.value || !selectedNiveau.value) { selectedMetrique.value = null; return }
  if (selectedMetrique.value && !getAvailableMetriques(selectedTaxe.value, selectedNiveau.value).includes(selectedMetrique.value)) {
    selectedMetrique.value = null
  }
})

// niveau change → reset downstream (EPCI forces fiscal mode)
watch(selectedNiveau, () => {
  selectedTaxe.value = null
  selectedMetrique.value = null
  selectedStrates.value = []
  selectedTypeEpci.value = null
  if (selectedNiveau.value === 'epci') {
    cartoMode.value = 'fiscal'
    selectedDispositifCarte.value = null
  }
})

// mode change → reset downstream
watch(cartoMode, () => {
  selectedTaxe.value = null
  selectedMetrique.value = null
  selectedDispositifCarte.value = null
  cartoData.value = new Map()
})

// dispositif selection → load static data
watch(selectedDispositifCarte, async () => {
  if (cartoMode.value !== 'dispositif' || !selectedDispositifCarte.value || !geoLoaded.value) return
  await loadDispositifData()
})

// data params change → reload data (fiscal mode only)
watch(
  () => [
    selectedTaxe.value,
    selectedMetrique.value,
    selectedAnnee.value,
    selectedStrates.value.join(','),
    selectedTypeEpci.value,
  ],
  async () => {
    if (cartoMode.value !== 'fiscal') return
    if (!isReady.value || !geoLoaded.value) return
    await loadData()
  },
)

// perimetreType change → reset everything
watch(perimetreType, () => {
  selectedRegion.value = null
  selectedDeptRegion.value = null
  selectedDept.value = null
  selectedNiveau.value = null
  selectedTaxe.value = null
  selectedMetrique.value = null
  selectedStrates.value = []
  selectedTypeEpci.value = null
  cartoData.value = new Map()
  depts.value = []
  removeLayers()
})

// dept region filter → fetch depts
watch(selectedDeptRegion, async (reg) => {
  selectedDept.value = null
  selectedNiveau.value = null
  if (!reg) { depts.value = []; return }
  deptsLoading.value = true
  try {
    depts.value = await fetchDepartementsForRegion(reg.code)
  } finally {
    deptsLoading.value = false
  }
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  if (!mapContainer.value) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256, maxzoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      layers: [{
        id: 'osm', type: 'raster', source: 'osm',
        paint: { 'raster-saturation': -0.55, 'raster-brightness-max': 0.88 },
      }],
    },
    center: [2.35, 46.8],
    zoom: 5.3,
    minZoom: 4,
    maxZoom: 16,
    maxBounds: METRO_BOUNDS,
  })

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
  map.scrollZoom.setWheelZoomRate(1 / 250)

  map.on('load', () => {
    styleLoaded.value = true
    if (pendingGeojson) {
      const g = pendingGeojson
      addLayers(g)
      pendingGeojson = null
      if (perimetreType.value === 'departement') zoomToDept(g)
      if (isReady.value) updateMapData()
    }
  })
})

onBeforeUnmount(() => map?.remove())

// ─── UI helpers ───────────────────────────────────────────────────────────────

function toggleStrate(id: number) {
  const i = selectedStrates.value.indexOf(id)
  if (i >= 0) selectedStrates.value.splice(i, 1)
  else selectedStrates.value.push(id)
}

function pickRegion(r: RegionInfo) {
  selectedRegion.value = r
  flyToRegion(r)
}

function pickDept(d: { code: string; nom: string }) {
  selectedDept.value = d
}
</script>

<template>
  <div class="carto-view">
    <div ref="mapContainer" class="carto-map" />

    <!-- Nav -->
    <button class="nav-home" @click="router.push('/')">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M8 2L3 6.5 8 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Carte principale
    </button>

    <!-- Loading overlay -->
    <Transition name="fade">
      <div v-if="isLoading" class="carto-overlay">
        <div class="overlay-ring" />
        <p class="overlay-text">
          {{ geoLoading ? 'Chargement des contours…' : 'Chargement des données…' }}
        </p>
      </div>
    </Transition>

    <!-- Error overlay -->
    <Transition name="fade">
      <div v-if="loadError && !isLoading" class="carto-overlay carto-overlay--error">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 8v5M12 16v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <p class="overlay-text">{{ loadError }}</p>
        <button class="err-retry" @click="loadError = null">Fermer</button>
      </div>
    </Transition>

    <!-- ── Sidebar ──────────────────────────────────────────────────────────── -->
    <aside class="carto-sidebar">
      <div class="sb-accent-bar" />

      <div class="sb-scroll">
        <!-- Brand -->
        <div class="sb-head">
          <div class="sb-brand">
            <img src="@/assets/logo.png" class="sb-brand-logo" alt="Géofiscal" />
            <span class="sb-brand-name">géofiscal</span>
            <span class="sb-brand-tag">fiscalité locale</span>
          </div>
          <h1 class="sb-title">Analyse<br>fiscale</h1>
          <p class="sb-sub">Cartographie par territoire</p>
        </div>

        <div class="sb-sep" />

        <!-- 1. PÉRIMÈTRE TYPE -->
        <div class="sb-section">
          <p class="sb-label">PÉRIMÈTRE</p>
          <div class="niv-track">
            <button
              class="niv-btn"
              :class="{ 'niv-btn--on': perimetreType === 'region' }"
              @click="perimetreType = 'region'"
            >Région</button>
            <button
              class="niv-btn"
              :class="{ 'niv-btn--on': perimetreType === 'departement' }"
              @click="perimetreType = 'departement'"
            >Département</button>
          </div>

          <!-- Region picker -->
          <template v-if="perimetreType === 'region'">
            <p class="list-group-label">Métropole</p>
            <div class="territory-list territory-list--scrollable">
              <button
                v-for="r in METRO_REGIONS"
                :key="r.code"
                class="territory-item"
                :class="{ 'territory-item--on': selectedRegion?.code === r.code }"
                @click="pickRegion(r)"
              >{{ r.label }}</button>
            </div>
            <p class="list-group-label">DOM-TOM</p>
            <div class="territory-list">
              <button
                v-for="r in DOM_REGIONS"
                :key="r.code"
                class="territory-item"
                :class="{ 'territory-item--on': selectedRegion?.code === r.code }"
                @click="pickRegion(r)"
              >{{ r.label }}</button>
            </div>
          </template>

          <!-- Dept picker -->
          <template v-if="perimetreType === 'departement'">
            <p class="list-group-label">Filtrer par région</p>
            <div class="territory-list territory-list--sm">
              <button
                v-for="r in METRO_REGIONS"
                :key="r.code"
                class="territory-item territory-item--compact"
                :class="{ 'territory-item--on': selectedDeptRegion?.code === r.code }"
                @click="selectedDeptRegion = r"
              >{{ r.label }}</button>
            </div>

            <template v-if="selectedDeptRegion">
              <p class="list-group-label">
                {{ selectedDeptRegion.label }}
                <span v-if="deptsLoading" class="loading-dot">…</span>
              </p>
              <div class="territory-list territory-list--dept">
                <button
                  v-for="d in depts"
                  :key="d.code"
                  class="territory-item territory-item--dept"
                  :class="{ 'territory-item--on': selectedDept?.code === d.code }"
                  @click="pickDept(d)"
                >
                  <span class="dept-code">{{ d.code }}</span>
                  <span class="dept-name">{{ d.nom }}</span>
                </button>
              </div>
            </template>
          </template>
        </div>

        <!-- 2. NIVEAU -->
        <Transition name="step">
          <div v-if="perimetre" class="sb-section">
            <div class="sb-sep-sm" />
            <p class="sb-label">NIVEAU D'ANALYSE</p>
            <div class="niv-track">
              <button
                class="niv-btn"
                :class="{ 'niv-btn--on': selectedNiveau === 'communes' }"
                @click="selectedNiveau = 'communes'"
              >Communes</button>
              <button
                class="niv-btn"
                :class="{ 'niv-btn--on': selectedNiveau === 'epci' }"
                @click="selectedNiveau = 'epci'"
              >EPCI</button>
            </div>
          </div>
        </Transition>

        <!-- MODE (communes uniquement) -->
        <Transition name="step">
          <div v-if="selectedNiveau === 'communes'" class="sb-section">
            <div class="sb-sep-sm" />
            <p class="sb-label">MODE</p>
            <div class="niv-track">
              <button
                class="niv-btn"
                :class="{ 'niv-btn--on': cartoMode === 'fiscal' }"
                @click="cartoMode = 'fiscal'"
              >Fiscalité</button>
              <button
                class="niv-btn"
                :class="{ 'niv-btn--on': cartoMode === 'dispositif' }"
                @click="cartoMode = 'dispositif'"
              >Dispositifs</button>
            </div>
          </div>
        </Transition>

        <!-- CATÉGORIE (mode dispositif) -->
        <Transition name="step">
          <div v-if="selectedNiveau === 'communes' && cartoMode === 'dispositif'" class="sb-section">
            <div class="sb-sep-sm" />
            <p class="sb-label">CATÉGORIE</p>
            <div class="ind-list">
              <button
                class="ind-btn"
                :class="{ 'ind-btn--on': selectedDispositifCarte === 'TLV_THLV' }"
                @click="selectedDispositifCarte = 'TLV_THLV'"
              >
                <span class="ind-dot" />
                TLV / THLV — Logements vacants
              </button>
            </div>
            <p class="dispositif-note">Zone tendue (arrêté 2013) · THLV instaurée : source à intégrer</p>
          </div>
        </Transition>

        <!-- 3. TAXE (mode fiscal uniquement) -->
        <Transition name="step">
          <div v-if="selectedNiveau && cartoMode === 'fiscal'" class="sb-section">
            <div class="sb-sep-sm" />
            <p class="sb-label">TAXE</p>
            <div class="taxe-grid">
              <button
                v-for="t in availableTaxes"
                :key="t"
                class="taxe-btn"
                :class="{ 'taxe-btn--on': selectedTaxe === t }"
                @click="selectedTaxe = t"
              >
                <span class="taxe-key">{{ TAXE_LABELS[t] }}</span>
                <span class="taxe-sub">{{ TAXE_SUBTITLES[t] }}</span>
              </button>
            </div>
          </div>
        </Transition>

        <!-- 4. MÉTRIQUE (mode fiscal uniquement) -->
        <Transition name="step">
          <div v-if="selectedTaxe && cartoMode === 'fiscal'" class="sb-section">
            <div class="sb-sep-sm" />
            <p class="sb-label">MÉTRIQUE</p>
            <div class="ind-list">
              <button
                v-for="m in availableMetriques"
                :key="m"
                class="ind-btn"
                :class="{ 'ind-btn--on': selectedMetrique === m }"
                @click="selectedMetrique = m"
              >
                <span class="ind-dot" />
                {{ METRIQUE_LABELS[m] }}
              </button>
            </div>
          </div>
        </Transition>

        <!-- ANNÉE (mode fiscal uniquement) -->
        <div v-if="cartoMode === 'fiscal'" class="sb-section">
          <div class="sb-sep-sm" />
          <p class="sb-label">ANNÉE</p>
          <div class="year-row">
            <button
              v-for="yr in YEARS"
              :key="yr"
              class="yr-btn"
              :class="{ 'yr-btn--on': selectedAnnee === yr }"
              @click="selectedAnnee = yr"
            >{{ yr }}</button>
          </div>
        </div>

        <!-- FILTRES (mode fiscal uniquement) -->
        <Transition name="step">
          <div v-if="selectedNiveau && cartoMode === 'fiscal'" class="sb-section">
            <div class="sb-sep-sm" />
            <p class="sb-label">FILTRES</p>

            <!-- Strates (communes) -->
            <template v-if="selectedNiveau === 'communes'">
              <p class="filter-sublabel">Strates démographiques</p>
              <div class="strate-grid">
                <button
                  v-for="s in STRATES"
                  :key="s.id"
                  class="strate-chip"
                  :class="{ 'strate-chip--on': selectedStrates.includes(s.id) }"
                  @click="toggleStrate(s.id)"
                >{{ s.label }}</button>
              </div>
            </template>

            <!-- Type EPCI -->
            <template v-if="selectedNiveau === 'epci'">
              <p class="filter-sublabel">Type d'EPCI</p>
              <div class="epci-type-row">
                <button
                  class="epci-type-btn"
                  :class="{ 'epci-type-btn--on': selectedTypeEpci === null }"
                  @click="selectedTypeEpci = null"
                >Tous</button>
                <button
                  v-for="et in EPCI_TYPES"
                  :key="et.key"
                  class="epci-type-btn"
                  :class="{ 'epci-type-btn--on': selectedTypeEpci === et.key }"
                  @click="selectedTypeEpci = et.key"
                >{{ et.label }}</button>
              </div>
            </template>
          </div>
        </Transition>

        <div class="sb-sep" />

        <!-- STATISTIQUES (mode fiscal uniquement) -->
        <Transition name="fade">
          <div v-if="stats && !isLoading && cartoMode === 'fiscal'" class="sb-section">
            <p class="sb-label">STATISTIQUES · {{ stats.count }} territoires</p>
            <div class="stats-row">
              <div class="stat-card">
                <span class="stat-lbl">Min</span>
                <span class="stat-val">{{ formatVal(stats.min) }}</span>
              </div>
              <div class="stat-card stat-card--median">
                <span class="stat-lbl">Médiane</span>
                <span class="stat-val stat-val--gold">{{ formatVal(stats.median) }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-lbl">Max</span>
                <span class="stat-val">{{ formatVal(stats.max) }}</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <footer class="sb-foot">
        <span>{{ cartoMode === 'dispositif' ? 'Zones tendues / DGFiP' : 'REI / DGFiP' }}</span>
        <span>{{ cartoMode === 'dispositif' ? 'Statique' : selectedAnnee }}</span>
      </footer>
    </aside>

    <!-- ── Legend ────────────────────────────────────────────────────────────── -->
    <Transition name="leg">
      <div v-if="geoLoaded && cartoData.size > 0 && !isLoading" class="carto-legend">
        <div class="leg-title">{{ currentLabel }}</div>

        <!-- Dispositif mode: légende catégorielle statique -->
        <template v-if="cartoMode === 'dispositif' && dispositifLegendClasses">
          <div class="leg-classes">
            <div v-for="cls in dispositifLegendClasses" :key="cls.code" class="leg-row">
              <span class="leg-swatch" :style="{ background: cls.color }" />
              <span class="leg-range">{{ cls.label }}</span>
              <span class="leg-count">({{ cls.count }})</span>
            </div>
            <div class="leg-row leg-nodata">
              <span class="leg-swatch" :style="{ background: NO_DATA_COLOR }" />
              <span class="leg-range">Sans données</span>
            </div>
          </div>
          <div class="leg-src">Zones tendues — arrêté du 1er août 2013</div>
        </template>

        <!-- Fiscal mode — majoration THRS: légende à classes fixes -->
        <template v-else-if="selectedMetrique === 'majoration' && majoLegendClasses">
          <div class="leg-year">{{ selectedAnnee }}</div>
          <div class="leg-classes">
            <div
              v-for="(cls, i) in majoLegendClasses"
              :key="cls.code"
              class="leg-row leg-row--clickable"
              @click="modalClass = i"
            >
              <span class="leg-swatch" :style="{ background: cls.color }" />
              <span class="leg-range">{{ cls.label }}</span>
              <span class="leg-count">({{ cls.count }})</span>
            </div>
            <div class="leg-row leg-nodata">
              <span class="leg-swatch" :style="{ background: NO_DATA_COLOR }" />
              <span class="leg-range">Hors zone tendue / Sans données</span>
            </div>
          </div>
          <div class="leg-src">Source : REI / DGFiP — {{ selectedAnnee }}</div>
        </template>

        <!-- Fiscal mode standard: légende quantile -->
        <template v-else>
          <div class="leg-year">{{ selectedAnnee }}</div>
          <div class="leg-classes">
            <div
              v-for="(cls, i) in legendClasses"
              :key="i"
              class="leg-row leg-row--clickable"
              @click="modalClass = i"
            >
              <span class="leg-swatch" :style="{ background: cls.color }" />
              <span class="leg-range">{{ cls.label }}</span>
              <span class="leg-count">({{ cls.count }})</span>
            </div>
            <div class="leg-row leg-nodata">
              <span class="leg-swatch" :style="{ background: NO_DATA_COLOR }" />
              <span class="leg-range">Sans données</span>
            </div>
          </div>
          <div class="leg-src">Source : REI / DGFiP — {{ selectedAnnee }}</div>
        </template>
      </div>
    </Transition>

    <!-- ── Class modal ─────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="modalClass !== null" class="class-modal-overlay" @click.self="modalClass = null">
          <div class="class-modal">
            <div class="class-modal-head">
              <div>
                <div class="class-modal-title">
                  <span class="class-modal-swatch" :style="{ background: (selectedMetrique === 'majoration' ? majoLegendClasses?.[modalClass] : legendClasses[modalClass])?.color }" />
                  {{ (selectedMetrique === 'majoration' ? majoLegendClasses?.[modalClass] : legendClasses[modalClass])?.label }}
                </div>
                <div class="class-modal-sub">{{ modalItems.length }} territoire{{ modalItems.length !== 1 ? 's' : '' }} · {{ currentLabel }}</div>
              </div>
              <button class="class-modal-close" @click="modalClass = null">✕</button>
            </div>
            <div class="class-modal-list">
              <div v-for="item in modalItems" :key="item.code" class="class-modal-row" @click="openTerritoireTab(item)">
                <span class="class-modal-name">{{ item.name }}</span>
                <span class="class-modal-val">{{ formatVal(item.value) }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Tooltip ───────────────────────────────────────────────────────────── -->
    <Transition name="tip">
      <div
        v-if="tooltip.visible"
        class="carto-tip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="tip-name">{{ tooltip.name }}</div>
        <div class="tip-val">{{ tooltip.categLabel ?? formatVal(tooltip.value) }}</div>
        <div
          v-if="tooltip.value !== null && tooltip.valeurN1Display !== null"
          class="tip-evol"
        >
          <span class="tip-n1-label">N-1</span>
          <span class="tip-n1">{{ formatVal(tooltip.valeurN1Display) }}</span>
          <span
            class="tip-delta"
            :class="tooltip.value >= tooltip.valeurN1Display ? 'tip-delta--up' : 'tip-delta--down'"
          >
            {{ (tooltip.value >= tooltip.valeurN1Display ? '+' : '') }}{{ (((tooltip.value - tooltip.valeurN1Display) / Math.abs(tooltip.valeurN1Display)) * 100).toFixed(1) }}%
          </span>
        </div>
        <div class="tip-label">{{ currentLabel }}</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────────── */

.carto-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--shell-bg);
}

.carto-map {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* ── Nav ─────────────────────────────────────────────────────────────────── */

.nav-home {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(240, 62, 142, 0.3);
  background: rgba(249, 246, 241, 0.92);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  transition: all 150ms ease;
}

.nav-home:hover {
  border-color: var(--shell-accent);
  color: var(--text-gold);
  background: rgba(249, 246, 241, 0.98);
}

/* ── Overlays ────────────────────────────────────────────────────────────── */

.carto-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: rgba(13, 20, 33, 0.62);
  backdrop-filter: blur(3px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}

.carto-overlay--error { color: rgba(249, 246, 241, 0.6); }

.overlay-ring {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid rgba(240, 62, 142, 0.22);
  border-top-color: var(--shell-accent);
  animation: spin 0.9s linear infinite;
}

.overlay-text {
  font-family: var(--font-ui);
  font-size: 13px;
  color: rgba(249, 246, 241, 0.6);
  letter-spacing: 0.02em;
  line-height: 1.5;
}

.err-retry {
  padding: 6px 18px;
  border-radius: 6px;
  border: 1px solid rgba(249, 246, 241, 0.3);
  background: transparent;
  color: rgba(249, 246, 241, 0.5);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  transition: all 150ms ease;
}

.err-retry:hover {
  border-color: rgba(249, 246, 241, 0.6);
  color: rgba(249, 246, 241, 0.8);
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Sidebar ─────────────────────────────────────────────────────────────── */

.carto-sidebar {
  position: absolute;
  left: 20px;
  top: 20px;
  bottom: 20px;
  width: 340px;
  z-index: 10;
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sb-accent-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, rgba(240,62,142,0.15) 0%, var(--shell-accent) 55%, rgba(240,62,142,0.3) 100%);
  z-index: 1;
}

.sb-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.sb-head { padding: 26px 22px 16px; }

.sb-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.sb-brand-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 8px;
}

.sb-brand-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.sb-brand-tag {
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-gold);
  background: rgba(240, 62, 142, 0.08);
  padding: 3px 7px;
  border-radius: 4px;
  border: 1px solid rgba(240, 62, 142, 0.2);
}

.sb-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.15;
}

.sb-sub {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}

.sb-sep {
  height: 2px;
  background: linear-gradient(90deg, var(--shell-accent) 0%, rgba(240,62,142,0.12) 60%, transparent 100%);
  margin: 2px 0;
}

.sb-sep-sm {
  height: 1px;
  background: linear-gradient(90deg, rgba(240,62,142,0.18) 0%, transparent 80%);
  margin: 0 -22px 8px;
}

.sb-section { padding: 8px 22px 0; }

.sb-label {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  color: var(--text-muted);
  margin-bottom: 9px;
}

/* ── Territory lists ─────────────────────────────────────────────────────── */

.list-group-label {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 10px 0 5px;
}

.loading-dot { color: var(--shell-accent); }

.territory-list {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
}

.territory-list--scrollable {
  max-height: 160px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.territory-list--sm { max-height: 130px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }
.territory-list--dept { max-height: 150px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border-light) transparent; }

.territory-item {
  display: block;
  width: 100%;
  margin: 0;
  padding: 6px 9px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  outline: none;
  flex-shrink: 0;
}

.territory-item:focus-visible {
  outline: 2px solid var(--shell-accent);
  outline-offset: -1px;
}

.territory-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.territory-item--on {
  background: rgba(240, 62, 142, 0.08);
  border-color: rgba(240, 62, 142, 0.25);
  color: var(--text-primary);
}

.territory-item--dom { opacity: 0.85; }

.territory-item--compact {
  padding: 4px 9px;
  font-size: 10px;
}

.territory-item--dept {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 9px;
}

.dept-code {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  width: 22px;
  flex-shrink: 0;
}

.dept-name {
  font-family: var(--font-ui);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Niveau / segmented control ─────────────────────────────────────────── */

.niv-track {
  display: flex;
  background: var(--chip-bg);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.niv-btn {
  flex: 1;
  padding: 6px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.niv-btn:hover { color: var(--text-secondary); }

.niv-btn--on {
  background: var(--panel-bg);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

/* ── Taxe grid ───────────────────────────────────────────────────────────── */

.taxe-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.taxe-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid var(--border-muted);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.taxe-btn:hover {
  background: var(--surface-hover);
  border-color: var(--border-light);
  color: var(--text-primary);
}

.taxe-btn--on {
  background: rgba(240, 62, 142, 0.07);
  border-color: rgba(240, 62, 142, 0.3);
  color: var(--text-primary);
}

.taxe-key {
  font-family: var(--font-data);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.taxe-sub {
  font-family: var(--font-ui);
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.3;
}

/* ── Métrique list ───────────────────────────────────────────────────────── */

.ind-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ind-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.ind-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.ind-btn--on {
  background: rgba(240, 62, 142, 0.07);
  border-color: rgba(240, 62, 142, 0.22);
  color: var(--text-primary);
}

.ind-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-muted);
  flex-shrink: 0;
  transition: background var(--transition-fast);
}

.ind-btn--on .ind-dot { background: var(--shell-accent); }

/* ── Year ────────────────────────────────────────────────────────────────── */

.year-row { display: flex; gap: 4px; margin-bottom: 12px; }

.yr-btn {
  font-family: var(--font-data);
  font-size: 12px;
  padding: 4px 14px;
  border-radius: 5px;
  border: 1px solid var(--border-muted);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.yr-btn:hover { border-color: var(--shell-accent); color: var(--text-secondary); }

.yr-btn--on {
  background: rgba(240, 62, 142, 0.1);
  border-color: rgba(240, 62, 142, 0.35);
  color: var(--text-gold);
}

/* ── Filtres ─────────────────────────────────────────────────────────────── */

.filter-sublabel {
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.07em;
  color: var(--text-muted);
  margin-bottom: 7px;
}

.dispositif-note {
  font-family: var(--font-ui);
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 8px;
  line-height: 1.4;
  opacity: 0.7;
}

.strate-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.strate-chip {
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--border-muted);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: 10px;
  text-align: center;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.strate-chip:hover { border-color: var(--shell-accent); color: var(--text-secondary); }

.strate-chip--on {
  background: rgba(240, 62, 142, 0.1);
  border-color: rgba(240, 62, 142, 0.4);
  color: var(--text-gold);
}

.epci-type-row { display: flex; gap: 4px; flex-wrap: wrap; }

.epci-type-btn {
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid var(--border-muted);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.epci-type-btn:hover { border-color: var(--shell-accent); color: var(--text-secondary); }

.epci-type-btn--on {
  background: rgba(240, 62, 142, 0.1);
  border-color: rgba(240, 62, 142, 0.35);
  color: var(--text-gold);
}

/* ── Stats ───────────────────────────────────────────────────────────────── */

.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 8px;
  background: var(--chip-bg);
  border-radius: 8px;
  border: 1px solid transparent;
}

.stat-card--median {
  background: rgba(240, 62, 142, 0.06);
  border-color: rgba(240, 62, 142, 0.14);
}

.stat-lbl {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.stat-val {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-val--gold { color: var(--text-gold); }

/* ── Footer ──────────────────────────────────────────────────────────────── */

.sb-foot {
  padding: 12px 22px;
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  font-family: var(--font-data);
  font-size: 10px;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}

/* ── Legend ──────────────────────────────────────────────────────────────── */

.carto-legend {
  position: absolute;
  right: 20px;
  bottom: 90px;
  z-index: 10;
  background: var(--panel-bg);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22), 0 0 1px rgba(0, 0, 0, 0.1);
  padding: 14px 16px 12px;
  min-width: 220px;
}

.leg-title {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.leg-year {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-gold);
  margin-top: 1px;
  margin-bottom: 10px;
}

.leg-classes { display: flex; flex-direction: column; gap: 7px; }

.leg-row { display: flex; align-items: center; gap: 8px; }
.leg-nodata { opacity: 0.6; }

.leg-swatch { width: 16px; height: 10px; border-radius: 2px; flex-shrink: 0; }

.leg-range {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-secondary);
  flex: 1;
}

.leg-count {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
}

.leg-src {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--border-light);
  font-family: var(--font-data);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

/* ── Tooltip ─────────────────────────────────────────────────────────────── */

.carto-tip {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  background: var(--panel-bg);
  border-radius: 10px;
  padding: 10px 14px 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.22), 0 0 1px rgba(0, 0, 0, 0.1);
  transform: translateY(-50%);
  min-width: 148px;
}

.tip-name {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.tip-val {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 400;
  color: var(--text-gold);
  letter-spacing: -0.015em;
  line-height: 1.15;
}

.tip-evol {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.tip-n1-label {
  font-family: var(--font-data);
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tip-n1 {
  font-family: var(--font-data);
  font-size: 11px;
  color: var(--text-muted);
}

.tip-delta {
  font-family: var(--font-data);
  font-size: 11px;
  font-weight: 600;
}

.tip-delta--up {
  color: #188038;
}

.tip-delta--down {
  color: #E52C3F;
}

.tip-label {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 3px;
}

/* ── Legend row clickable ────────────────────────────────────────────────── */

.leg-row--clickable {
  cursor: pointer;
  border-radius: 5px;
  transition: background 120ms ease;
  padding: 2px 4px;
  margin: 0 -4px;
}

.leg-row--clickable:hover {
  background: rgba(240, 62, 142, 0.08);
}

.leg-row--clickable .leg-count {
  color: var(--shell-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-style: dotted;
}

/* ── Class modal ─────────────────────────────────────────────────────────── */

.class-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(13, 20, 33, 0.52);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.class-modal {
  background: var(--panel-bg);
  border-radius: 16px;
  box-shadow: 0 16px 64px rgba(0, 0, 0, 0.32), 0 0 1px rgba(0, 0, 0, 0.12);
  width: 400px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.class-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.class-modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.class-modal-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}

.class-modal-sub {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
  margin-left: 24px;
}

.class-modal-close {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 120ms;
  flex-shrink: 0;
}

.class-modal-close:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.class-modal-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-light) transparent;
}

.class-modal-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 8px;
  border-radius: 6px;
  transition: background 100ms;
  cursor: pointer;
}

.class-modal-row:hover { background: var(--surface-hover); }

.class-modal-name {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.class-modal-val {
  font-family: var(--font-data);
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
}

/* ── Transitions ─────────────────────────────────────────────────────────── */

.fade-enter-active, .fade-leave-active { transition: opacity 350ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.step-enter-active {
  transition: opacity 250ms ease, transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}
.step-enter-from { opacity: 0; transform: translateY(6px); }

.leg-enter-active { transition: opacity 400ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1); }
.leg-enter-from { opacity: 0; transform: translateY(8px); }

.tip-enter-active { transition: opacity 100ms ease, transform 100ms ease; }
.tip-leave-active { transition: opacity 70ms ease; }
.tip-enter-from { opacity: 0; transform: translateY(-50%) translateX(6px); }
.tip-leave-to { opacity: 0; }

.modal-enter-active { transition: opacity 200ms ease; }
.modal-leave-active { transition: opacity 150ms ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .class-modal { transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1); }
.modal-enter-from .class-modal { transform: scale(0.96) translateY(8px); }
</style>
