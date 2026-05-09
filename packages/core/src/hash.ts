import { ValidationError, type ValidationIssue } from "./errors.js";
import type { StateHash } from "./types.js";

export async function hashState(state: unknown): Promise<StateHash> {
  const canonicalJson = canonicalStringify(state);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson)
  );

  return `sha256:${toHex(new Uint8Array(digest))}`;
}

export function canonicalStringify(value: unknown): string {
  const issues: ValidationIssue[] = [];
  const result = stringifyJsonValue(value, [], issues);

  if (issues.length > 0) {
    throw new ValidationError("Value is not JSON-compatible.", issues);
  }

  return result;
}

function stringifyJsonValue(
  value: unknown,
  path: readonly (string | number)[],
  issues: ValidationIssue[]
): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issues.push({
        path,
        message: "JSON-compatible numbers must be finite."
      });
      return "null";
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      items.push(stringifyJsonValue(value[index], [...path, index], issues));
    }
    return `[${items.join(",")}]`;
  }

  if (isPlainRecord(value)) {
    const properties: string[] = [];
    for (const key of Object.keys(value).sort()) {
      properties.push(
        `${JSON.stringify(key)}:${stringifyJsonValue(value[key], [...path, key], issues)}`
      );
    }
    return `{${properties.join(",")}}`;
  }

  issues.push({
    path,
    message: `Unsupported JSON value type "${typeof value}".`
  });
  return "null";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
