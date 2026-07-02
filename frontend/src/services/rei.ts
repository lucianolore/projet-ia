import type { Territory, TerritoireData, ReiIndicateur, TerritoireMeta } from '@/types/territoire'
import { getDispositifs } from '@/services/dispositif'

const BASE = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei/records'

// Commune-level fiscal vars
const COMMUNE_VARS = ['E11', 'E12', 'E13', 'B11', 'B12', 'B13', 'F22', 'F23', 'H13THS', 'TXMAJOTHRS']

// GFP (EPCI) intercommunality fiscal vars — destinataire="GFP" rows only
const EPCI_VARS = ['E31', 'E32', 'E32VOTE', 'E33', 'B31', 'B32', 'B32VOTE', 'B33', 'P31', 'P32', 'P32VOTE', 'P33', 'F22GFP', 'F23GFP']

export async function fetchTerritoireData(territory: Territory, annee = '2024'): Promise<TerritoireData> {
  const isCommune = territory.type === 'commune'
  const vars = isCommune ? COMMUNE_VARS : EPCI_VARS
  const idFilter = isCommune
    ? `idcom="${territory.code}"`
    : `sirepci="${territory.code}" AND destinataire="GFP"`
  const varFilter = `var IN ("${vars.join('","')}")`

  const where = `${idFilter} AND annee="${annee}" AND ${varFilter}`
  const select = 'var,varlib,valeur,dispositif_fiscal,categorie,libcom,libdep,libreg,idcom,sirepci,gfp_ept,strate,forjepci,optepci'
  // EPCI: order_by=var ensures all 14 vars appear before limit=100 cuts off
  const limit = isCommune ? 50 : 100
  const orderBy = isCommune ? '' : '&order_by=var'
  const url = `${BASE}?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&limit=${limit}${orderBy}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`REI API ${res.status}`)

  const json = await res.json()
  const results = json.results as Array<Record<string, unknown>>

  if (results.length === 0) throw new Error('Aucune donnée pour ce territoire en ' + annee)

  const first = results[0]!
  const meta: TerritoireMeta = {
    // For EPCI, libcom holds the EPCI name (gfp_ept) — commune name is irrelevant
    libcom: isCommune ? String(first.libcom ?? territory.name) : String(first.gfp_ept ?? territory.name),
    libdep: String(first.libdep ?? ''),
    libreg: String(first.libreg ?? territory.region),
    idcom: String(first.idcom ?? ''),
    sirepci: String(first.sirepci ?? ''),
    gfp_ept: String(first.gfp_ept ?? ''),
    strate: isCommune ? Number(first.strate ?? 0) : 0,
    forjepci: String(first.forjepci ?? ''),
    optepci: String(first.optepci ?? ''),
  }

  const indicateurs: Record<string, ReiIndicateur> = {}
  for (const r of results) {
    indicateurs[String(r.var)] = {
      var: String(r.var),
      varlib: String(r.varlib),
      valeur: r.valeur != null ? Number(r.valeur) : null,
      dispositif_fiscal: String(r.dispositif_fiscal),
      categorie: String(r.categorie),
    }
  }

  const dispositifs = isCommune
    ? getDispositifs(territory.code, indicateurs)
    : {}

  return { meta, indicateurs, annee, ta: null, dispositifs }
}
