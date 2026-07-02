const TA_BASE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/delta_deliberation_tam_17_01_23/records'

export interface TaData {
  communale: number | null
  departementale: number | null
  regionale: number | null
  hasMultipleZones: boolean
}

export async function fetchTaData(idcom: string): Promise<TaData> {
  const dep = idcom.substring(0, 2)
  const com = idcom.substring(2)

  const where = `departement="${dep}" AND commune="${com}" AND def_prov="DEFINITIF" AND date_fin IS NULL`
  const url = `${TA_BASE}?where=${encodeURIComponent(where)}&select=taux,zone_application,date_effet&limit=50&order_by=date_effet%20DESC`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`TA API ${res.status}`)

  const json = await res.json()
  const records = (json.results ?? []) as Array<{
    taux: number
    zone_application: string
    date_effet: string
  }>

  if (records.length === 0) {
    return { communale: null, departementale: null, regionale: null, hasMultipleZones: false }
  }

  const byZone: Record<string, number[]> = {}
  for (const r of records) {
    const zone = r.zone_application
    if (!byZone[zone]) byZone[zone] = []
    byZone[zone]!.push(r.taux)
  }

  const communaleValues = byZone['Communale'] ?? []
  const uniqueCommunale = [...new Set(communaleValues)]

  return {
    communale: communaleValues[0] ?? null,
    departementale: (byZone['Départementale'] ?? [])[0] ?? null,
    regionale: (byZone['Régionale'] ?? [])[0] ?? null,
    hasMultipleZones: uniqueCommunale.length > 1,
  }
}
