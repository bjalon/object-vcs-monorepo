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
- supprimer un tag ne supprime jamais la révision cible ;
- supprimer un tag absent lève `TagNotFoundError` par défaut, ou retourne `deleted: false` avec `missing: "ignore"` ;
- `expectedRevision` protège la suppression et lève `TagRevisionMismatchError` si le tag pointe ailleurs.

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

  deleteTag(
    name: string,
    options?: DeleteTagOptions
  ): Promise<DeleteTagResult>;

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
export interface DeleteTagOptions {
  missing?: "throw" | "ignore";
  expectedRevision?: RevisionNumber;
  author?: string;
}

export interface DeleteTagResult {
  deleted: boolean;
  name: string;
  previousRevision: RevisionNumber | null;
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

  deleteTag(input: DeleteTagInput): Promise<DeleteTagResult>;

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
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
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
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
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
- `graphVersion` ;
- `schemaFingerprint` ;
- `schemaFingerprintAlgorithm`.

Le `schemaFingerprint` est calculé automatiquement depuis les schémas Zod quand
c'est représentable. Sinon, l'application doit fournir un fingerprint manuel
dans `createRepository({ schemaFingerprint: "manual:..." })`. Le fingerprint ne
fait pas partie de la clé principale de stockage : le repository reste indexé par
`repoId`, branche et numéro de révision.

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
type MigrationMode = "raw" | "current" | "strict";
```

- `raw` : retourne l’état stocké ;
- `current` : applique les migrations vers le graph courant ;
- `strict` : refuse une révision dont le fingerprint diffère.

Le repository expose aussi `getGraphIdentity()` et `assertCompatibleGraph()` pour
inspecter la compatibilité d'une branche ou d'une révision avant lecture.

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
class TagNotFoundError extends ObjectVcsError {}
class TagRevisionMismatchError extends ObjectVcsError {}
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
