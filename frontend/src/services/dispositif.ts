import type { ReiIndicateur, DispositifIndicateur } from '@/types/territoire'
import { ZONES_TENDUES } from '@/data/zones-tendues'

export function estZoneTendue(codeCommune: string): boolean {
  return ZONES_TENDUES.has(codeCommune)
}

export function getRegime(codeCommune: string): 'TLV' | 'THLV' {
  return estZoneTendue(codeCommune) ? 'TLV' : 'THLV'
}

/**
 * Computes all dispositif indicators for a commune from static + REI data.
 * Returns a record keyed by indicator var code.
 *
 * Available:
 *   ZT         — Zone tendue (boolean, static)
 *   REGIME     — Régime applicable TLV/THLV (categorical, derived)
 *   THRS_INST  — Majoration THRS instaurée (boolean, derived from TXMAJOTHRS)
 *   TXMAJOTHRS — Taux de majoration THRS (use ReiIndicateur directly)
 *
 * Not available in OFGL REI:
 *   THLV_INST  — THLV instaurée (TLV = taxe d'État, hors périmètre REI OFGL)
 */
export function getDispositifs(
  codeCommune: string,
  indicateurs: Record<string, ReiIndicateur>,
): Record<string, DispositifIndicateur> {
  const zt = estZoneTendue(codeCommune)
  const txMaj = indicateurs['TXMAJOTHRS']?.valeur

  const result: Record<string, DispositifIndicateur> = {
    ZT: {
      var: 'ZT',
      varlib: 'Zone tendue',
      kind: 'boolean',
      valeur: zt,
      categorie: 'Logement',
      dispositif_fiscal: 'Zone tendue',
    },
    REGIME: {
      var: 'REGIME',
      varlib: 'Régime applicable',
      kind: 'categorical',
      valeur: zt ? 'TLV' : 'THLV applicable',
      categorie: 'Logement',
      dispositif_fiscal: 'Logements vacants',
    },
    THRS_INST: {
      var: 'THRS_INST',
      varlib: 'Majoration THRS instaurée',
      kind: 'boolean',
      valeur: txMaj != null ? txMaj > 0 : null,
      categorie: 'Résidences secondaires',
      dispositif_fiscal: 'THRS',
    },
  }

  return result
}
