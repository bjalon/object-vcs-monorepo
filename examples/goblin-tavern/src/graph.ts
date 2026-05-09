import { collection, defineGraph, singleton, type InferState } from "@bjalon/object-vcs-core";
import { z } from "zod";

export const TavernSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  motto: z.string().min(1),
  reputation: z.number().int().min(0).max(100)
});

export const ChaosSettingsSchema = z.object({
  theme: z.enum(["sunny", "dungeon", "lava"]),
  chaosLevel: z.number().int().min(0).max(10),
  autosaveDirty: z.boolean()
});

export const GoblinSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.enum(["chef", "bard", "guard", "intern"]),
  mood: z.enum(["grumpy", "hungry", "heroic", "suspicious"]),
  favoriteSnack: z.string().min(1),
  energy: z.number().int().min(0).max(100)
});

export const MenuItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  pricePebbles: z.number().int().min(0),
  weirdness: z.number().int().min(1).max(5),
  inStock: z.boolean()
});

export const TavernEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  severity: z.enum(["minor", "messy", "legendary"]),
  resolved: z.boolean()
});

export const goblinTavernGraph = defineGraph({
  tavern: singleton(TavernSchema),
  chaosSettings: singleton(ChaosSettingsSchema),
  goblins: collection(GoblinSchema),
  menuItems: collection(MenuItemSchema),
  tavernEvents: collection(TavernEventSchema)
});

export type TavernState = InferState<typeof goblinTavernGraph>;
export type Goblin = z.infer<typeof GoblinSchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
export type TavernEvent = z.infer<typeof TavernEventSchema>;
