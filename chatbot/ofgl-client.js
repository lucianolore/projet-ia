// Thin HTTP client for the OFGL "REI" dataset (Recensement des Éléments
// d'Imposition) - real local tax rates/revenue by commune, France-wide.
// https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei
//
// Plain public REST API (Opendatasoft Explore v2.1), no auth, no MCP wrapper needed.
// Coverage: only annee 2024/2025 are currently populated in this dataset.

const BASE_URL = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei/records';

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function odsqlEscape(value) {
  return String(value).replace(/"/g, '\\"');
}

function buildWhere(filters) {
  const clauses = [];
  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    clauses.push(`${field}="${odsqlEscape(value)}"`);
  }
  return clauses.join(' AND ');
}

async function queryREI({ commune, idcom, dep, reg, annee, dispositif_fiscal, categorie, destinataire, limit = 50 }) {
  const where = buildWhere({
    libcom: commune ? stripAccents(commune).toUpperCase() : undefined,
    idcom,
    dep,
    reg,
    annee,
    dispositif_fiscal,
    categorie,
    destinataire,
  });

  const url = new URL(BASE_URL);
  if (where) url.searchParams.set('where', where);
  url.searchParams.set('limit', String(Math.min(limit, 100)));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OFGL API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return {
    total_count: data.total_count,
    results: data.results,
  };
}

module.exports = { queryREI, stripAccents };
