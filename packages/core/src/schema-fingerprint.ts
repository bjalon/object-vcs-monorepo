import { z } from "zod";

import { PersistenceError } from "./errors.js";
import { stableStringify } from "./hash.js";
import type { GraphEntries, ObjectVcsGraph } from "./graph.js";
import type {
  GraphIdentity,
  JsonValue,
  SchemaAdapter,
  SchemaFingerprintAlgorithm
} from "./types.js";

export interface ResolveGraphIdentityOptions {
  readonly graph: ObjectVcsGraph;
  readonly graphVersion: string;
  readonly schemaFingerprint?: string;
  readonly schemaFingerprintAlgorithm?: SchemaFingerprintAlgorithm;
}

interface CanonicalGraphSchemaV1 {
  readonly objectVcsSchemaFingerprintVersion: 1;
  readonly nodes: readonly CanonicalGraphNodeV1[];
}

interface CanonicalGraphNodeV1 {
  readonly key: string;
  readonly kind: "singleton" | "collection";
  readonly jsonSchema: JsonValue;
}

export function resolveGraphIdentity(
  options: ResolveGraphIdentityOptions
): GraphIdentity {
  if (options.schemaFingerprint !== undefined) {
    return {
      graphVersion: options.graphVersion,
      schemaFingerprint: options.schemaFingerprint,
      schemaFingerprintAlgorithm:
        options.schemaFingerprintAlgorithm ?? "manual"
    };
  }

  if (
    options.schemaFingerprintAlgorithm !== undefined &&
    options.schemaFingerprintAlgorithm !== "zod-json-schema-sha256-v1"
  ) {
    throw new PersistenceError(
      `Schema fingerprint algorithm "${options.schemaFingerprintAlgorithm}" requires an explicit schemaFingerprint.`
    );
  }

  const canonicalSchema = createCanonicalGraphSchema(options.graph.entries);
  return {
    graphVersion: options.graphVersion,
    schemaFingerprint: `sha256:${sha256Hex(stableStringify(canonicalSchema))}`,
    schemaFingerprintAlgorithm: "zod-json-schema-sha256-v1"
  };
}

function createCanonicalGraphSchema(
  entries: GraphEntries
): CanonicalGraphSchemaV1 {
  return {
    objectVcsSchemaFingerprintVersion: 1,
    nodes: Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => ({
        key,
        kind: entry.kind,
        jsonSchema: schemaToJsonSchema(entry.schema)
      }))
  };
}

function schemaToJsonSchema(schema: SchemaAdapter<unknown>): JsonValue {
  if (!isZodSchema(schema)) {
    throw new PersistenceError(
      "Automatic schema fingerprinting requires Zod schemas. Provide schemaFingerprint for non-Zod schemas."
    );
  }

  return zodToJsonSchema(schema);
}

function isZodSchema(value: unknown): value is z.ZodType<unknown> {
  return value instanceof z.ZodType;
}

function zodToJsonSchema(schema: z.ZodType<unknown>): JsonValue {
  if (schema instanceof z.ZodString) {
    return withoutUndefined({
      type: "string",
      minLength: schema.minLength ?? undefined,
      maxLength: schema.maxLength ?? undefined,
      format: stringFormat(schema)
    });
  }

  if (schema instanceof z.ZodNumber) {
    return withoutUndefined({
      type: schema.isInt ? "integer" : "number",
      minimum: schema.minValue ?? undefined,
      maximum: schema.maxValue ?? undefined
    });
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodNull) {
    return { type: "null" };
  }

  if (schema instanceof z.ZodLiteral) {
    return { const: jsonLiteral(schema.value) };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: [...schema.options]
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element)
    };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: zodToJsonSchema(schema.valueSchema)
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodNullable) {
    return {
      anyOf: [zodToJsonSchema(schema.unwrap()), { type: "null" }]
    };
  }

  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault());
  }

  if (schema instanceof z.ZodObject) {
    const properties: Record<string, JsonValue> = {};
    const required: string[] = [];
    const shape = schema.shape as Readonly<Record<string, z.ZodType<unknown>>>;

    for (const [key, childSchema] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(childSchema);
      if (!isOptionalLike(childSchema)) {
        required.push(key);
      }
    }

    return withoutUndefined({
      type: "object",
      properties,
      required: required.length === 0 ? undefined : required.sort(),
      additionalProperties: false
    });
  }

  throw new PersistenceError(
    `Zod schema "${schema.constructor.name}" cannot be represented automatically. Provide schemaFingerprint manually.`
  );
}

function isOptionalLike(schema: z.ZodType<unknown>): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}

function stringFormat(schema: z.ZodString): string | undefined {
  if (schema.isEmail) {
    return "email";
  }
  if (schema.isURL) {
    return "uri";
  }
  if (schema.isUUID) {
    return "uuid";
  }
  if (schema.isDatetime) {
    return "date-time";
  }
  if (schema.isDate) {
    return "date";
  }
  if (schema.isTime) {
    return "time";
  }
  return undefined;
}

function jsonLiteral(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new PersistenceError(
    "Only JSON-compatible Zod literals can be fingerprinted automatically."
  );
}

function withoutUndefined(
  input: Readonly<Record<string, JsonValue | undefined>>
): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const hash = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19
  ]);
  const words = new Uint32Array(64);
  const padded = padSha256(bytes);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byteOffset = offset + index * 4;
      words[index] =
        ((padded[byteOffset] ?? 0) << 24) |
        ((padded[byteOffset + 1] ?? 0) << 16) |
        ((padded[byteOffset + 2] ?? 0) << 8) |
        (padded[byteOffset + 3] ?? 0);
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(words[index - 15] ?? 0, 7) ^
        rotateRight(words[index - 15] ?? 0, 18) ^
        ((words[index - 15] ?? 0) >>> 3);
      const s1 =
        rotateRight(words[index - 2] ?? 0, 17) ^
        rotateRight(words[index - 2] ?? 0, 19) ^
        ((words[index - 2] ?? 0) >>> 10);
      words[index] =
        ((words[index - 16] ?? 0) + s0 + (words[index - 7] ?? 0) + s1) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 =
        (h + s1 + ch + (sha256Constants[index] ?? 0) + (words[index] ?? 0)) >>>
        0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }

  return Array.from(hash)
    .map(word => word.toString(16).padStart(8, "0"))
    .join("");
}

function padSha256(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  return padded;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

const sha256Constants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
  0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
  0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
  0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
