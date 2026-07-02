<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import maplibregl from 'maplibre-gl'
import { useTerritoireStore } from '@/stores/territoire'

const store = useTerritoireStore()

const DOM_TOM = [
  { id: 'gua', label: 'Guadeloupe', center: [-61.55, 16.17] as [number, number], zoom: 7.2 },
  { id: 'mar', label: 'Martinique', center: [-61.02, 14.65] as [number, number], zoom: 8.0 },
  { id: 'guy', label: 'Guyane', center: [-53.1, 3.9] as [number, number], zoom: 4.5 },
  { id: 'reu', label: 'Réunion', center: [55.54, -21.1] as [number, number], zoom: 7.8 },
  { id: 'may', label: 'Mayotte', center: [45.15, -12.83] as [number, number], zoom: 8.5 },
]

function makeStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      'osm': {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: 'osm-layer',
        type: 'raster',
        source: 'osm',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  }
}

const METRO_INSET = {
  id: 'metro',
  label: 'Métropole',
  center: [2.35, 46.8] as [number, number],
  zoom: 5.0,
}

const activeId = ref<string | null>(null)

const displayedInsets = computed(() =>
  activeId.value === null
    ? DOM_TOM
    : [METRO_INSET, ...DOM_TOM.filter(d => d.id !== activeId.value)],
)

const mainContainer = ref<HTMLDivElement | null>(null)
let mainMap: maplibregl.Map | null = null

const insetMapInstances: Record<string, maplibregl.Map> = {}
const insetContainerRefs: Record<string, HTMLDivElement | null> = {}

const insetRefFns = Object.fromEntries(
  ['metro', ...DOM_TOM.map(d => d.id)].map(id => [
    id,
    (el: unknown) => { insetContainerRefs[id] = el ? el as HTMLDivElement : null },
  ]),
)

async function rebuildInsets() {
  Object.values(insetMapInstances).forEach(m => m.remove())
  for (const k of Object.keys(insetMapInstances)) delete insetMapInstances[k]
  await nextTick()
  for (const item of displayedInsets.value) {
    const el = insetContainerRefs[item.id]
    if (!el) continue
    insetMapInstances[item.id] = new maplibregl.Map({
      container: el,
      style: makeStyle(),
      center: item.center,
      zoom: item.zoom,
      interactive: false,
      attributionControl: false,
    })
  }
}

function handleInsetClick(id: string) {
  if (id === 'metro') {
    activeId.value = null
    mainMap?.setMaxBounds([[-8, 39.5], [12, 52.5]])
    mainMap?.flyTo({ center: [2.35, 46.8], zoom: 5.2, duration: 1000 })
  } else {
    const dom = DOM_TOM.find(d => d.id === id)
    if (!dom) return
    activeId.value = id
    mainMap?.setMaxBounds(null)
    mainMap?.flyTo({ center: dom.center, zoom: dom.zoom, duration: 1000 })
  }
  rebuildInsets()
}

onMounted(() => {
  if (!mainContainer.value) return

  mainMap = new maplibregl.Map({
    container: mainContainer.value,
    style: makeStyle(),
    center: [2.35, 46.8],
    zoom: 5.2,
    minZoom: 4,
    maxZoom: 16,
    maxBounds: [[-8, 39.5], [12, 52.5]],
  })

  mainMap.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    'bottom-right',
  )

  mainMap.scrollZoom.setWheelZoomRate(1 / 250)

  rebuildInsets()
})

const HL_SOURCE = 'commune-highlight'
const HL_FILL = 'commune-highlight-fill'
const HL_LINE = 'commune-highlight-line'

function removeHighlight() {
  if (!mainMap) return
  if (mainMap.getLayer(HL_FILL)) mainMap.removeLayer(HL_FILL)
  if (mainMap.getLayer(HL_LINE)) mainMap.removeLayer(HL_LINE)
  if (mainMap.getSource(HL_SOURCE)) mainMap.removeSource(HL_SOURCE)
}

function geojsonBounds(coordinates: unknown[]): maplibregl.LngLatBounds | null {
  const pts: [number, number][] = []
  const collect = (v: unknown): void => {
    if (!Array.isArray(v)) return
    if (typeof v[0] === 'number') { pts.push(v as [number, number]); return }
    v.forEach(collect)
  }
  collect(coordinates)
  if (!pts.length) return null
  return pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]))
}

async function highlightCommune(code: string) {
  if (!mainMap) return
  // DOM-TOM insets are separate non-interactive maps — skip
  if (code.startsWith('97') || code.startsWith('98')) return

  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes/${code}?fields=contour&format=geojson&geometry=contour`,
    )
    if (!res.ok) return
    const geojson = await res.json()

    removeHighlight()

    mainMap.addSource(HL_SOURCE, { type: 'geojson', data: geojson })
    mainMap.addLayer({
      id: HL_FILL,
      type: 'fill',
      source: HL_SOURCE,
      paint: { 'fill-color': '#F03E8E', 'fill-opacity': 0.15 },
    })
    mainMap.addLayer({
      id: HL_LINE,
      type: 'line',
      source: HL_SOURCE,
      paint: { 'line-color': '#F03E8E', 'line-width': 2, 'line-opacity': 0.9 },
    })

    const bounds = geojsonBounds(geojson.geometry?.coordinates ?? [])
    if (bounds) {
      mainMap.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 })
    }
  } catch {
    // network error — map stays unchanged
  }
}

watch(
  () => store.selected,
  (territory) => {
    if (!mainMap) return
    if (!territory || territory.type !== 'commune') {
      removeHighlight()
      return
    }
    const run = () => highlightCommune(territory.code)
    if (mainMap.isStyleLoaded()) run()
    else mainMap.once('styledata', run)
  },
)

onBeforeUnmount(() => {
  Object.values(insetMapInstances).forEach(m => m.remove())
  mainMap?.remove()
})
</script>

<template>
  <div class="map-explorer">
    <div ref="mainContainer" class="map-container" />

    <div class="domtom-panel">
      <div
        v-for="item in displayedInsets"
        :key="item.id"
        class="domtom-inset"
        :class="{ 'domtom-inset--metro': item.id === 'metro' }"
        @click="handleInsetClick(item.id)"
      >
        <div :ref="insetRefFns[item.id]" class="domtom-map" />
        <span class="domtom-label">{{ item.label }}</span>
      </div>
    </div>

    <div class="map-vignette" />
  </div>
</template>

<style scoped>
.map-explorer {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.map-container {
  width: 100%;
  height: 100%;
}

.domtom-panel {
  position: absolute;
  bottom: 48px;
  right: 16px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.domtom-inset {
  width: 108px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  overflow: hidden;
  background: #0d1421;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.domtom-inset:hover {
  border-color: rgba(240, 62, 142, 0.6);
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.6);
}

.domtom-inset--metro {
  border-color: rgba(240, 62, 142, 0.35);
}

.domtom-map {
  width: 108px;
  height: 68px;
}

.domtom-label {
  display: block;
  text-align: center;
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  background: rgba(13, 20, 33, 0.9);
  padding: 3px 0;
  letter-spacing: 0.04em;
}

.map-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 100% 100% at 70% 50%,
    transparent 40%,
    rgba(13, 20, 33, 0.35) 100%
  );
  z-index: 1;
}
</style>
