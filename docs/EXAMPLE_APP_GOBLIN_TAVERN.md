# Application d’exemple — Goblin Tavern VCS

Nom : **Goblin Tavern VCS**  
Stack : Vite + React + TypeScript + Firebase Firestore  
Déploiement : GitHub Pages  
But : démontrer Object VCS avec une grappe d’objets amusante, versionnée, taggable et branchable.

## 1. Pitch

L’application permet de gérer une taverne de gobelins :

- nom et réputation de la taverne ;
- paramètres de chaos ;
- liste des gobelins employés ;
- menu de plats douteux ;
- historique des versions ;
- tags comme `menu-halloween` ou `avant-catastrophe` ;
- branches comme `idee-stupide`, `client-vip`, `univers-sans-soupe`.

Le ton de l’application est léger, mais elle couvre les cas d’usage sérieux : CRUD, HEAD dirty, commit, tag, restore, branch.

## 2. Objectifs pédagogiques

L’exemple doit montrer :

1. définition d’un graph Zod ;
2. création d’un repository ;
3. modification dirty de `HEAD` ;
4. commit explicite ;
5. commit vide ;
6. tag ;
7. lecture d’une ancienne révision ;
8. restore ;
9. création de branche depuis une révision ;
10. timeline React ;
11. intégration Firebase ;
12. déploiement GitHub Pages.

## 3. Grappe d’objets

```ts
import { z } from "zod";
import { defineGraph, singleton, collection, InferState } from "@bjalon/object-vcs-core";

export const TavernSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  motto: z.string().min(1),
  reputation: z.number().int().min(0).max(100),
});

export const SettingsSchema = z.object({
  theme: z.enum(["sunny", "dungeon", "lava"]),
  chaosLevel: z.number().int().min(0).max(10),
  autosaveDirty: z.boolean(),
});

export const GoblinSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.enum(["chef", "bard", "guard", "intern"]),
  mood: z.enum(["grumpy", "hungry", "heroic", "suspicious"]),
  favoriteSnack: z.string().min(1),
  energy: z.number().int().min(0).max(100),
});

export const MenuItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  pricePebbles: z.number().int().min(0),
  weirdness: z.number().int().min(1).max(5),
  inStock: z.boolean(),
});

export const TavernEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  severity: z.enum(["minor", "messy", "legendary"]),
  resolved: z.boolean(),
});

export const graph = defineGraph({
  tavern: singleton(TavernSchema),
  settings: singleton(SettingsSchema),
  goblins: collection(GoblinSchema),
  menuItems: collection(MenuItemSchema),
  events: collection(TavernEventSchema),
});

export type TavernState = InferState<typeof graph>;
```

## 4. État initial

```ts
export const initialState: TavernState = {
  tavern: {
    id: "tavern-1",
    name: "La Marmite du Gobelin Doré",
    motto: "On sert chaud, parfois vivant.",
    reputation: 42,
  },
  settings: {
    theme: "dungeon",
    chaosLevel: 6,
    autosaveDirty: true,
  },
  goblins: {
    grubnuk: {
      id: "grubnuk",
      name: "Grubnuk",
      role: "chef",
      mood: "hungry",
      favoriteSnack: "chaussette marinée",
      energy: 78,
    },
    zibzab: {
      id: "zibzab",
      name: "Zibzab",
      role: "bard",
      mood: "suspicious",
      favoriteSnack: "fromage qui crie",
      energy: 51,
    },
  },
  menuItems: {
    rock_soup: {
      id: "rock_soup",
      name: "Soupe de cailloux premium",
      pricePebbles: 7,
      weirdness: 3,
      inStock: true,
    },
    dragon_omelette: {
      id: "dragon_omelette",
      name: "Omelette de dragon approximatif",
      pricePebbles: 19,
      weirdness: 5,
      inStock: true,
    },
  },
  events: {
    spoon_incident: {
      id: "spoon_incident",
      title: "La grande disparition des cuillères",
      severity: "messy",
      resolved: false,
    },
  },
};
```

## 5. Fonctionnalités UI

### 5.1 Écran principal

Sections :

- carte taverne ;
- paramètres de chaos ;
- liste des gobelins ;
- menu ;
- événements ;
- panneau `HEAD` ;
- timeline des révisions ;
- tags ;
- branches.

### 5.2 Panneau HEAD

Affiche :

- branche active ;
- statut `clean` ou `dirty` ;
- numéro de révision si clean ;
- hash court ;
- boutons : `Commit`, `Commit vide`, `Reset hard`, `Restore`.

### 5.3 Timeline

Chaque entrée affiche :

- numéro de révision ;
- message ;
- branche ;
- date ;
- auteur ;
- tags éventuels ;
- indicateur de checkpoint.

Actions :

- `Voir` ;
- `Restaurer dans HEAD` ;
- `Créer branche depuis ici` ;
- `Créer tag`.

### 5.4 Diff viewer

En v0.1, le diff viewer peut afficher une comparaison JSON simple :

- état avant ;
- état après ;
- liste des chemins modifiés.

En v0.2, il utilisera les patches JSON.

## 6. Routes

Application monopage :

```txt
/                       Accueil et éditeur
/?repo=goblin-demo      Repository spécifique
/?branch=main           Branche active
/?revision=12           Preview d’une révision
```

Comme GitHub Pages sert une SPA statique, le routage doit fonctionner en query string ou avec fallback `index.html`.

## 7. Structure du projet exemple

```txt
examples/goblin-tavern/
  package.json
  index.html
  vite.config.ts
  src/
    main.tsx
    App.tsx
    graph.ts
    initialState.ts
    repo.ts
    firebase.ts
    components/
      TavernCard.tsx
      SettingsPanel.tsx
      GoblinList.tsx
      MenuList.tsx
      EventList.tsx
      HeadPanel.tsx
      TimelinePanel.tsx
      BranchPanel.tsx
      TagPanel.tsx
      RevisionPreview.tsx
    styles.css
```

## 8. Setup Firebase

### 8.1 Variables d’environnement

```txt
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_OBJECT_VCS_REPO_ID=goblin-tavern-demo
```

La configuration Firebase côté client n’est pas suffisante pour sécuriser l’application. La sécurité se joue dans les règles Firestore et, si besoin, dans un backend.

### 8.2 Initialisation Firebase

```ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseApp = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const db = getFirestore(firebaseApp);
```

### 8.3 Repository

```ts
import { createRepository } from "@bjalon/object-vcs-core";
import { firebasePersistence } from "@bjalon/object-vcs-firebase";
import { db } from "./firebase";
import { graph } from "./graph";

export const repo = createRepository({
  repoId: import.meta.env.VITE_OBJECT_VCS_REPO_ID ?? "goblin-tavern-demo",
  graph,
  schemaVersion: 1,
  defaultBranch: "main",
  persistence: firebasePersistence({
    db,
    rootCollection: "objectVcs",
  }),
});
```

## 9. Exemple de règles Firestore pour démo publique

Version très permissive pour une démo non sensible :

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

Cette règle est volontairement non sécurisée. Elle ne doit pas être utilisée en production.

## 10. Exemple de règles Firestore authentifiées

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /objectVcs/{repoId} {
      allow read: if isSignedIn();
      allow create, update: if isSignedIn();
      allow delete: if false;

      match /branches/{branchId} {
        allow read: if isSignedIn();
        allow create, update: if isSignedIn();
        allow delete: if false;
      }

      match /heads/{branchId} {
        allow read: if isSignedIn();
        allow create, update: if isSignedIn();
        allow delete: if false;
      }

      match /revisions/{revisionId} {
        allow read: if isSignedIn();
        allow create: if isSignedIn();
        allow update, delete: if false;
      }

      match /tags/{tagId} {
        allow read: if isSignedIn();
        allow create, update: if isSignedIn();
        allow delete: if false;
      }

      match /blobs/{blobId} {
        allow read: if isSignedIn();
        allow create: if isSignedIn();
        allow update, delete: if false;
      }
    }

    function isSignedIn() {
      return request.auth != null;
    }
  }
}
```

## 11. Déploiement GitHub Pages

GitHub Pages héberge des fichiers statiques. L’exemple doit donc être buildé en HTML/CSS/JS avec Vite, puis publié.

### 11.1 Vite config

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? "/object-vcs/" : "/",
});
```

Remplacer `/object-vcs/` par le nom réel du repository GitHub si nécessaire.

### 11.2 GitHub Action

```yaml
name: Deploy Goblin Tavern

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter goblin-tavern build
        env:
          GITHUB_PAGES: "true"
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: examples/goblin-tavern/dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## 12. Scénarios de démonstration

### 12.1 Dirty puis commit

1. Modifier l’humeur de Grubnuk.
2. Vérifier que `HEAD` devient dirty.
3. Cliquer sur `Commit`.
4. Voir une nouvelle révision dans la timeline.

### 12.2 Dirty remplacé

1. Modifier le niveau de chaos à `7` sans commit.
2. Modifier ensuite le niveau de chaos à `8` sans commit.
3. Vérifier que seule la valeur `8` existe dans `HEAD`.
4. Vérifier qu’aucune révision intermédiaire n’a été créée.

### 12.3 Tag

1. Mettre le menu dans un état satisfaisant.
2. Cliquer sur `Créer tag`.
3. Entrer `menu-halloween`.
4. Voir le tag sur la révision courante.

### 12.4 Branche depuis ancienne révision

1. Sélectionner une ancienne révision.
2. Cliquer `Créer branche depuis ici`.
3. Nommer la branche `univers-sans-soupe`.
4. Supprimer la soupe de cailloux.
5. Committer.
6. Constater que `main` n’a pas changé.

### 12.5 Restore

1. Choisir une ancienne révision.
2. Cliquer `Restaurer dans HEAD`.
3. Constater que `HEAD` devient dirty.
4. Committer ou annuler via reset hard.

## 13. Critères d’acceptation

L’application est considérée satisfaisante si :

- elle se build avec Vite ;
- elle se déploie sur GitHub Pages ;
- elle écrit et lit dans Firestore ;
- elle affiche le `HEAD` ;
- elle affiche la timeline ;
- elle permet au moins CRUD sur gobelins et menu ;
- elle permet commit, tag, restore et branch ;
- elle illustre clairement dirty vs clean ;
- elle ne nécessite pas de backend autre que Firebase pour la démo.

