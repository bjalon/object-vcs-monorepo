import {
  BranchNotFoundError,
  DirtyHeadError,
  RevisionNotFoundError
} from "./errors.js";
import type { ObjectVcsGraph, InferState } from "./graph.js";
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

export function createRepository<TGraph extends ObjectVcsGraph>(
  options: CreateRepositoryOptions<TGraph>
): ObjectVcsRepository<InferState<TGraph>> {
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
        : { expectedHeadHash: updateOptions.expectedHeadHash })
    });

    return {
      head: result.head,
      createdRevision: false
    };
  }

  return {
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
      const current = await this.getHead(
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
      const current = await this.getHead(
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
      const head = await this.getHead({ branch: branchName });
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
        const head = await this.getHead({ branch: branchName });
        if (head.status === "dirty") {
          if (tagOptions.createRevisionIfDirty !== true) {
            throw new DirtyHeadError(
              "Cannot tag a dirty HEAD unless createRevisionIfDirty is true."
            );
          }
          const commitResult = await this.commit({
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
      const state = await this.readRevision(revision);
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
}
