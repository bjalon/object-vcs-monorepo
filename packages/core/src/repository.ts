import {
  BranchNotFoundError,
  DirtyHeadError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  PersistenceError,
  RevisionNotFoundError,
  SchemaCompatibilityError,
  ValidationError
} from "./errors.js";
import type {
  CollectionGraphEntry,
  GraphEntries,
  InferEntryState,
  InferState,
  ObjectVcsGraph,
  SingletonGraphEntry
} from "./graph.js";
import { hashState, stableStringify } from "./hash.js";
import { cloneJson } from "./json.js";
import { migrateState, type StateMigration } from "./migrations.js";
import { resolveGraphIdentity } from "./schema-fingerprint.js";
import type {
  BranchRecord,
  BranchName,
  GraphIdentity,
  Head,
  RepositoryId,
  RevisionNumber,
  StateHash,
  TagName,
  TagRecord
} from "./types.js";
import type {
  DeleteTagResult,
  PersistenceAdapter,
  RevisionSummary,
  Unsubscribe
} from "./persistence.js";

export interface CreateRepositoryOptions<TGraph extends ObjectVcsGraph> {
  readonly repoId: RepositoryId;
  readonly graph: TGraph;
  readonly schemaVersion: number;
  readonly graphVersion?: string;
  readonly schemaFingerprint?: string;
  readonly schemaFingerprintAlgorithm?: GraphIdentity["schemaFingerprintAlgorithm"];
  readonly migrations?: readonly StateMigration[];
  readonly defaultBranch?: BranchName;
  readonly persistence: PersistenceAdapter<InferState<TGraph>>;
}

export interface InitOptions<TState> {
  readonly initialState: TState;
  readonly branch?: BranchName;
  readonly commit?: boolean;
  readonly message?: string;
  readonly author?: string;
}

export interface InitResult<TState> {
  readonly head: Head<TState>;
  readonly revision?: RevisionSummary;
}

export interface GetHeadOptions {
  readonly branch?: BranchName;
  readonly migrateTo?: "raw" | "current" | "strict" | string;
}

export interface UpdateOptions {
  readonly branch?: BranchName;
  readonly commit?: boolean;
  readonly message?: string;
  readonly author?: string;
  readonly expectedHeadHash?: StateHash;
  readonly concurrency?: "strict" | "last-write-wins";
}

export interface UpdateResult<TState> {
  readonly head: Head<TState>;
  readonly revision?: RevisionSummary;
  readonly createdRevision: boolean;
}

export interface CommitOptions {
  readonly branch?: BranchName;
  readonly message?: string;
  readonly author?: string;
  readonly allowEmpty?: boolean;
  readonly expectedHeadHash?: StateHash;
}

export interface CommitResult<TState> {
  readonly head: Head<TState>;
  readonly revision: RevisionSummary;
  readonly created: boolean;
}

export interface ReadRevisionOptions {
  readonly migrateTo?: "raw" | "current" | "strict" | string;
  readonly migration?: "latest" | "strict";
}

export interface ListRevisionsOptions {
  readonly branch?: BranchName;
  readonly limit?: number;
  readonly after?: RevisionNumber;
  readonly order?: "asc" | "desc";
}

export interface TagOptions {
  readonly revision?: RevisionNumber | "HEAD";
  readonly branch?: BranchName;
  readonly annotation?: string;
  readonly author?: string;
  readonly createRevisionIfDirty?: boolean;
  readonly overwrite?: boolean;
}

export interface DeleteTagOptions {
  readonly missing?: "throw" | "ignore";
  readonly expectedRevision?: RevisionNumber;
  readonly author?: string;
}

export interface CreateBranchOptions {
  readonly from: RevisionNumber | "HEAD";
  readonly checkout?: boolean;
  readonly author?: string;
}

export interface RestoreOptions {
  readonly branch?: BranchName;
  readonly commit?: boolean;
  readonly message?: string;
  readonly author?: string;
  readonly expectedHeadHash?: StateHash;
}

export interface ResetBranchOptions {
  readonly to: RevisionNumber;
  readonly mode: "hard";
  readonly author?: string;
  readonly expectedHeadHash?: StateHash;
}

export interface MigrateHeadOptions {
  readonly branch?: BranchName;
  readonly to?: string;
  readonly message?: string;
  readonly author?: string;
  readonly allowEmpty?: boolean;
  readonly expectedHeadHash?: StateHash;
}

export type GraphCompatibilityResult =
  | {
      readonly status: "compatible";
      readonly graphVersion: string;
      readonly schemaFingerprint: string;
    }
  | {
      readonly status: "migration-required";
      readonly fromGraphVersion: string;
      readonly toGraphVersion: string;
      readonly fromSchemaFingerprint: string;
      readonly toSchemaFingerprint: string;
    }
  | {
      readonly status: "incompatible";
      readonly reason: string;
      readonly fromGraphVersion: string;
      readonly toGraphVersion: string;
      readonly fromSchemaFingerprint: string;
      readonly toSchemaFingerprint: string;
    };

export interface AssertCompatibleGraphOptions {
  readonly revision?: RevisionNumber;
  readonly branch?: BranchName;
}

export interface ObjectVcsRepository<TState> {
  getGraphIdentity(): GraphIdentity;
  assertCompatibleGraph(
    options?: AssertCompatibleGraphOptions
  ): Promise<GraphCompatibilityResult>;
  init(options: InitOptions<TState>): Promise<InitResult<TState>>;
  getHead(options?: GetHeadOptions): Promise<Head<TState>>;
  watchHead(
    callback: (head: Head<TState>) => void,
    options?: GetHeadOptions
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
  migrateHead(options?: MigrateHeadOptions): Promise<CommitResult<TState>>;
  listRevisions(options?: ListRevisionsOptions): Promise<RevisionSummary[]>;
  watchRevisions(
    callback: (revisions: RevisionSummary[]) => void,
    options?: ListRevisionsOptions
  ): Unsubscribe;
  tag(name: TagName, options?: TagOptions): Promise<TagRecord>;
  listTags(): Promise<TagRecord[]>;
  deleteTag(
    name: TagName,
    options?: DeleteTagOptions
  ): Promise<DeleteTagResult>;
  listBranches(): Promise<BranchRecord[]>;
  createBranch(
    name: BranchName,
    options: CreateBranchOptions
  ): Promise<BranchRecord>;
  checkout(branch: BranchName): Promise<Head<TState>>;
  restore(
    revision: RevisionNumber,
    options?: RestoreOptions
  ): Promise<UpdateResult<TState>>;
  resetBranch(
    branch: BranchName,
    options: ResetBranchOptions
  ): Promise<BranchRecord>;
}

type EntriesOf<TGraph extends ObjectVcsGraph> =
  TGraph extends ObjectVcsGraph<infer TEntries> ? TEntries : never;

export type SingletonEntryName<TGraph extends ObjectVcsGraph> = {
  [TKey in keyof EntriesOf<TGraph>]: EntriesOf<TGraph>[TKey] extends SingletonGraphEntry<unknown>
    ? TKey
    : never;
}[keyof EntriesOf<TGraph>] & string;

export type CollectionEntryName<TGraph extends ObjectVcsGraph> = {
  [TKey in keyof EntriesOf<TGraph>]: EntriesOf<TGraph>[TKey] extends CollectionGraphEntry<unknown>
    ? TKey
    : never;
}[keyof EntriesOf<TGraph>] & string;

export type CollectionEntityState<TEntry> =
  TEntry extends CollectionGraphEntry<infer TValue> ? TValue : never;

export interface SingletonCrudHelper<TState, TValue> {
  get(options?: GetHeadOptions): Promise<TValue>;
  set(value: TValue, options?: UpdateOptions): Promise<UpdateResult<TState>>;
  update(
    updater: (current: TValue) => TValue,
    options?: UpdateOptions
  ): Promise<UpdateResult<TState>>;
}

export interface EntityCrudHelper<TState, TValue> {
  list(options?: GetHeadOptions): Promise<Record<string, TValue>>;
  get(id: string, options?: GetHeadOptions): Promise<TValue | null>;
  create(
    id: string,
    value: TValue,
    options?: UpdateOptions
  ): Promise<UpdateResult<TState>>;
  update(
    id: string,
    updater: (current: TValue) => TValue,
    options?: UpdateOptions
  ): Promise<UpdateResult<TState>>;
  delete(id: string, options?: UpdateOptions): Promise<UpdateResult<TState>>;
}

export type SingletonCrudHelpers<
  TGraph extends ObjectVcsGraph,
  TState
> = {
  readonly [TKey in SingletonEntryName<TGraph>]: SingletonCrudHelper<
    TState,
    InferEntryState<EntriesOf<TGraph>[TKey]>
  >;
};

export type EntityCrudHelpers<
  TGraph extends ObjectVcsGraph,
  TState
> = {
  readonly [TKey in CollectionEntryName<TGraph>]: EntityCrudHelper<
    TState,
    CollectionEntityState<EntriesOf<TGraph>[TKey]>
  >;
};

export type ObjectVcsTypedRepository<TGraph extends ObjectVcsGraph> =
  ObjectVcsRepository<InferState<TGraph>> & {
    readonly singletons: SingletonCrudHelpers<TGraph, InferState<TGraph>>;
    readonly entities: EntityCrudHelpers<TGraph, InferState<TGraph>>;
  };

export function createRepository<TGraph extends ObjectVcsGraph>(
  options: CreateRepositoryOptions<TGraph>
): ObjectVcsTypedRepository<TGraph> {
  type TState = InferState<TGraph>;

  let activeBranch = options.defaultBranch ?? "main";
  const defaultBranch = options.defaultBranch ?? "main";
  const graphVersion = options.graphVersion ?? "1";
  const graphIdentity = resolveGraphIdentity({
    graph: options.graph,
    graphVersion,
    ...(options.schemaFingerprint === undefined
      ? {}
      : { schemaFingerprint: options.schemaFingerprint }),
    ...(options.schemaFingerprintAlgorithm === undefined
      ? {}
      : { schemaFingerprintAlgorithm: options.schemaFingerprintAlgorithm })
  });
  const migrations = options.migrations ?? [];

  function resolveBranch(branch: BranchName | undefined): BranchName {
    return branch ?? activeBranch;
  }

  function validateState(input: unknown): TState {
    return options.graph.validateState(input) as TState;
  }

  function resolveMigrationTarget(
    migrationOptions: ReadRevisionOptions | GetHeadOptions | undefined
  ): "raw" | "current" | "strict" | string | null {
    const requestedTarget = migrationOptions?.migrateTo;
    if (requestedTarget !== undefined) {
      return requestedTarget;
    }

    if (
      "migration" in (migrationOptions ?? {}) &&
      (migrationOptions as ReadRevisionOptions).migration === "latest"
    ) {
      return "current";
    }

    return null;
  }

  function assertCurrentTarget(targetGraphVersion: string): void {
    if (targetGraphVersion !== graphVersion) {
      throw new ValidationError("Migration target does not match repository graph.", [
        {
          path: ["graphVersion"],
          message: `Repository can validate "${graphVersion}", not "${targetGraphVersion}".`
        }
      ]);
    }
  }

  function resolveTargetGraphVersion(
    target: "current" | "strict" | string
  ): string {
    return target === "current" || target === "strict" ? graphVersion : target;
  }

  function hasMigrationPath(from: string, to: string): boolean {
    if (from === to) {
      return true;
    }

    const visited = new Set<string>([from]);
    const queue = [from];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        break;
      }

      for (const migration of migrations) {
        if (migration.from !== current || visited.has(migration.to)) {
          continue;
        }
        if (migration.to === to) {
          return true;
        }
        visited.add(migration.to);
        queue.push(migration.to);
      }
    }

    return false;
  }

  async function readHeadGraphIdentity(head: Head<TState>): Promise<GraphIdentity> {
    const sourceRevision = head.headRevision ?? head.baseRevision;

    if (sourceRevision !== null) {
      const storedRevision = await options.persistence.readRevision({
        repoId: options.repoId,
        revision: sourceRevision
      });
      if (storedRevision === null) {
        throw new RevisionNotFoundError(
          `Revision "${sourceRevision}" was not found.`
        );
      }
      return {
        graphVersion: storedRevision.revision.graphVersion,
        schemaFingerprint: storedRevision.revision.schemaFingerprint,
        schemaFingerprintAlgorithm:
          storedRevision.revision.schemaFingerprintAlgorithm
      };
    }

    const repo = await options.persistence.getRepo({ repoId: options.repoId });
    if (repo === null) {
      throw new RevisionNotFoundError(
        `Repository "${options.repoId}" was not found.`
      );
    }
    return {
      graphVersion: repo.graphVersion,
      schemaFingerprint: repo.schemaFingerprint,
      schemaFingerprintAlgorithm: repo.schemaFingerprintAlgorithm
    };
  }

  async function validateHead(
    head: Head<TState>,
    getHeadOptions?: GetHeadOptions
  ): Promise<Head<TState>> {
    let stateInput: unknown = head.state;
    const rawStateHash = await hashState(stateInput);

    if (rawStateHash !== head.stateHash) {
      throw new ValidationError("HEAD state hash does not match its state.", [
        {
          path: ["stateHash"],
          message: `Expected "${head.stateHash}", computed "${rawStateHash}".`
        }
      ]);
    }

    const targetGraphVersion = resolveMigrationTarget(getHeadOptions);
    if (targetGraphVersion === "raw") {
      return {
        ...head,
        state: cloneJson(stateInput) as TState
      };
    }

    const sourceGraphIdentity = await readHeadGraphIdentity(head);
    if (
      targetGraphVersion === null ||
      targetGraphVersion === "strict"
    ) {
      if (sourceGraphIdentity.schemaFingerprint !== graphIdentity.schemaFingerprint) {
        throw new SchemaCompatibilityError(
          `HEAD schema fingerprint "${sourceGraphIdentity.schemaFingerprint}" is not compatible with current "${graphIdentity.schemaFingerprint}".`
        );
      }
    } else {
      const resolvedTargetGraphVersion =
        resolveTargetGraphVersion(targetGraphVersion);
      assertCurrentTarget(resolvedTargetGraphVersion);
      if (sourceGraphIdentity.graphVersion !== resolvedTargetGraphVersion) {
        stateInput = migrateState({
          state: stateInput,
          from: sourceGraphIdentity.graphVersion,
          to: resolvedTargetGraphVersion,
          migrations
        });
      }
    }

    const state = validateState(stateInput);
    const stateHash = await hashState(state);

    if (targetGraphVersion === null && stateHash !== head.stateHash) {
      throw new ValidationError("HEAD state hash does not match its state.", [
        {
          path: ["stateHash"],
          message: `Expected "${head.stateHash}", computed "${stateHash}".`
        }
      ]);
    }

    if (head.status === "clean" && head.headRevision === null) {
      throw new ValidationError("Clean HEAD must point to a revision.", [
        {
          path: ["headRevision"],
          message: "Clean HEAD must have a headRevision."
        }
      ]);
    }

    return {
      ...head,
      stateHash,
      state
    };
  }

  async function validateStoredRevision(
    revision: RevisionSummary,
    stateInput: unknown,
    readRevisionOptions?: ReadRevisionOptions
  ): Promise<TState> {
    let nextStateInput = stateInput;
    const rawStateHash = await hashState(stateInput);

    if (rawStateHash !== revision.stateHash) {
      throw new ValidationError("Revision state hash does not match its state.", [
        {
          path: ["stateHash"],
          message: `Expected "${revision.stateHash}", computed "${rawStateHash}".`
        }
      ]);
    }

    const targetGraphVersion = resolveMigrationTarget(readRevisionOptions);
    if (targetGraphVersion === "raw") {
      stableStringify(stateInput);
      return cloneJson(stateInput) as TState;
    }

    if (
      (targetGraphVersion === null || targetGraphVersion === "strict") &&
      revision.schemaFingerprint !== graphIdentity.schemaFingerprint
    ) {
      throw new SchemaCompatibilityError(
        `Revision "${revision.revision}" schema fingerprint "${revision.schemaFingerprint}" is not compatible with current "${graphIdentity.schemaFingerprint}".`
      );
    }

    if (targetGraphVersion !== null && targetGraphVersion !== "strict") {
      const resolvedTargetGraphVersion =
        resolveTargetGraphVersion(targetGraphVersion);
      assertCurrentTarget(resolvedTargetGraphVersion);
      if (revision.graphVersion !== resolvedTargetGraphVersion) {
        nextStateInput = migrateState({
          state: stateInput,
          from: revision.graphVersion,
          to: resolvedTargetGraphVersion,
          migrations
        });
      }
    }

    const state = validateState(nextStateInput);
    return state;
  }

  async function writeUpdate(
    nextStateInput: unknown,
    updateOptions: UpdateOptions = {}
  ): Promise<UpdateResult<TState>> {
    const branchName = resolveBranch(updateOptions.branch);
    const state = validateState(nextStateInput);
    const stateHash = await hashState(state);

    if (updateOptions.commit === true) {
      const result = await options.persistence.createRevision({
        repoId: options.repoId,
        branchName,
        schemaVersion: options.schemaVersion,
        graphIdentity,
        state,
        stateHash,
        ...(updateOptions.message === undefined
          ? {}
          : { message: updateOptions.message }),
        ...(updateOptions.author === undefined
          ? {}
          : { author: updateOptions.author }),
        ...(updateOptions.expectedHeadHash === undefined
          ? {}
          : { expectedHeadHash: updateOptions.expectedHeadHash })
      });
      return {
        head: result.head,
        revision: result.revision,
        createdRevision: result.created
      };
    }

    const result = await options.persistence.writeHead({
      repoId: options.repoId,
      branchName,
      state,
      stateHash,
      ...(updateOptions.author === undefined
        ? {}
        : { author: updateOptions.author }),
      ...(updateOptions.expectedHeadHash === undefined
        ? {}
        : { expectedHeadHash: updateOptions.expectedHeadHash }),
      ...(updateOptions.concurrency === undefined
        ? {}
        : { concurrency: updateOptions.concurrency })
    });

    return {
      head: result.head,
      createdRevision: false
    };
  }

  function withDefaultExpectedHeadHash<TOptions extends UpdateOptions>(
    updateOptions: TOptions,
    head: Head<TState>
  ): TOptions {
    if (
      updateOptions.expectedHeadHash !== undefined ||
      updateOptions.concurrency === "last-write-wins"
    ) {
      return updateOptions;
    }

    return {
      ...updateOptions,
      expectedHeadHash: head.stateHash
    };
  }

  const repository: ObjectVcsRepository<TState> = {
    getGraphIdentity(): GraphIdentity {
      return graphIdentity;
    },

    async assertCompatibleGraph(
      compatibilityOptions: AssertCompatibleGraphOptions = {}
    ): Promise<GraphCompatibilityResult> {
      let sourceIdentity: GraphIdentity;

      if (compatibilityOptions.revision !== undefined) {
        const storedRevision = await options.persistence.readRevision({
          repoId: options.repoId,
          revision: compatibilityOptions.revision
        });
        if (storedRevision === null) {
          throw new RevisionNotFoundError(
            `Revision "${compatibilityOptions.revision}" was not found.`
          );
        }
        sourceIdentity = {
          graphVersion: storedRevision.revision.graphVersion,
          schemaFingerprint: storedRevision.revision.schemaFingerprint,
          schemaFingerprintAlgorithm:
            storedRevision.revision.schemaFingerprintAlgorithm
        };
      } else {
        const branchName = resolveBranch(compatibilityOptions.branch);
        const head = await options.persistence.getHead({
          repoId: options.repoId,
          branchName
        });
        if (head === null) {
          throw new BranchNotFoundError(
            `HEAD for branch "${branchName}" was not found.`
          );
        }
        sourceIdentity = await readHeadGraphIdentity(head);
      }

      if (sourceIdentity.schemaFingerprint === graphIdentity.schemaFingerprint) {
        return {
          status: "compatible",
          graphVersion: sourceIdentity.graphVersion,
          schemaFingerprint: sourceIdentity.schemaFingerprint
        };
      }

      if (hasMigrationPath(sourceIdentity.graphVersion, graphIdentity.graphVersion)) {
        return {
          status: "migration-required",
          fromGraphVersion: sourceIdentity.graphVersion,
          toGraphVersion: graphIdentity.graphVersion,
          fromSchemaFingerprint: sourceIdentity.schemaFingerprint,
          toSchemaFingerprint: graphIdentity.schemaFingerprint
        };
      }

      return {
        status: "incompatible",
        reason: "Schema fingerprints differ and no migration path is available.",
        fromGraphVersion: sourceIdentity.graphVersion,
        toGraphVersion: graphIdentity.graphVersion,
        fromSchemaFingerprint: sourceIdentity.schemaFingerprint,
        toSchemaFingerprint: graphIdentity.schemaFingerprint
      };
    },

    async init(initOptions: InitOptions<TState>): Promise<InitResult<TState>> {
      activeBranch = initOptions.branch ?? defaultBranch;
      const initialState = validateState(initOptions.initialState);
      const stateHash = await hashState(initialState);
      const result = await options.persistence.createRepo({
        repoId: options.repoId,
        schemaVersion: options.schemaVersion,
        graphVersion,
        schemaFingerprint: graphIdentity.schemaFingerprint,
        schemaFingerprintAlgorithm: graphIdentity.schemaFingerprintAlgorithm,
        defaultBranch: activeBranch,
        storageMode: "snapshot",
        initialState,
        stateHash,
        commit: initOptions.commit !== false,
        ...(initOptions.message === undefined
          ? {}
          : { message: initOptions.message }),
        ...(initOptions.author === undefined ? {} : { author: initOptions.author })
      });

      return {
        head: result.head,
        ...(result.revision === undefined ? {} : { revision: result.revision })
      };
    },

    async getHead(
      getHeadOptions: GetHeadOptions = {}
    ): Promise<Head<TState>> {
      const branchName = resolveBranch(getHeadOptions.branch);
      const head = await options.persistence.getHead({
        repoId: options.repoId,
        branchName
      });

      if (head === null) {
        throw new BranchNotFoundError(
          `HEAD for branch "${branchName}" was not found.`
        );
      }

      return validateHead(head, getHeadOptions);
    },

    watchHead(
      callback: (head: Head<TState>) => void,
      watchOptions: GetHeadOptions = {}
    ): Unsubscribe {
      if (options.persistence.subscribeHead === undefined) {
        throw new PersistenceError("Persistence adapter does not support watchHead.");
      }

      const branchName = resolveBranch(watchOptions.branch);
      return options.persistence.subscribeHead(
        {
          repoId: options.repoId,
          branchName
        },
        head => {
          void validateHead(head, watchOptions).then(callback);
        }
      );
    },

    async update(
      updater: (current: TState) => TState,
      updateOptions: UpdateOptions = {}
    ): Promise<UpdateResult<TState>> {
      const current = await repository.getHead(
        updateOptions.branch === undefined
          ? {}
          : { branch: updateOptions.branch }
      );
      return writeUpdate(
        updater(cloneJson(current.state)),
        withDefaultExpectedHeadHash(updateOptions, current)
      );
    },

    async edit(
      recipe: (draft: TState) => void,
      updateOptions: UpdateOptions = {}
    ): Promise<UpdateResult<TState>> {
      const current = await repository.getHead(
        updateOptions.branch === undefined
          ? {}
          : { branch: updateOptions.branch }
      );
      const draft = cloneJson(current.state);
      recipe(draft);
      return writeUpdate(
        draft,
        withDefaultExpectedHeadHash(updateOptions, current)
      );
    },

    async commit(
      commitOptions: CommitOptions = {}
    ): Promise<CommitResult<TState>> {
      const branchName = resolveBranch(commitOptions.branch);
      const head = await repository.getHead({ branch: branchName });
      const result = await options.persistence.createRevision({
        repoId: options.repoId,
        branchName,
        schemaVersion: options.schemaVersion,
        graphIdentity,
        state: head.state,
        stateHash: head.stateHash,
        ...(commitOptions.message === undefined
          ? {}
          : { message: commitOptions.message }),
        ...(commitOptions.author === undefined
          ? {}
          : { author: commitOptions.author }),
        ...(commitOptions.allowEmpty === undefined
          ? {}
          : { allowEmpty: commitOptions.allowEmpty }),
        expectedHeadHash: commitOptions.expectedHeadHash ?? head.stateHash
      });

      return {
        head: result.head,
        revision: result.revision,
        created: result.created
      };
    },

    async readRevision(
      revision: RevisionNumber,
      readRevisionOptions: ReadRevisionOptions = {}
    ): Promise<TState> {
      const storedRevision = await options.persistence.readRevision({
        repoId: options.repoId,
        revision
      });

      if (storedRevision === null) {
        throw new RevisionNotFoundError(`Revision "${revision}" was not found.`);
      }

      return cloneJson(
        await validateStoredRevision(
          storedRevision.revision,
          storedRevision.state,
          readRevisionOptions
        )
      );
    },

    async migrateHead(
      migrateOptions: MigrateHeadOptions = {}
    ): Promise<CommitResult<TState>> {
      const branchName = resolveBranch(migrateOptions.branch);
      const rawHead = await options.persistence.getHead({
        repoId: options.repoId,
        branchName
      });

      if (rawHead === null) {
        throw new BranchNotFoundError(
          `HEAD for branch "${branchName}" was not found.`
        );
      }

      const sourceGraphIdentity = await readHeadGraphIdentity(rawHead);
      const targetGraphVersion = migrateOptions.to ?? graphVersion;
      assertCurrentTarget(targetGraphVersion);
      const migratedHead = await validateHead(rawHead, {
        branch: branchName,
        migrateTo: targetGraphVersion
      });
      const result = await options.persistence.createRevision({
        repoId: options.repoId,
        branchName,
        schemaVersion: options.schemaVersion,
        graphIdentity,
        state: migratedHead.state,
        stateHash: migratedHead.stateHash,
        message:
          migrateOptions.message ??
          `Migrate graph ${sourceGraphIdentity.graphVersion} -> ${targetGraphVersion}`,
        ...(migrateOptions.author === undefined
          ? {}
          : { author: migrateOptions.author }),
        allowEmpty:
          migrateOptions.allowEmpty ??
          (sourceGraphIdentity.graphVersion !== targetGraphVersion ||
            sourceGraphIdentity.schemaFingerprint !== graphIdentity.schemaFingerprint),
        expectedHeadHash: migrateOptions.expectedHeadHash ?? rawHead.stateHash
      });

      return {
        head: result.head,
        revision: result.revision,
        created: result.created
      };
    },

    async listRevisions(
      listOptions: ListRevisionsOptions = {}
    ): Promise<RevisionSummary[]> {
      return options.persistence.listRevisions({
        repoId: options.repoId,
        ...(listOptions.branch === undefined
          ? {}
          : { branchName: listOptions.branch }),
        ...(listOptions.limit === undefined ? {} : { limit: listOptions.limit }),
        ...(listOptions.after === undefined ? {} : { after: listOptions.after }),
        ...(listOptions.order === undefined ? {} : { order: listOptions.order })
      });
    },

    watchRevisions(
      callback: (revisions: RevisionSummary[]) => void,
      watchOptions: ListRevisionsOptions = {}
    ): Unsubscribe {
      if (options.persistence.subscribeRevisions === undefined) {
        throw new PersistenceError(
          "Persistence adapter does not support watchRevisions."
        );
      }

      return options.persistence.subscribeRevisions(
        {
          repoId: options.repoId,
          ...(watchOptions.branch === undefined
            ? {}
            : { branchName: watchOptions.branch }),
          ...(watchOptions.limit === undefined ? {} : { limit: watchOptions.limit }),
          ...(watchOptions.after === undefined ? {} : { after: watchOptions.after }),
          ...(watchOptions.order === undefined ? {} : { order: watchOptions.order })
        },
        revisions => {
          callback([...revisions]);
        }
      );
    },

    async tag(name: TagName, tagOptions: TagOptions = {}): Promise<TagRecord> {
      const branchName = resolveBranch(tagOptions.branch);
      let revision = tagOptions.revision;

      if (revision === undefined || revision === "HEAD") {
        const head = await repository.getHead({ branch: branchName });
        if (head.status === "dirty") {
          if (tagOptions.createRevisionIfDirty === false) {
            throw new DirtyHeadError(
              "Cannot tag a dirty HEAD when createRevisionIfDirty is false."
            );
          }
          const commitResult = await repository.commit({
            branch: branchName,
            message: `Create revision for tag ${name}`,
            ...(tagOptions.author === undefined
              ? {}
              : { author: tagOptions.author })
          });
          revision = commitResult.revision.revision;
        } else {
          if (head.headRevision === null) {
            throw new RevisionNotFoundError("Cannot tag an empty HEAD.");
          }
          revision = head.headRevision;
        }
      }

      if (revision === undefined || revision === null) {
        throw new RevisionNotFoundError("Cannot tag an empty HEAD.");
      }

      return options.persistence.createTag({
        repoId: options.repoId,
        name,
        revision,
        branchName,
        ...(tagOptions.annotation === undefined
          ? {}
          : { annotation: tagOptions.annotation }),
        ...(tagOptions.author === undefined ? {} : { author: tagOptions.author }),
        ...(tagOptions.overwrite === undefined
          ? {}
          : { overwrite: tagOptions.overwrite })
      });
    },

    async listTags(): Promise<TagRecord[]> {
      return options.persistence.listTags({
        repoId: options.repoId
      });
    },

    async deleteTag(
      name: TagName,
      deleteTagOptions: DeleteTagOptions = {}
    ): Promise<DeleteTagResult> {
      return options.persistence.deleteTag({
        repoId: options.repoId,
        name,
        missing: deleteTagOptions.missing ?? "throw",
        ...(deleteTagOptions.expectedRevision === undefined
          ? {}
          : { expectedRevision: deleteTagOptions.expectedRevision }),
        ...(deleteTagOptions.author === undefined
          ? {}
          : { author: deleteTagOptions.author })
      });
    },

    async listBranches(): Promise<BranchRecord[]> {
      return options.persistence.listBranches({
        repoId: options.repoId
      });
    },

    async createBranch(
      name: BranchName,
      createBranchOptions: CreateBranchOptions
    ): Promise<BranchRecord> {
      const branch = await options.persistence.createBranch({
        repoId: options.repoId,
        name,
        from: createBranchOptions.from,
        sourceBranch: activeBranch,
        ...(createBranchOptions.checkout === undefined
          ? {}
          : { checkout: createBranchOptions.checkout }),
        ...(createBranchOptions.author === undefined
          ? {}
          : { author: createBranchOptions.author })
      });

      if (createBranchOptions.checkout === true) {
        activeBranch = name;
      }

      return branch;
    },

    async checkout(branch: BranchName): Promise<Head<TState>> {
      const head = await options.persistence.getHead({
        repoId: options.repoId,
        branchName: branch
      });

      if (head === null) {
        throw new BranchNotFoundError(`Branch "${branch}" was not found.`);
      }

      activeBranch = branch;
      return head;
    },

    async restore(
      revision: RevisionNumber,
      restoreOptions: RestoreOptions = {}
    ): Promise<UpdateResult<TState>> {
      const branchName = resolveBranch(restoreOptions.branch);
      const head = await repository.getHead({ branch: branchName });
      const state = await repository.readRevision(revision);
      return writeUpdate(state, {
        branch: branchName,
        ...(restoreOptions.commit === undefined
          ? {}
          : { commit: restoreOptions.commit }),
        ...(restoreOptions.message === undefined
          ? {}
          : { message: restoreOptions.message }),
        ...(restoreOptions.author === undefined
          ? {}
          : { author: restoreOptions.author }),
        expectedHeadHash: restoreOptions.expectedHeadHash ?? head.stateHash
      });
    },

    async resetBranch(
      branch: BranchName,
      resetOptions: ResetBranchOptions
    ): Promise<BranchRecord> {
      if (resetOptions.mode !== "hard") {
        throw new PersistenceError('resetBranch only supports mode "hard".');
      }

      return options.persistence.resetBranch({
        repoId: options.repoId,
        branchName: branch,
        to: resetOptions.to,
        mode: resetOptions.mode,
        ...(resetOptions.author === undefined ? {} : { author: resetOptions.author }),
        ...(resetOptions.expectedHeadHash === undefined
          ? {}
          : { expectedHeadHash: resetOptions.expectedHeadHash })
      });
    }
  };

  const crudHelpers = createCrudHelpers(options.graph, repository);

  return {
    ...repository,
    singletons: crudHelpers.singletons,
    entities: crudHelpers.entities
  };
}

function createCrudHelpers<TGraph extends ObjectVcsGraph>(
  graph: TGraph,
  repository: ObjectVcsRepository<InferState<TGraph>>
): Pick<ObjectVcsTypedRepository<TGraph>, "singletons" | "entities"> {
  type TState = InferState<TGraph>;

  const singletons: Partial<Record<string, SingletonCrudHelper<TState, unknown>>> =
    {};
  const entities: Partial<Record<string, EntityCrudHelper<TState, unknown>>> = {};

  for (const [entryName, entry] of Object.entries(graph.entries as GraphEntries)) {
    if (entry.kind === "singleton") {
      singletons[entryName] = createSingletonCrudHelper(entryName, repository);
      continue;
    }

    entities[entryName] = createEntityCrudHelper(entryName, repository);
  }

  return {
    singletons: singletons as SingletonCrudHelpers<TGraph, TState>,
    entities: entities as EntityCrudHelpers<TGraph, TState>
  };
}

function createSingletonCrudHelper<TState, TValue>(
  entryName: string,
  repository: ObjectVcsRepository<TState>
): SingletonCrudHelper<TState, TValue> {
  return {
    async get(options: GetHeadOptions = {}): Promise<TValue> {
      const head = await repository.getHead(options);
      return cloneJson(readStateEntry(head.state, entryName) as TValue);
    },

    async set(
      value: TValue,
      options: UpdateOptions = {}
    ): Promise<UpdateResult<TState>> {
      return repository.update(
        current => writeStateEntry(current, entryName, value),
        options
      );
    },

    async update(
      updater: (current: TValue) => TValue,
      options: UpdateOptions = {}
    ): Promise<UpdateResult<TState>> {
      return repository.update(current => {
        const value = cloneJson(readStateEntry(current, entryName) as TValue);
        return writeStateEntry(current, entryName, updater(value));
      }, options);
    }
  };
}

function createEntityCrudHelper<TState, TValue>(
  entryName: string,
  repository: ObjectVcsRepository<TState>
): EntityCrudHelper<TState, TValue> {
  return {
    async list(options: GetHeadOptions = {}): Promise<Record<string, TValue>> {
      const head = await repository.getHead(options);
      return cloneJson(readCollectionEntry<TValue>(head.state, entryName));
    },

    async get(id: string, options: GetHeadOptions = {}): Promise<TValue | null> {
      const head = await repository.getHead(options);
      const collection = readCollectionEntry<TValue>(head.state, entryName);

      if (!Object.hasOwn(collection, id)) {
        return null;
      }

      return cloneJson(collection[id] as TValue);
    },

    async create(
      id: string,
      value: TValue,
      options: UpdateOptions = {}
    ): Promise<UpdateResult<TState>> {
      return repository.update(current => {
        const collection = readCollectionEntry<TValue>(current, entryName);

        if (Object.hasOwn(collection, id)) {
          throw new EntityAlreadyExistsError(
            `Entity "${id}" already exists in collection "${entryName}".`
          );
        }

        return writeStateEntry(current, entryName, {
          ...collection,
          [id]: value
        });
      }, options);
    },

    async update(
      id: string,
      updater: (current: TValue) => TValue,
      options: UpdateOptions = {}
    ): Promise<UpdateResult<TState>> {
      return repository.update(current => {
        const collection = readCollectionEntry<TValue>(current, entryName);

        if (!Object.hasOwn(collection, id)) {
          throw new EntityNotFoundError(
            `Entity "${id}" was not found in collection "${entryName}".`
          );
        }

        return writeStateEntry(current, entryName, {
          ...collection,
          [id]: updater(cloneJson(collection[id] as TValue))
        });
      }, options);
    },

    async delete(
      id: string,
      options: UpdateOptions = {}
    ): Promise<UpdateResult<TState>> {
      return repository.update(current => {
        const collection = readCollectionEntry<TValue>(current, entryName);

        if (!Object.hasOwn(collection, id)) {
          throw new EntityNotFoundError(
            `Entity "${id}" was not found in collection "${entryName}".`
          );
        }

        const nextCollection = Object.fromEntries(
          Object.entries(collection).filter(([entityId]) => entityId !== id)
        ) as Record<string, TValue>;

        return writeStateEntry(current, entryName, nextCollection);
      }, options);
    }
  };
}

function readStateEntry<TState>(state: TState, entryName: string): unknown {
  return (state as object as Record<string, unknown>)[entryName];
}

function writeStateEntry<TState>(
  state: TState,
  entryName: string,
  value: unknown
): TState {
  return {
    ...(state as object as Record<string, unknown>),
    [entryName]: value
  } as TState;
}

function readCollectionEntry<TValue>(
  state: unknown,
  entryName: string
): Record<string, TValue> {
  const value = readStateEntry(state, entryName);

  if (!isRecord(value)) {
    throw new EntityNotFoundError(
      `Collection "${entryName}" was not found on the current state.`
    );
  }

  return value as Record<string, TValue>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
