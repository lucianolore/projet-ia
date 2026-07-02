import type { Territory, TerritoireData, ReiIndicateur, TerritoireMeta } from '@/types/territoire'
import { getDispositifs } from '@/services/dispositif'

const BASE = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei/records'

// Commune-level fiscal vars
const COMMUNE_VARS = ['E11', 'E12', 'E13', 'B11', 'B12', 'B13', 'F22', 'F23', 'H13THS', 'TXMAJOTHRS']

// GFP (EPCI) intercommunality fiscal vars — destinataire="GFP" rows only
const EPCI_GFP_VARS = ['E31', 'E32', 'E32VOTE', 'E33', 'B31', 'B32', 'B32VOTE', 'B33', 'P31', 'P32', 'P32VOTE', 'P33']
// TEOM EPCI : dans l'API REI, la TEOM est sous destinataire="Divers" (pas "GFP") avec var=F22/F23
const EPCI_TEOM_VARS = ['F22', 'F23']

async function fetchEpciRows(
  territory: Territory,
  annee: string,
  vars: string[],
  destinataire: string,
): Promise<Array<Record<string, unknown>>> {
  const idFilter = `sirepci="${territory.code}" AND destinataire="${destinataire}"`
  const varFilter = `var IN ("${vars.join('","')}")`
  const where = `${idFilter} AND annee="${annee}" AND ${varFilter}`
  const select = 'var,varlib,valeur,dispositif_fiscal,categorie,libcom,libdep,libreg,idcom,sirepci,gfp_ept,strate,forjepci,optepci'
  const url = `${BASE}?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&limit=100&order_by=var`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`REI API ${res.status}`)
  const json = await res.json()
  return (json.results ?? []) as Array<Record<string, unknown>>
}

export async function fetchTerritoireData(territory: Territory, annee = '2024'): Promise<TerritoireData> {
  const isCommune = territory.type === 'commune'

  let results: Array<Record<string, unknown>>

  if (isCommune) {
    const vars = COMMUNE_VARS
    const idFilter = `idcom="${territory.code}"`
    const varFilter = `var IN ("${vars.join('","')}")`
    const where = `${idFilter} AND annee="${annee}" AND ${varFilter}`
    const select = 'var,varlib,valeur,dispositif_fiscal,categorie,libcom,libdep,libreg,idcom,sirepci,gfp_ept,strate,forjepci,optepci'
    const url = `${BASE}?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&limit=50`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`REI API ${res.status}`)
    const json = await res.json()
    results = (json.results ?? []) as Array<Record<string, unknown>>
  } else {
    // EPCI : deux requêtes nécessaires — GFP (TFPB/TFPNB/CFE) + Divers (TEOM)
    const [gfpRows, teomRows] = await Promise.all([
      fetchEpciRows(territory, annee, EPCI_GFP_VARS, 'GFP'),
      fetchEpciRows(territory, annee, EPCI_TEOM_VARS, 'Divers'),
    ])
    // Pour TEOM, l'API retourne une ligne par commune membre — on garde uniquement la première
    // occurrence de chaque variable (le taux/produit de l'EPCI est le même sur toutes les lignes)
    const seenTeomVars = new Set<string>()
    const dedupTeom = teomRows.filter(r => {
      const v = String(r.var)
      if (seenTeomVars.has(v)) return false
      seenTeomVars.add(v)
      return true
    })
    results = [...gfpRows, ...dedupTeom]
  }

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
