export type RepositoryId = string;
export type RevisionNumber = number;
export type BranchName = string;
export type TagName = string;
export type StateHash = string;

export type HeadStatus = "clean" | "dirty";
export type StorageMode = "snapshot" | "patch" | "hybrid";
export type ConcurrencyMode = "strict" | "last-write-wins";

export interface SchemaAdapter<T> {
  parse(input: unknown): T;
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: unknown };
}

export interface Head<TState> {
  repoId: RepositoryId;
  branchName: BranchName;
  status: HeadStatus;
  headRevision: RevisionNumber | null;
  baseRevision: RevisionNumber | null;
  stateHash: StateHash;
  state: TState;
  updatedAt: string;
  updatedBy?: string;
}

export interface RevisionRecord {
  repoId: RepositoryId;
  revision: RevisionNumber;
  parentRevision: RevisionNumber | null;
  branchName: BranchName;
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

export interface BranchRecord {
  repoId: RepositoryId;
  name: BranchName;
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

export interface TagRecord {
  repoId: RepositoryId;
  name: TagName;
  revision: RevisionNumber;
  annotation?: string;
  createdAt: string;
  createdBy?: string;
}
