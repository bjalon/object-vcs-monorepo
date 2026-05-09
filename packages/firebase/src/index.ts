import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  type DocumentReference,
  type Firestore,
  type Transaction
} from "firebase/firestore";

import {
  BranchAlreadyExistsError,
  BranchNotFoundError,
  ConcurrencyConflictError,
  PersistenceError,
  RepositoryAlreadyExistsError,
  RepositoryNotFoundError,
  RevisionNotFoundError,
  TagAlreadyExistsError,
  type BranchName,
  type BranchRecord,
  type CreateBranchInput,
  type CreateRepoInput,
  type CreateRepoResult,
  type CreateRevisionInput,
  type CreateRevisionResult,
  type CreateTagInput,
  type GetBranchInput,
  type GetHeadInput,
  type GetRepoInput,
  type Head,
  type ListBranchesInput,
  type ListRevisionsInput,
  type ListTagsInput,
  type PersistenceAdapter,
  type ReadRevisionInput,
  type ReadRevisionStateInput,
  type RepoRecord,
  type ResetBranchInput,
  type RestoreRevisionInput,
  type RevisionNumber,
  type RevisionRecord,
  type RevisionSummary,
  type StateHash,
  type StoredRevision,
  type TagRecord,
  type Unsubscribe,
  type UpdateBranchInput,
  type WriteHeadInput,
  type WriteHeadResult
} from "@bjalon/object-vcs-core";

export interface FirebasePersistenceCollectionNames {
  readonly branches?: string;
  readonly heads?: string;
  readonly revisions?: string;
  readonly tags?: string;
  readonly blobs?: string;
}

export interface FirebasePersistenceOptions {
  readonly db: Firestore;
  readonly rootCollection?: string;
  readonly collections?: FirebasePersistenceCollectionNames;
  readonly checkpointEvery?: number;
  readonly maxInlineHeadStateBytes?: number;
  readonly now?: () => string;
}

interface ResolvedCollectionNames {
  readonly branches: string;
  readonly heads: string;
  readonly revisions: string;
  readonly tags: string;
  readonly blobs: string;
}

interface ResolvedFirebasePersistenceOptions {
  readonly db: Firestore;
  readonly rootCollection: string;
  readonly collections: ResolvedCollectionNames;
  readonly checkpointEvery: number;
  readonly maxInlineHeadStateBytes: number;
  readonly now: () => string;
}

export interface FirebaseRepoDocument {
  readonly id: string;
  readonly schemaVersion: number;
  readonly graphVersion: string;
  readonly defaultBranch: string;
  readonly nextRevision: number;
  readonly storageMode: "snapshot" | "patch" | "hybrid";
  readonly checkpointEvery: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FirebaseHeadDocument<TState = unknown> {
  readonly branchName: string;
  readonly status: "clean" | "dirty";
  readonly headRevision: number | null;
  readonly baseRevision: number | null;
  readonly stateHash: string;
  readonly state?: TState;
  readonly stateBlobRef?: string;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

export interface FirebaseRevisionDocument {
  readonly revision: number;
  readonly parentRevision: number | null;
  readonly branchName: string;
  readonly stateHash: string;
  readonly schemaVersion: number;
  readonly graphVersion: string;
  readonly patchBlobRef?: string;
  readonly snapshotBlobRef?: string;
  readonly isCheckpoint: boolean;
  readonly isEmptyRevision: boolean;
  readonly message?: string;
  readonly createdAt: string;
  readonly createdBy?: string;
}

interface FirebaseBlobDocument<TState = unknown> {
  readonly kind: "snapshot";
  readonly stateHash: string;
  readonly state: TState;
  readonly createdAt: string;
}

type FirestoreData = Readonly<Record<string, unknown>>;

export function firebasePersistence<TState>(
  options: FirebasePersistenceOptions
): PersistenceAdapter<TState> {
  const resolvedOptions = resolveOptions(options);
  const refs = createReferenceFactory(resolvedOptions);

  return {
    async getRepo(input: GetRepoInput): Promise<RepoRecord | null> {
      const repoSnapshot = await getDoc(refs.repo(input.repoId));
      if (!repoSnapshot.exists()) {
        return null;
      }

      return repoRecordFromDocument(input.repoId, readDocumentData(repoSnapshot));
    },

    async createRepo(
      input: CreateRepoInput<TState>
    ): Promise<CreateRepoResult<TState>> {
      return runTransaction(resolvedOptions.db, async transaction => {
        const repoReference = refs.repo(input.repoId);
        const repoSnapshot = await transaction.get(repoReference);
        if (repoSnapshot.exists()) {
          throw new RepositoryAlreadyExistsError(
            `Repository "${input.repoId}" already exists.`
          );
        }

        const timestamp = resolvedOptions.now();
        const revisionNumber = 1;
        const repo: RepoRecord = {
          repoId: input.repoId,
          schemaVersion: input.schemaVersion,
          graphVersion: input.graphVersion,
          defaultBranch: input.defaultBranch,
          storageMode: input.storageMode,
          nextRevision: input.commit ? 2 : 1,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        const repoDocument: FirebaseRepoDocument = {
          id: input.repoId,
          schemaVersion: input.schemaVersion,
          graphVersion: input.graphVersion,
          defaultBranch: input.defaultBranch,
          nextRevision: repo.nextRevision,
          storageMode: input.storageMode,
          checkpointEvery: resolvedOptions.checkpointEvery,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        const revision =
          input.commit === true
            ? createRevisionRecord({
                repo,
                revision: revisionNumber,
                branchName: input.defaultBranch,
                parentRevision: null,
                stateHash: input.stateHash,
                isEmptyRevision: false,
                timestamp,
                message: input.message,
                author: input.author
              })
            : undefined;
        const headRevision = revision?.revision ?? null;
        const branch = createBranchRecord({
          repoId: input.repoId,
          branchName: input.defaultBranch,
          revision: headRevision,
          stateHash: input.stateHash,
          status: input.commit ? "clean" : "dirty",
          createdFromRevision: headRevision,
          timestamp,
          author: input.author
        });
        const head = createHeadRecord({
          repoId: input.repoId,
          branchName: input.defaultBranch,
          status: input.commit ? "clean" : "dirty",
          revision: headRevision,
          baseRevision: headRevision,
          stateHash: input.stateHash,
          state: input.initialState,
          timestamp,
          author: input.author
        });

        transaction.set(repoReference, repoDocument);
        transaction.set(refs.branch(input.repoId, input.defaultBranch), branch);
        writeHeadDocument(
          transaction,
          refs,
          resolvedOptions,
          input.repoId,
          head
        );

        if (revision !== undefined) {
          writeSnapshotRevision(
            transaction,
            refs,
            input.repoId,
            revision,
            input.initialState,
            timestamp
          );
        }

        return {
          repo,
          head,
          ...(revision === undefined ? {} : { revision })
        };
      });
    },

    async getBranch(input: GetBranchInput): Promise<BranchRecord | null> {
      const branchSnapshot = await getDoc(
        refs.branch(input.repoId, input.branchName)
      );
      if (!branchSnapshot.exists()) {
        return null;
      }

      return branchRecordFromDocument(readDocumentData(branchSnapshot));
    },

    async getHead(input: GetHeadInput): Promise<Head<TState> | null> {
      const headSnapshot = await getDoc(refs.head(input.repoId, input.branchName));
      if (!headSnapshot.exists()) {
        return null;
      }

      return headFromDocument<TState>(
        input.repoId,
        readDocumentData(headSnapshot),
        async blobRef => readBlobState(refs, input.repoId, blobRef)
      );
    },

    async listBranches(input: ListBranchesInput): Promise<BranchRecord[]> {
      await readRepoOrThrow(refs, input.repoId);
      const snapshots = await getDocs(refs.branches(input.repoId));
      return snapshots.docs
        .map(snapshot => branchRecordFromDocument(readDocumentData(snapshot)))
        .sort((left, right) => left.name.localeCompare(right.name));
    },

    async writeHead(
      input: WriteHeadInput<TState>
    ): Promise<WriteHeadResult<TState>> {
      return runTransaction(resolvedOptions.db, async transaction => {
        await readRepoOrThrowInTransaction(transaction, refs, input.repoId);
        const branchSnapshot = await transaction.get(
          refs.branch(input.repoId, input.branchName)
        );
        const headSnapshot = await transaction.get(
          refs.head(input.repoId, input.branchName)
        );
        const currentHead = await headFromSnapshotOrThrowInTransaction<TState>(
          transaction,
          refs,
          input.repoId,
          input.branchName,
          headSnapshot
        );
        branchFromSnapshotOrThrow(input.branchName, branchSnapshot);
        checkExpectedHeadHash(currentHead, input.expectedHeadHash);

        const timestamp = resolvedOptions.now();
        const baseRevision =
          input.baseRevision ??
          (currentHead.status === "clean"
            ? currentHead.headRevision
            : currentHead.baseRevision);
        const head = createHeadRecord({
          repoId: input.repoId,
          branchName: input.branchName,
          status: "dirty",
          revision: null,
          baseRevision,
          stateHash: input.stateHash,
          state: input.state,
          timestamp,
          author: input.author
        });
        const branch = updateBranchRecord({
          previous: branchRecordFromDocument(readDocumentData(branchSnapshot)),
          revision: null,
          baseRevision,
          stateHash: input.stateHash,
          status: "dirty",
          timestamp,
          author: input.author
        });

        transaction.set(refs.branch(input.repoId, input.branchName), branch);
        writeHeadDocument(
          transaction,
          refs,
          resolvedOptions,
          input.repoId,
          head
        );

        return { head };
      });
    },

    async createRevision(
      input: CreateRevisionInput<TState>
    ): Promise<CreateRevisionResult<TState>> {
      return runTransaction(resolvedOptions.db, async transaction => {
        const repo = await readRepoOrThrowInTransaction(
          transaction,
          refs,
          input.repoId
        );
        const branchSnapshot = await transaction.get(
          refs.branch(input.repoId, input.branchName)
        );
        const headSnapshot = await transaction.get(
          refs.head(input.repoId, input.branchName)
        );
        const currentHead = await headFromSnapshotOrThrowInTransaction<TState>(
          transaction,
          refs,
          input.repoId,
          input.branchName,
          headSnapshot
        );
        const currentBranch = branchFromSnapshotOrThrow(
          input.branchName,
          branchSnapshot
        );
        checkExpectedHeadHash(currentHead, input.expectedHeadHash);

        if (
          currentHead.status === "clean" &&
          currentHead.headRevision !== null &&
          currentHead.stateHash === input.stateHash &&
          input.allowEmpty !== true
        ) {
          const currentRevisionSnapshot = await transaction.get(
            refs.revision(input.repoId, currentHead.headRevision)
          );
          return {
            revision: revisionFromSnapshotOrThrow(
              currentHead.headRevision,
              currentRevisionSnapshot,
              input.repoId
            ),
            head: currentHead,
            created: false
          };
        }

        const revisionNumber = repo.nextRevision;
        const timestamp = resolvedOptions.now();
        const parentRevision =
          currentHead.status === "clean"
            ? currentHead.headRevision
            : currentHead.baseRevision;
        const parentHash =
          parentRevision === null
            ? null
            : revisionFromSnapshotOrThrow(
                parentRevision,
                await transaction.get(refs.revision(input.repoId, parentRevision)),
                input.repoId
              ).stateHash;
        const revision = createRevisionRecord({
          repo,
          revision: revisionNumber,
          branchName: input.branchName,
          parentRevision,
          stateHash: input.stateHash,
          isEmptyRevision: parentHash === input.stateHash,
          timestamp,
          message: input.message,
          author: input.author
        });
        const head = createHeadRecord({
          repoId: input.repoId,
          branchName: input.branchName,
          status: "clean",
          revision: revisionNumber,
          baseRevision: revisionNumber,
          stateHash: input.stateHash,
          state: input.state,
          timestamp,
          author: input.author
        });
        const branch = updateBranchRecord({
          previous: currentBranch,
          revision: revisionNumber,
          baseRevision: revisionNumber,
          stateHash: input.stateHash,
          status: "clean",
          timestamp,
          author: input.author
        });

        transaction.update(refs.repo(input.repoId), {
          nextRevision: revisionNumber + 1,
          updatedAt: timestamp
        });
        transaction.set(refs.branch(input.repoId, input.branchName), branch);
        writeHeadDocument(
          transaction,
          refs,
          resolvedOptions,
          input.repoId,
          head
        );
        writeSnapshotRevision(
          transaction,
          refs,
          input.repoId,
          revision,
          input.state,
          timestamp
        );

        return {
          revision,
          head,
          created: true
        };
      });
    },

    async readRevision(
      input: ReadRevisionInput
    ): Promise<StoredRevision<TState> | null> {
      await readRepoOrThrow(refs, input.repoId);
      const revisionSnapshot = await getDoc(
        refs.revision(input.repoId, input.revision)
      );
      if (!revisionSnapshot.exists()) {
        return null;
      }

      const revision = revisionRecordFromDocument(
        input.repoId,
        readDocumentData(revisionSnapshot)
      );
      const state = await readRevisionSnapshotState<TState>(
        refs,
        input.repoId,
        revision
      );

      return {
        revision,
        state
      };
    },

    async readRevisionState(
      input: ReadRevisionStateInput
    ): Promise<TState | null> {
      const storedRevision = await this.readRevision(input);
      return storedRevision?.state ?? null;
    },

    async listRevisions(
      input: ListRevisionsInput
    ): Promise<RevisionSummary[]> {
      await readRepoOrThrow(refs, input.repoId);
      const snapshots = await getDocs(refs.revisions(input.repoId));
      const revisions = snapshots.docs
        .map(snapshot =>
          revisionRecordFromDocument(input.repoId, readDocumentData(snapshot))
        )
        .filter(
          revision =>
            input.branchName === undefined ||
            revision.branchName === input.branchName
        )
        .filter(
          revision =>
            input.after === undefined || revision.revision > input.after
        )
        .sort((left, right) =>
          input.order === "asc"
            ? left.revision - right.revision
            : right.revision - left.revision
        );

      return revisions.slice(0, input.limit);
    },

    async createTag(input: CreateTagInput): Promise<TagRecord> {
      return runTransaction(resolvedOptions.db, async transaction => {
        const repo = await readRepoOrThrowInTransaction(
          transaction,
          refs,
          input.repoId
        );
        const tagReference = refs.tag(input.repoId, input.name);
        const tagSnapshot = await transaction.get(tagReference);
        if (tagSnapshot.exists() && input.overwrite !== true) {
          throw new TagAlreadyExistsError(`Tag "${input.name}" already exists.`);
        }

        const revision =
          input.revision === undefined || input.revision === "HEAD"
            ? (
                await headFromSnapshotOrThrowInTransaction<TState>(
                  transaction,
                  refs,
                  input.repoId,
                  input.branchName ?? repo.defaultBranch,
                  await transaction.get(
                    refs.head(input.repoId, input.branchName ?? repo.defaultBranch)
                  )
                )
              ).headRevision
            : input.revision;

        if (revision === null) {
          throw new RevisionNotFoundError("Cannot tag a dirty HEAD directly.");
        }

        revisionFromSnapshotOrThrow(
          revision,
          await transaction.get(refs.revision(input.repoId, revision)),
          input.repoId
        );

        const tag: TagRecord = {
          repoId: input.repoId,
          name: input.name,
          revision,
          ...(input.annotation === undefined
            ? {}
            : { annotation: input.annotation }),
          createdAt: resolvedOptions.now(),
          ...(input.author === undefined ? {} : { createdBy: input.author })
        };

        transaction.set(tagReference, tag);
        return tag;
      });
    },

    async listTags(input: ListTagsInput): Promise<TagRecord[]> {
      await readRepoOrThrow(refs, input.repoId);
      const snapshots = await getDocs(refs.tags(input.repoId));
      return snapshots.docs
        .map(snapshot => tagRecordFromDocument(readDocumentData(snapshot)))
        .sort((left, right) => left.name.localeCompare(right.name));
    },

    async createBranch(input: CreateBranchInput): Promise<BranchRecord> {
      return runTransaction(resolvedOptions.db, async transaction => {
        const repo = await readRepoOrThrowInTransaction(
          transaction,
          refs,
          input.repoId
        );
        const branchReference = refs.branch(input.repoId, input.name);
        const branchSnapshot = await transaction.get(branchReference);
        if (branchSnapshot.exists()) {
          throw new BranchAlreadyExistsError(
            `Branch "${input.name}" already exists.`
          );
        }

        const sourceRevision =
          input.from === "HEAD"
            ? (
                await headFromSnapshotOrThrowInTransaction<TState>(
                  transaction,
                  refs,
                  input.repoId,
                  input.sourceBranch ?? repo.defaultBranch,
                  await transaction.get(
                    refs.head(input.repoId, input.sourceBranch ?? repo.defaultBranch)
                  )
                )
              ).headRevision
            : input.from;

        if (sourceRevision === null) {
          throw new RevisionNotFoundError(
            "Cannot create a branch from a dirty HEAD."
          );
        }

        const revisionSnapshot = await transaction.get(
          refs.revision(input.repoId, sourceRevision)
        );
        const revision = revisionFromSnapshotOrThrow(
          sourceRevision,
          revisionSnapshot,
          input.repoId
        );
        const sourceState = await readRevisionSnapshotStateInTransaction<TState>(
          transaction,
          refs,
          input.repoId,
          revision
        );
        const timestamp = resolvedOptions.now();
        const branch = createBranchRecord({
          repoId: input.repoId,
          branchName: input.name,
          revision: sourceRevision,
          stateHash: revision.stateHash,
          status: "clean",
          createdFromRevision: sourceRevision,
          timestamp,
          author: input.author
        });
        const head = createHeadRecord({
          repoId: input.repoId,
          branchName: input.name,
          status: "clean",
          revision: sourceRevision,
          baseRevision: sourceRevision,
          stateHash: revision.stateHash,
          state: sourceState,
          timestamp,
          author: input.author
        });

        transaction.set(branchReference, branch);
        writeHeadDocument(
          transaction,
          refs,
          resolvedOptions,
          input.repoId,
          head
        );

        return branch;
      });
    },

    async updateBranch(input: UpdateBranchInput): Promise<BranchRecord> {
      return runTransaction(resolvedOptions.db, async transaction => {
        await readRepoOrThrowInTransaction(transaction, refs, input.repoId);
        const branchSnapshot = await transaction.get(
          refs.branch(input.repoId, input.branchName)
        );
        const branch = updateBranchRecord({
          previous: branchFromSnapshotOrThrow(input.branchName, branchSnapshot),
          revision: input.headRevision,
          baseRevision: input.baseRevision,
          stateHash: input.headStateHash,
          status: input.status,
          timestamp: resolvedOptions.now(),
          author: input.author
        });

        transaction.set(refs.branch(input.repoId, input.branchName), branch);
        return branch;
      });
    },

    async restoreRevision(
      input: RestoreRevisionInput<TState>
    ): Promise<WriteHeadResult<TState>> {
      if (input.commit === true) {
        const result = await this.createRevision({
          repoId: input.repoId,
          branchName: input.branchName,
          state: input.state,
          stateHash: input.stateHash,
          ...(input.message === undefined ? {} : { message: input.message }),
          ...(input.author === undefined ? {} : { author: input.author }),
          ...(input.expectedHeadHash === undefined
            ? {}
            : { expectedHeadHash: input.expectedHeadHash })
        });
        return { head: result.head };
      }

      return this.writeHead({
        repoId: input.repoId,
        branchName: input.branchName,
        state: input.state,
        stateHash: input.stateHash,
        ...(input.author === undefined ? {} : { author: input.author }),
        ...(input.expectedHeadHash === undefined
          ? {}
          : { expectedHeadHash: input.expectedHeadHash })
      });
    },

    async resetBranch(input: ResetBranchInput): Promise<BranchRecord> {
      return runTransaction(resolvedOptions.db, async transaction => {
        await readRepoOrThrowInTransaction(transaction, refs, input.repoId);
        const branchSnapshot = await transaction.get(
          refs.branch(input.repoId, input.branchName)
        );
        const headSnapshot = await transaction.get(
          refs.head(input.repoId, input.branchName)
        );
        const head = await headFromSnapshotOrThrowInTransaction<TState>(
          transaction,
          refs,
          input.repoId,
          input.branchName,
          headSnapshot
        );
        checkExpectedHeadHash(head, input.expectedHeadHash);
        const revisionSnapshot = await transaction.get(
          refs.revision(input.repoId, input.to)
        );
        const revision = revisionFromSnapshotOrThrow(
          input.to,
          revisionSnapshot,
          input.repoId
        );
        const state = await readRevisionSnapshotStateInTransaction<TState>(
          transaction,
          refs,
          input.repoId,
          revision
        );
        const timestamp = resolvedOptions.now();
        const branch = updateBranchRecord({
          previous: branchFromSnapshotOrThrow(input.branchName, branchSnapshot),
          revision: input.to,
          baseRevision: input.to,
          stateHash: revision.stateHash,
          status: "clean",
          timestamp,
          author: input.author
        });
        const nextHead = createHeadRecord({
          repoId: input.repoId,
          branchName: input.branchName,
          status: "clean",
          revision: input.to,
          baseRevision: input.to,
          stateHash: revision.stateHash,
          state,
          timestamp,
          author: input.author
        });

        transaction.set(refs.branch(input.repoId, input.branchName), branch);
        writeHeadDocument(
          transaction,
          refs,
          resolvedOptions,
          input.repoId,
          nextHead
        );

        return branch;
      });
    },

    subscribeHead(input, callback): Unsubscribe {
      return onSnapshot(refs.head(input.repoId, input.branchName), snapshot => {
        if (!snapshot.exists()) {
          return;
        }

        void headFromDocument<TState>(
          input.repoId,
          readDocumentData(snapshot),
          async blobRef => readBlobState(refs, input.repoId, blobRef)
        ).then(callback);
      });
    },

    subscribeRevisions(input, callback): Unsubscribe {
      return onSnapshot(refs.revisions(input.repoId), snapshot => {
        const revisions = snapshot.docs
          .map(item =>
            revisionRecordFromDocument(input.repoId, readDocumentData(item))
          )
          .filter(
            revision =>
              input.branchName === undefined ||
              revision.branchName === input.branchName
          )
          .filter(
            revision =>
              input.after === undefined || revision.revision > input.after
          )
          .sort((left, right) =>
            input.order === "asc"
              ? left.revision - right.revision
              : right.revision - left.revision
          )
          .slice(0, input.limit);

        callback(revisions);
      });
    }
  };
}

export const objectVcsFirebasePackage = "@bjalon/object-vcs-firebase";

function resolveOptions(
  options: FirebasePersistenceOptions
): ResolvedFirebasePersistenceOptions {
  return {
    db: options.db,
    rootCollection: options.rootCollection ?? "objectVcs",
    collections: {
      branches: options.collections?.branches ?? "branches",
      heads: options.collections?.heads ?? "heads",
      revisions: options.collections?.revisions ?? "revisions",
      tags: options.collections?.tags ?? "tags",
      blobs: options.collections?.blobs ?? "blobs"
    },
    checkpointEvery: options.checkpointEvery ?? 1,
    maxInlineHeadStateBytes: options.maxInlineHeadStateBytes ?? 900_000,
    now: options.now ?? (() => new Date().toISOString())
  };
}

interface ReferenceFactory {
  repo(repoId: string): DocumentReference;
  branches(repoId: string): ReturnType<typeof collection>;
  branch(repoId: string, branchName: BranchName): DocumentReference;
  heads(repoId: string): ReturnType<typeof collection>;
  head(repoId: string, branchName: BranchName): DocumentReference;
  revisions(repoId: string): ReturnType<typeof collection>;
  revision(repoId: string, revision: RevisionNumber): DocumentReference;
  tags(repoId: string): ReturnType<typeof collection>;
  tag(repoId: string, name: string): DocumentReference;
  blob(repoId: string, stateHash: StateHash): DocumentReference;
}

function createReferenceFactory(
  options: ResolvedFirebasePersistenceOptions
): ReferenceFactory {
  return {
    repo(repoId) {
      return doc(collection(options.db, options.rootCollection), encodeId(repoId));
    },
    branches(repoId) {
      return collection(this.repo(repoId), options.collections.branches);
    },
    branch(repoId, branchName) {
      return doc(this.branches(repoId), encodeId(branchName));
    },
    heads(repoId) {
      return collection(this.repo(repoId), options.collections.heads);
    },
    head(repoId, branchName) {
      return doc(this.heads(repoId), encodeId(branchName));
    },
    revisions(repoId) {
      return collection(this.repo(repoId), options.collections.revisions);
    },
    revision(repoId, revision) {
      return doc(this.revisions(repoId), String(revision));
    },
    tags(repoId) {
      return collection(this.repo(repoId), options.collections.tags);
    },
    tag(repoId, name) {
      return doc(this.tags(repoId), encodeId(name));
    },
    blob(repoId, stateHash) {
      return doc(
        collection(this.repo(repoId), options.collections.blobs),
        encodeId(stateHash)
      );
    }
  };
}

function encodeId(value: string): string {
  if (value.length === 0) {
    throw new PersistenceError("Firestore document identifiers cannot be empty.");
  }

  return Array.from(new TextEncoder().encode(value))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readDocumentData(snapshot: { data(): unknown }): FirestoreData {
  const data = snapshot.data();
  if (!isRecord(data)) {
    throw new PersistenceError("Firestore document is not a plain object.");
  }
  return data;
}

async function readRepoOrThrow(
  refs: ReferenceFactory,
  repoId: string
): Promise<RepoRecord> {
  const snapshot = await getDoc(refs.repo(repoId));
  if (!snapshot.exists()) {
    throw new RepositoryNotFoundError(`Repository "${repoId}" was not found.`);
  }

  return repoRecordFromDocument(repoId, readDocumentData(snapshot));
}

async function readRepoOrThrowInTransaction(
  transaction: TransactionLike,
  refs: ReferenceFactory,
  repoId: string
): Promise<RepoRecord> {
  const snapshot = await transaction.get(refs.repo(repoId));
  if (!snapshot.exists()) {
    throw new RepositoryNotFoundError(`Repository "${repoId}" was not found.`);
  }

  return repoRecordFromDocument(repoId, readDocumentData(snapshot));
}

type TransactionLike = Transaction;

function repoRecordFromDocument(
  repoId: string,
  data: FirestoreData
): RepoRecord {
  const document = data as unknown as FirebaseRepoDocument;
  return {
    repoId,
    schemaVersion: document.schemaVersion,
    graphVersion: document.graphVersion,
    defaultBranch: document.defaultBranch,
    storageMode: document.storageMode,
    nextRevision: document.nextRevision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

function branchRecordFromDocument(data: FirestoreData): BranchRecord {
  return data as unknown as BranchRecord;
}

function tagRecordFromDocument(data: FirestoreData): TagRecord {
  return data as unknown as TagRecord;
}

function revisionRecordFromDocument(
  repoId: string,
  data: FirestoreData
): RevisionRecord {
  const document = data as unknown as FirebaseRevisionDocument;
  return {
    repoId,
    revision: document.revision,
    parentRevision: document.parentRevision,
    branchName: document.branchName,
    stateHash: document.stateHash,
    schemaVersion: document.schemaVersion,
    graphVersion: document.graphVersion,
    ...(document.message === undefined ? {} : { message: document.message }),
    createdAt: document.createdAt,
    ...(document.createdBy === undefined
      ? {}
      : { createdBy: document.createdBy }),
    isEmptyRevision: document.isEmptyRevision,
    isCheckpoint: document.isCheckpoint,
    ...(document.patchBlobRef === undefined
      ? {}
      : { patchRef: document.patchBlobRef }),
    ...(document.snapshotBlobRef === undefined
      ? {}
      : { snapshotRef: document.snapshotBlobRef })
  };
}

async function headFromDocument<TState>(
  repoId: string,
  data: FirestoreData,
  readStateBlob: (blobRef: string) => Promise<TState>
): Promise<Head<TState>> {
  const document = data as unknown as FirebaseHeadDocument<TState>;
  const state =
    document.state === undefined
      ? await readStateBlob(requireString(document.stateBlobRef, "stateBlobRef"))
      : document.state;

  return {
    repoId,
    branchName: document.branchName,
    status: document.status,
    headRevision: document.headRevision,
    baseRevision: document.baseRevision,
    stateHash: document.stateHash,
    state,
    updatedAt: document.updatedAt,
    ...(document.updatedBy === undefined
      ? {}
      : { updatedBy: document.updatedBy })
  };
}

async function headFromSnapshotOrThrowInTransaction<TState>(
  transaction: TransactionLike,
  refs: ReferenceFactory,
  repoId: string,
  branchName: BranchName,
  snapshot: { exists(): boolean; data(): unknown }
): Promise<Head<TState>> {
  if (!snapshot.exists()) {
    throw new BranchNotFoundError(`Branch "${branchName}" was not found.`);
  }

  const data = readDocumentData(snapshot);
  const document = data as unknown as FirebaseHeadDocument<TState>;
  const state =
    document.state === undefined
      ? await readBlobStateInTransaction<TState>(
          transaction,
          refs,
          repoId,
          requireString(document.stateBlobRef, "stateBlobRef")
        )
      : document.state;

  return {
    repoId,
    branchName: document.branchName,
    status: document.status,
    headRevision: document.headRevision,
    baseRevision: document.baseRevision,
    stateHash: document.stateHash,
    state,
    updatedAt: document.updatedAt,
    ...(document.updatedBy === undefined
      ? {}
      : { updatedBy: document.updatedBy })
  };
}

function branchFromSnapshotOrThrow(
  branchName: BranchName,
  snapshot: { exists(): boolean; data(): unknown }
): BranchRecord {
  if (!snapshot.exists()) {
    throw new BranchNotFoundError(`Branch "${branchName}" was not found.`);
  }

  return branchRecordFromDocument(readDocumentData(snapshot));
}

function revisionFromSnapshotOrThrow(
  revision: RevisionNumber,
  snapshot: { exists(): boolean; data(): unknown },
  repoId: string
): RevisionRecord {
  if (!snapshot.exists()) {
    throw new RevisionNotFoundError(`Revision "${revision}" was not found.`);
  }

  return revisionRecordFromDocument(repoId, readDocumentData(snapshot));
}

function createBranchRecord(input: {
  readonly repoId: string;
  readonly branchName: BranchName;
  readonly revision: RevisionNumber | null;
  readonly stateHash: StateHash;
  readonly status: "clean" | "dirty";
  readonly createdFromRevision: RevisionNumber | null;
  readonly timestamp: string;
  readonly author: string | undefined;
}): BranchRecord {
  return {
    repoId: input.repoId,
    name: input.branchName,
    headRevision: input.revision,
    baseRevision: input.revision,
    headStateHash: input.stateHash,
    status: input.status,
    createdFromRevision: input.createdFromRevision,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    ...(input.author === undefined ? {} : { createdBy: input.author }),
    ...(input.author === undefined ? {} : { updatedBy: input.author })
  };
}

function updateBranchRecord(input: {
  readonly previous: BranchRecord;
  readonly revision: RevisionNumber | null;
  readonly baseRevision: RevisionNumber | null;
  readonly stateHash: StateHash;
  readonly status: "clean" | "dirty";
  readonly timestamp: string;
  readonly author: string | undefined;
}): BranchRecord {
  return {
    ...input.previous,
    headRevision: input.revision,
    baseRevision: input.baseRevision,
    headStateHash: input.stateHash,
    status: input.status,
    updatedAt: input.timestamp,
    ...(input.author === undefined ? {} : { updatedBy: input.author })
  };
}

function createHeadRecord<TState>(input: {
  readonly repoId: string;
  readonly branchName: BranchName;
  readonly status: "clean" | "dirty";
  readonly revision: RevisionNumber | null;
  readonly baseRevision: RevisionNumber | null;
  readonly stateHash: StateHash;
  readonly state: TState;
  readonly timestamp: string;
  readonly author: string | undefined;
}): Head<TState> {
  return {
    repoId: input.repoId,
    branchName: input.branchName,
    status: input.status,
    headRevision: input.revision,
    baseRevision: input.baseRevision,
    stateHash: input.stateHash,
    state: input.state,
    updatedAt: input.timestamp,
    ...(input.author === undefined ? {} : { updatedBy: input.author })
  };
}

function createRevisionRecord(input: {
  readonly repo: RepoRecord;
  readonly revision: RevisionNumber;
  readonly branchName: BranchName;
  readonly parentRevision: RevisionNumber | null;
  readonly stateHash: StateHash;
  readonly isEmptyRevision: boolean;
  readonly timestamp: string;
  readonly message: string | undefined;
  readonly author: string | undefined;
}): RevisionRecord {
  return {
    repoId: input.repo.repoId,
    revision: input.revision,
    parentRevision: input.parentRevision,
    branchName: input.branchName,
    stateHash: input.stateHash,
    schemaVersion: input.repo.schemaVersion,
    graphVersion: input.repo.graphVersion,
    ...(input.message === undefined ? {} : { message: input.message }),
    createdAt: input.timestamp,
    ...(input.author === undefined ? {} : { createdBy: input.author }),
    isEmptyRevision: input.isEmptyRevision,
    isCheckpoint: true,
    snapshotRef: input.stateHash
  };
}

function writeHeadDocument<TState>(
  transaction: TransactionLike,
  refs: ReferenceFactory,
  options: ResolvedFirebasePersistenceOptions,
  repoId: string,
  head: Head<TState>
): void {
  const inlineState = jsonByteSize(head.state) <= options.maxInlineHeadStateBytes;
  const document: FirebaseHeadDocument<TState> = {
    branchName: head.branchName,
    status: head.status,
    headRevision: head.headRevision,
    baseRevision: head.baseRevision,
    stateHash: head.stateHash,
    ...(inlineState ? { state: head.state } : { stateBlobRef: head.stateHash }),
    updatedAt: head.updatedAt,
    ...(head.updatedBy === undefined ? {} : { updatedBy: head.updatedBy })
  };

  if (!inlineState) {
    writeBlob(transaction, refs, repoId, head.stateHash, head.state, head.updatedAt);
  }

  transaction.set(refs.head(repoId, head.branchName), document);
}

function writeSnapshotRevision<TState>(
  transaction: TransactionLike,
  refs: ReferenceFactory,
  repoId: string,
  revision: RevisionRecord,
  state: TState,
  timestamp: string
): void {
  const document: FirebaseRevisionDocument = {
    revision: revision.revision,
    parentRevision: revision.parentRevision,
    branchName: revision.branchName,
    stateHash: revision.stateHash,
    schemaVersion: revision.schemaVersion,
    graphVersion: revision.graphVersion,
    snapshotBlobRef: revision.stateHash,
    isCheckpoint: revision.isCheckpoint,
    isEmptyRevision: revision.isEmptyRevision,
    ...(revision.message === undefined ? {} : { message: revision.message }),
    createdAt: revision.createdAt,
    ...(revision.createdBy === undefined
      ? {}
      : { createdBy: revision.createdBy })
  };

  writeBlob(transaction, refs, repoId, revision.stateHash, state, timestamp);
  transaction.set(refs.revision(repoId, revision.revision), document);
}

function writeBlob<TState>(
  transaction: TransactionLike,
  refs: ReferenceFactory,
  repoId: string,
  stateHash: StateHash,
  state: TState,
  timestamp: string
): void {
  const document: FirebaseBlobDocument<TState> = {
    kind: "snapshot",
    stateHash,
    state,
    createdAt: timestamp
  };
  transaction.set(refs.blob(repoId, stateHash), document);
}

async function readRevisionSnapshotState<TState>(
  refs: ReferenceFactory,
  repoId: string,
  revision: RevisionRecord
): Promise<TState> {
  return readBlobState<TState>(
    refs,
    repoId,
    requireString(revision.snapshotRef, "snapshotRef")
  );
}

async function readRevisionSnapshotStateInTransaction<TState>(
  transaction: TransactionLike,
  refs: ReferenceFactory,
  repoId: string,
  revision: RevisionRecord
): Promise<TState> {
  return readBlobStateInTransaction<TState>(
    transaction,
    refs,
    repoId,
    requireString(revision.snapshotRef, "snapshotRef")
  );
}

async function readBlobState<TState>(
  refs: ReferenceFactory,
  repoId: string,
  blobRef: string
): Promise<TState> {
  const snapshot = await getDoc(refs.blob(repoId, blobRef));
  if (!snapshot.exists()) {
    throw new RevisionNotFoundError(`Snapshot blob "${blobRef}" was not found.`);
  }

  const document = readDocumentData(snapshot) as unknown as FirebaseBlobDocument<TState>;
  return document.state;
}

async function readBlobStateInTransaction<TState>(
  transaction: TransactionLike,
  refs: ReferenceFactory,
  repoId: string,
  blobRef: string
): Promise<TState> {
  const snapshot = await transaction.get(refs.blob(repoId, blobRef));
  if (!snapshot.exists()) {
    throw new RevisionNotFoundError(`Snapshot blob "${blobRef}" was not found.`);
  }

  const document = readDocumentData(snapshot) as unknown as FirebaseBlobDocument<TState>;
  return document.state;
}

function checkExpectedHeadHash<TState>(
  head: Head<TState>,
  expectedHeadHash: StateHash | undefined
): void {
  if (expectedHeadHash !== undefined && expectedHeadHash !== head.stateHash) {
    throw new ConcurrencyConflictError(
      `Expected HEAD hash "${expectedHeadHash}", got "${head.stateHash}".`
    );
  }
}

function requireString(
  value: string | undefined,
  fieldName: string
): string {
  if (value === undefined) {
    throw new PersistenceError(`Missing Firestore field "${fieldName}".`);
  }

  return value;
}

function jsonByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
