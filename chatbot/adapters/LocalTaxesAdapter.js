// Local taxes adapter: wraps the OFGL "REI" dataset (Recensement des
// Éléments d'Imposition) - real French local tax rates/revenue by commune.
// https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei
//
// This is aggregate fiscal data per commune (rates, tax base, revenue
// collected), NOT a per-business tax simulator. There is no "parking tax"
// or per-employer CVAE estimate in this dataset - dispositif_fiscal covers
// CFE, TH, FB, FNB, TEOM-TIEOM, CVAE, IFER, GEMAPI-*, TSE-*, TVA, etc.
// Coverage: only annee 2024 and 2025 are currently populated.

const BaseAdapter = require('./BaseAdapter');
const { queryREI, stripAccents } = require('../ofgl-client');

class LocalTaxesAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('taxes', config);
  }

  async execute(toolName, params) {
    const method = this[`tool_${toolName}`];
    if (!method) {
      throw new Error(`Unknown tool: taxes:${toolName}`);
    }
    return method.call(this, params);
  }

  async tool_lookup_local_taxes(params) {
    const { commune, idcom, dep, reg, annee, dispositif_fiscal, categorie, destinataire } = params;

    if (!commune && !idcom) {
      throw new Error('lookup_local_taxes requires either "commune" (name) or "idcom" (INSEE code)');
    }

    const cacheKey = JSON.stringify(params);
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached;

    const { total_count, results } = await queryREI({
      commune,
      idcom,
      dep,
      reg,
      annee,
      dispositif_fiscal,
      categorie,
      destinataire,
      limit: params.limit || 50,
    });

    const result = {
      commune: commune ? stripAccents(commune).toUpperCase() : undefined,
      idcom,
      total_matching_rows: total_count,
      returned: results.length,
      rows: results.map((r) => ({
        annee: r.annee,
        commune: r.libcom,
        idcom: r.idcom,
        dep: r.dep,
        dispositif_fiscal: r.dispositif_fiscal,
        categorie: r.categorie,
        destinataire: r.destinataire,
        variable: r.varlib,
        valeur: r.valeur,
      })),
    };

    if (result.rows.length === 0) {
      result.note = 'No rows found. Check commune spelling (uppercase, no accent needed) or that annee is 2024/2025 (only years currently in this dataset).';
    } else if (!idcom) {
      const distinctIdcom = new Set(result.rows.map((r) => r.idcom));
      if (distinctIdcom.size > 1) {
        result.note = `Ambiguous commune name: ${distinctIdcom.size} different communes named "${result.commune}" exist (idcom: ${[...distinctIdcom].join(', ')}). Pass "idcom" or "dep" to disambiguate.`;
      }
    }

    this.cacheSet(cacheKey, result, 3600000);
    return result;
  }

  async tool_compare_taxes(params) {
    const { communes, annee, dispositif_fiscal, categorie, destinataire, dep } = params;

    if (!Array.isArray(communes) || communes.length === 0) {
      throw new Error('compare_taxes requires a non-empty "communes" array');
    }

    const perCommune = await Promise.all(
      communes.map((commune) =>
        this.tool_lookup_local_taxes({ commune, annee, dispositif_fiscal, categorie, destinataire, dep, limit: 20 }),
      ),
    );

    return {
      dispositif_fiscal,
      categorie,
      annee,
      comparison: perCommune,
      note: 'Each commune may have multiple rows (different destinataire/categorie) - inspect "rows" per entry rather than assuming a single scalar per commune.',
    };
  }
}

module.exports = LocalTaxesAdapter;
