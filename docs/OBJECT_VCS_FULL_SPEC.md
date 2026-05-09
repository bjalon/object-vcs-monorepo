# Object VCS — Dossier de spécification complet

> Document agrégé généré à partir de README.md et des documents du dossier docs/.

---

# README d’usage

**Object VCS** est une librairie TypeScript de versioning léger pour une petite grappe d’objets applicatifs typés. Elle reprend les idées utiles de Git — `HEAD`, révisions, branches, tags, historique — sans gérer un filesystem ni des fichiers.

Le cas d’usage cible : une application manipule toujours la même structure d’objet, par exemple un projet, ses paramètres et quelques collections d’entités. Chaque modification peut être simplement écrite dans `HEAD` ou transformée en révision historisée.

## Packages prévus

```txt
@bjalon/object-vcs-core       Moteur pur TypeScript, schémas, versioning, diffs, adapters.
@bjalon/object-vcs-firebase   Adapter Firestore.
@bjalon/object-vcs-http       Adapter HTTP pour backend custom.
@bjalon/object-vcs-react      Hooks et composants React.
@bjalon/object-vcs-vue        Composables et composants Vue.
@bjalon/object-vcs-vanilla    Widgets DOM et Web Components.
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
pnpm add @bjalon/object-vcs-core @bjalon/object-vcs-firebase firebase zod
```

Avec un backend custom compatible HTTP :

```bash
pnpm add @bjalon/object-vcs-core @bjalon/object-vcs-http zod
```

## Définir une grappe d’objets

```ts
import { z } from "zod";
import { defineGraph, singleton, collection, InferState } from "@bjalon/object-vcs-core";

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
import { createRepository } from "@bjalon/object-vcs-core";
import { firebasePersistence } from "@bjalon/object-vcs-firebase";
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

`@bjalon/object-vcs-http` fournit un adapter client. Le backend doit implémenter le contrat HTTP décrit dans [`docs/BACKEND_HTTP_CONTRACT.md`](docs/BACKEND_HTTP_CONTRACT.md).

```ts
import { createRepository } from "@bjalon/object-vcs-core";
import { httpPersistence } from "@bjalon/object-vcs-http";
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
import { ObjectVcsProvider, RevisionTimeline, useHead } from "@bjalon/object-vcs-react";

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
import { useHead, RevisionTimeline } from "@bjalon/object-vcs-vue";

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
import { createRevisionTimeline } from "@bjalon/object-vcs-vanilla";

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

---

# Spécification complète — Object VCS

Version : `0.1-draft`  
Statut : spécification de conception  
Nom de travail : `object-vcs`  
Langage cible : TypeScript  
Persistance initiale : Firebase Firestore  
Persistance alternative : adapter HTTP custom  
UI : React, Vue, Vanilla

## 1. Résumé

Object VCS est une librairie TypeScript qui fournit une abstraction de versioning légère pour une petite grappe d’objets applicatifs.

Elle permet de manipuler un état applicatif typé, structuré, validé, persistant et versionné :

- écriture initiale ;
- CRUD sur des objets singleton ou des collections ;
- modification du `HEAD` sans commit ;
- commit explicite pour créer une révision ;
- création de révision vide ;
- tags nommés ;
- branches ;
- lecture et restauration d’anciennes révisions ;
- persistance interchangeable ;
- composants UI pour visualiser et récupérer les versions.

La librairie est “Git-like” dans ses concepts, mais ne manipule pas un repository Git réel. Elle ne gère pas de filesystem, pas de fichiers, pas de staging area et pas de merge automatique en v1.

## 2. Hypothèses retenues

Les hypothèses suivantes sont considérées comme validées pour la v1 :

1. `HEAD` est partagé par branche.
2. Une branche possède exactement un `HEAD` courant.
3. `HEAD` peut être `clean` ou `dirty`.
4. Un `HEAD clean` pointe vers une révision existante.
5. Un `HEAD dirty` contient un état courant non historisé.
6. Une nouvelle modification dirty remplace la précédente modification dirty.
7. Une révision est immuable.
8. Les numéros de révision sont globaux au repository, pas locaux à une branche.
9. Les branches permettent de repartir depuis une ancienne révision et de poursuivre l’historique.
10. En v1, il n’y a pas de merge automatique entre branches.

## 3. Objectifs

### 3.1 Objectifs fonctionnels

La librairie doit permettre de :

- définir une grappe d’objets avec schéma ;
- initialiser un repository ;
- lire l’état courant ;
- modifier l’état courant ;
- persister une modification non commitée ;
- commiter une modification ;
- créer un commit vide ;
- lister les révisions ;
- lire une révision ;
- restaurer une révision ;
- créer un tag ;
- lister les tags ;
- créer une branche ;
- changer de branche ;
- visualiser l’historique dans React, Vue ou Vanilla ;
- brancher Firebase ou un backend custom.

### 3.2 Objectifs non fonctionnels

La librairie doit être :

- typée strictement ;
- indépendante de Firebase dans le core ;
- indépendante de React/Vue dans le core ;
- testable sans backend distant ;
- simple à utiliser côté application ;
- compatible avec un déploiement statique GitHub Pages pour l’application d’exemple ;
- robuste aux conflits concurrents ;
- claire dans sa sémantique `dirty` / `clean`.

### 3.3 Hors périmètre v1

Les fonctionnalités suivantes sont exclues de la v1 :

- merge automatique entre branches ;
- résolution de conflit type Git ;
- diff sémantique métier configurable ;
- permissions avancées intégrées au core ;
- édition collaborative temps réel au niveau champ ;
- stockage massif de très gros documents ;
- réécriture d’historique avancée ;
- squash, rebase, cherry-pick.

## 4. Choix du schéma : Zod comme source de vérité

Object VCS doit utiliser Zod comme mode de définition recommandé des schémas.

Raisons :

- TypeScript seul ne valide rien au runtime.
- Les états relus depuis Firebase ou un backend HTTP doivent être validés.
- Les anciennes révisions peuvent être relues après évolution du code.
- Les types TS peuvent être inférés depuis le schéma.
- Le modèle reste simple pour l’utilisateur.

Le core doit néanmoins exposer une interface abstraite de validation pour permettre d’autres bibliothèques plus tard.

```ts
export interface SchemaAdapter<T> {
  parse(input: unknown): T;
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: unknown };
}
```

## 5. Modèle de grappe d’objets

Une grappe est composée de deux types d’entrées :

- `singleton` : un objet unique ;
- `collection` : un dictionnaire d’objets indexés par identifiant.

```ts
const graph = defineGraph({
  settings: singleton(SettingsSchema),
  tasks: collection(TaskSchema),
});
```

Une collection est représentée par un `Record<string, Entity>`.

```ts
{
  tasks: {
    "task-1": { id: "task-1", title: "A", done: false },
    "task-2": { id: "task-2", title: "B", done: true }
  }
}
```

Les tableaux ne sont pas recommandés pour les collections CRUD, car les diffs par index sont fragiles. Les tableaux restent possibles à l’intérieur d’une entité si le schéma l’autorise.

## 6. Types publics principaux

```ts
export type RevisionNumber = number;
export type BranchName = string;
export type TagName = string;
export type StateHash = string;

export type HeadStatus = "clean" | "dirty";
export type StorageMode = "snapshot" | "patch" | "hybrid";
export type ConcurrencyMode = "strict" | "last-write-wins";
```

```ts
export interface Head<TState> {
  repoId: string;
  branchName: string;
  status: HeadStatus;
  headRevision: RevisionNumber | null;
  baseRevision: RevisionNumber | null;
  stateHash: StateHash;
  state: TState;
  updatedAt: string;
  updatedBy?: string;
}
```

```ts
export interface RevisionRecord {
  repoId: string;
  revision: RevisionNumber;
  parentRevision: RevisionNumber | null;
  branchName: string;
  stateHash: StateHash;
  schemaVersion: number;
  graphVersion: string;
  message?: string;
  createdAt: string;
  createdBy?: string;
  isEmptyRevision: boolean;
  isCheckpoint: boolean;
  patchRef?: string;
  snapshotRef?: string;
}
```

```ts
export interface BranchRecord {
  repoId: string;
  name: string;
  headRevision: RevisionNumber | null;
  baseRevision: RevisionNumber | null;
  headStateHash: StateHash;
  status: HeadStatus;
  createdFromRevision: RevisionNumber | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
```

```ts
export interface TagRecord {
  repoId: string;
  name: string;
  revision: RevisionNumber;
  annotation?: string;
  createdAt: string;
  createdBy?: string;
}
```

## 7. Sémantique de HEAD

### 7.1 HEAD clean

Un `HEAD clean` correspond exactement à une révision existante.

```txt
main HEAD -> revision 12
status    -> clean
```

### 7.2 HEAD dirty

Un `HEAD dirty` contient un état courant persistant, mais non historisé.

```txt
main HEAD -> état courant non commité
status    -> dirty
base      -> dernière révision clean connue
```

Une modification dirty remplace le dirty précédent. Le dirty précédent n’est pas retrouvable.

### 7.3 HEAD partagé

Pour la v1, le `HEAD` est partagé par branche. Si deux utilisateurs modifient la même branche, ils manipulent le même `HEAD`.

Conséquence : le contrôle de concurrence est important. Le mode recommandé est `concurrency: "strict"` avec `expectedHeadHash`.

## 8. Sémantique des révisions

Une révision est un état immuable et retrouvable.

Chaque révision a :

- un numéro global ;
- un parent ;
- une branche d’origine ;
- un hash d’état ;
- une date de création ;
- un auteur optionnel ;
- un message optionnel ;
- un snapshot ou un patch selon le mode de stockage.

Les révisions ne sont jamais modifiées après création.

## 9. Sémantique des branches

Une branche est un pointeur mutable vers un `HEAD`.

Créer une branche depuis une révision :

```ts
await repo.createBranch("fix-from-r7", {
  from: 7,
  checkout: true,
});
```

Après création :

```txt
fix-from-r7 HEAD -> revision 7
status           -> clean
```

Modifier cette branche crée un historique divergent, sans modifier la révision source.

## 10. Sémantique des tags

Un tag est un nom qui pointe vers une révision.

```ts
await repo.tag("v1.0.0");
```

Règles :

- si `HEAD` est clean, le tag pointe vers la révision courante ;
- si `HEAD` est dirty et `createRevisionIfDirty !== false`, une révision est créée puis taggée ;
- si `HEAD` est dirty et `createRevisionIfDirty === false`, une erreur `DirtyHeadError` est levée ;
- si le tag existe déjà, une erreur est levée sauf `overwrite: true`.

## 11. API publique du repository

```ts
export interface ObjectVcsRepository<TState> {
  init(options: InitOptions<TState>): Promise<InitResult<TState>>;

  getHead(options?: { branch?: string }): Promise<Head<TState>>;

  watchHead(
    callback: (head: Head<TState>) => void,
    options?: { branch?: string }
  ): Unsubscribe;

  update(
    updater: (current: TState) => TState,
    options?: UpdateOptions
  ): Promise<UpdateResult<TState>>;

  edit(
    recipe: (draft: TState) => void,
    options?: UpdateOptions
  ): Promise<UpdateResult<TState>>;

  commit(options?: CommitOptions): Promise<CommitResult<TState>>;

  readRevision(
    revision: RevisionNumber,
    options?: ReadRevisionOptions
  ): Promise<TState>;

  listRevisions(
    options?: ListRevisionsOptions
  ): Promise<RevisionSummary[]>;

  watchRevisions(
    callback: (revisions: RevisionSummary[]) => void,
    options?: ListRevisionsOptions
  ): Unsubscribe;

  tag(name: string, options?: TagOptions): Promise<TagRecord>;

  listTags(): Promise<TagRecord[]>;

  createBranch(
    name: string,
    options: CreateBranchOptions
  ): Promise<BranchRecord>;

  checkout(branch: string): Promise<Head<TState>>;

  restore(
    revision: RevisionNumber,
    options?: RestoreOptions
  ): Promise<UpdateResult<TState>>;

  resetBranch(
    branch: string,
    options: ResetBranchOptions
  ): Promise<BranchRecord>;
}
```

## 12. Options principales

```ts
export interface UpdateOptions {
  branch?: string;
  commit?: boolean;
  message?: string;
  author?: string;
  expectedHeadHash?: string;
  concurrency?: "strict" | "last-write-wins";
}
```

`commit` vaut `false` par défaut pour les modifications. Cela signifie : écrire un nouveau `HEAD dirty`.

```ts
export interface CommitOptions {
  branch?: string;
  message?: string;
  author?: string;
  allowEmpty?: boolean;
  expectedHeadHash?: string;
}
```

```ts
export interface TagOptions {
  revision?: RevisionNumber | "HEAD";
  branch?: string;
  annotation?: string;
  author?: string;
  createRevisionIfDirty?: boolean;
  overwrite?: boolean;
}
```

```ts
export interface CreateBranchOptions {
  from: RevisionNumber | "HEAD";
  checkout?: boolean;
  author?: string;
}
```

```ts
export interface RestoreOptions {
  branch?: string;
  commit?: boolean;
  message?: string;
  author?: string;
}
```

```ts
export interface ResetBranchOptions {
  to: RevisionNumber;
  mode: "hard";
}
```

## 13. CRUD généré depuis le graph

Le repository expose des helpers de CRUD typés.

### Singleton

```ts
await repo.singletons.settings.set(
  { theme: "lava", chaosLevel: 9 },
  { commit: false }
);

const settings = await repo.singletons.settings.get();
```

### Collection

```ts
await repo.entities.goblins.create(
  "g1",
  {
    id: "g1",
    name: "Grubnuk",
    role: "chef",
    mood: "hungry",
    favoriteSnack: "chaussette marinée",
  },
  { commit: true, message: "Ajout de Grubnuk" }
);
```

```ts
await repo.entities.goblins.update(
  "g1",
  goblin => ({ ...goblin, mood: "heroic" }),
  { commit: false }
);
```

```ts
await repo.entities.goblins.delete("g1", {
  commit: true,
  message: "Grubnuk part en pause syndicale",
});
```

## 14. Opérations de versioning

### 14.1 Initialiser

```ts
await repo.init({
  initialState,
  branch: "main",
  commit: true,
  message: "Initial state",
});
```

Recommandation : `commit: true` par défaut à l’initialisation.

### 14.2 Modifier sans commit

```ts
await repo.update(updater, { commit: false });
```

Effet :

```txt
HEAD devient dirty
aucune révision n’est créée
la version dirty précédente est perdue
```

### 14.3 Modifier avec commit

```ts
await repo.update(updater, {
  commit: true,
  message: "Modification validée",
});
```

Effet :

```txt
nouvelle révision créée
HEAD devient clean
HEAD pointe vers cette révision
```

### 14.4 Committer le HEAD courant

```ts
await repo.commit({
  message: "Checkpoint",
});
```

Si `HEAD` est dirty, une révision est créée.

Si `HEAD` est clean et `allowEmpty` est faux, aucune nouvelle révision n’est créée : la révision courante est retournée.

Si `HEAD` est clean et `allowEmpty` est vrai, une révision vide est créée.

```ts
await repo.commit({
  message: "Checkpoint sans modification",
  allowEmpty: true,
});
```

### 14.5 Lire une révision

```ts
const state = await repo.readRevision(12);
```

Cette opération ne modifie pas `HEAD`.

### 14.6 Restaurer une révision sans commit

```ts
await repo.restore(12, { commit: false });
```

Effet :

```txt
HEAD devient dirty
HEAD contient l’état de la révision 12
aucune nouvelle révision n’est créée
```

### 14.7 Restaurer une révision avec commit

```ts
await repo.restore(12, {
  commit: true,
  message: "Retour à la révision 12",
});
```

Effet :

```txt
nouvelle révision N créée
state(N) = state(12)
parent(N) = ancienne révision HEAD de la branche
HEAD devient clean
```

### 14.8 Reset hard

```ts
await repo.resetBranch("main", {
  to: 12,
  mode: "hard",
});
```

Effet :

```txt
HEAD de main pointe vers la révision 12
HEAD devient clean
un éventuel dirty courant est perdu
```

Cette opération est volontairement explicite et dangereuse.

## 15. Hash d’état

Chaque état est converti en JSON canonique, puis hashé.

Format recommandé :

```txt
sha256:<hex>
```

Contraintes :

- les clés d’objet sont triées ;
- les valeurs `undefined` sont interdites ;
- les nombres doivent être finis ;
- les dates doivent être représentées en string ISO si nécessaires ;
- les fonctions, classes et prototypes custom sont interdits ;
- l’état doit être JSON-compatible.

Le hash sert à :

- détecter les modifications ;
- éviter certains commits vides ;
- vérifier la concurrence optimiste ;
- indexer des blobs éventuels.

## 16. Stockage : snapshot, patch, hybride

### 16.1 Mode snapshot

Chaque révision stocke l’état complet.

Avantages :

- simple ;
- rapide à lire ;
- robuste ;
- idéal pour v0.1.

Inconvénient : stockage plus volumineux.

### 16.2 Mode patch

Chaque révision stocke un patch depuis son parent.

Avantages : stockage compact et historique lisible.

Inconvénients : reconstruction plus coûteuse, chaîne de dépendances plus fragile.

### 16.3 Mode hybride recommandé

Le mode hybride stocke :

- un patch pour chaque révision ;
- un snapshot complet tous les `N` commits ;
- un snapshot si la chaîne de patch devient trop longue.

Configuration :

```ts
storage: {
  mode: "hybrid",
  checkpointEvery: 20,
  maxPatchChainLength: 50,
}
```

Recommandation d’implémentation :

- v0.1 : snapshot only ;
- v0.2 : hybride ;
- v1.0 : hybride par défaut.

## 17. Format de diff

Le format recommandé est JSON Patch.

```ts
export type JsonPatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: unknown };
```

Pour la v1, le moteur peut générer uniquement :

- `add` ;
- `remove` ;
- `replace`.

Le moteur peut accepter `move`, `copy` et `test` à la lecture plus tard.

## 18. Interface de persistance

Le core dépend d’une interface abstraite.

```ts
export interface PersistenceAdapter<TState> {
  getRepo(input: GetRepoInput): Promise<RepoRecord | null>;

  createRepo(input: CreateRepoInput<TState>): Promise<CreateRepoResult<TState>>;

  getBranch(input: GetBranchInput): Promise<BranchRecord | null>;

  listBranches(input: ListBranchesInput): Promise<BranchRecord[]>;

  writeHead(input: WriteHeadInput<TState>): Promise<WriteHeadResult<TState>>;

  createRevision(input: CreateRevisionInput<TState>): Promise<CreateRevisionResult<TState>>;

  readRevision(input: ReadRevisionInput): Promise<StoredRevision<TState> | null>;

  readRevisionState(input: ReadRevisionStateInput): Promise<TState | null>;

  listRevisions(input: ListRevisionsInput): Promise<RevisionSummary[]>;

  createTag(input: CreateTagInput): Promise<TagRecord>;

  listTags(input: ListTagsInput): Promise<TagRecord[]>;

  createBranch(input: CreateBranchInput): Promise<BranchRecord>;

  updateBranch(input: UpdateBranchInput): Promise<BranchRecord>;

  restoreRevision(input: RestoreRevisionInput<TState>): Promise<WriteHeadResult<TState>>;

  resetBranch(input: ResetBranchInput): Promise<BranchRecord>;

  subscribeHead?(
    input: SubscribeHeadInput,
    callback: (head: StoredHead<TState>) => void
  ): Unsubscribe;

  subscribeRevisions?(
    input: SubscribeRevisionsInput,
    callback: (items: RevisionSummary[]) => void
  ): Unsubscribe;
}
```

## 19. Adapter mémoire

Un adapter mémoire doit être implémenté tôt.

Nom : `memoryPersistence()`.

Usages :

- tests unitaires ;
- documentation ;
- Storybook ;
- exemple local sans Firebase ;
- développement des composants UI.

Il doit respecter les mêmes invariants que Firebase et HTTP.

## 20. Adapter Firebase

Package : `@bjalon/object-vcs-firebase`.

### 20.1 Initialisation

```ts
import { firebasePersistence } from "@bjalon/object-vcs-firebase";

const persistence = firebasePersistence({
  db,
  rootCollection: "objectVcs",
});
```

### 20.2 Structure Firestore

```txt
/objectVcs/{repoId}
  meta document

/objectVcs/{repoId}/branches/{branchName}
  BranchRecord

/objectVcs/{repoId}/heads/{branchName}
  Head document

/objectVcs/{repoId}/revisions/{revisionNo}
  RevisionRecord

/objectVcs/{repoId}/tags/{encodedTagName}
  TagRecord

/objectVcs/{repoId}/blobs/{hash}
  snapshots ou patches
```

Firestore stocke des documents organisés en collections et sous-collections. Le modèle ci-dessus suit donc naturellement cette organisation.

### 20.3 Document repository

```ts
export interface FirebaseRepoDocument {
  id: string;
  schemaVersion: number;
  graphVersion: string;
  defaultBranch: string;
  nextRevision: number;
  storageMode: StorageMode;
  checkpointEvery: number;
  createdAt: unknown;
  updatedAt: unknown;
}
```

### 20.4 Document head

```ts
export interface FirebaseHeadDocument<TState = unknown> {
  branchName: string;
  status: "clean" | "dirty";
  headRevision: number | null;
  baseRevision: number | null;
  stateHash: string;
  state?: TState;
  stateBlobRef?: string;
  updatedAt: unknown;
  updatedBy?: string;
}
```

Pour les petits états, `state` peut être stocké directement. Si l’état approche des limites de taille Firestore, utiliser `stateBlobRef`.

### 20.5 Document revision

```ts
export interface FirebaseRevisionDocument {
  revision: number;
  parentRevision: number | null;
  branchName: string;
  stateHash: string;
  schemaVersion: number;
  graphVersion: string;
  patchBlobRef?: string;
  snapshotBlobRef?: string;
  isCheckpoint: boolean;
  isEmptyRevision: boolean;
  message?: string;
  createdAt: unknown;
  createdBy?: string;
}
```

### 20.6 Transactions

Les opérations suivantes doivent être transactionnelles :

- création de repository ;
- création de révision ;
- commit ;
- tag sur `HEAD dirty` ;
- création de branche ;
- reset hard ;
- restore avec commit.

Une transaction doit vérifier :

- l’existence du repository ;
- l’existence de la branche ;
- l’état courant de `HEAD` ;
- `expectedHeadHash` si fourni ;
- l’unicité du tag si concerné ;
- l’allocation de `nextRevision`.

### 20.7 Temps réel

L’adapter Firebase doit implémenter :

- `subscribeHead` ;
- `subscribeRevisions` ;
- `subscribeTags` ;
- `subscribeBranches` si nécessaire.

L’UI doit pouvoir fonctionner sans temps réel, mais les composants React/Vue/Vanilla en bénéficient.

### 20.8 Limites de taille

Firestore a une limite de taille par document. L’adapter doit donc prévoir une stratégie `blob` pour les états trop gros, même si le cas d’usage cible reste petit.

### 20.9 Règles de sécurité

Le package Firebase doit fournir un template de règles Firestore.

Objectifs des règles :

- lecture réservée aux membres ;
- écriture réservée aux writers/admins ;
- révisions immuables ;
- blobs immuables ;
- tags contrôlés ;
- branches contrôlées.

Les règles Firestore ne remplacent pas une validation de schéma complète côté backend. Si l’application est sensible, les commits doivent passer par un backend ou des Cloud Functions qui valident le schéma.

## 21. Adapter HTTP custom

Package prévu : `@bjalon/object-vcs-http`.

Ce package permet de remplacer Firebase par n’importe quel backend REST compatible avec le contrat décrit dans `BACKEND_HTTP_CONTRACT.md`.

```ts
const persistence = httpPersistence({
  baseUrl: "https://api.example.com/object-vcs",
  getAuthToken: async () => token,
});
```

Le backend custom devient responsable de :

- stockage ;
- transactions ;
- allocation des révisions ;
- validation éventuelle ;
- sécurité ;
- reconstruction des états ;
- flux temps réel optionnel.

## 22. Packages UI

### 22.1 React

Package : `@bjalon/object-vcs-react`.

Exports :

```ts
ObjectVcsProvider
useObjectVcs
useHead
useRevision
useRevisions
useTags
useBranches
useCheckout
useCommit
RevisionTimeline
RevisionPicker
BranchSelector
TagList
DiffViewer
```

Composant principal :

```tsx
<RevisionTimeline
  branch="main"
  onSelectRevision={async revision => {
    const state = await repo.readRevision(revision.revision);
  }}
  onRestoreRevision={revision =>
    repo.restore(revision.revision, { commit: false })
  }
/>
```

### 22.2 Vue

Package : `@bjalon/object-vcs-vue`.

Exports :

```ts
createObjectVcsPlugin
useObjectVcs
useHead
useRevision
useRevisions
useTags
useBranches
RevisionTimeline
RevisionPicker
BranchSelector
TagList
DiffViewer
```

### 22.3 Vanilla

Package : `@bjalon/object-vcs-vanilla`.

Exports :

```ts
createRevisionTimeline
createBranchSelector
createTagList
defineObjectVcsWebComponents
```

Exemple :

```ts
createRevisionTimeline(document.querySelector("#timeline")!, {
  repo,
  branch: "main",
  onSelectRevision: async revision => {
    const state = await repo.readRevision(revision.revision);
    renderPreview(state);
  },
});
```

## 23. Monorepo

Structure recommandée :

```txt
object-vcs/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  turbo.json

  packages/
    core/
    firebase/
    http/
    react/
    vue/
    vanilla/
    devtools/

  examples/
    goblin-tavern/

  docs/
    SPEC.md
    BACKEND_HTTP_CONTRACT.md
    EXAMPLE_APP_GOBLIN_TAVERN.md
    IMPLEMENTATION_LOTS.md
```

## 24. Migrations de schéma

Chaque révision stocke :

- `schemaVersion` ;
- `graphVersion`.

Configuration :

```ts
const repo = createRepository({
  graph,
  schemaVersion: 3,
  migrations: {
    1: migrateV1ToV2,
    2: migrateV2ToV3,
  },
});
```

Modes de lecture :

```ts
type MigrationMode = "raw" | "latest" | "strict";
```

- `raw` : retourne l’état stocké ;
- `latest` : applique les migrations ;
- `strict` : refuse une ancienne version.

La v0.1 peut prévoir les types sans implémenter toutes les migrations.

## 25. Modèle d’erreurs

```ts
class ObjectVcsError extends Error {}
class ValidationError extends ObjectVcsError {}
class RepositoryNotFoundError extends ObjectVcsError {}
class RepositoryAlreadyExistsError extends ObjectVcsError {}
class BranchNotFoundError extends ObjectVcsError {}
class BranchAlreadyExistsError extends ObjectVcsError {}
class RevisionNotFoundError extends ObjectVcsError {}
class TagAlreadyExistsError extends ObjectVcsError {}
class DirtyHeadError extends ObjectVcsError {}
class ConcurrencyConflictError extends ObjectVcsError {}
class DetachedHeadWriteError extends ObjectVcsError {}
class MigrationError extends ObjectVcsError {}
class PersistenceError extends ObjectVcsError {}
```

## 26. Invariants

Le système doit garantir :

1. une révision ne change jamais ;
2. un tag pointe vers une révision existante ;
3. une branche pointe vers un `HEAD` valide ;
4. un `HEAD dirty` peut être remplacé ;
5. un `HEAD clean` correspond à une révision ;
6. `readRevision(n)` retourne toujours le même état logique, hors migration demandée ;
7. un état écrit est toujours validé côté client ;
8. un commit produit un `stateHash` stable ;
9. une branche créée depuis une ancienne révision ne modifie pas cette ancienne révision ;
10. un tag sur `HEAD clean` ne crée pas de nouvelle révision par défaut ;
11. le compteur de révision ne recule jamais ;
12. en mode strict, un conflit concurrent produit une erreur explicite.

## 27. Tests à prévoir

### Core

- définition de graph ;
- validation Zod ;
- inférence des types ;
- init clean ;
- init dirty ;
- update dirty ;
- remplacement de dirty ;
- commit dirty ;
- commit empty ;
- tag clean ;
- tag dirty ;
- branch depuis révision ;
- checkout ;
- restore dirty ;
- restore commit ;
- reset hard ;
- diff et apply diff ;
- reconstruction snapshot ;
- reconstruction hybride ;
- migrations.

### Firebase

- création repo ;
- structure Firestore ;
- transaction commit ;
- conflit `expectedHeadHash` ;
- tag conflict ;
- immutabilité révision ;
- realtime listener ;
- règles de sécurité via emulator.

### HTTP

- conformité endpoints ;
- erreurs HTTP ;
- retry idempotent ;
- conflit 409 ;
- lecture de révision ;
- SSE optionnel.

### UI

- affichage timeline ;
- sélection de révision ;
- restauration ;
- changement branche ;
- affichage dirty/clean ;
- états loading/error/empty.

## 28. Références techniques

- Firestore data model : https://firebase.google.com/docs/firestore/data-model
- Firestore transactions and batched writes : https://firebase.google.com/docs/firestore/manage-data/transactions
- Firestore quotas : https://firebase.google.com/docs/firestore/quotas
- GitHub Pages overview : https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- JSON Patch RFC 6902 : https://datatracker.ietf.org/doc/html/rfc6902

---

# Contrat backend HTTP — Object VCS Storage API

Version : `v1-draft`  
Package client prévu : `@bjalon/object-vcs-http`  
But : remplacer Firebase par un backend custom.

## 1. Objectif

Ce document définit les endpoints qu’un backend custom doit exposer pour être utilisable par `httpPersistence()`.

Le backend custom peut être implémenté avec n’importe quelle stack : Node, NestJS, Fastify, Hono, Go, Java, .NET, Python, PostgreSQL, MongoDB, DynamoDB, etc.

Le client ne suppose rien du stockage interne. Il suppose seulement que l’API HTTP respecte les invariants et les formats décrits ici.

## 2. Base URL

Exemple :

```txt
https://api.example.com/object-vcs/v1
```

Configuration côté client :

```ts
const persistence = httpPersistence({
  baseUrl: "https://api.example.com/object-vcs",
  apiVersion: "v1",
  getAuthToken: async () => authToken,
});
```

Le client construira les URLs sous la forme :

```txt
{baseUrl}/{apiVersion}/...
```

## 3. Headers

### 3.1 Requête

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>
X-Object-Vcs-Client-Version: 0.1.0
X-Idempotency-Key: <uuid>
```

`Authorization` est optionnel pour les exemples publics, mais recommandé.

`X-Idempotency-Key` est recommandé pour toutes les opérations d’écriture.

### 3.2 Réponse

```http
Content-Type: application/json
```

## 4. Format des erreurs

Toutes les erreurs applicatives doivent utiliser ce format :

```ts
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

Exemple :

```json
{
  "error": {
    "code": "CONCURRENCY_CONFLICT",
    "message": "HEAD has changed since expectedHeadHash.",
    "details": {
      "expectedHeadHash": "sha256:aaa",
      "actualHeadHash": "sha256:bbb"
    }
  }
}
```

## 5. Codes HTTP attendus

| Statut | Usage |
|---|---|
| `200` | Lecture ou écriture réussie. |
| `201` | Ressource créée. |
| `204` | Suppression ou opération sans payload. |
| `400` | Requête mal formée. |
| `401` | Authentification absente ou invalide. |
| `403` | Droits insuffisants. |
| `404` | Repository, branche, révision ou tag introuvable. |
| `409` | Conflit concurrent, tag existant, branche existante. |
| `422` | État invalide pour le schéma ou invariant métier impossible. |
| `500` | Erreur serveur. |

## 6. Types DTO

### 6.1 Repo

```ts
export interface RepoDto {
  repoId: string;
  schemaVersion: number;
  graphVersion: string;
  defaultBranch: string;
  storageMode: "snapshot" | "patch" | "hybrid";
  nextRevision: number;
  createdAt: string;
  updatedAt: string;
}
```

### 6.2 Head

```ts
export interface HeadDto<TState = unknown> {
  repoId: string;
  branchName: string;
  status: "clean" | "dirty";
  headRevision: number | null;
  baseRevision: number | null;
  stateHash: string;
  state: TState;
  updatedAt: string;
  updatedBy?: string;
}
```

### 6.3 Branch

```ts
export interface BranchDto {
  repoId: string;
  name: string;
  headRevision: number | null;
  baseRevision: number | null;
  headStateHash: string;
  status: "clean" | "dirty";
  createdFromRevision: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
```

### 6.4 Revision

```ts
export interface RevisionDto {
  repoId: string;
  revision: number;
  parentRevision: number | null;
  branchName: string;
  stateHash: string;
  schemaVersion: number;
  graphVersion: string;
  message?: string;
  createdAt: string;
  createdBy?: string;
  isEmptyRevision: boolean;
  isCheckpoint: boolean;
}
```

### 6.5 Tag

```ts
export interface TagDto {
  repoId: string;
  name: string;
  revision: number;
  annotation?: string;
  createdAt: string;
  createdBy?: string;
}
```

## 7. Invariants backend obligatoires

Le backend doit garantir :

1. les numéros de révision sont alloués atomiquement ;
2. une révision créée ne peut plus être modifiée ;
3. un tag pointe vers une révision existante ;
4. un tag est unique par repository, sauf `overwrite: true` ;
5. une branche pointe vers un `HEAD` valide ;
6. `HEAD clean` implique `headRevision !== null` ;
7. `HEAD dirty` peut remplacer un autre `HEAD dirty` ;
8. une écriture avec `expectedHeadHash` doit échouer si le hash courant diffère ;
9. le backend retourne `409 Conflict` en cas de conflit concurrent ;
10. `reset` exige explicitement `mode: "hard"`.

## 8. Endpoint : créer ou initialiser un repository

```http
POST /v1/repos
```

### Request

```ts
export interface CreateRepoRequest<TState = unknown> {
  repoId: string;
  schemaVersion: number;
  graphVersion: string;
  defaultBranch?: string;
  storageMode?: "snapshot" | "patch" | "hybrid";
  initialState: TState;
  commit?: boolean;
  message?: string;
  author?: string;
  ifNotExists?: boolean;
}
```

### Response

```ts
export interface CreateRepoResponse<TState = unknown> {
  repo: RepoDto;
  head: HeadDto<TState>;
  revision?: RevisionDto;
}
```

### Sémantique

- Si `commit !== false`, le backend crée la révision `1` et `HEAD clean` pointe vers elle.
- Si `commit === false`, le backend crée un `HEAD dirty` sans révision.
- Si le repository existe déjà et `ifNotExists` est faux, retourner `409`.
- Si le repository existe déjà et `ifNotExists` est vrai, retourner l’état existant.

## 9. Endpoint : lire un repository

```http
GET /v1/repos/{repoId}
```

### Response

```ts
export interface GetRepoResponse {
  repo: RepoDto;
}
```

## 10. Endpoint : lister les branches

```http
GET /v1/repos/{repoId}/branches
```

### Response

```ts
export interface ListBranchesResponse {
  branches: BranchDto[];
}
```

## 11. Endpoint : créer une branche

```http
POST /v1/repos/{repoId}/branches
```

### Request

```ts
export interface CreateBranchRequest {
  name: string;
  from: number | "HEAD";
  sourceBranch?: string;
  checkout?: boolean;
  author?: string;
}
```

### Response

```ts
export interface CreateBranchResponse<TState = unknown> {
  branch: BranchDto;
  head?: HeadDto<TState>;
}
```

### Sémantique

- `from: number` crée la branche depuis cette révision.
- `from: "HEAD"` crée la branche depuis le `HEAD` de `sourceBranch` ou de la branche par défaut.
- Si la branche existe déjà, retourner `409`.
- Si `checkout` est vrai, la réponse peut inclure le `head` de la nouvelle branche.

## 12. Endpoint : lire le HEAD

```http
GET /v1/repos/{repoId}/branches/{branch}/head
```

### Response

```ts
export interface GetHeadResponse<TState = unknown> {
  head: HeadDto<TState>;
}
```

Le backend doit retourner l’état complet courant, même s’il stocke en interne des patchs.

## 13. Endpoint : écrire un HEAD dirty

```http
PUT /v1/repos/{repoId}/branches/{branch}/head
```

### Request

```ts
export interface WriteHeadRequest<TState = unknown> {
  state: TState;
  stateHash: string;
  expectedHeadHash?: string;
  baseRevision?: number | null;
  author?: string;
  concurrency?: "strict" | "last-write-wins";
}
```

### Response

```ts
export interface WriteHeadResponse<TState = unknown> {
  head: HeadDto<TState>;
}
```

### Sémantique

- Ne crée jamais de révision.
- Met la branche en `status: "dirty"`.
- Remplace l’éventuel dirty précédent.
- Si `concurrency === "strict"`, `expectedHeadHash` doit matcher le hash courant.
- Si conflit, retourner `409`.

## 14. Endpoint : commit

```http
POST /v1/repos/{repoId}/branches/{branch}/commit
```

### Request

```ts
export interface CommitRequest<TState = unknown> {
  state?: TState;
  stateHash?: string;
  message?: string;
  author?: string;
  allowEmpty?: boolean;
  expectedHeadHash?: string;
}
```

### Response

```ts
export interface CommitResponse<TState = unknown> {
  revision: RevisionDto;
  head: HeadDto<TState>;
  created: boolean;
}
```

### Sémantique

Cas possibles :

1. `state` est fourni : le backend commit cet état directement.
2. `state` est absent : le backend commit l’état courant de `HEAD`.
3. Si l’état est identique à la révision courante et `allowEmpty !== true`, ne pas créer de nouvelle révision et retourner `created: false`.
4. Si l’état est identique et `allowEmpty === true`, créer une révision vide.
5. Après commit, `HEAD` devient `clean`.

## 15. Endpoint : restore

```http
POST /v1/repos/{repoId}/branches/{branch}/restore
```

### Request

```ts
export interface RestoreRequest {
  revision: number;
  commit?: boolean;
  message?: string;
  author?: string;
  expectedHeadHash?: string;
}
```

### Response

```ts
export interface RestoreResponse<TState = unknown> {
  head: HeadDto<TState>;
  revision?: RevisionDto;
}
```

### Sémantique

- `commit: false` restaure l’état de la révision dans un `HEAD dirty`.
- `commit: true` crée une nouvelle révision dont l’état est celui de la révision restaurée.
- La révision source n’est jamais modifiée.

## 16. Endpoint : reset hard

```http
POST /v1/repos/{repoId}/branches/{branch}/reset
```

### Request

```ts
export interface ResetBranchRequest {
  to: number;
  mode: "hard";
  author?: string;
  expectedHeadHash?: string;
}
```

### Response

```ts
export interface ResetBranchResponse<TState = unknown> {
  branch: BranchDto;
  head: HeadDto<TState>;
}
```

### Sémantique

- Repositionne la branche sur une révision existante.
- Supprime l’éventuel dirty courant.
- Ne supprime aucune révision.
- `mode` doit être exactement `"hard"`.

## 17. Endpoint : lister les révisions

```http
GET /v1/repos/{repoId}/revisions?branch=main&limit=50&after=12
```

### Query params

| Paramètre | Type | Description |
|---|---|---|
| `branch` | string | Filtre optionnel par branche d’origine. |
| `limit` | number | Nombre maximum de résultats. |
| `after` | number | Pagination après une révision. |
| `order` | `asc` ou `desc` | Ordre de tri. Défaut : `desc`. |

### Response

```ts
export interface ListRevisionsResponse {
  revisions: RevisionDto[];
  nextCursor?: string;
}
```

## 18. Endpoint : lire une révision

```http
GET /v1/repos/{repoId}/revisions/{revision}
```

### Response

```ts
export interface GetRevisionResponse {
  revision: RevisionDto;
}
```

## 19. Endpoint : lire l’état d’une révision

```http
GET /v1/repos/{repoId}/revisions/{revision}/state?migration=latest
```

### Query params

| Paramètre | Type | Description |
|---|---|---|
| `migration` | `raw` \| `latest` \| `strict` | Mode de migration souhaité. |

### Response

```ts
export interface GetRevisionStateResponse<TState = unknown> {
  revision: RevisionDto;
  state: TState;
  stateHash: string;
}
```

Le backend peut déléguer les migrations au client. Dans ce cas, il retourne l’état `raw` et indique clairement son comportement dans sa configuration.

## 20. Endpoint : lister les tags

```http
GET /v1/repos/{repoId}/tags
```

### Response

```ts
export interface ListTagsResponse {
  tags: TagDto[];
}
```

## 21. Endpoint : créer un tag

```http
POST /v1/repos/{repoId}/tags
```

### Request

```ts
export interface CreateTagRequest {
  name: string;
  revision?: number | "HEAD";
  branch?: string;
  annotation?: string;
  author?: string;
  createRevisionIfDirty?: boolean;
  overwrite?: boolean;
  messageIfRevisionCreated?: string;
  expectedHeadHash?: string;
}
```

### Response

```ts
export interface CreateTagResponse<TState = unknown> {
  tag: TagDto;
  revision?: RevisionDto;
  head?: HeadDto<TState>;
}
```

### Sémantique

- Si `revision` est un numéro, le tag pointe vers cette révision.
- Si `revision` vaut `"HEAD"` ou est absent, le tag pointe vers le `HEAD` de la branche.
- Si `HEAD` est dirty et `createRevisionIfDirty !== false`, le backend crée d’abord une révision.
- Si `HEAD` est dirty et `createRevisionIfDirty === false`, retourner `409` ou `422` avec `DIRTY_HEAD`.
- Si le tag existe et `overwrite !== true`, retourner `409`.

## 22. Endpoint optionnel : flux temps réel SSE

```http
GET /v1/repos/{repoId}/events?branch=main
```

### Format

Server-Sent Events.

Exemple :

```txt
event: head
id: 42
data: {"branchName":"main","stateHash":"sha256:abc","status":"dirty"}

```

Événements recommandés :

- `head` ;
- `revision` ;
- `tag` ;
- `branch`.

Si cet endpoint n’existe pas, l’adapter HTTP doit pouvoir fonctionner en polling ou sans realtime.

## 23. Sécurité

Le backend doit décider du modèle de sécurité. Recommandation minimale :

- authentification bearer token ;
- rôle `reader`, `writer`, `admin` par repository ;
- lecture autorisée aux `reader` ;
- écriture autorisée aux `writer` ;
- opérations dangereuses comme `reset` réservées aux `admin` ou explicitement activées.

## 24. Validation de schéma côté backend

Le client valide toujours l’état avant écriture. Mais dans un contexte non fiable, le backend doit aussi valider.

Deux modes sont possibles :

### 24.1 Backend sans connaissance du schéma

Le backend stocke l’état comme JSON opaque.

Avantage : simple et générique.  
Inconvénient : un client malveillant peut envoyer un état invalide.

### 24.2 Backend avec connaissance du schéma

Le backend enregistre le schéma ou connaît la structure attendue.

Avantage : sécurité et intégrité fortes.  
Inconvénient : plus complexe, surtout avec des schémas Zod côté serveur.

Pour une application sensible, choisir ce mode.

## 25. Stockage interne recommandé

### 25.1 PostgreSQL

Tables possibles :

```txt
object_vcs_repos
object_vcs_branches
object_vcs_heads
object_vcs_revisions
object_vcs_tags
object_vcs_blobs
object_vcs_idempotency_keys
```

Utiliser une transaction SQL pour :

- verrouiller le repository ou la branche ;
- vérifier `expectedHeadHash` ;
- allouer la révision ;
- insérer la révision ;
- mettre à jour le head.

### 25.2 MongoDB

Collections possibles :

```txt
repos
branches
heads
revisions
tags
blobs
```

Utiliser une transaction si plusieurs documents doivent être écrits atomiquement.

### 25.3 DynamoDB

Utiliser :

- clés composées ;
- conditional writes ;
- transactions ;
- item immutability pour révisions.

## 26. Exemple de cycle complet

### 26.1 Lire HEAD

```http
GET /v1/repos/goblin-tavern-demo/branches/main/head
```

### 26.2 Écrire un dirty

```http
PUT /v1/repos/goblin-tavern-demo/branches/main/head
```

```json
{
  "state": {
    "tavern": { "id": "tavern-1", "name": "La Marmite", "motto": "Miam", "reputation": 43 },
    "settings": { "theme": "dungeon", "chaosLevel": 7 },
    "goblins": {},
    "menuItems": {}
  },
  "stateHash": "sha256:abc",
  "expectedHeadHash": "sha256:previous",
  "concurrency": "strict"
}
```

### 26.3 Committer

```http
POST /v1/repos/goblin-tavern-demo/branches/main/commit
```

```json
{
  "message": "Chaos augmenté",
  "expectedHeadHash": "sha256:abc"
}
```

### 26.4 Tagger

```http
POST /v1/repos/goblin-tavern-demo/tags
```

```json
{
  "name": "chaos-stable",
  "revision": "HEAD",
  "branch": "main",
  "annotation": "Stable, malgré le chaos"
}
```

## 27. Compatibilité client

Le client `@bjalon/object-vcs-http` doit exposer la même interface de persistance que Firebase. Le code applicatif ne doit pas changer lorsqu’on remplace :

```ts
firebasePersistence(...)
```

par :

```ts
httpPersistence(...)
```


---

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


---

# Lots d’implémentation — Object VCS

Version : `0.1-draft`

## Vue d’ensemble

Le découpage ci-dessous vise à produire rapidement un socle utilisable, puis à enrichir progressivement le stockage, les UI et les adapters.

Ordre recommandé :

```txt
Lot 0  Cadrage repo et outillage
Lot 1  Core types, graph, validation
Lot 2  Moteur HEAD/révision en mémoire
Lot 3  API CRUD typée
Lot 4  Adapter Firebase snapshot
Lot 5  React hooks + timeline
Lot 6  Exemple Goblin Tavern sur GitHub Pages
Lot 7  Adapter HTTP client + contrat backend
Lot 8  Vue
Lot 9  Vanilla
Lot 10 Diff/hybride/migrations
Lot 11 Durcissement, docs, release
```

## Lot 0 — Cadrage monorepo et outillage

### Objectif

Créer le squelette du projet.

### Livrables

- `pnpm-workspace.yaml` ;
- `package.json` racine ;
- `tsconfig.base.json` ;
- configuration build ;
- configuration tests ;
- structure `packages/*` ;
- structure `examples/goblin-tavern` ;
- conventions de nommage ;
- CI minimale.

### Packages concernés

- tous.

### Critères d’acceptation

- `pnpm install` fonctionne ;
- `pnpm build` fonctionne même si les packages sont vides ;
- `pnpm test` fonctionne ;
- chaque package expose un point d’entrée TypeScript.

## Lot 1 — Core types, graph et validation

### Objectif

Implémenter la définition de graph et la validation d’état.

### Livrables

- `defineGraph` ;
- `singleton` ;
- `collection` ;
- `InferState` ;
- `SchemaAdapter` ;
- adapter Zod ;
- validation complète d’un état ;
- contraintes JSON-compatible ;
- erreurs de validation.

### Packages concernés

- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- un état valide passe ;
- un état invalide échoue ;
- les types TS sont correctement inférés ;
- les collections sont typées en `Record<string, Entity>` ;
- les singletons sont typés comme objets directs.

## Lot 2 — Moteur HEAD/révision en mémoire

### Objectif

Implémenter le moteur de versioning avec un adapter mémoire.

### Livrables

- `createRepository` ;
- `memoryPersistence` ;
- `init` ;
- `getHead` ;
- `update` ;
- `edit` ;
- `commit` ;
- `readRevision` ;
- `listRevisions` ;
- `tag` ;
- `listTags` ;
- `createBranch` ;
- `checkout` ;
- `restore` ;
- `resetBranch` ;
- hash canonique ;
- mode snapshot.

### Packages concernés

- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- HEAD clean après init commitée ;
- HEAD dirty après update non commitée ;
- le dirty précédent est remplacé ;
- commit crée une révision ;
- commit vide possible avec `allowEmpty` ;
- tag clean ne crée pas de révision ;
- tag dirty crée une révision si autorisé ;
- branche depuis ancienne révision fonctionnelle ;
- restore sans commit rend HEAD dirty ;
- restore avec commit crée une révision.

## Lot 3 — API CRUD typée

### Objectif

Ajouter les helpers CRUD générés depuis le graph.

### Livrables

- `repo.singletons.<name>.get()` ;
- `repo.singletons.<name>.set()` ;
- `repo.entities.<name>.list()` ;
- `repo.entities.<name>.get(id)` ;
- `repo.entities.<name>.create(id, value)` ;
- `repo.entities.<name>.update(id, updater)` ;
- `repo.entities.<name>.delete(id)` ;
- propagation des options `commit`, `message`, `author`, `expectedHeadHash`.

### Packages concernés

- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- CRUD singleton typé ;
- CRUD collection typé ;
- erreur si création d’un id existant ;
- erreur si update/delete d’un id absent, sauf option explicite ;
- validation Zod à chaque écriture ;
- les helpers utilisent le même moteur que `update`.

## Lot 4 — Adapter Firebase snapshot

### Objectif

Implémenter la persistance Firestore en mode snapshot.

### Livrables

- `firebasePersistence` ;
- structure collections/documents ;
- transactions commit/tag/branch/reset ;
- allocation atomique des révisions ;
- `subscribeHead` ;
- `subscribeRevisions` ;
- support blobs simple si document trop gros ;
- template de rules ;
- tests avec emulator.

### Packages concernés

- `@bjalon/object-vcs-firebase`.

### Critères d’acceptation

- init écrit dans Firestore ;
- update dirty écrit le HEAD ;
- commit crée une révision immuable ;
- conflit `expectedHeadHash` renvoie une erreur ;
- timeline temps réel mise à jour ;
- rules empêchent update/delete des révisions ;
- fonctionne avec l’émulateur Firebase.

## Lot 5 — React hooks et timeline

### Objectif

Fournir l’intégration React minimale.

### Livrables

- `ObjectVcsProvider` ;
- `useObjectVcs` ;
- `useHead` ;
- `useRevisions` ;
- `useTags` ;
- `useBranches` ;
- `RevisionTimeline` ;
- `BranchSelector` ;
- `TagList` ;
- états loading/error ;
- style minimal non intrusif.

### Packages concernés

- `@bjalon/object-vcs-react`.

### Critères d’acceptation

- un composant React peut afficher HEAD ;
- timeline affiche les révisions ;
- sélection d’une révision déclenche callback ;
- restore disponible via callback ;
- changement de branche possible ;
- pas de dépendance Firebase dans le package React.

## Lot 6 — Exemple Goblin Tavern

### Objectif

Créer une application de démonstration complète.

### Livrables

- projet Vite React ;
- graph Zod `Goblin Tavern` ;
- état initial ;
- CRUD gobelins ;
- CRUD menu ;
- panneau settings ;
- panneau HEAD ;
- timeline ;
- tags ;
- branches ;
- Firebase setup ;
- GitHub Action de déploiement Pages ;
- documentation de déploiement.

### Packages concernés

- `examples/goblin-tavern` ;
- `@bjalon/object-vcs-core` ;
- `@bjalon/object-vcs-firebase` ;
- `@bjalon/object-vcs-react`.

### Critères d’acceptation

- build Vite OK ;
- déploiement Pages OK ;
- Firestore reçoit les modifications ;
- scénarios de démonstration exécutables ;
- README spécifique à l’exemple.

## Lot 7 — Adapter HTTP client et contrat backend

### Objectif

Permettre de remplacer Firebase par un backend custom.

### Livrables

- package `@bjalon/object-vcs-http` ;
- `httpPersistence` ;
- mapping endpoints vers `PersistenceAdapter` ;
- gestion auth bearer ;
- gestion idempotency key ;
- gestion erreurs HTTP ;
- support optionnel SSE ;
- documentation `BACKEND_HTTP_CONTRACT.md` ;
- mock server de test.

### Packages concernés

- `@bjalon/object-vcs-http` ;
- `@bjalon/object-vcs-core`.

### Critères d’acceptation

- le même code applicatif fonctionne avec `httpPersistence` ;
- les conflits 409 deviennent `ConcurrencyConflictError` ;
- les erreurs 422 deviennent `ValidationError` ;
- les endpoints minimaux sont testés ;
- le mock backend passe les mêmes tests que Firebase pour les scénarios principaux.

## Lot 8 — Vue

### Objectif

Fournir l’intégration Vue.

### Livrables

- plugin Vue ;
- composables ;
- composants ;
- timeline ;
- docs ;
- exemple minimal.

### Packages concernés

- `@bjalon/object-vcs-vue`.

### Critères d’acceptation

- même comportement fonctionnel que React ;
- pas de dépendance Firebase ;
- composants typés ;
- supports loading/error.

## Lot 9 — Vanilla

### Objectif

Fournir une intégration sans framework.

### Livrables

- `createRevisionTimeline` ;
- `createBranchSelector` ;
- `createTagList` ;
- option Web Components ;
- CSS minimal ;
- docs.

### Packages concernés

- `@bjalon/object-vcs-vanilla`.

### Critères d’acceptation

- utilisable avec un simple élément DOM ;
- pas de dépendance React/Vue ;
- callback sélection révision ;
- callback restore ;
- rendu accessible et simple.

## Lot 10 — Diff, stockage hybride et migrations

### Objectif

Passer du snapshot simple à un stockage plus compact et évolutif.

### Livrables

- génération JSON Patch ;
- application JSON Patch ;
- mode `patch` ;
- mode `hybrid` ;
- checkpoints ;
- reconstruction depuis checkpoint ;
- moteur de migration ;
- `MigrationMode` ;
- diff viewer enrichi.

### Packages concernés

- `@bjalon/object-vcs-core` ;
- `@bjalon/object-vcs-firebase` ;
- `@bjalon/object-vcs-http` ;
- UI packages pour diff viewer.

### Critères d’acceptation

- reconstruction fiable ;
- tests patch/apply ;
- checkpoints respectés ;
- lecture ancienne révision possible ;
- migration `raw/latest/strict` testée ;
- compatibilité snapshot conservée.

## Lot 11 — Durcissement, documentation et release

### Objectif

Rendre la librairie publiable et maintenable.

### Livrables

- documentation complète ;
- API reference ;
- guides Firebase/HTTP/React/Vue/Vanilla ;
- tests de non-régression ;
- CI complète ;
- packaging ESM ;
- types `.d.ts` ;
- changelog ;
- versioning packages ;
- stratégie de release.

### Critères d’acceptation

- `pnpm test` vert ;
- `pnpm build` vert ;
- exemple déployé ;
- docs lisibles ;
- packages publiables ;
- API publique stabilisée.

## Risques principaux

### Concurrence sur HEAD partagé

Risque : deux utilisateurs modifient le même `HEAD` en même temps.

Mitigation :

- `expectedHeadHash` ;
- mode `strict` par défaut pour commit ;
- UI indiquant les conflits ;
- option `last-write-wins` seulement pour usages simples.

### Taille des états

Risque : les états dépassent les limites du backend.

Mitigation :

- blobs ;
- mode hybride ;
- documentation des limites ;
- cible claire : petite grappe d’objets.

### Sécurité Firebase

Risque : croire que la config Firebase suffit à sécuriser.

Mitigation :

- règles Firestore fournies ;
- docs explicites ;
- recommandation backend pour usages sensibles.

### Scope creep vers Git complet

Risque : ajouter merge/rebase/cherry-pick trop tôt.

Mitigation :

- v1 limitée ;
- branches sans merge automatique ;
- restore et reset clairs.

## Décision recommandée pour démarrer

Démarrer par :

1. `@bjalon/object-vcs-core` avec `memoryPersistence` ;
2. mode snapshot only ;
3. React timeline minimale ;
4. Firebase adapter ;
5. Goblin Tavern.

Le stockage par diff doit venir après validation de la sémantique HEAD/commit/branch, car il complexifie la persistance sans changer l’API utilisateur.
