import {
  BranchAlreadyExistsError,
  BranchNotFoundError,
  ConcurrencyConflictError,
  DirtyHeadError,
  PersistenceError,
  RepositoryAlreadyExistsError,
  RepositoryNotFoundError,
  RevisionNotFoundError,
  TagAlreadyExistsError,
  TagNotFoundError,
  TagRevisionMismatchError
} from "./errors.js";
import { cloneJson } from "./json.js";
import type {
  BranchRecord,
  Head,
  RevisionRecord,
  StateHash,
  TagRecord
} from "./types.js";
import type {
  CreateBranchInput,
  CreateRepoInput,
  CreateRepoResult,
  CreateRevisionInput,
  CreateRevisionResult,
  CreateTagInput,
  DeleteTagInput,
  DeleteTagResult,
  GetBranchInput,
  GetHeadInput,
  GetRepoInput,
  ListBranchesInput,
  ListRevisionsInput,
  ListTagsInput,
  PersistenceAdapter,
  ReadRevisionInput,
  ReadRevisionStateInput,
  RepoRecord,
  ResetBranchInput,
  RestoreRevisionInput,
  RevisionSummary,
  StoredRevision,
  UpdateBranchInput,
  WriteHeadInput,
  WriteHeadResult
} from "./persistence.js";

interface InMemoryRepositoryStore<TState> {
  repo: RepoRecord;
  branches: Map<string, BranchRecord>;
  heads: Map<string, Head<TState>>;
  revisions: Map<number, StoredRevision<TState>>;
  tags: Map<string, TagRecord>;
}

export interface InMemoryPersistenceOptions {
  readonly now?: () => string;
}

export function inMemoryPersistence<TState>(
  options: InMemoryPersistenceOptions = {}
): PersistenceAdapter<TState> {
  const stores = new Map<string, InMemoryRepositoryStore<TState>>();
  const now = options.now ?? (() => new Date().toISOString());

  function getStore(repoId: string): InMemoryRepositoryStore<TState> {
    const store = stores.get(repoId);
    if (store === undefined) {
      throw new RepositoryNotFoundError(`Repository "${repoId}" was not found.`);
    }
    return store;
  }

  function getHeadOrThrow(
    store: InMemoryRepositoryStore<TState>,
    branchName: string
  ): Head<TState> {
    const head = store.heads.get(branchName);
    if (head === undefined) {
      throw new BranchNotFoundError(`Branch "${branchName}" was not found.`);
    }
    return head;
  }

  function getRevisionOrThrow(
    store: InMemoryRepositoryStore<TState>,
    revision: number
  ): StoredRevision<TState> {
    const storedRevision = store.revisions.get(revision);
    if (storedRevision === undefined) {
      throw new RevisionNotFoundError(`Revision "${revision}" was not found.`);
    }
    return storedRevision;
  }

  function checkExpectedHeadHash(
    head: Head<TState>,
    expectedHeadHash: StateHash | undefined
  ): void {
    if (
      expectedHeadHash !== undefined &&
      expectedHeadHash !== head.stateHash
    ) {
      throw new ConcurrencyConflictError(
        `Expected HEAD hash "${expectedHeadHash}", got "${head.stateHash}".`
      );
    }
  }

  function setCleanHead(
    store: InMemoryRepositoryStore<TState>,
    branchName: string,
    state: TState,
    stateHash: StateHash,
    revision: number,
    author: string | undefined
  ): Head<TState> {
    const timestamp = now();
    const head: Head<TState> = {
      repoId: store.repo.repoId,
      branchName,
      status: "clean",
      headRevision: revision,
      baseRevision: revision,
      stateHash,
      state: cloneJson(state),
      updatedAt: timestamp,
      ...(author === undefined ? {} : { updatedBy: author })
    };
    const branch = getBranchOrThrow(store, branchName);
    const updatedBranch: BranchRecord = {
      ...branch,
      headRevision: revision,
      baseRevision: revision,
      headStateHash: stateHash,
      status: "clean",
      updatedAt: timestamp,
      ...(author === undefined ? {} : { updatedBy: author })
    };
    store.heads.set(branchName, head);
    store.branches.set(branchName, updatedBranch);
    return cloneJson(head);
  }

  function getBranchOrThrow(
    store: InMemoryRepositoryStore<TState>,
    branchName: string
  ): BranchRecord {
    const branch = store.branches.get(branchName);
    if (branch === undefined) {
      throw new BranchNotFoundError(`Branch "${branchName}" was not found.`);
    }
    return branch;
  }

  return {
    async getRepo(input: GetRepoInput): Promise<RepoRecord | null> {
      return cloneOrNull(stores.get(input.repoId)?.repo ?? null);
    },

    async createRepo(
      input: CreateRepoInput<TState>
    ): Promise<CreateRepoResult<TState>> {
      if (stores.has(input.repoId)) {
        throw new RepositoryAlreadyExistsError(
          `Repository "${input.repoId}" already exists.`
        );
      }

      const timestamp = now();
      const repo: RepoRecord = {
        repoId: input.repoId,
        schemaVersion: input.schemaVersion,
        graphVersion: input.graphVersion,
        schemaFingerprint: input.schemaFingerprint,
        schemaFingerprintAlgorithm: input.schemaFingerprintAlgorithm,
        defaultBranch: input.defaultBranch,
        storageMode: input.storageMode,
        nextRevision: input.commit ? 2 : 1,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const revisions = new Map<number, StoredRevision<TState>>();
      const branches = new Map<string, BranchRecord>();
      const heads = new Map<string, Head<TState>>();
      const tags = new Map<string, TagRecord>();
      const store: InMemoryRepositoryStore<TState> = {
        repo,
        branches,
        heads,
        revisions,
        tags
      };

      let revision: RevisionRecord | undefined;
      if (input.commit) {
        revision = {
          repoId: input.repoId,
          revision: 1,
          parentRevision: null,
          branchName: input.defaultBranch,
          stateHash: input.stateHash,
          schemaVersion: input.schemaVersion,
          graphVersion: input.graphVersion,
          schemaFingerprint: input.schemaFingerprint,
          schemaFingerprintAlgorithm: input.schemaFingerprintAlgorithm,
          ...(input.message === undefined ? {} : { message: input.message }),
          createdAt: timestamp,
          ...(input.author === undefined ? {} : { createdBy: input.author }),
          isEmptyRevision: false,
          isCheckpoint: true,
          snapshotRef: input.stateHash
        };
        revisions.set(1, {
          revision,
          state: cloneJson(input.initialState)
        });
      }

      const headRevision = revision?.revision ?? null;
      const branch: BranchRecord = {
        repoId: input.repoId,
        name: input.defaultBranch,
        headRevision,
        baseRevision: headRevision,
        headStateHash: input.stateHash,
        status: input.commit ? "clean" : "dirty",
        createdFromRevision: headRevision,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.author === undefined ? {} : { createdBy: input.author }),
        ...(input.author === undefined ? {} : { updatedBy: input.author })
      };
      const head: Head<TState> = {
        repoId: input.repoId,
        branchName: input.defaultBranch,
        status: input.commit ? "clean" : "dirty",
        headRevision,
        baseRevision: headRevision,
        stateHash: input.stateHash,
        state: cloneJson(input.initialState),
        updatedAt: timestamp,
        ...(input.author === undefined ? {} : { updatedBy: input.author })
      };

      branches.set(input.defaultBranch, branch);
      heads.set(input.defaultBranch, head);
      stores.set(input.repoId, store);

      return {
        repo: cloneJson(repo),
        head: cloneJson(head),
        ...(revision === undefined ? {} : { revision: cloneJson(revision) })
      };
    },

    async getBranch(input: GetBranchInput): Promise<BranchRecord | null> {
      const store = stores.get(input.repoId);
      return cloneOrNull(store?.branches.get(input.branchName) ?? null);
    },

    async getHead(input: GetHeadInput): Promise<Head<TState> | null> {
      const store = stores.get(input.repoId);
      return cloneOrNull(store?.heads.get(input.branchName) ?? null);
    },

    async listBranches(input: ListBranchesInput): Promise<BranchRecord[]> {
      const store = getStore(input.repoId);
      return Array.from(store.branches.values()).map(cloneJson);
    },

    async writeHead(
      input: WriteHeadInput<TState>
    ): Promise<WriteHeadResult<TState>> {
      const store = getStore(input.repoId);
      const currentHead = getHeadOrThrow(store, input.branchName);
      checkExpectedHeadHash(currentHead, input.expectedHeadHash);

      const timestamp = now();
      const baseRevision =
        input.baseRevision ??
        (currentHead.status === "clean"
          ? currentHead.headRevision
          : currentHead.baseRevision);
      const head: Head<TState> = {
        repoId: input.repoId,
        branchName: input.branchName,
        status: "dirty",
        headRevision: null,
        baseRevision,
        stateHash: input.stateHash,
        state: cloneJson(input.state),
        updatedAt: timestamp,
        ...(input.author === undefined ? {} : { updatedBy: input.author })
      };
      const branch = getBranchOrThrow(store, input.branchName);
      const updatedBranch: BranchRecord = {
        ...branch,
        headRevision: null,
        baseRevision,
        headStateHash: input.stateHash,
        status: "dirty",
        updatedAt: timestamp,
        ...(input.author === undefined ? {} : { updatedBy: input.author })
      };

      store.heads.set(input.branchName, head);
      store.branches.set(input.branchName, updatedBranch);

      return { head: cloneJson(head) };
    },

    async createRevision(
      input: CreateRevisionInput<TState>
    ): Promise<CreateRevisionResult<TState>> {
      const store = getStore(input.repoId);
      const currentHead = getHeadOrThrow(store, input.branchName);
      checkExpectedHeadHash(currentHead, input.expectedHeadHash);

      if (
        currentHead.status === "clean" &&
        currentHead.headRevision !== null &&
        currentHead.stateHash === input.stateHash &&
        input.allowEmpty !== true
      ) {
        const storedRevision = getRevisionOrThrow(
          store,
          currentHead.headRevision
        );
        return {
          revision: cloneJson(storedRevision.revision),
          head: cloneJson(currentHead),
          created: false
        };
      }

      const revisionNumber = store.repo.nextRevision;
      const timestamp = now();
      const parentRevision =
        currentHead.status === "clean"
          ? currentHead.headRevision
          : currentHead.baseRevision;
      const parentHash =
        parentRevision === null
          ? null
          : getRevisionOrThrow(store, parentRevision).revision.stateHash;
      const revision: RevisionRecord = {
        repoId: input.repoId,
        revision: revisionNumber,
        parentRevision,
        branchName: input.branchName,
        stateHash: input.stateHash,
        schemaVersion: input.schemaVersion ?? store.repo.schemaVersion,
        graphVersion: input.graphIdentity?.graphVersion ?? input.graphVersion ?? store.repo.graphVersion,
        schemaFingerprint:
          input.graphIdentity?.schemaFingerprint ?? store.repo.schemaFingerprint,
        schemaFingerprintAlgorithm:
          input.graphIdentity?.schemaFingerprintAlgorithm ??
          store.repo.schemaFingerprintAlgorithm,
        ...(input.message === undefined ? {} : { message: input.message }),
        createdAt: timestamp,
        ...(input.author === undefined ? {} : { createdBy: input.author }),
        isEmptyRevision: parentHash === input.stateHash,
        isCheckpoint: true,
        snapshotRef: input.stateHash
      };

      store.revisions.set(revisionNumber, {
        revision,
        state: cloneJson(input.state)
      });
      store.repo = {
        ...store.repo,
        schemaVersion: input.schemaVersion ?? store.repo.schemaVersion,
        graphVersion: input.graphIdentity?.graphVersion ?? input.graphVersion ?? store.repo.graphVersion,
        schemaFingerprint:
          input.graphIdentity?.schemaFingerprint ?? store.repo.schemaFingerprint,
        schemaFingerprintAlgorithm:
          input.graphIdentity?.schemaFingerprintAlgorithm ??
          store.repo.schemaFingerprintAlgorithm,
        nextRevision: revisionNumber + 1,
        updatedAt: timestamp
      };
      const head = setCleanHead(
        store,
        input.branchName,
        input.state,
        input.stateHash,
        revisionNumber,
        input.author
      );

      return {
        revision: cloneJson(revision),
        head,
        created: true
      };
    },

    async readRevision(
      input: ReadRevisionInput
    ): Promise<StoredRevision<TState> | null> {
      const store = getStore(input.repoId);
      return cloneOrNull(store.revisions.get(input.revision) ?? null);
    },

    async readRevisionState(
      input: ReadRevisionStateInput
    ): Promise<TState | null> {
      const store = getStore(input.repoId);
      return cloneOrNull(store.revisions.get(input.revision)?.state ?? null);
    },

    async listRevisions(
      input: ListRevisionsInput
    ): Promise<RevisionSummary[]> {
      const store = getStore(input.repoId);
      const revisions = Array.from(store.revisions.values())
        .map(storedRevision => storedRevision.revision)
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

      return revisions.slice(0, input.limit).map(cloneJson);
    },

    async createTag(input: CreateTagInput): Promise<TagRecord> {
      const store = getStore(input.repoId);
      if (store.tags.has(input.name) && input.overwrite !== true) {
        throw new TagAlreadyExistsError(`Tag "${input.name}" already exists.`);
      }

      const branchName = input.branchName ?? store.repo.defaultBranch;
      let revision =
        input.revision === undefined || input.revision === "HEAD"
          ? getHeadOrThrow(store, branchName).headRevision
          : input.revision;

      if (input.revision === undefined || input.revision === "HEAD") {
        const head = getHeadOrThrow(store, branchName);
        if (head.status === "dirty") {
          if (input.createRevisionIfDirty === false) {
            throw new DirtyHeadError(
              "Cannot tag a dirty HEAD when createRevisionIfDirty is false."
            );
          }

          const revisionNumber = store.repo.nextRevision;
          const timestamp = now();
          const parentRevision = head.baseRevision;
          const parentHash =
            parentRevision === null
              ? null
              : getRevisionOrThrow(store, parentRevision).revision.stateHash;
          const revisionRecord: RevisionRecord = {
            repoId: input.repoId,
            revision: revisionNumber,
            parentRevision,
            branchName,
            stateHash: head.stateHash,
            schemaVersion: store.repo.schemaVersion,
            graphVersion: store.repo.graphVersion,
            schemaFingerprint: store.repo.schemaFingerprint,
            schemaFingerprintAlgorithm: store.repo.schemaFingerprintAlgorithm,
            message: `Create revision for tag ${input.name}`,
            createdAt: timestamp,
            ...(input.author === undefined ? {} : { createdBy: input.author }),
            isEmptyRevision: parentHash === head.stateHash,
            isCheckpoint: true,
            snapshotRef: head.stateHash
          };

          store.revisions.set(revisionNumber, {
            revision: revisionRecord,
            state: cloneJson(head.state)
          });
          store.repo = {
            ...store.repo,
            nextRevision: revisionNumber + 1,
            updatedAt: timestamp
          };
          setCleanHead(
            store,
            branchName,
            head.state,
            head.stateHash,
            revisionNumber,
            input.author
          );
          revision = revisionNumber;
        }
      }

      if (revision === null) {
        throw new RevisionNotFoundError("Cannot tag a dirty HEAD directly.");
      }

      getRevisionOrThrow(store, revision);

      const tag: TagRecord = {
        repoId: input.repoId,
        name: input.name,
        revision,
        ...(input.annotation === undefined
          ? {}
          : { annotation: input.annotation }),
        createdAt: now(),
        ...(input.author === undefined ? {} : { createdBy: input.author })
      };
      store.tags.set(input.name, tag);
      return cloneJson(tag);
    },

    async listTags(input: ListTagsInput): Promise<TagRecord[]> {
      const store = getStore(input.repoId);
      return Array.from(store.tags.values()).map(cloneJson);
    },

    async deleteTag(input: DeleteTagInput): Promise<DeleteTagResult> {
      const store = getStore(input.repoId);
      const tag = store.tags.get(input.name);

      if (tag === undefined) {
        if ((input.missing ?? "throw") === "ignore") {
          return {
            deleted: false,
            name: input.name,
            previousRevision: null
          };
        }

        throw new TagNotFoundError(`Tag "${input.name}" was not found.`);
      }

      if (
        input.expectedRevision !== undefined &&
        tag.revision !== input.expectedRevision
      ) {
        throw new TagRevisionMismatchError(
          `Tag "${input.name}" points to revision "${tag.revision}", not "${input.expectedRevision}".`
        );
      }

      store.tags.delete(input.name);
      return {
        deleted: true,
        name: input.name,
        previousRevision: tag.revision
      };
    },

    async createBranch(input: CreateBranchInput): Promise<BranchRecord> {
      const store = getStore(input.repoId);
      if (store.branches.has(input.name)) {
        throw new BranchAlreadyExistsError(
          `Branch "${input.name}" already exists.`
        );
      }

      const sourceRevision =
        input.from === "HEAD"
          ? getHeadOrThrow(
              store,
              input.sourceBranch ?? store.repo.defaultBranch
            ).headRevision
          : input.from;

      if (sourceRevision === null) {
        throw new RevisionNotFoundError(
          "Cannot create a branch from a dirty HEAD."
        );
      }

      const source = getRevisionOrThrow(store, sourceRevision);
      const timestamp = now();
      const branch: BranchRecord = {
        repoId: input.repoId,
        name: input.name,
        headRevision: sourceRevision,
        baseRevision: sourceRevision,
        headStateHash: source.revision.stateHash,
        status: "clean",
        createdFromRevision: sourceRevision,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.author === undefined ? {} : { createdBy: input.author }),
        ...(input.author === undefined ? {} : { updatedBy: input.author })
      };
      const head: Head<TState> = {
        repoId: input.repoId,
        branchName: input.name,
        status: "clean",
        headRevision: sourceRevision,
        baseRevision: sourceRevision,
        stateHash: source.revision.stateHash,
        state: cloneJson(source.state),
        updatedAt: timestamp,
        ...(input.author === undefined ? {} : { updatedBy: input.author })
      };

      store.branches.set(input.name, branch);
      store.heads.set(input.name, head);
      return cloneJson(branch);
    },

    async updateBranch(input: UpdateBranchInput): Promise<BranchRecord> {
      const store = getStore(input.repoId);
      const branch = getBranchOrThrow(store, input.branchName);
      const updatedBranch: BranchRecord = {
        ...branch,
        headRevision: input.headRevision,
        baseRevision: input.baseRevision,
        headStateHash: input.headStateHash,
        status: input.status,
        updatedAt: now(),
        ...(input.author === undefined ? {} : { updatedBy: input.author })
      };
      store.branches.set(input.branchName, updatedBranch);
      return cloneJson(updatedBranch);
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
      if (input.mode !== "hard") {
        throw new PersistenceError('resetBranch only supports mode "hard".');
      }

      const store = getStore(input.repoId);
      const currentHead = getHeadOrThrow(store, input.branchName);
      checkExpectedHeadHash(currentHead, input.expectedHeadHash);
      const revision = getRevisionOrThrow(store, input.to);
      setCleanHead(
        store,
        input.branchName,
        revision.state,
        revision.revision.stateHash,
        input.to,
        input.author
      );
      return cloneJson(getBranchOrThrow(store, input.branchName));
    },

    subscribeHead(input, callback) {
      const store = getStore(input.repoId);
      callback(cloneJson(getHeadOrThrow(store, input.branchName)));
      return () => {
        return;
      };
    },

    subscribeRevisions(input, callback) {
      void this.listRevisions(input).then(callback);
      return () => {
        return;
      };
    },

    subscribeTags(input, callback) {
      void this.listTags(input).then(callback);
      return () => {
        return;
      };
    },

    subscribeBranches(input, callback) {
      void this.listBranches(input).then(callback);
      return () => {
        return;
      };
    }
  };
}

export const memoryPersistence = inMemoryPersistence;

function cloneOrNull<TValue>(value: TValue | null): TValue | null {
  return value === null ? null : cloneJson(value);
}
