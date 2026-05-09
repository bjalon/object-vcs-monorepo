# Goblin Tavern VCS

Application d’exemple pour Object VCS.

## Fonctionnalités

- CRUD gobelins.
- CRUD menu.
- Paramètres de chaos.
- HEAD dirty/clean.
- Commit.
- Tag.
- Branch depuis ancienne révision.
- Restore.
- Timeline React.
- Backend Firebase Firestore.
- Déploiement GitHub Pages.

## Variables d’environnement

```txt
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_OBJECT_VCS_REPO_ID=goblin-tavern-demo
```

## Commandes

```bash
pnpm install
pnpm --filter goblin-tavern dev
pnpm --filter goblin-tavern build
```

## Déploiement

Voir `docs/EXAMPLE_APP_GOBLIN_TAVERN.md`.
