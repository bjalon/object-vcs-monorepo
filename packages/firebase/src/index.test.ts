import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";

import {
  GarbageCollectionPlanStaleError,
  TagNotFoundError,
  TagRevisionMismatchError,
  type GarbageCollectionPlan,
  type PersistenceAdapter,
  type PersistencePlanGarbageCollectionInput,
  type PersistenceRunGarbageCollectionInput
} from "@bjalon/object-vcs-core";

interface FakeReference {
  readonly kind: "collection" | "document";
  readonly path: string;
  readonly id: string;
}

interface FakeSnapshot {
  readonly id: string;
  exists(): boolean;
  data(): unknown;
}

type StoredDocument = Readonly<Record<string, unknown>>;

interface TestState {
  readonly value: number;
  readonly payload?: string;
}

interface FakeTransaction {
  get(reference: FakeReference): Promise<FakeSnapshot>;
  set(reference: FakeReference, data: unknown): void;
  update(reference: FakeReference, data: unknown): void;
  delete(reference: FakeReference): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneDocument(value: StoredDocument): StoredDocument {
  return JSON.parse(JSON.stringify(value)) as StoredDocument;
}

function toStoredDocument(value: unknown): StoredDocument {
  if (!isRecord(value)) {
    throw new Error("Fake Firestore only supports plain object documents.");
  }
  return cloneDocument(value);
}

function makeSnapshot(path: string, document: StoredDocument | undefined): FakeSnapshot {
  return {
    id: path.split("/").at(-1) ?? path,
    exists: () => document !== undefined,
    data: () => {
      if (document === undefined) {
        return undefined;
      }
      return cloneDocument(document);
    }
  };
}

function immediateCollectionDocuments(
  store: ReadonlyMap<string, StoredDocument>,
  collectionPath: string
): FakeSnapshot[] {
  const prefix = `${collectionPath}/`;
  return Array.from(store.entries())
    .filter(([path]) => {
      if (!path.startsWith(prefix)) {
        return false;
      }
      return !path.slice(prefix.length).includes("/");
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, document]) => makeSnapshot(path, document));
}

const firestoreMock = vi.hoisted(() => {
  const store = new Map<string, StoredDocument>();

  function referencePath(parent: unknown, id: string): string {
    if (isRecord(parent) && typeof parent.path === "string") {
      return `${parent.path}/${id}`;
    }
    return id;
  }

  function makeReference(
    kind: FakeReference["kind"],
    path: string
  ): FakeReference {
    return {
      kind,
      path,
      id: path.split("/").at(-1) ?? path
    };
  }

  const transaction: FakeTransaction = {
    async get(reference) {
      return makeSnapshot(reference.path, store.get(reference.path));
    },
    set(reference, data) {
      store.set(reference.path, toStoredDocument(data));
    },
    update(reference, data) {
      const current = store.get(reference.path);
      if (current === undefined) {
        throw new Error(`Document "${reference.path}" does not exist.`);
      }
      store.set(reference.path, {
        ...current,
        ...toStoredDocument(data)
      });
    },
    delete(reference) {
      store.delete(reference.path);
    }
  };

  return {
    store,
    module: {
      collection: vi.fn((parent: unknown, id: string): FakeReference => {
        return makeReference("collection", referencePath(parent, id));
      }),
      doc: vi.fn((parent: unknown, id: string): FakeReference => {
        return makeReference("document", referencePath(parent, id));
      }),
      getDoc: vi.fn(async (reference: FakeReference): Promise<FakeSnapshot> => {
        return makeSnapshot(reference.path, store.get(reference.path));
      }),
      getDocs: vi.fn(
        async (
          reference: FakeReference
        ): Promise<{ readonly docs: readonly FakeSnapshot[] }> => {
          return {
            docs: immediateCollectionDocuments(store, reference.path)
          };
        }
      ),
      onSnapshot: vi.fn(() => {
        return () => undefined;
      }),
      runTransaction: vi.fn(
        async (
          _db: unknown,
          callback: (transaction: FakeTransaction) => Promise<unknown>
        ): Promise<unknown> => {
          return callback(transaction);
        }
      )
    }
  };
});

vi.mock("firebase/firestore", () => firestoreMock.module);

import {
  firebasePersistence,
  objectVcsFirebasePackage,
  type FirebasePersistenceOptions
} from "./index.js";

function createAdapter(
  options: Partial<FirebasePersistenceOptions> = {}
): PersistenceAdapter<TestState> {
  let tick = 0;
  return firebasePersistence<TestState>({
    db: {} as Firestore,
    maxInlineHeadStateBytes: 10_000,
    now: () => {
      tick += 1;
      return `2026-01-01T00:00:${String(tick).padStart(2, "0")}.000Z`;
    },
    ...options
  });
}

async function createRepository(
  adapter: PersistenceAdapter<TestState>,
  repoId: string
): Promise<void> {
  await adapter.createRepo({
    repoId,
    schemaVersion: 1,
    graphVersion: "test@1",
    schemaFingerprint: "manual:test@1",
    schemaFingerprintAlgorithm: "manual",
    defaultBranch: "main",
    storageMode: "snapshot",
    initialState: { value: 1 },
    stateHash: "hash-1",
    commit: true
  });
}

async function createUnreachableRevision(
  adapter: PersistenceAdapter<TestState>,
  repoId: string
): Promise<void> {
  await adapter.createBranch({
    repoId,
    name: "obsolete",
    from: 1
  });
  await adapter.createRevision({
    repoId,
    branchName: "obsolete",
    state: { value: 2 },
    stateHash: "hash-2"
  });
  await adapter.resetBranch({
    repoId,
    branchName: "obsolete",
    to: 1,
    mode: "hard"
  });
}

async function planGarbageCollection(
  adapter: PersistenceAdapter<TestState>,
  input: PersistencePlanGarbageCollectionInput
): Promise<GarbageCollectionPlan> {
  if (adapter.planGarbageCollection === undefined) {
    throw new Error("Firebase adapter does not expose planGarbageCollection.");
  }
  return adapter.planGarbageCollection(input);
}

async function runGarbageCollection(
  adapter: PersistenceAdapter<TestState>,
  input: PersistenceRunGarbageCollectionInput
) {
  if (adapter.runGarbageCollection === undefined) {
    throw new Error("Firebase adapter does not expose runGarbageCollection.");
  }
  return adapter.runGarbageCollection(input);
}

describe("@bjalon/object-vcs-firebase public entrypoint", () => {
  beforeEach(() => {
    firestoreMock.store.clear();
    vi.clearAllMocks();
  });

  it("exports adapter options and factory", () => {
    const options: FirebasePersistenceOptions = {
      db: {} as Firestore,
      rootCollection: "objectVcs",
      collections: {
        revisions: "history"
      }
    };
    const adapter = firebasePersistence(options);

    expect(options.rootCollection).toBe("objectVcs");
    expect(options.collections?.revisions).toBe("history");
    expect(adapter.createRepo).toBeTypeOf("function");
    expect(objectVcsFirebasePackage).toBe("@bjalon/object-vcs-firebase");
  });

  it("deletes a Firebase tag and keeps its revision readable", async () => {
    const adapter = createAdapter();
    await createRepository(adapter, "repo-delete-tag");
    await adapter.createTag({
      repoId: "repo-delete-tag",
      name: "v1",
      revision: 1
    });

    const result = await adapter.deleteTag({
      repoId: "repo-delete-tag",
      name: "v1"
    });

    expect(result).toEqual({
      deleted: true,
      name: "v1",
      previousRevision: 1
    });
    await expect(
      adapter.deleteTag({ repoId: "repo-delete-tag", name: "v1" })
    ).rejects.toBeInstanceOf(TagNotFoundError);
    await expect(
      adapter.readRevision({ repoId: "repo-delete-tag", revision: 1 })
    ).resolves.not.toBeNull();
  });

  it("checks expectedRevision when deleting Firebase tags", async () => {
    const adapter = createAdapter();
    await createRepository(adapter, "repo-expected-tag");
    await adapter.createTag({
      repoId: "repo-expected-tag",
      name: "v1",
      revision: 1
    });

    await expect(
      adapter.deleteTag({
        repoId: "repo-expected-tag",
        name: "v1",
        expectedRevision: 2
      })
    ).rejects.toBeInstanceOf(TagRevisionMismatchError);

    await expect(
      adapter.deleteTag({
        repoId: "repo-expected-tag",
        name: "missing",
        missing: "ignore"
      })
    ).resolves.toEqual({
      deleted: false,
      name: "missing",
      previousRevision: null
    });
  });

  it("lists Firebase branches with GC metadata", async () => {
    const adapter = createAdapter();
    await createRepository(adapter, "repo-branches");
    await adapter.createBranch({
      repoId: "repo-branches",
      name: "feature",
      from: 1
    });

    const branches = await adapter.listBranches({ repoId: "repo-branches" });

    expect(branches.map(branch => branch.name)).toEqual(["feature", "main"]);
    expect(branches.find(branch => branch.name === "feature")).toMatchObject({
      headRevision: 1,
      baseRevision: 1,
      status: "clean",
      createdFromRevision: 1
    });
  });

  it("plans and runs Firebase GC for unreachable revisions", async () => {
    const adapter = createAdapter();
    const repoId = "repo-gc-run";
    await createRepository(adapter, repoId);
    await createUnreachableRevision(adapter, repoId);

    const plan = await planGarbageCollection(adapter, {
      repoId,
      beforeRevision: 3
    });

    expect(plan.deletableRevisions.map(revision => revision.revision)).toEqual([
      2
    ]);

    const result = await runGarbageCollection(adapter, {
      repoId,
      plan
    });

    expect(result.deletedRevisions).toEqual([2]);
    await expect(
      adapter.readRevision({ repoId, revision: 2 })
    ).resolves.toBeNull();
    await expect(
      adapter.readRevision({ repoId, revision: 1 })
    ).resolves.not.toBeNull();
  });

  it("refuses stale Firebase GC plans", async () => {
    const adapter = createAdapter();
    const repoId = "repo-gc-stale";
    await createRepository(adapter, repoId);
    await createUnreachableRevision(adapter, repoId);
    const plan = await planGarbageCollection(adapter, {
      repoId,
      beforeRevision: 3
    });

    await adapter.createTag({
      repoId,
      name: "keep-obsolete",
      revision: 2
    });

    await expect(
      runGarbageCollection(adapter, {
        repoId,
        plan
      })
    ).rejects.toBeInstanceOf(GarbageCollectionPlanStaleError);
  });

  it("detects and deletes orphan Firebase blobs", async () => {
    const adapter = createAdapter({ maxInlineHeadStateBytes: 1 });
    const repoId = "repo-gc-orphan-blob";
    await createRepository(adapter, repoId);
    await adapter.writeHead({
      repoId,
      branchName: "main",
      state: { value: 2, payload: "x".repeat(100) },
      stateHash: "hash-dirty"
    });

    const plan = await planGarbageCollection(adapter, {
      repoId,
      beforeRevision: 2,
      includeOrphanBlobs: true
    });

    expect(plan.orphanBlobs.length).toBeGreaterThanOrEqual(1);
    const result = await runGarbageCollection(adapter, {
      repoId,
      plan
    });

    expect(result.deletedBlobs.length).toBeGreaterThanOrEqual(1);
  });

  it("returns an approximate Firebase storage estimate", async () => {
    const adapter = createAdapter();
    const repoId = "repo-storage-estimate";
    await createRepository(adapter, repoId);
    await adapter.createTag({
      repoId,
      name: "v1",
      revision: 1
    });

    if (adapter.estimateStorage === undefined) {
      throw new Error("Firebase adapter does not expose estimateStorage.");
    }

    const estimate = await adapter.estimateStorage({
      repoId
    });

    expect(estimate.repoId).toBe(repoId);
    expect(estimate.revisionCount).toBe(1);
    expect(estimate.blobCount).toBe(1);
    expect(estimate.branchCount).toBe(1);
    expect(estimate.tagCount).toBe(1);
    expect(estimate.estimatedBackendBytes).toBeGreaterThan(0);
    expect(estimate.notes[0]).toContain("approximate");
  });
});
