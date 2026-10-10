# LeukFlow

Application de facturation pour commerçants et PME (pensée pour le Sénégal) :
factures, reçus et devis, achats avec photo du justificatif, tableau de bord,
export Excel pour le comptable. Une seule application web, utilisable sur
ordinateur et sur téléphone (installable sur l'écran d'accueil).

## Fonctionnalités

- **Landing page** publique (`/`), inscription et connexion.
- **Achats / dépenses** : saisie rapide (montant TTC) ou détaillée, photo du ticket
  ou PDF de la facture fournisseur, catégories, mode de paiement (Wave, Orange Money…).
- **Ventes** : factures, reçus et devis numérotés automatiquement
  (`FAC-2026-0001`, `REC-…`, `DEV-…`), devis transformable en facture,
  aperçu en direct, PDF imprimable, partage (WhatsApp, email) sur mobile.
- **Suivi** : payé / non payé / en retard, actions groupées, achats sans justificatif.
- **Tableau de bord** : ventes, dépenses, solde, TVA nette, graphique sur 12 mois,
  dépenses par catégorie, points à traiter.
- **Clients & fournisseurs** retrouvés automatiquement à partir des pièces.
- **Export comptable Excel** : récapitulatif ou écritures débit / crédit
  (plan SYSCOHADA ou PCG), historique des exports.
- **Variables personnalisées** : chaque entreprise crée ses propres champs (texte, nombre,
  date, liste de choix, oui / non) pour ses ventes et / ou ses achats ; aucun au départ.
  Ils peuvent être obligatoires, imprimés sur la facture, et sortent en colonnes dans l’export.
- **Équipe** : collaborateur (saisie) et comptable (lecture seule).
- Réglages par défaut : FCFA (XOF), TVA 18 %, NINEA / RCCM, SYSCOHADA.

> Le format d'export propre au logiciel comptable du client reste à ajouter dans
> `server/src/services/excel.js` (`EXPORT_FORMATS`) dès que sa description est connue.

## Structure

```
api/      Point d'entrée Vercel (fonction serverless qui sert l'API Express)
server/   API REST (Node.js, Express, PostgreSQL)
web/      Application web (React + Vite), responsive mobile
```

Base de données : PostgreSQL (Neon en production). En local et dans les tests,
PGlite (un Postgres embarqué) est utilisé automatiquement : rien à installer.
Justificatifs : Vercel Blob en production, dossier local sinon.

## Lancer en local

Prérequis : Node.js 20 ou plus.

```bash
npm install
npm run dev:api     # API sur http://localhost:4000 (données dans server/data/)
npm run dev:web     # application sur http://localhost:5173
```

Tests : `npm test` (PGlite) ou `TEST_DATABASE_URL=postgres://… npm test` (vrai serveur Postgres).

## Démo en ligne (GitHub Pages)

Une version de démonstration est publiée automatiquement sur GitHub Pages à chaque push :
**https://abraham806.github.io/ClaudeCloud/**

Dans cette version, l'API tourne entièrement dans le navigateur (même code, base PGlite
enregistrée dans le navigateur) : les données restent sur l'appareil de chaque visiteur.
Bouton « Ajouter des exemples » pour la remplir. Build : `VITE_DEMO=1 VITE_BASE=/ClaudeCloud/ npm run build`.

## Mettre en ligne sur Vercel

1. Sur vercel.com : **Add New › Project**, importer le dépôt GitHub. Vercel lit
   `vercel.json` : aucun réglage de build à modifier.
2. Dans le projet, onglet **Storage** :
   - **Create Database › Neon (Postgres)** et la relier au projet (ajoute `DATABASE_URL`) ;
   - **Create › Blob** et le relier au projet (ajoute `BLOB_READ_WRITE_TOKEN`).
3. **Settings › Environment Variables** : ajouter `JWT_SECRET` (une longue chaîne aléatoire,
   par exemple le résultat de `openssl rand -hex 32`).
4. **Deployments › Redeploy**. Les tables sont créées automatiquement au premier appel.

Chaque push sur GitHub redéploie l'application (aperçu pour les branches, production pour `main`).

Limites liées à Vercel : 4,5 Mo par envoi ; les photos sont compressées dans le navigateur
avant l'envoi et les fichiers sont envoyés un par un (4 Mo maximum par PDF).

## Autres hébergements

**Docker** (un seul conteneur, base PGlite dans `/data`, ou Postgres via `DATABASE_URL`) :

```bash
docker build -t facturo .
docker run -p 4000:4000 -e JWT_SECRET=une-longue-chaine-secrete -v facturo-data:/data facturo
```

**Render** : New › Blueprint › ce dépôt (`render.yaml`).

Variables d'environnement : `JWT_SECRET` (obligatoire en production), `DATABASE_URL`,
`BLOB_READ_WRITE_TOKEN`, `PORT` (4000), `PGLITE_DIR`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `CORS_ORIGIN`.
