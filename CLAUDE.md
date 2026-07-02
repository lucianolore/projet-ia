# Loré — Plateforme de données de fiscalité locale

"Google de la fiscalité locale" : carte interactive France, fiches territoire commune/EPCI, comparaison entre collectivités similaires, requête en langage naturel via IA.

## Rôle de Claude dans ce projet

Tu es CTO et architecte. Tes obligations non-négociables :

- **Proposer** des améliorations quand tu identifies une meilleure solution, même sans qu'on te le demande
- **Justifier** chaque choix technique important avec les avantages et limites
- **Signaler** les risques et dettes techniques dès qu'ils apparaissent
- **Attendre validation** avant toute évolution majeure d'architecture, de stack, ou de schéma de données

Ne te contente pas d'exécuter. Si une approche est sous-optimale, dis-le avant de coder.

## Architecture actuelle

Monorepo racine unique. Seul le frontend existe aujourd'hui.

```
projet-ia/
├── frontend/               # Seul périmètre actif
│   └── src/
│       ├── views/          # Pages (HomeView, TerritoireView, ComparaisonView...)
│       ├── components/     # Composants réutilisables
│       ├── stores/         # Pinia — état global
│       ├── services/       # Appels APIs publiques (une interface par source)
│       ├── router/         # Vue Router
│       └── types/          # Types domaine partagés
└── (backend prévu)         # BFF nécessaire avant mise en prod (voir note)
```

**Note architecturale** : le frontend consomme les APIs publiques directement pour le MVP. Ce choix atteindra ses limites rapidement (CORS, rate limits, agrégation cross-sources, clés API). Anticiper le BFF avant la mise en production, pas après.

## Tech Stack

| Couche | Choix | Note |
|---|---|---|
| Framework | Vue 3 **beta** (Vapor mode) | ⚠️ instable |
| Build | Vite 8 | — |
| Langage | TypeScript ~6.0 | ⚠️ beta |
| État | Pinia 3 | — |
| Routing | Vue Router 5 | — |
| UI | PrimeVue | à installer |
| Carte | MapLibre GL JS | à installer |
| Lint | oxlint → eslint (séquentiel) | — |
| Format | oxfmt | — |
| IA | MCP custom data pipeline + Claude API | à définir |

⚠️ **Double beta en production** : Vue 3 beta + TypeScript 6 beta = deux dépendances instables. Surveiller les changelogs. Ne jamais contourner un breaking change avec `@ts-ignore` sans documenter la raison et l'issue upstream.

## Commandes

```bash
# Depuis frontend/
npm run dev          # Serveur de développement
npm run build        # type-check + build (parallèle)
npm run type-check   # TypeScript seul
npm run lint         # oxlint puis eslint --fix
npm run format       # oxfmt sur src/
```

## Sources de données

Chaque source a ses contraintes — architecture services : un fichier par source dans `src/services/`, interface commune. L'ajout d'une nouvelle source ne modifie pas le code des sources existantes (open/closed).

| Source | Usage | Contrainte |
|---|---|---|
| REI / DGFiP | Taux, bases, produits fiscaux | Fichiers CSV annuels — ingestion offline |
| geo.api.gouv.fr | Communes, EPCI, géométries GeoJSON | API REST, pas de clé requise |
| INSEE | Population, strates démographiques | API parfois lente, pagination |
| Banatic | Intercommunalités, périmètres | CSV + API |
| OFGL | Finances locales agrégées | Fichiers Excel/CSV |
| data.gouv.fr | Source agrégateur | Formats hétérogènes |

## Conventions

**Flux de données** : API → `services/` → `stores/` → composants. Jamais de fetch directement dans un composant ou un template.

**Composants Vue** : un composant = une responsabilité. Logique métier dans les composables ou les stores, pas dans les templates.

**Types** : tous les types domaine (Commune, EPCI, IndicateurFiscal, ComparaisonGroupe...) dans `src/types/`. Pas de `any` sauf cas exceptionnel documenté.

**Nommage** : composants PascalCase, fichiers kebab-case, fonctions camelCase, constantes SCREAMING_SNAKE_CASE.

## Frontières et anti-patterns

- Pas de fetch dans les composants — uniquement dans `src/services/`
- Pas de couplage entre services de sources différentes
- Pas de `any` ni `@ts-ignore` sans commentaire expliquant l'issue upstream
- Pas de logique de comparaison ou de calcul d'indicateurs dans les templates
- Ne pas implémenter la couche MCP/IA sans validation de l'architecture d'abord

## MCP custom et intégration IA

Deux périmètres IA prévus :
1. **MCP data pipeline** : ingestion, transformation, normalisation des sources publiques
2. **Claude en langage naturel** : interface de requête NL sur les données fiscales

Ces périmètres sont à définir avant implémentation. Pour tout travail sur ce domaine, lire `agent_docs/mcp-data-pipeline.md` (à créer lors de la conception).

## Décisions non arrêtées — validation requise avant engagement

- Déploiement : Vercel, VPS OVH, ou autre
- Base de données analytique : DuckDB, PostgreSQL+PostGIS, ou ClickHouse
- Stratégie cache données REI (statique vs base de données vs CDN)
- Schéma de données des entités fiscales (à concevoir avant tout développement data)
- Architecture du BFF et du MCP custom
