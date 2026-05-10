import {
  collection,
  defineGraph,
  singleton,
  type InferState
} from "@bjalon/object-vcs-core";
import { z } from "zod";

export const TavernSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  motto: z.string().min(1),
  reputation: z.number().int().min(0).max(100)
});

export const GoblinSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.enum(["chef", "bard", "guard", "intern"]),
  mood: z.enum(["grumpy", "hungry", "heroic", "suspicious"]),
  favoriteSnack: z.string().min(1),
  energy: z.number().int().min(0).max(100)
});

export const goblinTavernGraph = defineGraph({
  tavern: singleton(TavernSchema),
  goblins: collection(GoblinSchema)
});

export type TavernState = InferState<typeof goblinTavernGraph>;
export type Goblin = z.infer<typeof GoblinSchema>;
