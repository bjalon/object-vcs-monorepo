import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  ValidationError,
  collection,
  defineGraph,
  objectVcsCorePackage,
  singleton,
  validateState,
  zodSchema,
  type HeadStatus,
  type InferState,
  type PersistenceAdapter,
  type RepositoryId
} from "./index.js";

const SettingsSchema = z.object({
  theme: z.enum(["sunny", "dungeon", "lava"]),
  chaosLevel: z.number().int().min(0).max(10)
});

const GoblinSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  energy: z.number().int().min(0).max(100)
});

const graph = defineGraph({
  settings: singleton(SettingsSchema),
  goblins: collection(GoblinSchema)
});

type TavernState = InferState<typeof graph>;

describe("@bjalon/object-vcs-core graph", () => {
  it("exports public primitives", () => {
    const status: HeadStatus = "clean";
    const repoId: RepositoryId = "repo-1";

    expect(status).toBe("clean");
    expect(repoId).toBe("repo-1");
    expect(objectVcsCorePackage).toBe("@bjalon/object-vcs-core");
  });

  it("infers singleton and collection state shapes", () => {
    expectTypeOf<TavernState["settings"]>().toEqualTypeOf<
      z.infer<typeof SettingsSchema>
    >();
    expectTypeOf<TavernState["goblins"]>().toEqualTypeOf<
      Record<string, z.infer<typeof GoblinSchema>>
    >();
  });

  it("validates a complete state at runtime", () => {
    const state = graph.validateState({
      settings: {
        theme: "dungeon",
        chaosLevel: 6
      },
      goblins: {
        grubnuk: {
          id: "grubnuk",
          name: "Grubnuk",
          energy: 78
        }
      }
    });

    expect(state.settings.theme).toBe("dungeon");
    expect(state.goblins.grubnuk?.energy).toBe(78);
  });

  it("supports an explicit Zod schema adapter helper", () => {
    const settings = singleton(zodSchema(SettingsSchema));

    expect(settings.schema.parse({ theme: "lava", chaosLevel: 9 })).toEqual({
      theme: "lava",
      chaosLevel: 9
    });
  });

  it("returns a safe validation error instead of throwing", () => {
    const result = graph.safeValidateState({
      settings: {
        theme: "dungeon",
        chaosLevel: 11
      },
      goblins: {}
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.issues[0]?.path).toEqual(["settings"]);
    }
  });

  it("throws a validation error for missing graph entries", () => {
    expect(() =>
      validateState(graph, {
        settings: {
          theme: "sunny",
          chaosLevel: 1
        }
      })
    ).toThrow(ValidationError);
  });

  it("rejects non JSON-compatible parsed values", () => {
    const dateGraph = defineGraph({
      event: singleton({
        parse: (input: unknown) => input as Date,
        safeParse: (input: unknown) => ({ success: true, data: input as Date })
      })
    });

    const result = dateGraph.safeValidateState({
      event: new Date("2026-05-09T00:00:00.000Z")
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Unsupported JSON");
    }
  });

  it("exposes the persistence adapter type without implementation coupling", () => {
    expectTypeOf<PersistenceAdapter<TavernState>["getRepo"]>().parameters.toEqualTypeOf<
      [{ readonly repoId: string }]
    >();
  });
});
