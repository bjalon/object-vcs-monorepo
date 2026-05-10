import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DirtyHeadError,
  GarbageCollectionPlanStaleError,
  MigrationError,
  SchemaCompatibilityError,
  TagNotFoundError,
  TagRevisionMismatchError,
  createRepository,
  defineGraph,
  inMemoryPersistence,
  singleton,
  type BranchRecord,
  type GarbageCollectionPlan,
  type InferState,
  type PersistenceAdapter
} from "./index.js";

const CounterSchema = z.object({
  value: z.number().int(),
  label: z.string()
});

const graph = defineGraph({
  counter: singleton(CounterSchema)
});

type CounterState = InferState<typeof graph>;

const LegacyCounterSchema = z.object({
  value: z.number().int(),
  label: z.string(),
  legacy: z.string()
});

const legacyGraph = defineGraph({
  counter: singleton(LegacyCounterSchema)
});

type LegacyCounterState = InferState<typeof legacyGraph>;

const modifiedGraph = defineGraph({
  counter: singleton(
    z.object({
      value: z.number().int(),
      label: z.string(),
      note: z.string().optional()
    })
  )
});

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

function legacyState(value = 0): LegacyCounterState {
  return {
    counter: {
      value,
      label: `value-${value}`,
      legacy: "drop-me"
    }
  };
}

function asPersistence<TState>(
  persistence: PersistenceAdapter<unknown>
): PersistenceAdapter<TState> {
  return persistence as unknown as PersistenceAdapter<TState>;
}

function findBranch(
  branches: readonly BranchRecord[],
  name: string
): BranchRecord {
  const branch = branches.find(item => item.name === name);
  if (branch === undefined) {
    throw new Error(`Branch "${name}" was not listed.`);
  }
  return branch;
}

function findProtectedRevision(
  plan: GarbageCollectionPlan,
  revision: number
) {
  return plan.protectedRevisions.find(item => item.revision === revision);
}

function findBlockedRevision(plan: GarbageCollectionPlan, revision: number) {
  return plan.blockedRevisions.find(item => item.revision === revision);
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

  it("deletes an existing tag without deleting its revision", async () => {
    const repo = createCounterRepository("delete-tag-existing");
    await repo.init({ initialState: initialState() });
    await repo.tag("v1");

    const result = await repo.deleteTag("v1");

    expect(result).toEqual({
      deleted: true,
      name: "v1",
      previousRevision: 1
    });
    await expect(repo.listTags()).resolves.toEqual([]);
    await expect(repo.readRevision(1)).resolves.toEqual(initialState());
  });

  it("throws when deleting a missing tag by default", async () => {
    const repo = createCounterRepository("delete-tag-missing-throw");
    await repo.init({ initialState: initialState() });

    await expect(repo.deleteTag("missing")).rejects.toBeInstanceOf(
      TagNotFoundError
    );
  });

  it("ignores missing tags when requested", async () => {
    const repo = createCounterRepository("delete-tag-missing-ignore");
    await repo.init({ initialState: initialState() });

    await expect(
      repo.deleteTag("missing", { missing: "ignore" })
    ).resolves.toEqual({
      deleted: false,
      name: "missing",
      previousRevision: null
    });
  });

  it("deletes a tag when expectedRevision matches", async () => {
    const repo = createCounterRepository("delete-tag-expected-success");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.tag("v2", { revision: 2 });

    await expect(
      repo.deleteTag("v2", { expectedRevision: 2 })
    ).resolves.toEqual({
      deleted: true,
      name: "v2",
      previousRevision: 2
    });
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(2));
  });

  it("rejects tag deletion when expectedRevision mismatches", async () => {
    const repo = createCounterRepository("delete-tag-expected-mismatch");
    await repo.init({ initialState: initialState() });
    await repo.tag("v1");

    await expect(
      repo.deleteTag("v1", { expectedRevision: 2 })
    ).rejects.toBeInstanceOf(TagRevisionMismatchError);
    await expect(repo.listTags()).resolves.toHaveLength(1);
    await expect(repo.readRevision(1)).resolves.toEqual(initialState());
  });

  it("lists branch metadata after init", async () => {
    const repo = createCounterRepository("list-branches-init");
    await repo.init({ initialState: initialState() });

    const branches = await repo.listBranches();

    expect(branches).toHaveLength(1);
    expect(branches[0]).toMatchObject({
      repoId: "list-branches-init",
      name: "main",
      headRevision: 1,
      baseRevision: 1,
      headStateHash: branches[0]?.headStateHash,
      status: "clean",
      createdFromRevision: 1
    });
  });

  it("lists branches after creating a branch", async () => {
    const repo = createCounterRepository("list-branches-create");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(1), { commit: true });
    await repo.createBranch("from-r1", { from: 1 });

    const branches = await repo.listBranches();
    const main = findBranch(branches, "main");
    const fromR1 = findBranch(branches, "from-r1");

    expect(main).toMatchObject({
      headRevision: 2,
      baseRevision: 2,
      status: "clean",
      createdFromRevision: 1
    });
    expect(fromR1).toMatchObject({
      headRevision: 1,
      baseRevision: 1,
      status: "clean",
      createdFromRevision: 1
    });
  });

  it("keeps branch listing stable after checkout", async () => {
    const repo = createCounterRepository("list-branches-checkout");
    await repo.init({ initialState: initialState() });
    await repo.createBranch("feature", { from: "HEAD" });

    const beforeCheckout = await repo.listBranches();
    await repo.checkout("feature");
    const afterCheckout = await repo.listBranches();

    expect(afterCheckout).toEqual(beforeCheckout);
  });

  it("lists dirty branch metadata", async () => {
    const repo = createCounterRepository("list-branches-dirty");
    await repo.init({ initialState: initialState() });

    await repo.update(() => initialState(8));
    const main = findBranch(await repo.listBranches(), "main");

    expect(main).toMatchObject({
      headRevision: null,
      baseRevision: 1,
      status: "dirty",
      createdFromRevision: 1
    });
  });

  it("preserves baseRevision and headRevision through branch divergence", async () => {
    const repo = createCounterRepository("list-branches-revisions");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.createBranch("feature", { from: 1, checkout: true });
    await repo.update(() => initialState(3));

    const dirtyFeature = findBranch(await repo.listBranches(), "feature");
    expect(dirtyFeature).toMatchObject({
      headRevision: null,
      baseRevision: 1,
      status: "dirty",
      createdFromRevision: 1
    });

    await repo.commit({ message: "Feature commit" });
    const branches = await repo.listBranches();
    const main = findBranch(branches, "main");
    const feature = findBranch(branches, "feature");

    expect(main).toMatchObject({
      headRevision: 2,
      baseRevision: 2,
      status: "clean"
    });
    expect(feature).toMatchObject({
      headRevision: 3,
      baseRevision: 3,
      status: "clean",
      createdFromRevision: 1
    });
  });

  it("protects tagged revisions in garbage collection plans", async () => {
    const repo = createCounterRepository("gc-tagged");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    await repo.tag("keep-r2", { revision: 2 });

    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    expect(findProtectedRevision(plan, 2)?.reasons).toContain("tagged");
    expect(plan.deletableRevisions.map(revision => revision.revision)).toEqual(
      []
    );
  });

  it("protects branch heads in garbage collection plans", async () => {
    const repo = createCounterRepository("gc-branch-head");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });

    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    expect(findProtectedRevision(plan, 2)?.reasons).toContain("branch-head");
    expect(plan.deletableRevisions).toEqual([]);
  });

  it("protects dirty base revisions in garbage collection plans", async () => {
    const repo = createCounterRepository("gc-dirty-base");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(4));

    const plan = await repo.planGarbageCollection({ beforeRevision: 2 });

    expect(findProtectedRevision(plan, 1)?.reasons).toContain(
      "dirty-base-revision"
    );
    expect(plan.deletableRevisions).toEqual([]);
  });

  it("protects parents of protected revisions", async () => {
    const repo = createCounterRepository("gc-protected-parent");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.update(() => initialState(3), { commit: true });

    const plan = await repo.planGarbageCollection({ beforeRevision: 4 });

    expect(findProtectedRevision(plan, 3)?.reasons).toContain("branch-head");
    expect(findProtectedRevision(plan, 2)?.reasons).toContain(
      "ancestor-of-protected-revision"
    );
    expect(findProtectedRevision(plan, 1)?.reasons).toContain(
      "ancestor-of-protected-revision"
    );
    expect(plan.deletableRevisions).toEqual([]);
  });

  it("proposes unreachable revisions for deletion", async () => {
    const repo = createCounterRepository("gc-unreachable");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });

    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    expect(plan.deletableRevisions.map(revision => revision.revision)).toEqual([
      2
    ]);
    expect(await repo.readRevision(2)).toEqual(initialState(2));
  });

  it("filters deletion candidates with beforeRevision", async () => {
    const repo = createCounterRepository("gc-before-revision");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });

    const plan = await repo.planGarbageCollection({ beforeRevision: 2 });

    expect(plan.deletableRevisions).toEqual([]);
    expect(findBlockedRevision(plan, 2)?.reasons).toContain(
      "after-before-revision-threshold"
    );
  });

  it("computes a stable refs snapshot hash", async () => {
    const repo = createCounterRepository("gc-stable-hash");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });

    const firstPlan = await repo.planGarbageCollection({ beforeRevision: 3 });
    const secondPlan = await repo.planGarbageCollection({ beforeRevision: 3 });

    expect(firstPlan.refsSnapshot).toEqual(secondPlan.refsSnapshot);
    expect(firstPlan.refsSnapshotHash).toBe(secondPlan.refsSnapshotHash);
  });

  it("does not propose dangerous parent deletion", async () => {
    const repo = createCounterRepository("gc-no-dangerous-parent");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.update(() => initialState(3), { commit: true });
    await repo.tag("keep-tip", { revision: 3 });

    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    expect(plan.deletableRevisions).toEqual([]);
    expect(findProtectedRevision(plan, 2)?.reasons).toContain(
      "ancestor-of-protected-revision"
    );
  });

  it("dry-runs garbage collection without deleting anything", async () => {
    const repo = createCounterRepository("gc-run-dry");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    const result = await repo.runGarbageCollection(plan, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.deletedRevisions).toEqual([]);
    expect(result.deletedBlobs).toEqual([]);
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(2));
  });

  it("deletes an unreachable revision when garbage collection runs", async () => {
    const repo = createCounterRepository("gc-run-unreachable");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    const result = await repo.runGarbageCollection(plan);

    expect(result.deletedRevisions).toEqual([2]);
    await expect(repo.readRevision(2)).rejects.toThrow(
      'Revision "2" was not found.'
    );
  });

  it("does not delete a tagged revision when garbage collection runs", async () => {
    const repo = createCounterRepository("gc-run-tagged");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    await repo.tag("keep", { revision: 2 });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    const result = await repo.runGarbageCollection(plan);

    expect(result.deletedRevisions).toEqual([]);
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(2));
  });

  it("does not delete a branch head when garbage collection runs", async () => {
    const repo = createCounterRepository("gc-run-branch-head");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    const result = await repo.runGarbageCollection(plan);

    expect(result.deletedRevisions).toEqual([]);
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(2));
  });

  it("does not delete protected ancestors when garbage collection runs", async () => {
    const repo = createCounterRepository("gc-run-ancestor");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.update(() => initialState(3), { commit: true });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    const result = await repo.runGarbageCollection(plan);

    expect(result.deletedRevisions).toEqual([]);
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(2));
  });

  it("refuses a stale garbage collection plan after a tag is created", async () => {
    const repo = createCounterRepository("gc-run-stale-tag");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    await repo.tag("new-protection", { revision: 2 });

    await expect(repo.runGarbageCollection(plan)).rejects.toBeInstanceOf(
      GarbageCollectionPlanStaleError
    );
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(2));
  });

  it("refuses a stale garbage collection plan after a branch is created", async () => {
    const repo = createCounterRepository("gc-run-stale-branch");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    await repo.createBranch("protect-r2", { from: 2 });

    await expect(repo.runGarbageCollection(plan)).rejects.toBeInstanceOf(
      GarbageCollectionPlanStaleError
    );
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(2));
  });

  it("deletes snapshot blobs after deleting unreachable revisions", async () => {
    const repo = createCounterRepository("gc-run-delete-blob");
    await repo.init({ initialState: initialState() });
    await repo.update(() => initialState(2), { commit: true });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    const result = await repo.runGarbageCollection(plan);

    expect(result.deletedRevisions).toEqual([2]);
    expect(result.deletedBlobs).toEqual([
      plan.deletableRevisions[0]?.snapshotBlobRef
    ]);
    expect(result.skippedBlobs).toEqual([]);
  });

  it("keeps snapshot blobs that are still referenced", async () => {
    const repo = createCounterRepository("gc-run-keep-blob");
    await repo.init({ initialState: initialState() });
    await repo.commit({ allowEmpty: true, message: "Empty duplicate" });
    await repo.resetBranch("main", { to: 1, mode: "hard" });
    const plan = await repo.planGarbageCollection({ beforeRevision: 3 });

    const result = await repo.runGarbageCollection(plan);

    expect(result.deletedRevisions).toEqual([2]);
    expect(result.deletedBlobs).toEqual([]);
    expect(result.skippedBlobs).toEqual([
      {
        blobRef: plan.deletableRevisions[0]?.snapshotBlobRef,
        reason: "still-referenced"
      }
    ]);
    await expect(repo.readRevision(1)).resolves.toEqual(initialState());
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

  it("generates stable schema fingerprints for the same graph", () => {
    const firstRepo = createCounterRepository("fingerprint-same-1");
    const secondRepo = createCounterRepository("fingerprint-same-2");

    expect(firstRepo.getGraphIdentity()).toEqual(secondRepo.getGraphIdentity());
  });

  it("generates different schema fingerprints when the graph changes", () => {
    const firstRepo = createCounterRepository("fingerprint-different-1");
    const secondRepo = createRepository({
      repoId: "fingerprint-different-2",
      graph: modifiedGraph,
      schemaVersion: 1,
      graphVersion: "test",
      persistence: inMemoryPersistence<InferState<typeof modifiedGraph>>()
    });

    expect(firstRepo.getGraphIdentity().schemaFingerprint).not.toBe(
      secondRepo.getGraphIdentity().schemaFingerprint
    );
  });

  it("supports manual schema fingerprints", () => {
    const repo = createRepository({
      repoId: "fingerprint-manual",
      graph,
      schemaVersion: 1,
      graphVersion: "test",
      schemaFingerprint: "manual:counter-schema",
      persistence: inMemoryPersistence<CounterState>()
    });

    expect(repo.getGraphIdentity()).toEqual({
      graphVersion: "test",
      schemaFingerprint: "manual:counter-schema",
      schemaFingerprintAlgorithm: "manual"
    });
  });

  it("requires a manual fingerprint for unsupported automatic Zod schemas", () => {
    const graphWithTransform = defineGraph({
      counter: singleton(z.string().transform(value => value.trim()))
    });

    expect(() =>
      createRepository({
        repoId: "fingerprint-unsupported",
        graph: graphWithTransform,
        schemaVersion: 1,
        graphVersion: "test",
        persistence: inMemoryPersistence<InferState<typeof graphWithTransform>>()
      })
    ).toThrow(
      'Zod schema "ZodEffects" cannot be represented automatically. Provide schemaFingerprint manually.'
    );
  });

  it("reports a revision compatible with the current graph", async () => {
    const repo = createCounterRepository("fingerprint-compatible");
    await repo.init({ initialState: initialState() });

    await expect(repo.assertCompatibleGraph({ revision: 1 })).resolves.toEqual({
      status: "compatible",
      graphVersion: "test",
      schemaFingerprint: repo.getGraphIdentity().schemaFingerprint
    });
  });

  it("keeps revision graph versions and reads old revisions through migrations", async () => {
    const persistence = inMemoryPersistence<unknown>();
    const legacyRepo = createRepository({
      repoId: "migration-read",
      graph: legacyGraph,
      schemaVersion: 1,
      graphVersion: "counter-v1",
      defaultBranch: "main",
      persistence: asPersistence<LegacyCounterState>(persistence)
    });
    await legacyRepo.init({ initialState: legacyState() });

    const repo = createRepository({
      repoId: "migration-read",
      graph,
      schemaVersion: 2,
      graphVersion: "counter-v2",
      defaultBranch: "main",
      migrations: [
        {
          from: "counter-v1",
          to: "counter-v2",
          migrate: state => {
            const parsed = legacyGraph.validateState(state);
            return {
              counter: {
                value: parsed.counter.value,
                label: parsed.counter.label
              }
            };
          }
        }
      ],
      persistence: asPersistence<CounterState>(persistence)
    });

    const revisions = await repo.listRevisions();
    expect(revisions[0]?.graphVersion).toBe("counter-v1");
    await expect(repo.assertCompatibleGraph({ revision: 1 })).resolves.toEqual({
      status: "migration-required",
      fromGraphVersion: "counter-v1",
      toGraphVersion: "counter-v2",
      fromSchemaFingerprint:
        legacyRepo.getGraphIdentity().schemaFingerprint,
      toSchemaFingerprint: repo.getGraphIdentity().schemaFingerprint
    });
    await expect(repo.readRevision(1)).rejects.toBeInstanceOf(
      SchemaCompatibilityError
    );
    await expect(
      repo.readRevision(1, { migrateTo: "strict" })
    ).rejects.toBeInstanceOf(SchemaCompatibilityError);
    await expect(repo.readRevision(1, { migrateTo: "current" })).resolves.toEqual(
      initialState()
    );
  });

  it("fails explicitly when no migration path exists", async () => {
    const persistence = inMemoryPersistence<unknown>();
    const legacyRepo = createRepository({
      repoId: "migration-missing",
      graph: legacyGraph,
      schemaVersion: 1,
      graphVersion: "counter-v1",
      defaultBranch: "main",
      persistence: asPersistence<LegacyCounterState>(persistence)
    });
    await legacyRepo.init({ initialState: legacyState() });

    const repo = createRepository({
      repoId: "migration-missing",
      graph,
      schemaVersion: 2,
      graphVersion: "counter-v2",
      defaultBranch: "main",
      persistence: asPersistence<CounterState>(persistence)
    });

    await expect(
      repo.readRevision(1, { migrateTo: "current" })
    ).rejects.toBeInstanceOf(MigrationError);
    await expect(repo.assertCompatibleGraph({ revision: 1 })).resolves.toEqual({
      status: "incompatible",
      reason: "Schema fingerprints differ and no migration path is available.",
      fromGraphVersion: "counter-v1",
      toGraphVersion: "counter-v2",
      fromSchemaFingerprint:
        legacyRepo.getGraphIdentity().schemaFingerprint,
      toSchemaFingerprint: repo.getGraphIdentity().schemaFingerprint
    });
  });

  it("migrates HEAD into a new revision using the target graph version", async () => {
    const persistence = inMemoryPersistence<unknown>();
    const legacyRepo = createRepository({
      repoId: "migration-head",
      graph: legacyGraph,
      schemaVersion: 1,
      graphVersion: "counter-v1",
      defaultBranch: "main",
      persistence: asPersistence<LegacyCounterState>(persistence)
    });
    await legacyRepo.init({ initialState: legacyState(3) });

    const repo = createRepository({
      repoId: "migration-head",
      graph,
      schemaVersion: 2,
      graphVersion: "counter-v2",
      defaultBranch: "main",
      migrations: [
        {
          from: "counter-v1",
          to: "counter-v2",
          migrate: state => {
            const parsed = legacyGraph.validateState(state);
            return {
              counter: {
                value: parsed.counter.value,
                label: parsed.counter.label
              }
            };
          }
        }
      ],
      persistence: asPersistence<CounterState>(persistence)
    });

    const preview = await repo.getHead({ migrateTo: "current" });
    expect(preview.state).toEqual(initialState(3));

    const result = await repo.migrateHead({
      author: "Migrator"
    });

    expect(result.created).toBe(true);
    expect(result.revision.revision).toBe(2);
    expect(result.revision.graphVersion).toBe("counter-v2");
    expect(result.revision.parentRevision).toBe(1);
    expect(result.head.status).toBe("clean");
    expect(result.head.state).toEqual(initialState(3));
    await expect(repo.readRevision(2)).resolves.toEqual(initialState(3));
  });
});
