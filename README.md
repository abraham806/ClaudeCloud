# Facturo

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
- **Équipe** : collaborateur (saisie) et comptable (lecture seule).
- Réglages par défaut : FCFA (XOF), TVA 18 %, NINEA / RCCM, SYSCOHADA.

> Le format d'export propre au logiciel comptable du client reste à ajouter dans
> `server/src/services/excel.js` (`EXPORT_FORMATS`) dès que sa description est connue.

## Structure

```
server/   API REST (Node.js, Express, SQLite) — sert aussi l'application web compilée
web/      Application web (React + Vite), responsive mobile
```

## Lancer en local

Prérequis : Node.js 20 ou plus.

```bash
npm run install:all
npm run dev:api     # API sur http://localhost:4000
npm run dev:web     # application sur http://localhost:5173
```

Tests de l'API : `npm test`.

## Mettre en ligne

L'API sert l'application web compilée : un seul service suffit.

**Docker**

```bash
docker build -t facturo .
docker run -p 4000:4000 -e JWT_SECRET=une-longue-chaine-secrete -v facturo-data:/data facturo
```

**Render** : New › Blueprint › ce dépôt (le fichier `render.yaml` crée le service,
le disque persistant et le secret).

**Sans Docker**

```bash
npm run install:all && npm run build
JWT_SECRET=une-longue-chaine-secrete npm start
```

Variables d'environnement : `PORT` (4000), `JWT_SECRET` (obligatoire en production),
`DB_FILE`, `UPLOAD_DIR`, `MAX_UPLOAD_MB` (10), `CORS_ORIGIN`.

Les données (base SQLite et justificatifs) sont dans `server/data/` par défaut,
`/data` dans l'image Docker : ce dossier doit être sur un disque persistant et sauvegardé.
