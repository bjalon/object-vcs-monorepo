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
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
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
  headBlobRef?: string;
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
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
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
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
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
  graphIdentity?: {
    graphVersion: string;
    schemaFingerprint: string;
    schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
  };
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

## 22. Endpoint : supprimer un tag

```http
DELETE /v1/repos/{repoId}/tags/{tagName}
```

### Query params

| Paramètre | Type | Description |
|---|---|---|
| `missing` | `throw` ou `ignore` | Défaut : `throw`. |
| `expectedRevision` | number | Supprime seulement si le tag pointe vers cette révision. |

### Response

```ts
export interface DeleteTagResponse {
  deleted: boolean;
  name: string;
  previousRevision: number | null;
}
```

### Sémantique

- Si le tag existe, il est supprimé et `previousRevision` contient sa révision cible.
- Si le tag est absent et `missing=throw`, retourner `404 TAG_NOT_FOUND`.
- Si le tag est absent et `missing=ignore`, retourner `deleted: false`.
- Si `expectedRevision` ne correspond pas, retourner `409 TAG_REVISION_MISMATCH`.
- Supprimer un tag ne supprime jamais la révision cible.

## 23. Endpoint optionnel : flux temps réel SSE

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

## 24. Sécurité

Le backend doit décider du modèle de sécurité. Recommandation minimale :

- authentification bearer token ;
- rôle `reader`, `writer`, `admin` par repository ;
- lecture autorisée aux `reader` ;
- écriture autorisée aux `writer` ;
- opérations dangereuses comme `reset` réservées aux `admin` ou explicitement activées.

## 25. Validation de schéma côté backend

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

## 26. Stockage interne recommandé

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

## 27. Exemple de cycle complet

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

## 28. Compatibilité client

Le client `@bjalon/object-vcs-http` doit exposer la même interface de persistance que Firebase. Le code applicatif ne doit pas changer lorsqu’on remplace :

```ts
firebasePersistence(...)
```

par :

```ts
httpPersistence(...)
```
