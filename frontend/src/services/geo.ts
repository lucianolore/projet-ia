import type { Territory, EpciDetails } from '@/types/territoire'

const GEO_API = 'https://geo.api.gouv.fr'

interface GeoCommune {
  nom: string
  code: string
  population?: number
  region: { nom: string }
  departement: { nom: string }
}

const STRATE_RANGES: Record<number, [number, number]> = {
  1: [0, 499],
  2: [500, 999],
  3: [1000, 1999],
  4: [2000, 4999],
  5: [5000, 9999],
  6: [10000, 19999],
  7: [20000, 49999],
  8: [50000, 99999],
  9: [100000, 249999],
  10: [250000, Number.MAX_SAFE_INTEGER],
}

export async function searchCommunesByStrate(
  query: string,
  strate: number,
  limit = 6,
): Promise<Territory[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const range = STRATE_RANGES[strate]
  if (!range) return []

  const params = new URLSearchParams({
    nom: q,
    fields: 'nom,code,population,region,departement',
    boost: 'population',
    limit: '50',
  })

  const res = await fetch(`${GEO_API}/communes?${params}`)
  if (!res.ok) return []

  const data: GeoCommune[] = await res.json()

  return data
    .filter(c => (c.population ?? 0) >= range[0] && (c.population ?? 0) <= range[1])
    .slice(0, limit)
    .map(c => ({
      id: c.code,
      name: c.nom,
      type: 'commune' as const,
      region: c.region?.nom ?? '',
      code: c.code,
    }))
}

export type SimilarScope = 'departement' | 'france'

export interface SimilarResult {
  results: Territory[]
  scope: SimilarScope
}

async function _fetchByScope(
  scopeFilter: Record<string, string>,
  range: [number, number],
  excludeCode: string,
  alreadyFound: Set<string>,
  limit: number,
  apiLimit = 500,
): Promise<Territory[]> {
  const params = new URLSearchParams({
    ...scopeFilter,
    fields: 'nom,code,population,region,departement',
    limit: String(apiLimit),
  })
  const res = await fetch(`${GEO_API}/communes?${params}`)
  if (!res.ok) return []
  const data: GeoCommune[] = await res.json()
  return data
    .filter(c =>
      c.code !== excludeCode &&
      !alreadyFound.has(c.code) &&
      (c.population ?? 0) >= range[0] &&
      (c.population ?? 0) <= range[1],
    )
    .slice(0, limit)
    .map(c => ({
      id: c.code,
      name: c.nom,
      type: 'commune' as const,
      region: c.region?.nom ?? '',
      code: c.code,
    }))
}

export async function fetchSimilarCommunes(
  idcom: string,
  strate: number,
  excludeCode: string,
  limit = 5,
): Promise<SimilarResult> {
  const deptCode = idcom.startsWith('97') ? idcom.slice(0, 3) : idcom.slice(0, 2)
  const range = STRATE_RANGES[strate]
  if (!range) return { results: [], scope: 'departement' }

  const deptResults = await _fetchByScope(
    { codeDepartement: deptCode },
    range,
    excludeCode,
    new Set(),
    limit,
  )
  if (deptResults.length >= limit) return { results: deptResults, scope: 'departement' }

  const alreadyFound = new Set(deptResults.map(t => t.code))
  const nationalResults = await _fetchByScope(
    {},
    range,
    excludeCode,
    alreadyFound,
    limit - deptResults.length,
    50000,
  )

  return {
    results: [...deptResults, ...nationalResults],
    scope: deptResults.length === 0 ? 'france' : 'departement',
  }
}

interface GeoEpci {
  nom: string
  code: string
  departements: Array<{ nom: string }>
}

const REI_BASE = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei/records'

export async function fetchSimilarEpcis(
  sirepci: string,
  forjepci: string,
  libreg: string,
  limit = 5,
): Promise<Territory[]> {
  const where = `forjepci="${forjepci}" AND libreg="${libreg}" AND annee="2025" AND destinataire="GFP"`
  const select = 'sirepci,gfp_ept,forjepci,libreg'
  const url = `${REI_BASE}?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&group_by=${encodeURIComponent(select)}&limit=50`
  const res = await fetch(url)
  if (!res.ok) return []
  const json = await res.json()
  const seen = new Set<string>()
  return (json.results ?? [])
    .filter((r: Record<string, unknown>) => {
      const key = String(r.sirepci)
      if (key === sirepci || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map((r: Record<string, unknown>) => ({
      id: String(r.sirepci),
      name: String(r.gfp_ept),
      type: 'epci' as const,
      region: String(r.libreg),
      code: String(r.sirepci),
    }))
}

export async function searchTerritoires(
  query: string,
  type: 'all' | 'commune' | 'epci',
  limit = 6,
): Promise<Territory[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const requests: Promise<Territory[]>[] = []

  if (type === 'all' || type === 'commune') {
    requests.push(searchCommunes(q, type === 'all' ? Math.ceil(limit / 2) : limit))
  }

  if (type === 'all' || type === 'epci') {
    requests.push(searchEpci(q, type === 'all' ? Math.floor(limit / 2) : limit))
  }

  const results = await Promise.all(requests)
  return results.flat().slice(0, limit)
}

async function searchCommunes(query: string, limit: number): Promise<Territory[]> {
  const params = new URLSearchParams({
    nom: query,
    fields: 'nom,code,region,departement',
    limit: String(limit),
    boost: 'population',
  })

  const res = await fetch(`${GEO_API}/communes?${params}`)
  if (!res.ok) return []

  const data: GeoCommune[] = await res.json()
  return data.map(c => ({
    id: c.code,
    name: c.nom,
    type: 'commune' as const,
    region: c.region?.nom ?? c.departement?.nom ?? '',
    code: c.code,
  }))
}

async function searchEpci(query: string, limit: number): Promise<Territory[]> {
  const params = new URLSearchParams({
    nom: query,
    fields: 'nom,code,departements',
    limit: String(limit),
  })

  const res = await fetch(`${GEO_API}/epcis?${params}`)
  if (!res.ok) return []

  const data: GeoEpci[] = await res.json()
  return data.map(e => ({
    id: e.code,
    name: e.nom,
    type: 'epci' as const,
    region: e.departements?.[0]?.nom ?? '',
    code: e.code,
  }))
}

export async function fetchEpciDetails(siren: string): Promise<EpciDetails> {
  const [epciRes, communesRes] = await Promise.allSettled([
    fetch(`${GEO_API}/epcis/${siren}?fields=population,surface`),
    fetch(`${GEO_API}/epcis/${siren}/communes?fields=code&limit=1000`),
  ])

  let population: number | null = null
  let surface: number | null = null
  if (epciRes.status === 'fulfilled' && epciRes.value.ok) {
    const data = await epciRes.value.json()
    population = data.population ?? null
    surface = data.surface ?? null
  }

  let nbCommunes: number | null = null
  if (communesRes.status === 'fulfilled' && communesRes.value.ok) {
    const data = await communesRes.value.json()
    nbCommunes = Array.isArray(data) ? data.length : null
  }

  return { population, nbCommunes, surface }
}

export async function fetchDefaultEpcis(): Promise<Territory[]> {
  const params = new URLSearchParams({
    type: 'MET',
    fields: 'nom,code,departements',
    limit: '30',
  })
  const res = await fetch(`${GEO_API}/epcis?${params}`)
  if (!res.ok) return []
  const data: GeoEpci[] = await res.json()
  return data
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map(e => ({
      id: e.code,
      name: e.nom,
      type: 'epci' as const,
      region: e.departements?.[0]?.nom ?? '',
      code: e.code,
    }))
}

// ─── Cartographie — bulk GeoJSON ─────────────────────────────────────────────

export async function fetchDepartementsForRegion(
  codeRegion: string,
): Promise<Array<{ code: string; nom: string }>> {
  const res = await fetch(`${GEO_API}/departements?codeRegion=${codeRegion}&fields=nom,code`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchCommunesGeojsonByRegion(
  codeRegion: string,
): Promise<{ type: string; features: unknown[] }> {
  const res = await fetch(
    `${GEO_API}/communes?codeRegion=${codeRegion}&fields=nom,code,population&format=geojson&geometry=contour`,
  )
  if (!res.ok) throw new Error(`geo.api communes région ${res.status}`)
  return res.json()
}

export async function fetchCommunesGeojsonByDept(
  codeDept: string,
): Promise<{ type: string; features: unknown[] }> {
  const res = await fetch(
    `${GEO_API}/communes?codeDepartement=${codeDept}&fields=nom,code,population&format=geojson&geometry=contour`,
  )
  if (!res.ok) throw new Error(`geo.api communes dépt ${res.status}`)
  return res.json()
}

async function fetchEpciListByRegion(codeRegion: string): Promise<Array<{ code: string; nom: string }>> {
  const res = await fetch(`${GEO_API}/epcis?codeRegion=${codeRegion}&fields=nom,code&limit=500`)
  if (!res.ok) throw new Error(`geo.api EPCI liste ${res.status}`)
  return res.json()
}

async function fetchEpciListByDept(codeDept: string): Promise<Array<{ code: string; nom: string }>> {
  const res = await fetch(`${GEO_API}/epcis?codeDepartement=${codeDept}&fields=nom,code&limit=200`)
  if (!res.ok) throw new Error(`geo.api EPCI liste ${res.status}`)
  return res.json()
}

async function fetchEpciContoursBatch(
  epcis: Array<{ code: string; nom: string }>,
): Promise<Array<{ type: string; id: string; geometry: unknown; properties: { code: string; nom: string } } | null>> {
  const BATCH = 25
  const results: Array<{ type: string; id: string; geometry: unknown; properties: { code: string; nom: string } } | null> = []

  for (let i = 0; i < epcis.length; i += BATCH) {
    const batch = epcis.slice(i, i + BATCH)
    const batchResults = await Promise.all(
      batch.map(async (epci) => {
        try {
          const r = await fetch(
            `${GEO_API}/epcis/${epci.code}?fields=contour&format=geojson&geometry=contour`,
          )
          if (!r.ok) return null
          const geojson = await r.json()
          if (!geojson.geometry) return null
          return {
            type: 'Feature' as const,
            id: epci.code,
            geometry: geojson.geometry,
            properties: { code: epci.code, nom: epci.nom },
          }
        } catch {
          return null
        }
      }),
    )
    results.push(...batchResults)
  }
  return results
}

async function buildEpciGeojson(
  epcis: Array<{ code: string; nom: string }>,
): Promise<{ type: string; features: unknown[] }> {
  const features = await fetchEpciContoursBatch(epcis)
  return { type: 'FeatureCollection', features: features.filter(Boolean) }
}

export async function fetchEpciGeojsonByRegion(
  codeRegion: string,
): Promise<{ type: string; features: unknown[] }> {
  // Try bulk endpoint first
  try {
    const res = await fetch(
      `${GEO_API}/epcis?codeRegion=${codeRegion}&fields=nom,code,contour&format=geojson&geometry=contour&limit=500`,
    )
    if (res.ok) {
      const data = await res.json()
      if (data?.features?.[0]?.geometry?.coordinates?.length) return data
    }
  } catch {
    // fall through to individual fetch
  }

  const list = await fetchEpciListByRegion(codeRegion)
  return buildEpciGeojson(list)
}

export async function fetchEpciGeojsonByDept(
  codeDept: string,
): Promise<{ type: string; features: unknown[] }> {
  // Try bulk endpoint first
  try {
    const res = await fetch(
      `${GEO_API}/epcis?codeDepartement=${codeDept}&fields=nom,code,contour&format=geojson&geometry=contour&limit=200`,
    )
    if (res.ok) {
      const data = await res.json()
      if (data?.features?.[0]?.geometry?.coordinates?.length) return data
    }
  } catch {
    // fall through to individual fetch
  }

  const list = await fetchEpciListByDept(codeDept)
  return buildEpciGeojson(list)
}
