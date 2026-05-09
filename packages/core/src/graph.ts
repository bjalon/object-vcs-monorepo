import { ValidationError, type ValidationIssue } from "./errors.js";
import type { SchemaAdapter } from "./types.js";

export type GraphEntryKind = "singleton" | "collection";

export interface SingletonGraphEntry<TValue> {
  readonly kind: "singleton";
  readonly schema: SchemaAdapter<TValue>;
}

export interface CollectionGraphEntry<TValue> {
  readonly kind: "collection";
  readonly schema: SchemaAdapter<TValue>;
}

export type GraphEntry<TValue = unknown> =
  | SingletonGraphEntry<TValue>
  | CollectionGraphEntry<TValue>;

export type GraphEntries = Readonly<Record<string, GraphEntry>>;

export interface ObjectVcsGraph<TEntries extends GraphEntries = GraphEntries> {
  readonly entries: TEntries;
  validateState(input: unknown): InferState<ObjectVcsGraph<TEntries>>;
  safeValidateState(input: unknown): ValidationResult<InferState<ObjectVcsGraph<TEntries>>>;
}

export type InferEntryState<TEntry> =
  TEntry extends SingletonGraphEntry<infer TValue>
    ? TValue
    : TEntry extends CollectionGraphEntry<infer TValue>
      ? Record<string, TValue>
      : never;

export type InferState<TGraph> = TGraph extends ObjectVcsGraph<infer TEntries>
  ? { [TKey in keyof TEntries]: InferEntryState<TEntries[TKey]> }
  : TGraph extends GraphEntries
    ? { [TKey in keyof TGraph]: InferEntryState<TGraph[TKey]> }
    : never;

export type ValidationResult<TValue> =
  | { readonly success: true; readonly data: TValue }
  | { readonly success: false; readonly error: ValidationError };

export function singleton<TValue>(
  schema: SchemaAdapter<TValue>
): SingletonGraphEntry<TValue> {
  return {
    kind: "singleton",
    schema
  };
}

export function collection<TValue>(
  schema: SchemaAdapter<TValue>
): CollectionGraphEntry<TValue> {
  return {
    kind: "collection",
    schema
  };
}

export function defineGraph<const TEntries extends GraphEntries>(
  entries: TEntries
): ObjectVcsGraph<TEntries> {
  return {
    entries,
    validateState(input) {
      return validateState(this, input);
    },
    safeValidateState(input) {
      return safeValidateState(this, input);
    }
  };
}

export function validateState<TGraph extends ObjectVcsGraph<GraphEntries>>(
  graph: TGraph,
  input: unknown
): InferState<TGraph> {
  const result = safeValidateState(graph, input);

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

export function safeValidateState<TGraph extends ObjectVcsGraph<GraphEntries>>(
  graph: TGraph,
  input: unknown
): ValidationResult<InferState<TGraph>> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return failedValidation([
      {
        path: [],
        message: "State must be a plain JSON object."
      }
    ]);
  }

  const parsedState: Record<string, unknown> = {};
  const graphKeys = new Set(Object.keys(graph.entries));

  for (const stateKey of Object.keys(input)) {
    if (!graphKeys.has(stateKey)) {
      issues.push({
        path: [stateKey],
        message: `Unknown graph entry "${stateKey}".`
      });
    }
  }

  for (const [entryName, entry] of Object.entries(graph.entries)) {
    if (!Object.hasOwn(input, entryName)) {
      issues.push({
        path: [entryName],
        message: `Missing graph entry "${entryName}".`
      });
      continue;
    }

    const rawValue = input[entryName];

    if (entry.kind === "singleton") {
      const parsed = parseWithSchema(entry.schema, rawValue, [entryName]);
      if (parsed.success) {
        parsedState[entryName] = parsed.data;
      } else {
        issues.push(parsed.issue);
      }
      continue;
    }

    if (!isRecord(rawValue)) {
      issues.push({
        path: [entryName],
        message: `Collection "${entryName}" must be a plain JSON object.`
      });
      continue;
    }

    const parsedCollection: Record<string, unknown> = {};

    for (const [entityId, entityValue] of Object.entries(rawValue)) {
      const parsed = parseWithSchema(entry.schema, entityValue, [
        entryName,
        entityId
      ]);
      if (parsed.success) {
        parsedCollection[entityId] = parsed.data;
      } else {
        issues.push(parsed.issue);
      }
    }

    parsedState[entryName] = parsedCollection;
  }

  if (issues.length > 0) {
    return failedValidation(issues);
  }

  const jsonIssues: ValidationIssue[] = [];
  collectJsonCompatibilityIssues(parsedState, [], jsonIssues);

  if (jsonIssues.length > 0) {
    return failedValidation(jsonIssues);
  }

  return {
    success: true,
    data: parsedState as InferState<TGraph>
  };
}

type SchemaParseResult<TValue> =
  | { readonly success: true; readonly data: TValue }
  | { readonly success: false; readonly issue: ValidationIssue };

function parseWithSchema<TValue>(
  schema: SchemaAdapter<TValue>,
  input: unknown,
  path: readonly (string | number)[]
): SchemaParseResult<TValue> {
  const result = schema.safeParse(input);

  if (result.success) {
    return result;
  }

  return {
    success: false,
    issue: {
      path,
      message: "Value does not match its schema.",
      cause: result.error
    }
  };
}

function failedValidation<TValue>(
  issues: readonly ValidationIssue[]
): ValidationResult<TValue> {
  return {
    success: false,
    error: new ValidationError("State validation failed.", issues)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function collectJsonCompatibilityIssues(
  value: unknown,
  path: readonly (string | number)[],
  issues: ValidationIssue[]
): void {
  if (value === null) {
    return;
  }

  const valueType = typeof value;

  if (valueType === "string" || valueType === "boolean") {
    return;
  }

  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      issues.push({
        path,
        message: "JSON-compatible numbers must be finite."
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectJsonCompatibilityIssues(value[index], [...path, index], issues);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      collectJsonCompatibilityIssues(childValue, [...path, key], issues);
    }
    return;
  }

  issues.push({
    path,
    message: `Unsupported JSON value type "${valueType}".`
  });
}
