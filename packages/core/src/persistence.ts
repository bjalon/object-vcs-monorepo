import type {
  BranchName,
  BranchRecord,
  Head,
  RepositoryId,
  RevisionNumber,
  RevisionRecord,
  StateHash,
  StorageMode,
  TagName,
  TagRecord
} from "./types.js";

export interface RepoRecord {
  readonly repoId: RepositoryId;
  readonly schemaVersion: number;
  readonly graphVersion: string;
  readonly defaultBranch: BranchName;
  readonly storageMode: StorageMode;
  readonly nextRevision: RevisionNumber;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type RevisionSummary = RevisionRecord;

export interface StoredRevision<TState> {
  readonly revision: RevisionRecord;
  readonly state: TState;
}

export type StoredHead<TState> = Head<TState>;

export type Unsubscribe = () => void;

export interface GetRepoInput {
  readonly repoId: RepositoryId;
}

export interface CreateRepoInput<TState> {
  readonly repoId: RepositoryId;
  readonly schemaVersion: number;
  readonly graphVersion: string;
  readonly defaultBranch: BranchName;
  readonly storageMode: StorageMode;
  readonly initialState: TState;
  readonly commit: boolean;
  readonly message?: string;
  readonly author?: string;
}

export interface CreateRepoResult<TState> {
  readonly repo: RepoRecord;
  readonly head: Head<TState>;
  readonly revision?: RevisionRecord;
}

export interface GetBranchInput {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
}

export interface ListBranchesInput {
  readonly repoId: RepositoryId;
}

export interface WriteHeadInput<TState> {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
  readonly state: TState;
  readonly stateHash: StateHash;
  readonly expectedHeadHash?: StateHash;
  readonly baseRevision?: RevisionNumber | null;
  readonly author?: string;
}

export interface WriteHeadResult<TState> {
  readonly head: Head<TState>;
}

export interface CreateRevisionInput<TState> {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
  readonly state: TState;
  readonly stateHash: StateHash;
  readonly message?: string;
  readonly author?: string;
  readonly allowEmpty?: boolean;
  readonly expectedHeadHash?: StateHash;
}

export interface CreateRevisionResult<TState> {
  readonly revision: RevisionRecord;
  readonly head: Head<TState>;
  readonly created: boolean;
}

export interface ReadRevisionInput {
  readonly repoId: RepositoryId;
  readonly revision: RevisionNumber;
}

export type ReadRevisionStateInput = ReadRevisionInput;

export interface ListRevisionsInput {
  readonly repoId: RepositoryId;
  readonly branchName?: BranchName;
  readonly limit?: number;
  readonly after?: RevisionNumber;
  readonly order?: "asc" | "desc";
}

export interface CreateTagInput {
  readonly repoId: RepositoryId;
  readonly name: TagName;
  readonly revision?: RevisionNumber | "HEAD";
  readonly branchName?: BranchName;
  readonly annotation?: string;
  readonly author?: string;
  readonly createRevisionIfDirty?: boolean;
  readonly overwrite?: boolean;
  readonly expectedHeadHash?: StateHash;
}

export interface ListTagsInput {
  readonly repoId: RepositoryId;
}

export interface CreateBranchInput {
  readonly repoId: RepositoryId;
  readonly name: BranchName;
  readonly from: RevisionNumber | "HEAD";
  readonly sourceBranch?: BranchName;
  readonly checkout?: boolean;
  readonly author?: string;
}

export interface UpdateBranchInput {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
  readonly headRevision: RevisionNumber | null;
  readonly baseRevision: RevisionNumber | null;
  readonly headStateHash: StateHash;
  readonly status: "clean" | "dirty";
  readonly author?: string;
}

export interface RestoreRevisionInput<TState> {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
  readonly revision: RevisionNumber;
  readonly state: TState;
  readonly stateHash: StateHash;
  readonly commit?: boolean;
  readonly message?: string;
  readonly author?: string;
  readonly expectedHeadHash?: StateHash;
}

export interface ResetBranchInput {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
  readonly to: RevisionNumber;
  readonly mode: "hard";
  readonly author?: string;
  readonly expectedHeadHash?: StateHash;
}

export interface SubscribeHeadInput {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
}

export type SubscribeRevisionsInput = ListRevisionsInput;

export interface PersistenceAdapter<TState> {
  getRepo(input: GetRepoInput): Promise<RepoRecord | null>;
  createRepo(input: CreateRepoInput<TState>): Promise<CreateRepoResult<TState>>;
  getBranch(input: GetBranchInput): Promise<BranchRecord | null>;
  listBranches(input: ListBranchesInput): Promise<BranchRecord[]>;
  writeHead(input: WriteHeadInput<TState>): Promise<WriteHeadResult<TState>>;
  createRevision(
    input: CreateRevisionInput<TState>
  ): Promise<CreateRevisionResult<TState>>;
  readRevision(
    input: ReadRevisionInput
  ): Promise<StoredRevision<TState> | null>;
  readRevisionState(input: ReadRevisionStateInput): Promise<TState | null>;
  listRevisions(input: ListRevisionsInput): Promise<RevisionSummary[]>;
  createTag(input: CreateTagInput): Promise<TagRecord>;
  listTags(input: ListTagsInput): Promise<TagRecord[]>;
  createBranch(input: CreateBranchInput): Promise<BranchRecord>;
  updateBranch(input: UpdateBranchInput): Promise<BranchRecord>;
  restoreRevision(
    input: RestoreRevisionInput<TState>
  ): Promise<WriteHeadResult<TState>>;
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
