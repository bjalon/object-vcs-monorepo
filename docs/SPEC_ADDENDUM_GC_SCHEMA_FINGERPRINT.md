
# Object VCS — Spec Addendum: Tags, Garbage Collection, Storage Estimate and Schema Fingerprint

Status: Draft for implementation  
Scope: core, in-memory persistence, Firebase adapter, HTTP adapter, React package, Goblin Tavern example  
Storage mode covered: snapshot-only  
Out of scope for this addendum: merge, rebase, patch/hybrid storage, full history compaction, automatic conflict resolution

---

## 1. Summary

This addendum extends Object VCS with:

1. tag deletion;
2. safe revision garbage collection;
3. orphan blob garbage collection;
4. more explicit storage estimation;
5. schema fingerprinting based on the model graph;
6. HTTP backend contract extensions for non-Firebase persistence.

The current versioning model remains unchanged:

- a revision is immutable while it exists;
- HEAD is mutable;
- HEAD belongs to a branch;
- dirty HEAD intermediate states are not recoverable unless committed;
- tags point to revision numbers;
- branches can be created from old revisions;
- no automatic merge is required.

Garbage collection is the only feature allowed to delete revision records. Garbage collection must be conservative by default.

---

## 2. Schema Fingerprint

### 2.1 Problem

Object VCS already uses `graphVersion` and migrations.

However, a semantic `graphVersion` alone does not guarantee that the runtime model used by the application is compatible with the state stored in a revision.

The library should therefore introduce a computed `schemaFingerprint`.

### 2.2 Recommendation

Use both:

```ts
interface GraphIdentity {
  graphVersion: string;
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: SchemaFingerprintAlgorithm;
}
````

```ts
type SchemaFingerprintAlgorithm =
  | "manual"
  | "zod-json-schema-sha256-v1";
```

The `graphVersion` is semantic and developer-controlled.

The `schemaFingerprint` is structural and machine-computed when possible.

### 2.3 Important Rule

The schema fingerprint must not be used as the main repository storage key.

Correct:

```txt
/repos/{repoId}
/repos/{repoId}/revisions/{revisionNumber}
/repos/{repoId}/branches/{branchName}
/repos/{repoId}/tags/{tagName}
/repos/{repoId}/schemas/{schemaFingerprint}
```

Incorrect:

```txt
/repos/{repoId}/schemas/{schemaFingerprint}/revisions/{revisionNumber}
```

Reason: if the schema hash is used as a main storage namespace, each schema evolution fragments the repository and makes migrations harder.

### 2.4 Storage

The repository metadata should contain:

```ts
interface RepoRecord {
  id: string;
  defaultBranch: string;
  currentGraphVersion: string;
  currentSchemaFingerprint: string;
  schemaFingerprintAlgorithm: SchemaFingerprintAlgorithm;
  createdAt: DateLike;
  updatedAt: DateLike;
}
```

Each revision should contain:

```ts
interface RevisionRecord<TState> {
  revision: RevisionNumber;
  parentRevision: RevisionNumber | null;
  branchName: BranchName;
  graphVersion: string;
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: SchemaFingerprintAlgorithm;
  stateHash: string;
  snapshotBlobRef?: string;
  patchBlobRef?: string;
  createdAt: DateLike;
  createdBy?: string;
  message?: string;
  isEmptyRevision: boolean;
}
```

A schema registry document may be stored:

```ts
interface StoredSchemaDocument {
  graphVersion: string;
  schemaFingerprint: string;
  schemaFingerprintAlgorithm: SchemaFingerprintAlgorithm;
  canonicalSchema: JsonValue;
  createdAt: DateLike;
}
```

### 2.5 Fingerprint Computation

For Zod-backed graphs, the default automatic algorithm is:

```txt
zod-json-schema-sha256-v1
```

Algorithm:

1. Convert every graph node schema to JSON Schema.
2. Build a normalized canonical graph document.
3. Sort all object keys recursively.
4. Remove `undefined` values.
5. Serialize with a stable JSON serializer.
6. Compute SHA-256.
7. Prefix with `sha256:`.

Example canonical payload:

```ts
interface CanonicalGraphSchemaV1 {
  objectVcsSchemaFingerprintVersion: 1;
  nodes: Array<{
    key: string;
    kind: "singleton" | "collection";
    jsonSchema: JsonValue;
  }>;
}
```

Example fingerprint:

```txt
sha256:4abf8c8e0b4c3f...
```

### 2.6 Manual Fingerprint

Some Zod schemas may contain transforms, refinements, custom validators or runtime-only logic that cannot be faithfully represented as JSON Schema.

In that case, the developer must be able to provide an explicit fingerprint:

```ts
const repo = createRepository({
  repoId: "goblin-tavern",
  graph,
  graphVersion: "goblin-tavern@2",
  schemaFingerprint: "manual:goblin-tavern@2",
  persistence,
});
```

### 2.7 Migrations

Migrations should remain keyed primarily by `graphVersion`.

Recommended:

```ts
type MigrationMap<TState> = Record<string, MigrationStep<TState>>;
```

Example key:

```txt
goblin-tavern@1->goblin-tavern@2
```

The fingerprint is used to detect unexpected structural drift.

The graph version is used to express intentional model evolution.

### 2.8 Compatibility Rules

When reading a revision:

1. If `revision.schemaFingerprint === current.schemaFingerprint`, parse normally.
2. If fingerprints differ but a migration path exists, migrate when requested.
3. If fingerprints differ and no migration path exists, throw `SchemaCompatibilityError`.
4. If `migrateTo: "raw"` is requested, return the raw stored state after minimal JSON validation only.
5. If `migrateTo: "current"` is requested, apply migrations and validate against the current graph.
6. If `migrateTo: "strict"` is requested, reject if the revision does not exactly match the current fingerprint.

### 2.9 New Public API

```ts
interface ObjectVcsRepository<TState> {
  getGraphIdentity(): GraphIdentity;

  assertCompatibleGraph(options?: {
    revision?: RevisionNumber;
    branch?: BranchName;
  }): Promise<GraphCompatibilityResult>;
}
```

```ts
type GraphCompatibilityResult =
  | {
      status: "compatible";
      graphVersion: string;
      schemaFingerprint: string;
    }
  | {
      status: "migration-required";
      fromGraphVersion: string;
      toGraphVersion: string;
      fromSchemaFingerprint: string;
      toSchemaFingerprint: string;
    }
  | {
      status: "incompatible";
      reason: string;
      fromGraphVersion: string;
      toGraphVersion: string;
      fromSchemaFingerprint: string;
      toSchemaFingerprint: string;
    };
```

### 2.10 New Error

```ts
class SchemaCompatibilityError extends ObjectVcsError {}
```

---

## 3. Tag Deletion

### 3.1 Goal

The library already supports tag creation.

It must now support tag deletion.

### 3.2 Public API

```ts
interface ObjectVcsRepository<TState> {
  deleteTag(
    name: string,
    options?: DeleteTagOptions
  ): Promise<DeleteTagResult>;
}
```

```ts
interface DeleteTagOptions {
  missing?: "throw" | "ignore";
  expectedRevision?: RevisionNumber;
  author?: string;
}
```

```ts
interface DeleteTagResult {
  deleted: boolean;
  name: string;
  previousRevision: RevisionNumber | null;
}
```

Default behavior:

```ts
const defaultDeleteTagOptions = {
  missing: "throw",
} satisfies DeleteTagOptions;
```

### 3.3 Semantics

If the tag exists:

* delete it;
* return `{ deleted: true, name, previousRevision }`.

If the tag does not exist and `missing === "throw"`:

* throw `TagNotFoundError`.

If the tag does not exist and `missing === "ignore"`:

* return `{ deleted: false, name, previousRevision: null }`.

If `expectedRevision` is provided and the tag exists but points to another revision:

* throw `TagRevisionMismatchError`.

### 3.4 Invariants

Deleting a tag does not delete the target revision.

Deleting a tag may make the target revision eligible for garbage collection if it is not otherwise protected.

### 3.5 New Errors

```ts
class TagNotFoundError extends ObjectVcsError {}
class TagRevisionMismatchError extends ObjectVcsError {}
```

---

## 4. Branch Listing

### 4.1 Goal

Garbage collection needs to know all branch heads.

The repository should expose branch listing if it does not already.

### 4.2 Public API

```ts
interface ObjectVcsRepository<TState> {
  listBranches(): Promise<BranchRecord[]>;
}
```

### 4.3 Optional Future API

Branch deletion is not required for this addendum, but it will make garbage collection more useful.

Future API:

```ts
interface ObjectVcsRepository<TState> {
  deleteBranch(
    name: BranchName,
    options?: DeleteBranchOptions
  ): Promise<DeleteBranchResult>;
}
```

```ts
interface DeleteBranchOptions {
  force?: boolean;
  missing?: "throw" | "ignore";
}
```

Rules:

* the default branch cannot be deleted unless explicitly supported later;
* a dirty branch cannot be deleted unless `force: true`;
* deleting a branch does not delete revisions directly;
* deleted branch history may become garbage-collectable.

This future API is not part of the mandatory implementation batch.

---

## 5. Garbage Collection

### 5.1 Goal

The library must support safe deletion of obsolete revisions and orphan blobs.

The first version must be conservative.

The initial strategy is:

```txt
unreachable-snapshots-v1
```

It applies to snapshot-only storage.

### 5.2 Core Principle

A revision can be deleted only if it is not reachable from any protected reference.

Protected references are:

1. tag revisions;
2. branch head revisions;
3. dirty HEAD base revisions;
4. branch base revisions when needed to preserve branch semantics;
5. any revision explicitly protected by options;
6. all ancestors of the above revisions.

Therefore, a parent revision of a kept revision must not be deleted.

### 5.3 Consequence

On a normal main branch, old ancestors of the current main HEAD will usually not be deleted, because they are reachable from the current branch head.

This is intentional.

Deleting old ancestors of an active branch would require a separate history compaction operation, such as creating a new checkpoint root and severing parent links. That is out of scope for this addendum.

### 5.4 Public API

```ts
interface ObjectVcsRepository<TState> {
  planGarbageCollection(
    options?: PlanGarbageCollectionOptions
  ): Promise<GarbageCollectionPlan>;

  runGarbageCollection(
    plan: GarbageCollectionPlan,
    options?: RunGarbageCollectionOptions
  ): Promise<GarbageCollectionRunResult>;
}
```

### 5.5 Plan Options

```ts
interface PlanGarbageCollectionOptions {
  beforeRevision?: RevisionNumber;

  keepTagged?: true;
  keepBranchHeads?: true;
  keepDirtyBaseRevisions?: true;

  includeOrphanBlobs?: boolean;

  protectRevisions?: RevisionNumber[];

  maxRevisionsToDelete?: number;

  estimateStorage?: boolean;
}
```

Defaults:

```ts
const defaultPlanGarbageCollectionOptions = {
  keepTagged: true,
  keepBranchHeads: true,
  keepDirtyBaseRevisions: true,
  includeOrphanBlobs: true,
  estimateStorage: true,
} satisfies PlanGarbageCollectionOptions;
```

`keepTagged`, `keepBranchHeads`, and `keepDirtyBaseRevisions` are typed as `true` intentionally for the first implementation. Unsafe overrides are not supported in this addendum.

### 5.6 Plan Result

```ts
interface GarbageCollectionPlan {
  planId: string;
  repoId: RepositoryId;
  strategy: "unreachable-snapshots-v1";

  createdAt: DateLike;

  options: RequiredGarbageCollectionPlanOptions;

  protectedRevisions: ProtectedRevision[];
  deletableRevisions: DeletableRevision[];
  blockedRevisions: BlockedRevision[];

  orphanBlobs: GarbageCollectableBlob[];

  estimatedFreedStorage: StorageEstimate;

  refsSnapshot: GarbageCollectionRefsSnapshot;
  refsSnapshotHash: string;
}
```

```ts
interface ProtectedRevision {
  revision: RevisionNumber;
  reasons: ProtectedRevisionReason[];
}
```

```ts
type ProtectedRevisionReason =
  | "tagged"
  | "branch-head"
  | "dirty-base-revision"
  | "branch-base-revision"
  | "explicitly-protected"
  | "ancestor-of-protected-revision";
```

```ts
interface DeletableRevision {
  revision: RevisionNumber;
  parentRevision: RevisionNumber | null;
  branchName: BranchName;
  stateHash: string;
  snapshotBlobRef?: string;
  estimatedStorage: StorageEstimate;
}
```

```ts
interface BlockedRevision {
  revision: RevisionNumber;
  reasons: BlockedRevisionReason[];
}
```

```ts
type BlockedRevisionReason =
  | "tagged"
  | "branch-head"
  | "dirty-base-revision"
  | "branch-base-revision"
  | "explicitly-protected"
  | "ancestor-of-protected-revision"
  | "after-before-revision-threshold"
  | "unknown-parent"
  | "missing-metadata";
```

```ts
interface GarbageCollectableBlob {
  blobRef: string;
  reason: "orphan";
  estimatedStorage: StorageEstimate;
}
```

```ts
interface GarbageCollectionRefsSnapshot {
  tags: Array<{
    name: string;
    revision: RevisionNumber;
  }>;

  branches: Array<{
    name: BranchName;
    headRevision: RevisionNumber | null;
    baseRevision: RevisionNumber | null;
    status: HeadStatus;
    headBlobRef?: string;
  }>;

  latestRevision: RevisionNumber | null;
}
```

### 5.7 Run Options

```ts
interface RunGarbageCollectionOptions {
  dryRun?: boolean;
  recomputeBeforeRun?: true;
  allowStalePlan?: false;
  author?: string;
}
```

Defaults:

```ts
const defaultRunGarbageCollectionOptions = {
  dryRun: false,
  recomputeBeforeRun: true,
  allowStalePlan: false,
} satisfies RunGarbageCollectionOptions;
```

`recomputeBeforeRun` is intentionally forced to `true` for the first implementation.

`allowStalePlan` is intentionally forced to `false` for the first implementation.

### 5.8 Run Result

```ts
interface GarbageCollectionRunResult {
  planId: string;
  repoId: RepositoryId;

  dryRun: boolean;

  deletedRevisions: RevisionNumber[];
  deletedBlobs: string[];

  skippedRevisions: BlockedRevision[];
  skippedBlobs: Array<{
    blobRef: string;
    reason: "still-referenced" | "missing" | "adapter-error";
  }>;

  freedStorageEstimate: StorageEstimate;

  startedAt: DateLike;
  completedAt: DateLike;
}
```

### 5.9 Stale Plan Protection

Between planning and running GC, a new tag, branch or commit may appear.

Therefore, `runGarbageCollection` must recompute the protected set before deleting anything.

If the recomputed `refsSnapshotHash` differs from the plan hash, the run must reject with:

```ts
class GarbageCollectionPlanStaleError extends ObjectVcsError {}
```

The caller can then call `planGarbageCollection` again.

### 5.10 Blob Deletion Rules

A blob is live if it is referenced by:

1. any remaining revision;
2. any branch HEAD;
3. any dirty branch HEAD;
4. any adapter-specific protected object.

A blob may be deleted only if it is not referenced by any live object.

If a GC operation fails halfway, it is acceptable to leave orphan blobs behind.

It is not acceptable to delete a blob that is still referenced by a live revision or HEAD.

Therefore, adapters should delete revisions first and blobs second.

### 5.11 Revision Deletion Rules

For this addendum, there is no public `deleteRevision(revision)` API.

Revision deletion is allowed only through `runGarbageCollection`.

A tagged revision must not be deleted.

A branch head revision must not be deleted.

A dirty base revision must not be deleted.

A parent of a protected revision must not be deleted.

A revision with missing or inconsistent metadata must be blocked, not deleted.

---

## 6. Storage Estimate

### 6.1 Goal

The example app currently shows rough JSON sizes.

The library should expose a more structured estimate.

The estimate is not billing-grade.

It is a debugging and product feedback tool.

### 6.2 Public API

```ts
interface ObjectVcsRepository<TState> {
  estimateStorage(
    options?: EstimateStorageOptions
  ): Promise<RepositoryStorageEstimate>;
}
```

```ts
interface EstimateStorageOptions {
  includeRevisions?: boolean;
  includeBlobs?: boolean;
  includeHeads?: boolean;
  includeBranches?: boolean;
  includeTags?: boolean;
  adapterSpecific?: boolean;
}
```

```ts
interface RepositoryStorageEstimate {
  repoId: RepositoryId;

  rawStateBytes: number;
  objectVcsMetadataBytes: number;
  blobBytes: number;

  estimatedBackendBytes: number | null;

  documentCount: number;
  revisionCount: number;
  blobCount: number;
  branchCount: number;
  tagCount: number;

  perRevision?: RevisionStorageEstimate[];

  notes: string[];
}
```

```ts
interface RevisionStorageEstimate {
  revision: RevisionNumber;
  rawStateBytes: number;
  revisionMetadataBytes: number;
  blobBytes: number;
  estimatedBackendBytes: number | null;
  documentCount: number;
}
```

### 6.3 Firebase Estimate

The Firebase adapter may expose an approximate estimate.

It should separate:

1. raw JSON state size;
2. Object VCS metadata size;
3. blob payload size;
4. estimated backend overhead;
5. document count;
6. index overhead note.

The Firebase estimate must not claim to be exact.

Recommended note:

```txt
Firestore storage estimate is approximate. It includes Object VCS JSON payloads and a configurable per-document overhead, but it does not guarantee exact billed storage.
```

### 6.4 Configurable Estimate

The Firebase adapter should accept:

```ts
interface FirebaseStorageEstimateOptions {
  fixedBytesPerDocument?: number;
  fixedBytesPerRevision?: number;
  fixedBytesPerBlob?: number;
}
```

Default values may be conservative and documented.

---

## 7. Persistence Adapter Extensions

### 7.1 Required New Methods

```ts
interface PersistenceAdapter<TState> {
  deleteTag(input: DeleteTagInput): Promise<DeleteTagResult>;

  listBranches(input: ListBranchesInput): Promise<BranchRecord[]>;

  planGarbageCollection?(
    input: PersistencePlanGarbageCollectionInput
  ): Promise<GarbageCollectionPlan>;

  runGarbageCollection?(
    input: PersistenceRunGarbageCollectionInput
  ): Promise<GarbageCollectionRunResult>;

  estimateStorage?(
    input: PersistenceEstimateStorageInput
  ): Promise<RepositoryStorageEstimate>;
}
```

### 7.2 Core Fallback

If the adapter does not implement `planGarbageCollection`, the core may compute the plan using:

* `listRevisions`;
* `listTags`;
* `listBranches`;
* available HEAD metadata;
* available blob metadata.

If required metadata is missing, the plan must mark affected revisions as blocked.

### 7.3 Adapter Execution

`runGarbageCollection` should be adapter-owned when possible, because deletion semantics are storage-specific.

The core repository method delegates to the adapter.

---

## 8. HTTP Backend Contract Extension

### 8.1 Delete Tag

```http
DELETE /v1/repos/{repoId}/tags/{tagName}
```

Query parameters:

```txt
missing=throw|ignore
expectedRevision=number
```

Response:

```json
{
  "deleted": true,
  "name": "v1",
  "previousRevision": 12
}
```

Errors:

```txt
404 TAG_NOT_FOUND
409 TAG_REVISION_MISMATCH
```

### 8.2 List Branches

```http
GET /v1/repos/{repoId}/branches
```

Response:

```json
{
  "branches": [
    {
      "name": "main",
      "baseRevision": null,
      "headRevision": 42,
      "headStateHash": "sha256:...",
      "status": "clean",
      "createdFromRevision": null,
      "createdAt": "2026-05-10T10:00:00.000Z",
      "updatedAt": "2026-05-10T10:00:00.000Z"
    }
  ]
}
```

### 8.3 Plan Garbage Collection

```http
POST /v1/repos/{repoId}/garbage-collection/plan
```

Request:

```json
{
  "beforeRevision": 30,
  "includeOrphanBlobs": true,
  "protectRevisions": [],
  "maxRevisionsToDelete": 100,
  "estimateStorage": true
}
```

Response:

```json
{
  "planId": "gc_01HZ...",
  "repoId": "goblin-tavern",
  "strategy": "unreachable-snapshots-v1",
  "createdAt": "2026-05-10T10:00:00.000Z",
  "protectedRevisions": [],
  "deletableRevisions": [],
  "blockedRevisions": [],
  "orphanBlobs": [],
  "estimatedFreedStorage": {
    "rawStateBytes": 0,
    "objectVcsMetadataBytes": 0,
    "blobBytes": 0,
    "estimatedBackendBytes": null,
    "documentCount": 0,
    "revisionCount": 0,
    "blobCount": 0,
    "branchCount": 0,
    "tagCount": 0,
    "notes": []
  },
  "refsSnapshot": {
    "tags": [],
    "branches": [],
    "latestRevision": 42
  },
  "refsSnapshotHash": "sha256:..."
}
```

### 8.4 Run Garbage Collection

```http
POST /v1/repos/{repoId}/garbage-collection/run
```

Request:

```json
{
  "plan": {
    "planId": "gc_01HZ..."
  },
  "dryRun": false,
  "recomputeBeforeRun": true,
  "allowStalePlan": false
}
```

Alternative request when the client sends the full plan:

```json
{
  "plan": {
    "planId": "gc_01HZ...",
    "strategy": "unreachable-snapshots-v1",
    "refsSnapshotHash": "sha256:...",
    "deletableRevisions": []
  },
  "dryRun": false,
  "recomputeBeforeRun": true,
  "allowStalePlan": false
}
```

Response:

```json
{
  "planId": "gc_01HZ...",
  "repoId": "goblin-tavern",
  "dryRun": false,
  "deletedRevisions": [],
  "deletedBlobs": [],
  "skippedRevisions": [],
  "skippedBlobs": [],
  "freedStorageEstimate": {
    "rawStateBytes": 0,
    "objectVcsMetadataBytes": 0,
    "blobBytes": 0,
    "estimatedBackendBytes": null,
    "documentCount": 0,
    "revisionCount": 0,
    "blobCount": 0,
    "branchCount": 0,
    "tagCount": 0,
    "notes": []
  },
  "startedAt": "2026-05-10T10:00:00.000Z",
  "completedAt": "2026-05-10T10:00:01.000Z"
}
```

Errors:

```txt
409 GARBAGE_COLLECTION_PLAN_STALE
409 GARBAGE_COLLECTION_UNSAFE
404 GARBAGE_COLLECTION_PLAN_NOT_FOUND
```

### 8.5 Storage Estimate

```http
GET /v1/repos/{repoId}/storage-estimate
```

Response:

```json
{
  "repoId": "goblin-tavern",
  "rawStateBytes": 12000,
  "objectVcsMetadataBytes": 8000,
  "blobBytes": 12000,
  "estimatedBackendBytes": 22000,
  "documentCount": 12,
  "revisionCount": 4,
  "blobCount": 4,
  "branchCount": 1,
  "tagCount": 2,
  "notes": [
    "Backend estimate is approximate."
  ]
}
```

### 8.6 Schema Identity

```http
GET /v1/repos/{repoId}/schema
```

Response:

```json
{
  "graphVersion": "goblin-tavern@2",
  "schemaFingerprint": "sha256:...",
  "schemaFingerprintAlgorithm": "zod-json-schema-sha256-v1"
}
```

---

## 9. Firebase Adapter Requirements

### 9.1 Delete Tag

Firebase tag deletion should use a transaction when `expectedRevision` is provided.

If no `expectedRevision` is provided, a normal delete is acceptable.

### 9.2 Garbage Collection Plan

The Firebase adapter must read:

* revisions;
* tags;
* branches;
* branch heads;
* blobs when available.

It must compute protected revisions using the reachability algorithm.

### 9.3 Garbage Collection Run

Before deletion, the Firebase adapter must recompute the protected set.

If the refs snapshot differs from the plan, reject the run.

Deletion should be safe and idempotent.

Recommended deletion order:

1. delete revision documents;
2. then delete orphan blob documents.

If the process fails after deleting revision documents but before deleting blobs, the remaining blobs are safe orphans and may be deleted by a later GC run.

The adapter must never delete a blob before ensuring it is no longer referenced.

### 9.4 Chunking

The Firebase adapter may need to split deletion work into chunks according to backend limits.

Chunking must not weaken safety rules.

### 9.5 Estimate

The Firebase adapter should add adapter-specific estimate notes.

It must not claim exact billed storage.

---

## 10. React and Goblin Tavern UI

### 10.1 Tag Deletion UI

The example app should support:

* listing tags;
* deleting a tag;
* showing the revision previously associated with the deleted tag;
* refreshing the timeline after deletion.

### 10.2 GC Panel

Add a panel named:

```txt
Storage cleanup
```

Actions:

1. Analyze cleanup;
2. Show deletable revisions;
3. Show blocked revisions with reasons;
4. Show orphan blobs;
5. Show estimated freed storage;
6. Run cleanup;
7. Refresh timeline and storage estimate.

### 10.3 UX Rules

The UI must make it clear that:

* deleting a tag does not delete a revision;
* GC may delete revisions permanently;
* GC is conservative and may report no deletable revision;
* old main branch ancestors usually remain protected;
* storage estimates are approximate.

### 10.4 Revision Timeline

The timeline should visually identify:

* tagged revisions;
* branch heads;
* selected revision;
* current HEAD;
* revisions blocked from GC;
* revisions planned for deletion.

---

## 11. Tests

### 11.1 Core Tests

Add tests for:

* schema fingerprint stable for same graph;
* schema fingerprint changes when graph structure changes;
* manual schema fingerprint;
* incompatible schema detection;
* deleteTag existing tag;
* deleteTag missing tag with `missing: "throw"`;
* deleteTag missing tag with `missing: "ignore"`;
* deleteTag with `expectedRevision` success;
* deleteTag with `expectedRevision` mismatch;
* listBranches;
* GC plan with tagged revision;
* GC plan with branch head;
* GC plan with dirty base revision;
* GC plan with ancestor of protected revision;
* GC plan with orphan blob;
* GC run deletes only deletable revisions;
* GC run refuses stale plan;
* storage estimate returns non-negative values.

### 11.2 Firebase Tests

Add tests for:

* tag deletion;
* tag deletion with expected revision;
* GC plan;
* GC run;
* stale GC plan rejection;
* orphan blob deletion;
* storage estimate shape.

Use emulator-based tests when available.

### 11.3 HTTP Adapter Tests

Add tests with mocked fetch for:

* DELETE tag;
* list branches;
* GC plan;
* GC run;
* storage estimate;
* error mapping.

### 11.4 UI Tests

Add tests where feasible for:

* deleting a tag;
* opening GC panel;
* running analysis;
* displaying blocked/deletable revisions;
* running cleanup.

---

## 12. Implementation Order

Recommended order:

1. schema fingerprint core;
2. deleteTag core and adapters;
3. listBranches if missing;
4. core GC plan with in-memory persistence;
5. core GC run with in-memory persistence;
6. HTTP adapter contract extension;
7. Firebase adapter implementation;
8. storage estimate;
9. React package and Goblin Tavern UI;
10. documentation update;
11. review and hardening.

---

## 13. Explicit Non-Goals

Do not implement yet:

* automatic merge;
* rebase;
* drop/rewrite interactive history;
* patch/hybrid storage;
* history compaction of active branches;
* server-side authentication model;
* production-grade billing estimate;
* deleting protected revisions with force.

