# Publication GitHub Pages

Ce projet publie l'application d'exemple `examples/goblin-tavern` via GitHub Actions.

## 1. Cote GitHub

Dans le repository GitHub :

1. Aller dans `Settings > Pages`.
2. Dans `Build and deployment`, choisir `Source: GitHub Actions`.
3. Aller dans `Settings > Secrets and variables > Actions > Variables`.
4. Ajouter les variables suivantes :

```txt
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_OBJECT_VCS_REPO_ID=goblin-tavern-demo
```

Les variables `VITE_*` sont injectees dans le bundle navigateur par Vite. Elles ne doivent donc contenir aucun secret serveur. La configuration Firebase Web contient des identifiants publics du projet/app Firebase, mais les droits doivent etre controles par les regles Firestore.

Le workflow [ci-pages.yml](.github/workflows/ci-pages.yml) fait ensuite :

- `npm ci` ;
- `npm run typecheck` ;
- `npm run lint` ;
- `npm run test` ;
- `npm run build` ;
- build Vite de `examples/goblin-tavern` avec `GITHUB_PAGES=true` ;
- publication de `examples/goblin-tavern/dist` sur GitHub Pages.

Le deploiement se lance sur `push` vers `main` ou `master`. Les pull requests lancent la validation, mais ne publient pas Pages.

## 2. Cote Firebase

Dans la console Firebase :

1. Creer ou ouvrir le projet Firebase de demonstration.
2. Ajouter une application Web.
3. Recuperer la configuration Web dans `Project settings > General > Your apps`.
4. Copier `apiKey`, `authDomain`, `projectId` et `appId` dans les variables GitHub ci-dessus.
5. Activer Firestore Database.
6. Creer la base Firestore dans la region souhaitee.

Pour une demo publique non sensible, les regles permissives de la specification peuvent suffire temporairement :

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /objectVcs/{repoId}/{document=**} {
      allow read, write: if true;
    }
  }
}
```

Ces regles ne doivent pas etre utilisees en production. Pour une demo avec authentification, utiliser les regles documentees dans `docs/EXAMPLE_APP_GOBLIN_TAVERN.md`.

Pour deployer les rules depuis le poste local, renseigner `examples/goblin-tavern/.env.local`, puis lancer depuis la racine :

```bash
npm run deploy:firebase:rules
```

Le script racine entre dans `examples/goblin-tavern`, charge `VITE_FIREBASE_PROJECT_ID` depuis `.env.local` et execute `firebase deploy --only firestore:rules`.

## 3. URL et base path

Le build Pages utilise `GITHUB_PAGES=true`, ce qui configure Vite avec :

```txt
/qastia-gitlight/
```

Si le repository GitHub est renomme, mettre a jour `repositoryName` dans `examples/goblin-tavern/vite.config.ts`.

L'URL finale aura la forme :

```txt
https://bjalon.github.io/qastia-gitlight/
```

## 4. Verification locale

Avant de pousser :

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Pour verifier uniquement l'exemple en mode Pages :

```bash
cd examples/goblin-tavern
GITHUB_PAGES=true npm run build
npm exec vite preview -- --host 127.0.0.1 --port 4173
```

## 5. Sources utiles

- GitHub Pages peut publier depuis un workflow GitHub Actions : https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- `actions/upload-pages-artifact` produit l'artefact attendu par Pages : https://github.com/actions/upload-pages-artifact
- `actions/deploy-pages` deploie l'artefact sur l'environnement `github-pages` : https://github.com/actions/deploy-pages
- Firebase documente la configuration Web et precise que l'objet de config contient des identifiants non secrets : https://firebase.google.com/docs/web/learn-more
