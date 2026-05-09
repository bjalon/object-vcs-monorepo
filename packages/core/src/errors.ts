export class ObjectVcsError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly cause?: unknown;
}

export class ValidationError extends ObjectVcsError {
  public readonly issues: readonly ValidationIssue[];

  public constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.issues = issues;
  }
}

export class RepositoryNotFoundError extends ObjectVcsError {}
export class RepositoryAlreadyExistsError extends ObjectVcsError {}
export class BranchNotFoundError extends ObjectVcsError {}
export class BranchAlreadyExistsError extends ObjectVcsError {}
export class RevisionNotFoundError extends ObjectVcsError {}
export class TagAlreadyExistsError extends ObjectVcsError {}
export class DirtyHeadError extends ObjectVcsError {}
export class ConcurrencyConflictError extends ObjectVcsError {}
export class PersistenceError extends ObjectVcsError {}
