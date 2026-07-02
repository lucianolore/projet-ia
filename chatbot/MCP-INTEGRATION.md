# MCP Integration Guide

Real adapter connection to the official data.gouv.fr MCP server.

## Current State

- **`DatagouvAdapter`** — real, wraps the official server via `mcp-client.js`. Works once `DATAGOUV_MCP_URL` is reachable (public default requires no key).
- **`LocalTaxesAdapter`** — real, queries the OFGL REI dataset directly over HTTP (`ofgl-client.js`). No mock, no key needed.

## The Server

Repo: https://github.com/datagouv/datagouv-mcp
Public endpoint: `https://mcp.data.gouv.fr/mcp`
Transport: **Streamable HTTP only** — no stdio, no SSE.

**This is a generic catalog server**, not a real-estate analytics API. There is no `search_property_transactions` or `score_market_health` tool. The tools it exposes:

| Tool | Purpose |
|------|---------|
| `search_datasets` | Find datasets by keyword |
| `get_dataset_info` | Dataset metadata |
| `list_dataset_resources` | List files in a dataset |
| `get_resource_info` | File metadata + Tabular API availability |
| `query_resource_data` | Fetch rows from a CSV/XLSX via Tabular API |
| `search_organizations` | Find publishing orgs (ministries, cities, INSEE...) |
| `search_dataservices` | Find third-party live APIs in the catalog |
| `get_dataservice_info` | Metadata + base_api_url for a dataservice |
| `get_dataservice_openapi_spec` | OpenAPI spec for a dataservice |
| `get_metrics` | Visits/downloads stats for a dataset/resource |

## Real-Estate Workflow (no shortcut tool)

To answer "compare DVF prices in Bordeaux vs Bruges", the agent must:

1. `search_datasets({query: "DVF valeurs foncières"})` → find the dataset id
2. `list_dataset_resources({dataset_id})` → find the CSV resource for the relevant year/department
3. `get_resource_info({resource_id})` → confirm Tabular API is available
4. `query_resource_data({resource_id, filter_column: "code_postal", filter_value: "33000"})` → raw rows
5. Compute averages/comparisons **in the agent's reasoning** — the server does no aggregation

Same pattern for DPE (search "DPE logements") and SIRENE business data (search "SIRENE établissements" or use an INSEE dataservice via `search_dataservices`).

## Client Wiring

```javascript
// mcp-client.js — real transport, not a stub
const MCPClient = require('./mcp-client');
const client = new MCPClient(); // reads DATAGOUV_MCP_URL from env, defaults to public endpoint

const rows = await client.call('query_resource_data', {
  resource_id: 'abc-123',
  filter_column: 'code_postal',
  filter_value: '33000',
  page_size: 50,
});
```

`DatagouvAdapter` (in `adapters/DatagouvAdapter.js`) wraps this 1:1 per tool, with `tool_*` methods matching each server tool name.

## Caching

Dataset/resource lookups cached 1h in the adapter (`cacheGet`/`cacheSet` from `BaseAdapter`). Row queries (`query_resource_data`) are **not** cached by default — data changes, and filter combinations are too varied to key cleanly.

## Error Handling

MCP tool errors surface as `result.isError` → `mcp-client.js` throws with the error text. Adapter does not catch/retry; propagates to the executor, which logs and rethrows to Claude as a tool error. Claude can retry with different params or ask the user for clarification.

## Rate Limiting

Not yet implemented. The public data.gouv.fr endpoint may have its own limits — if you hit 429s, add a token-bucket wrapper around `MCPClient.call()`.

## Local Taxes: OFGL REI Dataset

Repo/API: https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei
Plain public REST (Opendatasoft Explore v2.1), no auth, no MCP needed — `ofgl-client.js` calls it directly with `fetch`.

Key fields: `libcom` (commune name, UPPERCASE no accent in the data), `idcom` (INSEE code — **not** the postal code), `dep`/`reg`, `annee` (only 2024/2025 populated), `dispositif_fiscal` (CFE, TH, FB, FNB, TEOM-TIEOM, CVAE, IFER, GEMAPI-*, TSE-*, TVA, CHAMBRE-*...), `categorie` (Base/Taux/Produit/Compensation/Exoneration/Degrevement/Abattement/Tarif/Lissage/Perequation), `destinataire` (Commune/GFP/Departement/Region/Divers/Etat/...), `varlib` (human label), `valeur` (the number).

**Caveat — homonym communes**: names aren't unique (e.g. 3 communes named "Merignac" exist across different departments). `LocalTaxesAdapter.tool_lookup_local_taxes` detects this (multiple distinct `idcom` in the result) and returns a `note` telling the caller to pass `dep` or `idcom`.

```javascript
const { queryREI } = require('./ofgl-client');
const { results } = await queryREI({ commune: 'Bordeaux', annee: '2025', dispositif_fiscal: 'FB', categorie: 'Taux' });
```

## Deployment Checklist

- [ ] `DATAGOUV_MCP_URL` reachable from deployment environment (default public endpoint needs no key)
- [ ] Outbound HTTPS to `data.ofgl.fr` allowed (no key needed either)
- [ ] Additional adapters registered (zoning, permits, etc.) following the same pattern
- [ ] Rate limiting added if hitting quotas on either API
- [ ] Logging configured for production
