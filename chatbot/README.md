# Chatbot — Prototype NL sur données fiscales

> ⚠️ **Statut : prototype non validé architecturalement.** Le [CLAUDE.md racine](../CLAUDE.md) liste explicitement "Architecture du BFF et du MCP custom" comme décision non arrêtée nécessitant validation avant engagement. Ce dossier est un brouillon fonctionnel pour explorer l'approche — **pas** l'implémentation finale. Deux écarts connus par rapport au CLAUDE.md racine, à trancher avant tout usage en prod :
>
> 1. **Ingestion live vs offline** : le CLAUDE.md racine prévoit REI/DGFiP en "fichiers CSV annuels — ingestion offline" et OFGL en "fichiers Excel/CSV". Ce prototype interroge l'API REST OFGL en direct à chaque requête (`ofgl-client.js`), pas d'ingestion/cache local. Fonctionne pour un prototype, ne tient pas à l'échelle (rate limits, latence, dépendance disponibilité API tierce).
> 2. **Portée MCP** : ce prototype consomme aussi le [MCP data.gouv.fr](https://github.com/datagouv/datagouv-mcp) (catalogue générique), en plus d'OFGL — pas seulement REI/DGFiP.

Powered by Claude (seul provider, conforme au choix du CLAUDE.md racine) + [MCP data.gouv.fr](https://github.com/datagouv/datagouv-mcp) + [API OFGL REI](https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei).

## Ce que ça fait

`datagouv:*` — accès au catalogue data.gouv.fr complet : recherche datasets/dataservices/organisations, liste ressources, requête lignes CSV/XLSX (DVF, DPE, SIRENE...) via l'API Tabular. Catalogue générique, pas d'analytics immobilier tout fait — Claude trouve le dataset/ressource et calcule les stats lui-même à partir des lignes brutes.

`taxes:*` — vraies données fiscales locales via [OFGL REI](https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/rei) : taux/base/produit par commune (CFE, TH, FB, FNB, TEOM-TIEOM, CVAE, IFER, GEMAPI, TSE, TVA...), France entière. Seules les années 2024/2025 sont peuplées dans ce dataset ; pas de simulateur par entreprise (pas de taxe parking).

## Démarrage

```bash
cd chatbot
npm install
cp .env.example .env
# édite .env : ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run server
# serveur sur http://localhost:3000
```

```bash
npm run chat
# lance 2 requêtes d'exemple en CLI directe
```

```bash
npm test
# vérifie les tools sans LLM (taxes:* en direct sur l'API OFGL)
```

Appel HTTP :
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Compare le taux de taxe foncière entre Bordeaux et Bruges en 2025"}'
```

## Architecture

```
executor.js                 ← Dispatcher central "source:tool" → adapter
bootstrap.js                ← Point unique : construit executor + adapters + tools
mcp-client.js                ← Client MCP réel (Streamable HTTP) vers mcp.data.gouv.fr
ofgl-client.js                ← Client REST direct vers l'API OFGL REI
├── adapters/
│   ├── BaseAdapter.js       ← Base abstraite (cache, helpers)
│   ├── DatagouvAdapter.js   ← wrap du MCP data.gouv.fr officiel
│   └── LocalTaxesAdapter.js ← wrap de l'API OFGL REI (taxes locales réelles)
│
chatbot-server.js           ← Serveur Express
claude-integration.js       ← Client Claude (boucle agentique tool_use)
tool-definitions.json       ← Schémas d'outils pour Claude
system-prompt.md            ← Instructions système Claude
```

## Exemples d'usage

**"Compare le taux de taxe foncière entre Bordeaux, Bruges et Mérignac en 2025"**
1. Claude appelle `taxes:compare_taxes` avec `dep: "33"` (désambiguïse les communes homonymes, ex: 3 "Mérignac" en France)
2. Synthétise le classement à partir des taux réels renvoyés

**"Trouve le dataset DVF sur data.gouv.fr et liste ses ressources"**
1. `datagouv:search_datasets("DVF valeurs foncières")` → trouve le dataset officiel
2. `datagouv:list_dataset_resources` → liste les fichiers disponibles

## Ajouter une source de données

```javascript
// adapters/MyDataAdapter.js
const BaseAdapter = require('./BaseAdapter');

class MyDataAdapter extends BaseAdapter {
  constructor(config) {
    super('mydata', config);
  }

  async tool_my_search(params) {
    return { /* résultat */ };
  }
}

module.exports = MyDataAdapter;
```

```javascript
// bootstrap.js
const MyDataAdapter = require('./adapters/MyDataAdapter');
executor.registerAdapter('mydata', new MyDataAdapter());
// Claude voit maintenant : mydata:my_search
```

## Référence des outils

### Datagouv (catalogue data.gouv.fr)

| Tool | Rôle |
|------|------|
| `search_datasets` | Recherche datasets par mot-clé |
| `get_dataset_info` | Métadonnées d'un dataset |
| `list_dataset_resources` | Liste les fichiers d'un dataset |
| `get_resource_info` | Métadonnées fichier + dispo API Tabular |
| `query_resource_data` | Lignes d'un CSV/XLSX via l'API Tabular |
| `search_organizations` | Recherche organisations publiantes |
| `search_dataservices` | Recherche APIs tierces cataloguées |
| `get_dataservice_info` | Métadonnées + base_api_url d'une dataservice |
| `get_dataservice_openapi_spec` | Spec OpenAPI d'une dataservice |
| `get_metrics` | Stats visites/téléchargements |

### Taxes (OFGL REI, données réelles)

| Tool | Rôle |
|------|------|
| `lookup_local_taxes` | Taux/base/produit fiscal d'une commune (CFE, FB, TH, CVAE, TEOM...), 2024/2025 |
| `compare_taxes` | Idem, plusieurs communes, même type de taxe |

## Limites connues

- Dataset REI : seulement 2024/2025 (pas d'historique)
- Pas de cache/ingestion locale — chaque requête tape l'API OFGL en direct (voir écart §1 en tête de fichier)
- Communes homonymes en France (ex: 3× "Mérignac") — `LocalTaxesAdapter` détecte l'ambiguïté et demande `dep`/`idcom`
- Pas de zonage, permis de construire, financement — hors périmètre actuel

## Prochaine étape

Avant tout déploiement : trancher les décisions listées dans le [CLAUDE.md racine](../CLAUDE.md) (§"Décisions non arrêtées") — notamment stratégie de cache REI (statique vs base de données vs CDN) et architecture BFF/MCP définitive. Ce dossier peut servir de base de discussion, pas de socle à étendre tel quel.
