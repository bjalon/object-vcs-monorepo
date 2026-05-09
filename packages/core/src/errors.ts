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
