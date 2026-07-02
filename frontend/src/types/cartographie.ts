export type Taxe = 'TFPB' | 'TFPNB' | 'THRS' | 'CFE' | 'TEOM'
export type Metrique = 'taux' | 'base' | 'produit' | 'produit_hab' | 'base_hab' | 'evolution' | 'majoration' | 'produit_etab'
export type Niveau = 'communes' | 'epci'
export type PerimetreType = 'region' | 'departement'
export type CartoMode = 'fiscal' | 'dispositif'
export type DispositifCarte = 'TLV_THLV'

export interface Perimetre {
  type: PerimetreType
  code: string
  label: string
}

export interface CartoFilters {
  perimetre: Perimetre
  niveau: Niveau
  taxe: Taxe
  metrique: Metrique
  annee: string
  strates: number[]
  typeEpci: string | null
}

export interface CartoRecord {
  code: string
  name: string
  valeur: number | null
  valeurN1: number | null
  population: number | null
}

export interface RegionInfo {
  code: string
  label: string
  dom: boolean
  center: [number, number]
  zoom: number
}
