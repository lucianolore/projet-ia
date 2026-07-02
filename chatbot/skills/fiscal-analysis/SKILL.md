---
name: fiscal-analysis
description: "Analyse des données de fiscalité locale et immobilières françaises (REI/OFGL, DVF/data.gouv) affichées à l'utilisateur. Déclenche quand l'utilisateur demande d'analyser, interpréter, comparer ou commenter des données fiscales/immobilières déjà affichées à l'écran (taux d'imposition, transactions DVF, comparaison de communes). Ne pas utiliser pour générer du texte générique sans données concrètes en entrée."
---

# Analyse de données fiscales et immobilières locales — méthodologie

> Cette skill encadre l'interprétation de données déjà récupérées (affichées dans le front) — elle ne remplace pas les tools `taxes:*` / `datagouv:*` qui vont chercher les données. Le texte ci-dessous est injecté comme contexte additionnel quand l'utilisateur demande une analyse, pas une simple recherche.

## 1. Rôle

Produire une lecture experte et honnête des chiffres fournis en entrée — pas juste répéter les valeurs. L'utilisateur a déjà les données sous les yeux (tableau, carte, graphique) ; la valeur ajoutée attendue est l'**interprétation** : est-ce haut ou bas, pourquoi ça peut varier, qu'est-ce qui est fiable, qu'est-ce qui ne l'est pas.

## 2. Glossaire fiscal (REI/OFGL) — ne pas confondre

| Sigle | Signification | Qui la lève | Assiette |
|---|---|---|---|
| **FB** | Taxe foncière sur les propriétés bâties | Commune (+ part GFP/intercommunalité selon territoire) | Valeur locative cadastrale, abattement 50% |
| **FNB** | Taxe foncière sur les propriétés non bâties | Commune | Valeur locative cadastrale non bâtie |
| **TH** | Taxe d'habitation | Résiduelle depuis réforme (résidences secondaires principalement) | Valeur locative |
| **CFE** | Cotisation foncière des entreprises | GFP (EPCI) le plus souvent | Valeur locative des biens professionnels |
| **CVAE** | Cotisation sur la valeur ajoutée des entreprises | En suppression progressive (voir année) | Valeur ajoutée |
| **TEOM-TIEOM** | Taxe (incitative) d'enlèvement des ordures ménagères | Commune ou GFP | Même assiette que FB |
| **IFER** | Imposition forfaitaire sur les entreprises de réseau | Diverse | Forfaitaire par équipement (antennes, éoliennes, etc.) |
| **GEMAPI** | Gestion des milieux aquatiques et prévention des inondations | GFP | Additionnel sur FB/FNB/CFE/TH |
| **TSE** | Taxe spéciale d'équipement | Établissements publics fonciers | Additionnel |

**Catégories de valeur** (champ `categorie`) : `Taux` (%) ≠ `Produit` (€ collectés, montant absolu) ≠ `Base` (assiette taxable) ≠ `Compensation`/`Exoneration`/`Degrevement` (mécanismes d'allègement). **Ne jamais comparer un `Taux` d'une commune à un `Produit` d'une autre** — vérifier `categorie` avant toute comparaison.

**`destinataire`** : qui touche l'argent — `Commune`, `GFP` (intercommunalité/métropole), `Departement`, `Region`, `Divers`. Un taux "FB Commune" et un taux "FB GFP" pour la même commune s'additionnent, ne se comparent pas entre communes sans préciser lequel.

## 3. Ce que les données NE disent PAS (limites à toujours signaler)

- **REI/OFGL couvre seulement 2024 et 2025** — jamais d'historique plus ancien dans ce dataset. Si l'utilisateur demande une tendance sur 5 ans, dire clairement que ce n'est pas possible avec cette source.
- **Communes homonymes** : plusieurs communes françaises portent le même nom dans des départements différents (ex. 3 "Mérignac"). Si le résultat affiché ne précise pas `dep`/`idcom`, signaler l'ambiguïté possible plutôt que de conclure.
- **DVF (transactions immobilières)** : les données sont des lignes brutes de transactions, pas des statistiques officielles. Un "prix moyen" calculé sur un petit échantillon (n<10) est fragile — toujours mentionner la taille d'échantillon et la période couverte.
- **Taux ≠ facture réelle** : le taux communal seul ne donne pas le montant payé par un contribuable — il faut la valeur locative cadastrale du bien, non disponible dans REI.
- **CVAE en suppression progressive** — les montants baissent structurellement d'année en année pour cette raison précise, pas nécessairement parce que la zone perd en activité économique. Ne pas interpréter une baisse de CVAE comme un signal de déclin sans le préciser.

## 4. Méthode de comparaison entre communes/zones

1. Vérifier que la `categorie` et le `dispositif_fiscal` sont identiques entre toutes les entités comparées.
2. Situer chaque valeur par rapport à un repère : médiane du groupe comparé, ou valeur de la commune la plus proche en population/strate si disponible (`strate` dans REI).
3. Exprimer l'écart en points ET en pourcentage relatif (ex: "+1,3 point, soit +2,7% par rapport à Bordeaux") — un chiffre brut isolé n'a pas de sens pour un non-spécialiste.
4. Si l'écart est faible (<5% relatif), le dire explicitement plutôt que de sur-interpréter un classement.
5. Ne jamais recommander une décision d'implantation ou d'investissement sur la seule base d'un taux fiscal — mentionner explicitement les dimensions non couvertes (marché immobilier, accessibilité, dynamique économique locale) quand la question porte sur un choix de localisation.

## 5. Format de sortie attendu

Structurer la réponse ainsi (adapter selon la question, ne pas forcer une section vide) :

1. **Résumé en une phrase** — la conclusion avant le détail.
2. **Chiffres clés** — tableau si comparaison, avec source (`taxes:*` / `datagouv:*`) et année.
3. **Interprétation** — ce que ça signifie concrètement, en utilisant le glossaire §2.
4. **Limites** — piocher dans §3 ce qui s'applique réellement au cas traité ; ne pas lister toutes les limites par réflexe si elles ne s'appliquent pas.
5. **Question ouverte** (optionnel) — proposer un axe d'approfondissement seulement si pertinent, pas systématique.

Ton : direct, chiffré, pas de remplissage ("il est important de noter que..."). Si une donnée manque pour répondre complètement, le dire et proposer le tool à appeler pour la récupérer plutôt que d'inventer.
