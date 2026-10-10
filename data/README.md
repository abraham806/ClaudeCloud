# Données de la démo

`sauvegarde.json` est écrit par la démo GitHub Pages (Paramètres → Sauvegarde) : il contient
toute la base de la démo (entreprise, comptes, variables, pièces, justificatifs). La démo le
recharge automatiquement sur un nouvel appareil ou un navigateur vide.

- Le dépôt est **public** : ce fichier est lisible par tous. N'y mettez pas de données réelles
  sensibles. Les mots de passe y sont hachés (PBKDF2), jamais en clair.
- Ce n'est pas la base de production : en ligne (Vercel), les données vont dans Postgres (Neon).
- Les commits de ce dossier ne relancent ni la CI ni la publication de la démo.
