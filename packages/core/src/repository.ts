import {
  BranchNotFoundError,
  DirtyHeadError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  RevisionNotFoundError
} from "./errors.js";
import type {
  CollectionGraphEntry,
  GraphEntries,
  InferEntryState,
  InferState,
  ObjectVcsGraph,
  SingletonGraphEntry
} from "./graph.js";
import { hashState } from "./hash.js";
import { cloneJson } from "./json.js";
import type {
  BranchRecord,
  BranchName,
  Head,
  RepositoryId,
  RevisionNumber,
  StateHash,
  TagName,
  TagRecord
} from "./types.js";
import type {
  PersistenceAdapter,
  RevisionSummary
} from "./persistence.js";

export interface CreateRepositoryOptions<TGraph extends ObjectVcsGraph> {
  readonly repoId: RepositoryId;
  readonly graph: TGraph;
  readonly schemaVersion: number;
  readonly graphVersion?: string;
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
  readonly migration?: "raw" | "latest" | "strict";
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
}

export interface ResetBranchOptions {
  readonly to: RevisionNumber;
  readonly mode: "hard";
  readonly author?: string;
  readonly expectedHeadHash?: StateHash;
}

export interface ObjectVcsRepository<TState> {
  init(options: InitOptions<TState>): Promise<InitResult<TState>>;
  getHead(options?: GetHeadOptions): Promise<Head<TState>>;
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
  listRevisions(options?: ListRevisionsOptions): Promise<RevisionSummary[]>;
  tag(name: TagName, options?: TagOptions): Promise<TagRecord>;
  listTags(): Promise<TagRecord[]>;
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

  function resolveBranch(branch: BranchName | undefined): BranchName {
    return branch ?? activeBranch;
  }

  function validateState(input: unknown): TState {
    return options.graph.validateState(input) as TState;
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

  const repository: ObjectVcsRepository<TState> = {
    async init(initOptions: InitOptions<TState>): Promise<InitResult<TState>> {
      activeBranch = initOptions.branch ?? defaultBranch;
      const initialState = validateState(initOptions.initialState);
      const stateHash = await hashState(initialState);
      const result = await options.persistence.createRepo({
        repoId: options.repoId,
        schemaVersion: options.schemaVersion,
        graphVersion,
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

      return head;
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
      return writeUpdate(updater(cloneJson(current.state)), updateOptions);
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
      return writeUpdate(draft, updateOptions);
    },

    async commit(
      commitOptions: CommitOptions = {}
    ): Promise<CommitResult<TState>> {
      const branchName = resolveBranch(commitOptions.branch);
      const head = await repository.getHead({ branch: branchName });
      const result = await options.persistence.createRevision({
        repoId: options.repoId,
        branchName,
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
        ...(commitOptions.expectedHeadHash === undefined
          ? {}
          : { expectedHeadHash: commitOptions.expectedHeadHash })
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
      void readRevisionOptions;
      const state = await options.persistence.readRevisionState({
        repoId: options.repoId,
        revision
      });

      if (state === null) {
        throw new RevisionNotFoundError(`Revision "${revision}" was not found.`);
      }

      return cloneJson(state);
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

    async tag(name: TagName, tagOptions: TagOptions = {}): Promise<TagRecord> {
      const branchName = resolveBranch(tagOptions.branch);
      let revision = tagOptions.revision;

      if (revision === undefined || revision === "HEAD") {
        const head = await repository.getHead({ branch: branchName });
        if (head.status === "dirty") {
          if (tagOptions.createRevisionIfDirty !== true) {
            throw new DirtyHeadError(
              "Cannot tag a dirty HEAD unless createRevisionIfDirty is true."
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
          : { author: restoreOptions.author })
      });
    },

    async resetBranch(
      branch: BranchName,
      resetOptions: ResetBranchOptions
    ): Promise<BranchRecord> {
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
