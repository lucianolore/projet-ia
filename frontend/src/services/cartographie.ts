import type { CartoFilters, CartoRecord, Metrique, Niveau, RegionInfo, Taxe } from '@/types/cartographie'
import { ZONES_TENDUES } from '@/data/zones-tendues'

export const REGIONS: RegionInfo[] = [
  { code: '11', label: 'Île-de-France',             dom: false, center: [2.45,  48.72], zoom: 8.0 },
  { code: '24', label: 'Centre-Val de Loire',        dom: false, center: [1.90,  47.50], zoom: 7.0 },
  { code: '27', label: 'Bourgogne-Franche-Comté',   dom: false, center: [5.00,  47.20], zoom: 7.0 },
  { code: '28', label: 'Normandie',                  dom: false, center: [0.20,  49.00], zoom: 7.0 },
  { code: '32', label: 'Hauts-de-France',            dom: false, center: [2.70,  50.30], zoom: 7.0 },
  { code: '44', label: 'Grand Est',                  dom: false, center: [6.20,  48.50], zoom: 7.0 },
  { code: '52', label: 'Pays de la Loire',           dom: false, center: [-0.80, 47.60], zoom: 7.0 },
  { code: '53', label: 'Bretagne',                   dom: false, center: [-2.90, 48.10], zoom: 7.0 },
  { code: '75', label: 'Nouvelle-Aquitaine',         dom: false, center: [-0.50, 45.20], zoom: 6.5 },
  { code: '76', label: 'Occitanie',                  dom: false, center: [2.30,  43.80], zoom: 7.0 },
  { code: '84', label: 'Auvergne-Rhône-Alpes',      dom: false, center: [4.50,  45.40], zoom: 7.0 },
  { code: '93', label: "Provence-Alpes-Côte d'Azur", dom: false, center: [6.00,  43.90], zoom: 7.0 },
  { code: '94', label: 'Corse',                      dom: false, center: [9.10,  42.00], zoom: 8.0 },
  { code: '01', label: 'Guadeloupe',                 dom: true,  center: [-61.55, 16.17], zoom: 9.0 },
  { code: '02', label: 'Martinique',                 dom: true,  center: [-61.02, 14.65], zoom: 9.5 },
  { code: '03', label: 'Guyane',                     dom: true,  center: [-53.10,  3.90], zoom: 6.0 },
  { code: '04', label: 'La Réunion',                 dom: true,  center: [55.54,  -21.10], zoom: 9.0 },
  { code: '06', label: 'Mayotte',                    dom: true,  center: [45.15,  -12.83], zoom: 10.0 },
]

const OFGL_REI = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei/records'

type VarMap = Partial<Record<Metrique, string>>

const COMMUNE_VARS: Record<Taxe, VarMap> = {
  TFPB:  { taux: 'E12', base: 'E11', produit: 'E13', produit_hab: 'E13', base_hab: 'E11', evolution: 'E12' },
  TFPNB: { taux: 'B12', base: 'B11', produit: 'B13', produit_hab: 'B13', base_hab: 'B11', evolution: 'B12' },
  THRS:  { taux: 'H13THS', majoration: 'TXMAJOTHRS', evolution: 'H13THS' },
  CFE:   {},
  TEOM:  { taux: 'F22', produit: 'F23', produit_hab: 'F23', evolution: 'F22' },
}

const EPCI_VARS: Record<Taxe, VarMap> = {
  TFPB:  { taux: 'E32', base: 'E31', produit: 'E33', produit_hab: 'E33', base_hab: 'E31', evolution: 'E32' },
  TFPNB: { taux: 'B32', base: 'B31', produit: 'B33', produit_hab: 'B33', base_hab: 'B31', evolution: 'B32' },
  THRS:  {},
  CFE:   { taux: 'P32', base: 'P31', produit: 'P33', produit_hab: 'P33', base_hab: 'P31', evolution: 'P32' },
  // produit_etab: source DGFiP "fichiers détaillés CFE" (ingestion offline requise) — champ réservé
  TEOM:  { taux: 'F22GFP', produit: 'F23GFP', produit_hab: 'F23GFP', evolution: 'F22GFP' },
}

export function getVarCode(taxe: Taxe, metrique: Metrique, niveau: Niveau): string | null {
  const map = niveau === 'communes' ? COMMUNE_VARS : EPCI_VARS
  return map[taxe]?.[metrique] ?? null
}

export function getAvailableMetriques(taxe: Taxe, niveau: Niveau): Metrique[] {
  const map = niveau === 'communes' ? COMMUNE_VARS : EPCI_VARS
  const varMap = map[taxe] ?? {}
  return (['taux', 'base', 'produit', 'produit_hab', 'base_hab', 'majoration', 'evolution', 'produit_etab'] as Metrique[]).filter(
    m => m in varMap,
  )
}

export function getAvailableTaxes(niveau: Niveau): Taxe[] {
  const all: Taxe[] = ['TFPB', 'TFPNB', 'THRS', 'CFE', 'TEOM']
  if (niveau === 'communes') return all.filter(t => t !== 'CFE')
  return all.filter(t => t !== 'THRS')
}

function buildWhere(filters: CartoFilters, varCode: string, annee: string): string {
  const { perimetre, niveau, strates, typeEpci } = filters
  const parts: string[] = []

  if (perimetre.type === 'region') {
    parts.push(`reg="${perimetre.code}"`)
  } else {
    parts.push(`dep="${perimetre.code}"`)
  }

  parts.push(`annee="${annee}"`)
  parts.push(`var="${varCode}"`)

  if (niveau === 'epci') {
    parts.push(`destinataire="GFP"`)
    if (typeEpci) parts.push(`forjepci="${typeEpci}"`)
  } else {
    if (strates.length > 0) parts.push(`strate IN (${strates.join(',')})`)
  }

  return parts.join(' AND ')
}

const PAGE_SIZE = 100

async function fetchPage(
  where: string,
  niveau: Niveau,
  offset = 0,
): Promise<{ results: Array<Record<string, unknown>>; total_count: number }> {
  const select =
    niveau === 'communes'
      ? 'idcom,libcom,valeur,z08,strate'
      : 'sirepci,gfp_ept,valeur,z08,forjepci'
  const url = `${OFGL_REI}?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&limit=${PAGE_SIZE}&offset=${offset}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OFGL API ${res.status}`)
  const json = await res.json()
  return { results: json.results ?? [], total_count: json.total_count ?? 0 }
}

async function fetchAll(where: string, niveau: Niveau): Promise<Array<Record<string, unknown>>> {
  const first = await fetchPage(where, niveau, 0)
  const { results, total_count } = first
  if (total_count <= PAGE_SIZE) return results

  const pageCount = Math.ceil((total_count - PAGE_SIZE) / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      fetchPage(where, niveau, (i + 1) * PAGE_SIZE).then(r => r.results),
    ),
  )
  return [...results, ...pages.flat()]
}

function parseResults(results: Array<Record<string, unknown>>, niveau: Niveau): Map<string, CartoRecord> {
  const map = new Map<string, CartoRecord>()
  for (const r of results) {
    const code =
      niveau === 'communes' ? String(r.idcom ?? '') : String(r.sirepci ?? '')
    const name =
      niveau === 'communes' ? String(r.libcom ?? '') : String(r.gfp_ept ?? '')
    if (!code) continue
    map.set(code, {
      code,
      name,
      valeur: r.valeur != null ? Number(r.valeur) : null,
      valeurN1: null,
      population: r.z08 != null ? Number(r.z08) : null,
    })
  }
  return map
}

export async function fetchCartoData(filters: CartoFilters): Promise<Map<string, CartoRecord>> {
  const varCode = getVarCode(filters.taxe, filters.metrique, filters.niveau)
  if (!varCode) return new Map()

  const anneeN1 = String(Number(filters.annee) - 1)
  const where   = buildWhere(filters, varCode, filters.annee)
  const whereN1 = buildWhere(filters, varCode, anneeN1)

  const [resultsN, resultsN1] = await Promise.all([
    fetchAll(where, filters.niveau),
    fetchAll(whereN1, filters.niveau),
  ])

  const mapN1 = new Map<string, number | null>()
  for (const r of resultsN1) {
    const code = filters.niveau === 'communes' ? String(r.idcom ?? '') : String(r.sirepci ?? '')
    mapN1.set(code, r.valeur != null ? Number(r.valeur) : null)
  }

  const map = parseResults(resultsN, filters.niveau)
  for (const [code, record] of map) {
    record.valeurN1 = mapN1.get(code) ?? null
  }
  return map
}

export async function fetchCartoEvolution(filters: CartoFilters): Promise<Map<string, CartoRecord>> {
  const varCode = getVarCode(filters.taxe, 'evolution', filters.niveau)
  if (!varCode) return new Map()

  const anneeN1 = String(Number(filters.annee) - 1)
  const whereN = buildWhere(filters, varCode, filters.annee)
  const whereN1 = buildWhere(filters, varCode, anneeN1)

  const [resultsN, resultsN1] = await Promise.all([
    fetchAll(whereN, filters.niveau),
    fetchAll(whereN1, filters.niveau),
  ])

  const mapN1 = new Map<string, number | null>()
  for (const r of resultsN1) {
    const code =
      filters.niveau === 'communes' ? String(r.idcom ?? '') : String(r.sirepci ?? '')
    mapN1.set(code, r.valeur != null ? Number(r.valeur) : null)
  }

  const map = parseResults(resultsN, filters.niveau)
  for (const [code, record] of map) {
    record.valeurN1 = mapN1.get(code) ?? null
  }
  return map
}

export function computeDisplayValue(record: CartoRecord, metrique: Metrique): number | null {
  const { valeur, valeurN1, population } = record
  switch (metrique) {
    case 'taux':
    case 'base':
    case 'produit':
    case 'majoration':
      return valeur
    case 'produit_hab':
    case 'base_hab':
      if (valeur == null || !population || population === 0) return null
      return (valeur * 1000) / population
    case 'evolution':
      if (valeur == null || valeurN1 == null || valeurN1 === 0) return null
      return ((valeur - valeurN1) / Math.abs(valeurN1)) * 100
    case 'produit_etab':
      // Source DGFiP fichiers CFE — ingestion offline requise
      return null
  }
}

export function buildTlvThlvCartoData(codes: string[]): Map<string, CartoRecord> {
  const map = new Map<string, CartoRecord>()
  for (const code of codes) {
    if (!code) continue
    map.set(code, {
      code,
      name: code,
      // 2 = zone tendue (TLV), 0 = hors zone tendue (THLV applicable), 1 = THLV instaurée (réservé)
      valeur: ZONES_TENDUES.has(code) ? 2 : 0,
      valeurN1: null,
      population: null,
    })
  }
  return map
}
