import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  ValidationError,
  collection,
  createRepository,
  defineGraph,
  inMemoryPersistence,
  singleton,
  type InferState
} from "./index.js";

const SettingsSchema = z.object({
  theme: z.enum(["lava", "moss"]),
  chaosLevel: z.number().int().min(0).max(10)
});

const GoblinSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["chef", "guard"]),
  mood: z.string()
});

const tavernGraph = defineGraph({
  settings: singleton(SettingsSchema),
  goblins: collection(GoblinSchema)
});

type TavernState = InferState<typeof tavernGraph>;
type Settings = z.infer<typeof SettingsSchema>;
type Goblin = z.infer<typeof GoblinSchema>;

function initialState(): TavernState {
  return {
    settings: {
      theme: "lava",
      chaosLevel: 3
    },
    goblins: {}
  };
}

function grubnuk(): Goblin {
  return {
    id: "g1",
    name: "Grubnuk",
    role: "chef",
    mood: "hungry"
  };
}

function createTavernRepository(repoId: string) {
  return createRepository({
    repoId,
    graph: tavernGraph,
    schemaVersion: 1,
    graphVersion: "test",
    persistence: inMemoryPersistence<TavernState>()
  });
}

describe("typed CRUD helpers", () => {
  it("exposes graph-shaped singleton and collection helper types", async () => {
    const repo = createTavernRepository("crud-types");
    await repo.init({ initialState: initialState() });

    const settingsPromise: Promise<Settings> = repo.singletons.settings.get();
    const goblinPromise: Promise<Goblin | null> =
      repo.entities.goblins.get("g1");
    const goblinsPromise: Promise<Record<string, Goblin>> =
      repo.entities.goblins.list();

    await expect(settingsPromise).resolves.toEqual({
      theme: "lava",
      chaosLevel: 3
    });
    await expect(goblinPromise).resolves.toBeNull();
    await expect(goblinsPromise).resolves.toEqual({});
  });

  it("gets, sets and updates singleton values through repository update", async () => {
    const repo = createTavernRepository("crud-singletons");
    await repo.init({ initialState: initialState() });

    await repo.singletons.settings.set({
      theme: "moss",
      chaosLevel: 4
    });
    expect((await repo.getHead()).status).toBe("dirty");
    await expect(repo.singletons.settings.get()).resolves.toEqual({
      theme: "moss",
      chaosLevel: 4
    });

    const result = await repo.singletons.settings.update(
      settings => ({
        ...settings,
        chaosLevel: settings.chaosLevel + 1
      }),
      { commit: true, message: "Tune settings" }
    );

    expect(result.createdRevision).toBe(true);
    expect(result.revision?.message).toBe("Tune settings");
    await expect(repo.singletons.settings.get()).resolves.toEqual({
      theme: "moss",
      chaosLevel: 5
    });
  });

  it("creates, lists, reads, updates and deletes collection entities", async () => {
    const repo = createTavernRepository("crud-entities");
    await repo.init({ initialState: initialState() });
    const head = await repo.getHead();

    const createResult = await repo.entities.goblins.create("g1", grubnuk(), {
      commit: true,
      message: "Add Grubnuk",
      expectedHeadHash: head.stateHash
    });

    expect(createResult.createdRevision).toBe(true);
    expect(createResult.revision?.message).toBe("Add Grubnuk");
    await expect(repo.entities.goblins.get("g1")).resolves.toEqual(grubnuk());
    await expect(repo.entities.goblins.list()).resolves.toEqual({
      g1: grubnuk()
    });

    await repo.entities.goblins.update("g1", goblin => ({
      ...goblin,
      mood: "heroic"
    }));
    await expect(repo.entities.goblins.get("g1")).resolves.toEqual({
      ...grubnuk(),
      mood: "heroic"
    });

    await repo.entities.goblins.delete("g1", {
      commit: true,
      message: "Remove Grubnuk"
    });
    await expect(repo.entities.goblins.get("g1")).resolves.toBeNull();
    await expect(repo.entities.goblins.list()).resolves.toEqual({});
  });

  it("rejects duplicate creates and missing update or delete targets explicitly", async () => {
    const repo = createTavernRepository("crud-errors");
    await repo.init({ initialState: initialState() });

    await repo.entities.goblins.create("g1", grubnuk());

    await expect(
      repo.entities.goblins.create("g1", grubnuk())
    ).rejects.toBeInstanceOf(EntityAlreadyExistsError);
    await expect(
      repo.entities.goblins.update("missing", goblin => goblin)
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repo.entities.goblins.delete("missing")
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("validates singleton and collection writes with Zod schemas", async () => {
    const repo = createTavernRepository("crud-validation");
    await repo.init({ initialState: initialState() });

    const invalidSettings = {
      theme: "moss",
      chaosLevel: 999
    } as unknown as Settings;
    const invalidGoblin = {
      id: "g2",
      name: "Snarg",
      role: "bard",
      mood: "loud"
    } as unknown as Goblin;

    await expect(
      repo.singletons.settings.set(invalidSettings)
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repo.entities.goblins.create("g2", invalidGoblin)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
