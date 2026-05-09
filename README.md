# Object VCS

**Object VCS** est une librairie TypeScript de versioning léger pour une petite grappe d’objets applicatifs typés. Elle reprend les idées utiles de Git — `HEAD`, révisions, branches, tags, historique — sans gérer un filesystem ni des fichiers.

Le cas d’usage cible : une application manipule toujours la même structure d’objet, par exemple un projet, ses paramètres et quelques collections d’entités. Chaque modification peut être simplement écrite dans `HEAD` ou transformée en révision historisée.

## Packages prévus

```txt
@object-vcs/core       Moteur pur TypeScript, schémas, versioning, diffs, adapters.
@object-vcs/firebase   Adapter Firestore.
@object-vcs/http       Adapter HTTP pour backend custom.
@object-vcs/react      Hooks et composants React.
@object-vcs/vue        Composables et composants Vue.
@object-vcs/vanilla    Widgets DOM et Web Components.
```

## Principes clés

- Le schéma applicatif est défini avec Zod.
- Les types TypeScript sont inférés depuis les schémas.
- `HEAD` est l’état courant d’une branche.
- `HEAD` est partagé par branche.
- Une modification non commitée devient le nouveau `HEAD` dirty.
- Les versions dirty intermédiaires ne sont pas historisées.
- Une modification commitée crée une révision immuable.
- Une révision peut être créée même sans modification.
- Un tag est un nom qui pointe vers une révision.
- Une branche peut être créée depuis une ancienne révision.
- La persistance est abstraite : Firebase est le premier backend, mais pas une dépendance du core.

## Installation minimale

```bash
pnpm add @object-vcs/core @object-vcs/firebase firebase zod
```

Avec un backend custom compatible HTTP :

```bash
pnpm add @object-vcs/core @object-vcs/http zod
```

## Définir une grappe d’objets

```ts
import { z } from "zod";
import { defineGraph, singleton, collection, InferState } from "@object-vcs/core";

const TavernSchema = z.object({
  id: z.string(),
  name: z.string(),
  motto: z.string(),
  reputation: z.number().int().min(0).max(100),
});

const SettingsSchema = z.object({
  theme: z.enum(["sunny", "dungeon", "lava"]),
  chaosLevel: z.number().int().min(0).max(10),
});

const GoblinSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["chef", "bard", "guard", "intern"]),
  mood: z.enum(["grumpy", "hungry", "heroic", "suspicious"]),
  favoriteSnack: z.string(),
});

const MenuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  pricePebbles: z.number().int().min(0),
  weirdness: z.number().int().min(1).max(5),
  inStock: z.boolean(),
});

export const graph = defineGraph({
  tavern: singleton(TavernSchema),
  settings: singleton(SettingsSchema),
  goblins: collection(GoblinSchema),
  menuItems: collection(MenuItemSchema),
});

export type TavernState = InferState<typeof graph>;
```

## Utilisation avec Firebase

```ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { createRepository } from "@object-vcs/core";
import { firebasePersistence } from "@object-vcs/firebase";
import { graph } from "./graph";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});

const db = getFirestore(app);

export const repo = createRepository({
  repoId: "goblin-tavern-demo",
  graph,
  schemaVersion: 1,
  defaultBranch: "main",
  persistence: firebasePersistence({
    db,
    rootCollection: "objectVcs",
  }),
});
```

Initialisation :

```ts
await repo.init({
  branch: "main",
  commit: true,
  message: "Initialisation de la taverne",
  initialState: {
    tavern: {
      id: "tavern-1",
      name: "La Marmite du Gobelin Doré",
      motto: "On sert chaud, parfois vivant.",
      reputation: 42,
    },
    settings: {
      theme: "dungeon",
      chaosLevel: 6,
    },
    goblins: {
      g1: {
        id: "g1",
        name: "Grubnuk",
        role: "chef",
        mood: "hungry",
        favoriteSnack: "chaussette marinée",
      },
    },
    menuItems: {
      m1: {
        id: "m1",
        name: "Soupe de cailloux premium",
        pricePebbles: 7,
        weirdness: 3,
        inStock: true,
      },
    },
  },
});
```

Modifier `HEAD` sans créer de révision :

```ts
await repo.entities.goblins.update(
  "g1",
  goblin => ({ ...goblin, mood: "heroic" }),
  { commit: false }
);
```

Créer une révision :

```ts
await repo.commit({
  message: "Grubnuk devient héroïque",
  allowEmpty: false,
});
```

Modifier et commiter en une seule opération :

```ts
await repo.entities.menuItems.create(
  "m2",
  {
    id: "m2",
    name: "Omelette de dragon approximatif",
    pricePebbles: 19,
    weirdness: 5,
    inStock: true,
  },
  {
    commit: true,
    message: "Ajout d’un plat dangereux",
  }
);
```

Tagger la version courante :

```ts
await repo.tag("menu-halloween", {
  annotation: "Menu spécial horreur douce",
});
```

Créer une branche depuis une ancienne révision :

```ts
await repo.createBranch("idee-stupide", {
  from: 3,
  checkout: true,
});

await repo.update(
  state => ({
    ...state,
    settings: { ...state.settings, chaosLevel: 10 },
  }),
  {
    commit: true,
    message: "Univers alternatif beaucoup trop chaotique",
  }
);
```

## Utilisation avec backend HTTP custom

`@object-vcs/http` fournit un adapter client. Le backend doit implémenter le contrat HTTP décrit dans [`docs/BACKEND_HTTP_CONTRACT.md`](docs/BACKEND_HTTP_CONTRACT.md).

```ts
import { createRepository } from "@object-vcs/core";
import { httpPersistence } from "@object-vcs/http";
import { graph } from "./graph";

export const repo = createRepository({
  repoId: "goblin-tavern-demo",
  graph,
  schemaVersion: 1,
  defaultBranch: "main",
  persistence: httpPersistence({
    baseUrl: "https://api.example.com/object-vcs",
    getAuthToken: async () => localStorage.getItem("token"),
  }),
});
```

### Endpoints minimaux attendus côté backend

Tous les endpoints sont préfixés par `/v1`.

| Méthode | Endpoint | Rôle |
|---|---|---|
| `POST` | `/repos` | Créer ou initialiser un repository. |
| `GET` | `/repos/{repoId}` | Lire les métadonnées du repository. |
| `GET` | `/repos/{repoId}/branches` | Lister les branches. |
| `POST` | `/repos/{repoId}/branches` | Créer une branche depuis `HEAD` ou une révision. |
| `GET` | `/repos/{repoId}/branches/{branch}/head` | Lire le `HEAD` courant et son état complet. |
| `PUT` | `/repos/{repoId}/branches/{branch}/head` | Écrire un `HEAD` dirty sans créer de révision. |
| `POST` | `/repos/{repoId}/branches/{branch}/commit` | Créer une révision depuis le `HEAD` ou un état fourni. |
| `POST` | `/repos/{repoId}/branches/{branch}/restore` | Restaurer une révision dans `HEAD`, avec ou sans commit. |
| `POST` | `/repos/{repoId}/branches/{branch}/reset` | Repositionner brutalement une branche sur une révision. |
| `GET` | `/repos/{repoId}/revisions` | Lister les révisions. |
| `GET` | `/repos/{repoId}/revisions/{revision}` | Lire les métadonnées d’une révision. |
| `GET` | `/repos/{repoId}/revisions/{revision}/state` | Lire l’état complet reconstruit d’une révision. |
| `GET` | `/repos/{repoId}/tags` | Lister les tags. |
| `POST` | `/repos/{repoId}/tags` | Créer un tag. |
| `GET` | `/repos/{repoId}/events` | Optionnel : flux SSE temps réel pour `HEAD`, révisions, branches et tags. |

Le backend doit garantir au minimum :

1. allocation atomique des numéros de révision ;
2. immutabilité des révisions ;
3. unicité des tags, sauf `overwrite: true` ;
4. compare-and-set sur `HEAD` via `expectedHeadHash` ;
5. cohérence entre branche, `HEAD`, révision et tag ;
6. réponse `409 Conflict` en cas de conflit concurrent ;
7. réponse `422 Unprocessable Entity` si l’état envoyé est invalide pour le schéma attendu côté serveur, lorsque le backend choisit de revalider les schémas.

## React

```tsx
import { ObjectVcsProvider, RevisionTimeline, useHead } from "@object-vcs/react";

function App() {
  return (
    <ObjectVcsProvider repo={repo}>
      <Editor />
      <RevisionTimeline
        branch="main"
        onSelectRevision={async revision => {
          const state = await repo.readRevision(revision.revision);
          console.log(state);
        }}
      />
    </ObjectVcsProvider>
  );
}

function Editor() {
  const { head, update, commit } = useHead();

  if (!head) return null;

  return (
    <>
      <button
        onClick={() =>
          update(
            state => ({
              ...state,
              settings: {
                ...state.settings,
                chaosLevel: Math.min(10, state.settings.chaosLevel + 1),
              },
            }),
            { commit: false }
          )
        }
      >
        Augmenter le chaos dans HEAD
      </button>

      <button onClick={() => commit({ message: "Chaos assumé" })}>
        Commit
      </button>
    </>
  );
}
```

## Vue

```vue
<script setup lang="ts">
import { useHead, RevisionTimeline } from "@object-vcs/vue";

const { head, update, commit } = useHead();

async function increaseChaos() {
  await update(
    state => ({
      ...state,
      settings: {
        ...state.settings,
        chaosLevel: Math.min(10, state.settings.chaosLevel + 1),
      },
    }),
    { commit: false }
  );
}
</script>

<template>
  <button @click="increaseChaos">Augmenter le chaos dans HEAD</button>
  <button @click="commit({ message: 'Chaos assumé' })">Commit</button>
  <RevisionTimeline branch="main" />
</template>
```

## Vanilla

```ts
import { createRevisionTimeline } from "@object-vcs/vanilla";

createRevisionTimeline(document.querySelector("#timeline")!, {
  repo,
  branch: "main",
  onSelectRevision: async revision => {
    const state = await repo.readRevision(revision.revision);
    renderPreview(state);
  },
});
```

## Application d’exemple

L’application d’exemple s’appelle **Goblin Tavern VCS**. Elle est décrite dans [`docs/EXAMPLE_APP_GOBLIN_TAVERN.md`](docs/EXAMPLE_APP_GOBLIN_TAVERN.md).

Elle permet de manipuler une taverne de gobelins : gobelins, menu, paramètres de chaos, historique, tags et branches. Elle est conçue pour être déployée en site statique sur GitHub Pages avec Firestore comme backend.

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) : spécification complète produit et technique.
- [`docs/BACKEND_HTTP_CONTRACT.md`](docs/BACKEND_HTTP_CONTRACT.md) : contrat backend HTTP remplaçant Firebase.
- [`docs/EXAMPLE_APP_GOBLIN_TAVERN.md`](docs/EXAMPLE_APP_GOBLIN_TAVERN.md) : application d’exemple.
- [`docs/IMPLEMENTATION_LOTS.md`](docs/IMPLEMENTATION_LOTS.md) : découpage en lots.
