export interface Territory {
  id: string
  name: string
  type: 'commune' | 'epci'
  region: string
  code: string
}

export interface ReiIndicateur {
  var: string
  varlib: string
  valeur: number | null
  dispositif_fiscal: string
  categorie: string
}

export interface IndicateurBoolean {
  var: string
  varlib: string
  kind: 'boolean'
  valeur: boolean | null
  categorie: string
  dispositif_fiscal: string
}

export interface IndicateurCategorical {
  var: string
  varlib: string
  kind: 'categorical'
  valeur: string | null
  categorie: string
  dispositif_fiscal: string
}

export type DispositifIndicateur = IndicateurBoolean | IndicateurCategorical

export interface TerritoireMeta {
  libcom: string
  libdep: string
  libreg: string
  idcom: string
  sirepci: string
  gfp_ept: string
  strate: number
  forjepci: string
  optepci: string
}

export interface TaData {
  communale: number | null
  departementale: number | null
  regionale: number | null
  hasMultipleZones: boolean
}

export interface EpciDetails {
  population: number | null
  nbCommunes: number | null
  surface: number | null
}

export interface TerritoireData {
  meta: TerritoireMeta
  indicateurs: Record<string, ReiIndicateur>
  annee: string
  ta: TaData | null
  dispositifs: Record<string, DispositifIndicateur>
  epciDetails: EpciDetails | null
  cfeFocusVars: Record<string, ReiIndicateur>
}
