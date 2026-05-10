import type {
  BranchName,
  BranchRecord,
  ConcurrencyMode,
  GraphIdentity,
  Head,
  HeadStatus,
  RepositoryId,
  RevisionNumber,
  RevisionRecord,
  SchemaFingerprintAlgorithm,
  StateHash,
  StorageMode,
  TagName,
  TagRecord
} from "./types.js";

export interface RepoRecord {
  readonly repoId: RepositoryId;
  readonly schemaVersion: number;
  readonly graphVersion: string;
  readonly schemaFingerprint: string;
  readonly schemaFingerprintAlgorithm: SchemaFingerprintAlgorithm;
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
  readonly schemaFingerprint: string;
  readonly schemaFingerprintAlgorithm: SchemaFingerprintAlgorithm;
  readonly defaultBranch: BranchName;
  readonly storageMode: StorageMode;
  readonly initialState: TState;
  readonly stateHash: StateHash;
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

export interface GetHeadInput {
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
  readonly concurrency?: ConcurrencyMode;
}

export interface WriteHeadResult<TState> {
  readonly head: Head<TState>;
}

export interface CreateRevisionInput<TState> {
  readonly repoId: RepositoryId;
  readonly branchName: BranchName;
  readonly schemaVersion?: number;
  readonly graphVersion?: string;
  readonly graphIdentity?: GraphIdentity;
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

export interface DeleteTagInput {
  readonly repoId: RepositoryId;
  readonly name: TagName;
  readonly missing?: "throw" | "ignore";
  readonly expectedRevision?: RevisionNumber;
  readonly author?: string;
}

export interface DeleteTagResult {
  readonly deleted: boolean;
  readonly name: TagName;
  readonly previousRevision: RevisionNumber | null;
}

export interface StorageEstimate {
  readonly bytes: number;
  readonly documents: number;
  readonly blobs: number;
}

export type GarbageCollectionStrategy = "unreachable-snapshots-v1";

export interface PlanGarbageCollectionOptions {
  readonly beforeRevision?: RevisionNumber;
  readonly keepTagged?: true;
  readonly keepBranchHeads?: true;
  readonly keepDirtyBaseRevisions?: true;
  readonly includeOrphanBlobs?: boolean;
  readonly protectRevisions?: readonly RevisionNumber[];
  readonly maxRevisionsToDelete?: number;
  readonly estimateStorage?: boolean;
}

export interface RequiredGarbageCollectionPlanOptions {
  readonly beforeRevision: RevisionNumber | null;
  readonly keepTagged: true;
  readonly keepBranchHeads: true;
  readonly keepDirtyBaseRevisions: true;
  readonly includeOrphanBlobs: boolean;
  readonly protectRevisions: readonly RevisionNumber[];
  readonly maxRevisionsToDelete: number | null;
  readonly estimateStorage: boolean;
}

export type ProtectedRevisionReason =
  | "tagged"
  | "branch-head"
  | "dirty-base-revision"
  | "branch-base-revision"
  | "explicitly-protected"
  | "ancestor-of-protected-revision";

export interface ProtectedRevision {
  readonly revision: RevisionNumber;
  readonly reasons: readonly ProtectedRevisionReason[];
}

export interface DeletableRevision {
  readonly revision: RevisionNumber;
  readonly parentRevision: RevisionNumber | null;
  readonly branchName: BranchName;
  readonly stateHash: StateHash;
  readonly snapshotBlobRef?: string;
  readonly estimatedStorage: StorageEstimate;
}

export type BlockedRevisionReason =
  | "tagged"
  | "branch-head"
  | "dirty-base-revision"
  | "branch-base-revision"
  | "explicitly-protected"
  | "ancestor-of-protected-revision"
  | "after-before-revision-threshold"
  | "unknown-parent"
  | "missing-metadata";

export interface BlockedRevision {
  readonly revision: RevisionNumber;
  readonly reasons: readonly BlockedRevisionReason[];
}

export interface GarbageCollectableBlob {
  readonly blobRef: string;
  readonly reason: "orphan";
  readonly estimatedStorage: StorageEstimate;
}

export interface GarbageCollectionRefsSnapshot {
  readonly tags: readonly {
    readonly name: TagName;
    readonly revision: RevisionNumber;
  }[];
  readonly branches: readonly {
    readonly name: BranchName;
    readonly headRevision: RevisionNumber | null;
    readonly baseRevision: RevisionNumber | null;
    readonly status: HeadStatus;
    readonly headBlobRef?: string;
  }[];
  readonly latestRevision: RevisionNumber | null;
}

export interface GarbageCollectionPlan {
  readonly planId: string;
  readonly repoId: RepositoryId;
  readonly strategy: GarbageCollectionStrategy;
  readonly createdAt: string;
  readonly options: RequiredGarbageCollectionPlanOptions;
  readonly protectedRevisions: readonly ProtectedRevision[];
  readonly deletableRevisions: readonly DeletableRevision[];
  readonly blockedRevisions: readonly BlockedRevision[];
  readonly orphanBlobs: readonly GarbageCollectableBlob[];
  readonly estimatedFreedStorage: StorageEstimate;
  readonly refsSnapshot: GarbageCollectionRefsSnapshot;
  readonly refsSnapshotHash: string;
}

export interface RunGarbageCollectionOptions {
  readonly dryRun?: boolean;
  readonly recomputeBeforeRun?: true;
  readonly allowStalePlan?: false;
  readonly author?: string;
}

export interface GarbageCollectionRunResult {
  readonly planId: string;
  readonly repoId: RepositoryId;
  readonly dryRun: boolean;
  readonly deletedRevisions: readonly RevisionNumber[];
  readonly deletedBlobs: readonly string[];
  readonly skippedRevisions: readonly BlockedRevision[];
  readonly skippedBlobs: readonly {
    readonly blobRef: string;
    readonly reason: "still-referenced" | "missing" | "adapter-error";
  }[];
  readonly freedStorageEstimate: StorageEstimate;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface PersistencePlanGarbageCollectionInput
  extends PlanGarbageCollectionOptions {
  readonly repoId: RepositoryId;
}

export interface PersistenceRunGarbageCollectionInput
  extends RunGarbageCollectionOptions {
  readonly repoId: RepositoryId;
  readonly plan: GarbageCollectionPlan;
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
  readonly headBlobRef?: string;
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
export type SubscribeTagsInput = ListTagsInput;
export type SubscribeBranchesInput = ListBranchesInput;

export interface PersistenceAdapter<TState> {
  getRepo(input: GetRepoInput): Promise<RepoRecord | null>;
  createRepo(input: CreateRepoInput<TState>): Promise<CreateRepoResult<TState>>;
  getBranch(input: GetBranchInput): Promise<BranchRecord | null>;
  getHead(input: GetHeadInput): Promise<Head<TState> | null>;
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
  deleteTag(input: DeleteTagInput): Promise<DeleteTagResult>;
  planGarbageCollection?(
    input: PersistencePlanGarbageCollectionInput
  ): Promise<GarbageCollectionPlan>;
  runGarbageCollection?(
    input: PersistenceRunGarbageCollectionInput
  ): Promise<GarbageCollectionRunResult>;
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
  subscribeTags?(
    input: SubscribeTagsInput,
    callback: (items: TagRecord[]) => void
  ): Unsubscribe;
  subscribeBranches?(
    input: SubscribeBranchesInput,
    callback: (items: BranchRecord[]) => void
  ): Unsubscribe;
}
