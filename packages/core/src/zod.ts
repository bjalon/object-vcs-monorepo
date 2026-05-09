import type { z } from "zod";

import type { SchemaAdapter } from "./types.js";

export function zodSchema<TOutput>(
  schema: z.ZodType<TOutput>
): SchemaAdapter<TOutput> {
  return schema;
}
