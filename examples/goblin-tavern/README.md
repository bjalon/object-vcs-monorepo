# Goblin Tavern VCS

Application d'exemple Vite + React pour Object VCS.

Elle utilise :

- `@bjalon/object-vcs-core` pour le graph Zod et le repository ;
- `@bjalon/object-vcs-firebase` pour Firestore ;
- `@bjalon/object-vcs-react` pour `ObjectVcsProvider` et `RevisionTimeline`.

## Configuration locale

Creer `examples/goblin-tavern/.env.local` :

```txt
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_OBJECT_VCS_REPO_ID=goblin-tavern-demo
```

Ces variables sont exposees au navigateur par Vite. Ne mets pas de secret
serveur dedans.

`VITE_OBJECT_VCS_REPO_ID` est utilise comme prefixe stable. L'application ajoute
un suffixe de schema au runtime, par exemple
`goblin-tavern-demo-simple-v1`, pour eviter de relire un ancien repository dont
le graph ne correspond plus au modele courant.

## Lancer

Depuis la racine :

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run dev:example
```

Ou directement :

```bash
cd examples/goblin-tavern
npm run dev
```

## Firestore

Pour une demo publique temporaire, `firestore.rules` est permissif. Pour une
application reelle, remplace les rules par un controle d'authentification et de
membership.

Deploiement des rules depuis la racine :

```bash
npm run deploy:firebase:rules
```

## GitHub Pages

Le workflow `.github/workflows/ci-pages.yml` build puis publie
`examples/goblin-tavern/dist`.

Dans GitHub :

1. `Settings > Pages` : choisir `Source: GitHub Actions`.
2. `Settings > Secrets and variables > Actions > Variables` : ajouter les
   variables `VITE_*` listees plus haut.
3. Pousser sur `main`.

Le domaine custom attendu est configure par `public/CNAME` :

```txt
gitlight.qastia.com
```

La procedure complete est documentee dans `GITHUB_PAGE.md` a la racine.
