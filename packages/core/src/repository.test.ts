import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DirtyHeadError,
  createRepository,
  defineGraph,
  inMemoryPersistence,
  singleton,
  type InferState
} from "./index.js";

const CounterSchema = z.object({
  value: z.number().int(),
  label: z.string()
});

const graph = defineGraph({
  counter: singleton(CounterSchema)
});

type CounterState = InferState<typeof graph>;

function initialState(value = 0): CounterState {
  return {
    counter: {
      value,
      label: `value-${value}`
    }
  };
}

function createCounterRepository(repoId: string) {
  return createRepository({
    repoId,
    graph,
    schemaVersion: 1,
    graphVersion: "test",
    defaultBranch: "main",
    persistence: inMemoryPersistence<CounterState>()
  });
}

describe("Object VCS repository with in-memory persistence", () => {
  it("initializes a clean HEAD with an immutable first revision", async () => {
    const repo = createCounterRepository("init-clean");

    const result = await repo.init({
      initialState: initialState(),
      message: "Initial state"
    });

    expect(result.head.status).toBe("clean");
    expect(result.head.headRevision).toBe(1);
    expect(result.revision?.revision).toBe(1);
    await expect(repo.readRevision(1)).resolves.toEqual(initialState());
    await expect(repo.listRevisions()).resolves.toHaveLength(1);
  });

  it("can initialize a dirty HEAD without creating a revision", async () => {
    const repo = createCounterRepository("init-dirty");

    const result = await repo.init({
      initialState: initialState(),
      commit: false
    });

    expect(result.head.status).toBe("dirty");
    expect(result.head.headRevision).toBeNull();
    expect(result.revision).toBeUndefined();
    await expect(repo.listRevisions()).resolves.toHaveLength(0);
  });

  it("writes dirty HEAD updates without creating revisions and replaces previous dirty state", async () => {
    const repo = createCounterRepository("dirty-replace");
    await repo.init({ initialState: initialState() });

    await repo.update(current => ({
      counter: {
        value: current.counter.value + 1,
        label: "first dirty"
      }
    }));

    const secondUpdate = await repo.update(current => ({
      counter: {
        value: current.counter.value + 10,
        label: "second dirty"
      }
    }));

    expect(secondUpdate.head.status).toBe("dirty");
    expect(secondUpdate.head.headRevision).toBeNull();
    expect(secondUpdate.head.baseRevision).toBe(1);
    expect(secondUpdate.head.state.counter).toEqual({
      value: 11,
      label: "second dirty"
    });
    await expect(repo.listRevisions()).resolves.toHaveLength(1);
  });

  it("commits a dirty HEAD into a new clean immutable revision", async () => {
    const repo = createCounterRepository("commit-dirty");
    await repo.init({ initialState: initialState() });
    await repo.update(() => ({
      counter: {
        value: 2,
        label: "dirty"
      }
    }));

    const commit = await repo.commit({ message: "Commit dirty" });

    expect(commit.created).toBe(true);
    expect(commit.revision.revision).toBe(2);
    expect(commit.revision.parentRevision).toBe(1);
    expect(commit.head.status).toBe("clean");
    await expect(repo.readRevision(1)).resolves.toEqual(initialState());
    await expect(repo.readRevision(2)).resolves.toEqual({
      counter: {
        value: 2,
        label: "dirty"
      }
    });
  });

  it("commits an update in one operation", async () => {
    const repo = createCounterRepository("update-commit");
    await repo.init({ initialState: initialState() });

    const result = await repo.update(
      () => ({
        counter: {
          value: 3,
          label: "committed"
        }
      }),
      { commit: true, message: "Committed update" }
    );

    expect(result.createdRevision).toBe(true);
    expect(result.revision?.revision).toBe(2);
    expect(result.head.status).toBe("clean");
  });

  it("supports mutable edit recipes", async () => {
    const repo = createCounterRepository("edit-recipe");
    await repo.init({ initialState: initialState() });

    const result = await repo.edit(draft => {
      draft.counter.value = 4;
      draft.counter.label = "edited";
    });

    expect(result.head.status).toBe("dirty");
    expect(result.head.state.counter).toEqual({
      value: 4,
      label: "edited"
    });
  });

  it("creates an empty revision when allowEmpty is true", async () => {
    const repo = createCounterRepository("empty-commit");
    await repo.init({ initialState: initialState() });

    const noOpCommit = await repo.commit({ message: "No op" });
    const emptyCommit = await repo.commit({
      message: "Empty checkpoint",
      allowEmpty: true
    });

    expect(noOpCommit.created).toBe(false);
    expect(noOpCommit.revision.revision).toBe(1);
    expect(emptyCommit.created).toBe(true);
    expect(emptyCommit.revision.revision).toBe(2);
    expect(emptyCommit.revision.isEmptyRevision).toBe(true);
  });

  it("tags clean HEAD without creating a revision", async () => {
    const repo = createCounterRepository("tag-clean");
    await repo.init({ initialState: initialState() });

    const tag = await repo.tag("v1");

    expect(tag.revision).toBe(1);
    await expect(repo.listRevisions()).resolves.toHaveLength(1);
    await expect(repo.listTags()).resolves.toEqual([tag]);
  });

  it("tags dirty HEAD by creating a revision unless explicitly disabled", async () => {
    const repo = createCounterRepository("tag-dirty");
    await repo.init({ initialState: initialState() });
    await repo.update(() => ({
      counter: {
        value: 5,
        label: "dirty tag"
      }
    }));

    await expect(
      repo.tag("blocked", { createRevisionIfDirty: false })
    ).rejects.toBeInstanceOf(DirtyHeadError);

    const tag = await repo.tag("dirty");

    expect(tag.revision).toBe(2);
    expect((await repo.getHead()).status).toBe("clean");
    await expect(repo.listRevisions()).resolves.toHaveLength(2);
  });

  it("creates a branch from an old revision and diverges without merging", async () => {
    const repo = createCounterRepository("branch-from-old");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(1), { commit: true });

    const branch = await repo.createBranch("from-r1", {
      from: 1,
      checkout: true
    });
    await repo.update(() => initialState(99), { commit: true });

    expect(branch.createdFromRevision).toBe(1);
    expect((await repo.getHead()).state.counter.value).toBe(99);
    expect((await repo.getHead()).headRevision).toBe(3);

    const mainHead = await repo.checkout("main");
    expect(mainHead.state.counter.value).toBe(1);
    expect(mainHead.headRevision).toBe(2);

    await expect(repo.readRevision(1)).resolves.toEqual(initialState());
  });

  it("restores a revision as dirty state without creating a revision", async () => {
    const repo = createCounterRepository("restore-dirty");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(10), { commit: true });

    const result = await repo.restore(1);

    expect(result.createdRevision).toBe(false);
    expect(result.head.status).toBe("dirty");
    expect(result.head.state).toEqual(initialState());
    await expect(repo.listRevisions()).resolves.toHaveLength(2);
  });

  it("restores a revision and commits when requested", async () => {
    const repo = createCounterRepository("restore-commit");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(10), { commit: true });

    const result = await repo.restore(1, {
      commit: true,
      message: "Restore initial"
    });

    expect(result.createdRevision).toBe(true);
    expect(result.revision?.revision).toBe(3);
    expect(result.head.status).toBe("clean");
    expect(result.head.state).toEqual(initialState());
  });

  it("resets a branch hard to a revision and discards dirty state", async () => {
    const repo = createCounterRepository("reset-hard");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(8), { commit: true });
    await repo.update(() => initialState(42));

    const branch = await repo.resetBranch("main", {
      to: 1,
      mode: "hard"
    });
    const head = await repo.getHead();

    expect(branch.status).toBe("clean");
    expect(head.headRevision).toBe(1);
    expect(head.state).toEqual(initialState());
  });
});
