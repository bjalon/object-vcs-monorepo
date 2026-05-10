import { describe, expect, it, vi } from "vitest";

import {
  ConcurrencyConflictError,
  GarbageCollectionPlanNotFoundError,
  GarbageCollectionPlanStaleError,
  GarbageCollectionUnsafeError,
  PersistenceError,
  type GarbageCollectionPlan,
  RepositoryAlreadyExistsError,
  type RepositoryStorageEstimate,
  SchemaCompatibilityError,
  TagNotFoundError,
  TagRevisionMismatchError
} from "@bjalon/object-vcs-core";

import {
  httpPersistence,
  objectVcsHttpPackage,
  type CommitResponse,
  type CreateBranchResponse,
  type CreateRepoRequest,
  type CreateRepoResponse,
  type CreateTagResponse,
  type DeleteTagResponse,
  type GetHeadResponse,
  type GetRepoResponse,
  type GetRevisionStateResponse,
  type HttpFetch,
  type ListBranchesResponse,
  type ListRevisionsResponse,
  type ListTagsResponse,
  type RunGarbageCollectionResponse,
  type SchemaIdentityResponse,
  type StorageEstimateResponse,
  type PlanGarbageCollectionResponse,
  type ResetBranchResponse,
  type RestoreResponse,
  type WriteHeadRequest,
  type WriteHeadResponse
} from "./index.js";

interface TestState {
  readonly counter: {
    readonly value: number;
  };
}

interface CapturedRequest {
  readonly input: string;
  readonly init: RequestInit | undefined;
}

const state: TestState = {
  counter: {
    value: 1
  }
};

const repo = {
  repoId: "repo 1",
  schemaVersion: 1,
  graphVersion: "test",
  schemaFingerprint: "manual:test",
  schemaFingerprintAlgorithm: "manual" as const,
  defaultBranch: "main",
  storageMode: "snapshot" as const,
  nextRevision: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const head = {
  repoId: "repo 1",
  branchName: "main",
  status: "clean" as const,
  headRevision: 1,
  baseRevision: 1,
  stateHash: "sha256:one",
  state,
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const branch = {
  repoId: "repo 1",
  name: "main",
  headRevision: 1,
  baseRevision: 1,
  headStateHash: "sha256:one",
  status: "clean" as const,
  createdFromRevision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const revision = {
  repoId: "repo 1",
  revision: 1,
  parentRevision: null,
  branchName: "main",
  stateHash: "sha256:one",
  schemaVersion: 1,
  graphVersion: "test",
  schemaFingerprint: "manual:test",
  schemaFingerprintAlgorithm: "manual" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  isEmptyRevision: false,
  isCheckpoint: true
};

const tag = {
  repoId: "repo 1",
  name: "v1",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z"
};

const storageEstimate: RepositoryStorageEstimate = {
  repoId: "repo 1",
  rawStateBytes: 10,
  objectVcsMetadataBytes: 20,
  blobBytes: 30,
  estimatedBackendBytes: 60,
  documentCount: 4,
  revisionCount: 1,
  blobCount: 1,
  branchCount: 1,
  tagCount: 1,
  notes: ["approximate"]
};

const garbageCollectionPlan: GarbageCollectionPlan = {
  planId: "gc-1",
  repoId: "repo 1",
  strategy: "unreachable-snapshots-v1",
  createdAt: "2026-01-01T00:00:00.000Z",
  options: {
    beforeRevision: 2,
    keepTagged: true,
    keepBranchHeads: true,
    keepDirtyBaseRevisions: true,
    includeOrphanBlobs: true,
    protectRevisions: [],
    maxRevisionsToDelete: null,
    estimateStorage: true
  },
  protectedRevisions: [],
  deletableRevisions: [],
  blockedRevisions: [],
  orphanBlobs: [],
  estimatedFreedStorage: {
    bytes: 0,
    documents: 0,
    blobs: 0
  },
  refsSnapshot: {
    tags: [],
    branches: [],
    latestRevision: 1
  },
  refsSnapshotHash: "sha256:refs"
};

const schemaIdentity = {
  graphVersion: "test",
  schemaFingerprint: "manual:test",
  schemaFingerprintAlgorithm: "manual" as const
};

describe("@bjalon/object-vcs-http", () => {
  it("exports the package marker", () => {
    expect(objectVcsHttpPackage).toBe("@bjalon/object-vcs-http");
  });

  it("calls contract endpoints with configured headers", async () => {
    const { fetch, requests } = createFetchMock([
      jsonResponse<CreateRepoResponse<TestState>>(201, {
        repo,
        head,
        revision
      }),
      jsonResponse<GetRepoResponse>(200, { repo }),
      jsonResponse<ListBranchesResponse>(200, { branches: [branch] }),
      jsonResponse<GetHeadResponse<TestState>>(200, { head }),
      jsonResponse<WriteHeadResponse<TestState>>(200, { head }),
      jsonResponse<CommitResponse<TestState>>(201, {
        revision,
        head,
        created: true
      }),
      jsonResponse<GetRevisionStateResponse<TestState>>(200, {
        revision,
        state,
        stateHash: "sha256:one"
      }),
      jsonResponse<ListRevisionsResponse>(200, { revisions: [revision] }),
      jsonResponse<CreateTagResponse<TestState>>(201, { tag }),
      jsonResponse<ListTagsResponse>(200, { tags: [tag] }),
      jsonResponse<DeleteTagResponse>(200, {
        deleted: true,
        name: "v1",
        previousRevision: 1
      }),
      jsonResponse<PlanGarbageCollectionResponse>(200, garbageCollectionPlan),
      jsonResponse<RunGarbageCollectionResponse>(200, {
        planId: "gc-1",
        repoId: "repo 1",
        dryRun: true,
        deletedRevisions: [],
        deletedBlobs: [],
        skippedRevisions: [],
        skippedBlobs: [],
        freedStorageEstimate: {
          bytes: 0,
          documents: 0,
          blobs: 0
        },
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z"
      }),
      jsonResponse<StorageEstimateResponse>(200, storageEstimate),
      jsonResponse<SchemaIdentityResponse>(200, schemaIdentity),
      jsonResponse<CreateBranchResponse<TestState>>(201, { branch }),
      jsonResponse<RestoreResponse<TestState>>(200, { head, revision }),
      jsonResponse<ResetBranchResponse<TestState>>(200, { branch, head })
    ]);
    const adapter = httpPersistence<TestState>({
      baseUrl: "https://api.example.com/object-vcs/",
      fetch,
      headers: async () => ({ "X-Tenant": "demo" }),
      getAuthToken: async () => "token-1",
      getIdempotencyKey: () => "idem-1",
      clientVersion: "test-client"
    });

    await adapter.createRepo({
      repoId: "repo 1",
      schemaVersion: 1,
      graphVersion: "test",
      schemaFingerprint: "manual:test",
      schemaFingerprintAlgorithm: "manual",
      defaultBranch: "main",
      storageMode: "snapshot",
      initialState: state,
      stateHash: "sha256:one",
      commit: true,
      message: "Initial"
    });
    await adapter.getRepo({ repoId: "repo 1" });
    await adapter.listBranches({ repoId: "repo 1" });
    await adapter.getHead({ repoId: "repo 1", branchName: "main" });
    await adapter.writeHead({
      repoId: "repo 1",
      branchName: "main",
      state,
      stateHash: "sha256:two",
      expectedHeadHash: "sha256:one",
      concurrency: "strict"
    });
    await adapter.createRevision({
      repoId: "repo 1",
      branchName: "main",
      state,
      stateHash: "sha256:two",
      message: "Commit"
    });
    await adapter.readRevision({ repoId: "repo 1", revision: 1 });
    await adapter.listRevisions({
      repoId: "repo 1",
      branchName: "main",
      limit: 10,
      after: 1,
      order: "asc"
    });
    await adapter.createTag({ repoId: "repo 1", name: "v1", revision: "HEAD" });
    await adapter.listTags({ repoId: "repo 1" });
    await adapter.deleteTag({
      repoId: "repo 1",
      name: "v1",
      expectedRevision: 1
    });
    await adapter.planGarbageCollection({
      repoId: "repo 1",
      beforeRevision: 2,
      includeOrphanBlobs: true,
      protectRevisions: [],
      estimateStorage: true
    });
    await adapter.runGarbageCollection({
      repoId: "repo 1",
      plan: garbageCollectionPlan,
      dryRun: true,
      recomputeBeforeRun: true,
      allowStalePlan: false
    });
    await adapter.estimateStorage({
      repoId: "repo 1",
      includeRevisions: true,
      includeBlobs: false
    });
    await adapter.getSchemaIdentity({ repoId: "repo 1" });
    await adapter.createBranch({
      repoId: "repo 1",
      name: "feature/a",
      from: 1,
      checkout: true
    });
    await adapter.restoreRevision({
      repoId: "repo 1",
      branchName: "main",
      revision: 1,
      state,
      stateHash: "sha256:one",
      commit: true
    });
    await adapter.resetBranch({
      repoId: "repo 1",
      branchName: "main",
      to: 1,
      mode: "hard"
    });

    expect(requests.map(request => request.input)).toEqual([
      "https://api.example.com/object-vcs/v1/repos",
      "https://api.example.com/object-vcs/v1/repos/repo%201",
      "https://api.example.com/object-vcs/v1/repos/repo%201/branches",
      "https://api.example.com/object-vcs/v1/repos/repo%201/branches/main/head",
      "https://api.example.com/object-vcs/v1/repos/repo%201/branches/main/head",
      "https://api.example.com/object-vcs/v1/repos/repo%201/branches/main/commit",
      "https://api.example.com/object-vcs/v1/repos/repo%201/revisions/1/state",
      "https://api.example.com/object-vcs/v1/repos/repo%201/revisions?branch=main&limit=10&after=1&order=asc",
      "https://api.example.com/object-vcs/v1/repos/repo%201/tags",
      "https://api.example.com/object-vcs/v1/repos/repo%201/tags",
      "https://api.example.com/object-vcs/v1/repos/repo%201/tags/v1?missing=throw&expectedRevision=1",
      "https://api.example.com/object-vcs/v1/repos/repo%201/garbage-collection/plan",
      "https://api.example.com/object-vcs/v1/repos/repo%201/garbage-collection/run",
      "https://api.example.com/object-vcs/v1/repos/repo%201/storage-estimate?includeRevisions=true&includeBlobs=false",
      "https://api.example.com/object-vcs/v1/repos/repo%201/schema",
      "https://api.example.com/object-vcs/v1/repos/repo%201/branches",
      "https://api.example.com/object-vcs/v1/repos/repo%201/branches/main/restore",
      "https://api.example.com/object-vcs/v1/repos/repo%201/branches/main/reset"
    ]);
    expect(requests.map(request => request.init?.method)).toEqual([
      "POST",
      "GET",
      "GET",
      "GET",
      "PUT",
      "POST",
      "GET",
      "GET",
      "POST",
      "GET",
      "DELETE",
      "POST",
      "POST",
      "GET",
      "GET",
      "POST",
      "POST",
      "POST"
    ]);

    const createRepoBody = requestBody<CreateRepoRequest<TestState>>(requests[0]);
    expect(createRepoBody).toMatchObject({
      repoId: "repo 1",
      storageMode: "snapshot",
      initialState: state,
      message: "Initial"
    });

    const writeHeadBody = requestBody<WriteHeadRequest<TestState>>(requests[4]);
    expect(writeHeadBody).toMatchObject({
      state,
      stateHash: "sha256:two",
      expectedHeadHash: "sha256:one",
      concurrency: "strict"
    });

    const writeHeaders = new Headers(requests[4]?.init?.headers);
    expect(writeHeaders.get("authorization")).toBe("Bearer token-1");
    expect(writeHeaders.get("x-tenant")).toBe("demo");
    expect(writeHeaders.get("x-object-vcs-client-version")).toBe("test-client");
    expect(writeHeaders.get("x-idempotency-key")).toBe("idem-1");
  });

  it("maps HTTP error responses to Object VCS errors", async () => {
    const { fetch } = createFetchMock([
      jsonResponse(409, {
        error: {
          code: "CONCURRENCY_CONFLICT",
          message: "HEAD has changed."
        }
      }),
      jsonResponse(409, {
        error: {
          code: "REPOSITORY_ALREADY_EXISTS",
          message: "Repository exists."
        }
      }),
      jsonResponse(404, {
        error: {
          code: "REVISION_NOT_FOUND",
          message: "Revision missing."
        }
      }),
      jsonResponse(404, {
        error: {
          code: "TAG_NOT_FOUND",
          message: "Tag missing."
        }
      }),
      jsonResponse(409, {
        error: {
          code: "TAG_REVISION_MISMATCH",
          message: "Tag changed."
        }
      }),
      jsonResponse(409, {
        error: {
          code: "GARBAGE_COLLECTION_PLAN_STALE",
          message: "Plan stale."
        }
      }),
      jsonResponse(409, {
        error: {
          code: "GARBAGE_COLLECTION_UNSAFE",
          message: "Unsafe."
        }
      }),
      jsonResponse(404, {
        error: {
          code: "GARBAGE_COLLECTION_PLAN_NOT_FOUND",
          message: "Plan missing."
        }
      }),
      jsonResponse(422, {
        error: {
          code: "SCHEMA_COMPATIBILITY_ERROR",
          message: "Schema mismatch."
        }
      })
    ]);
    const adapter = httpPersistence<TestState>({
      baseUrl: "https://api.example.com/object-vcs",
      fetch
    });

    await expect(
      adapter.writeHead({
        repoId: "repo 1",
        branchName: "main",
        state,
        stateHash: "sha256:two"
      })
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
    await expect(
      adapter.createRepo({
        repoId: "repo 1",
        schemaVersion: 1,
        graphVersion: "test",
        schemaFingerprint: "manual:test",
        schemaFingerprintAlgorithm: "manual",
        defaultBranch: "main",
        storageMode: "snapshot",
        initialState: state,
        stateHash: "sha256:one",
        commit: true
      })
    ).rejects.toBeInstanceOf(RepositoryAlreadyExistsError);
    await expect(
      adapter.readRevision({ repoId: "repo 1", revision: 99 })
    ).resolves.toBeNull();
    await expect(
      adapter.deleteTag({ repoId: "repo 1", name: "missing" })
    ).rejects.toBeInstanceOf(TagNotFoundError);
    await expect(
      adapter.deleteTag({
        repoId: "repo 1",
        name: "v1",
        expectedRevision: 2
      })
    ).rejects.toBeInstanceOf(TagRevisionMismatchError);
    await expect(
      adapter.runGarbageCollection({
        repoId: "repo 1",
        plan: garbageCollectionPlan
      })
    ).rejects.toBeInstanceOf(GarbageCollectionPlanStaleError);
    await expect(
      adapter.runGarbageCollection({
        repoId: "repo 1",
        plan: garbageCollectionPlan
      })
    ).rejects.toBeInstanceOf(GarbageCollectionUnsafeError);
    await expect(
      adapter.runGarbageCollection({
        repoId: "repo 1",
        plan: garbageCollectionPlan
      })
    ).rejects.toBeInstanceOf(GarbageCollectionPlanNotFoundError);
    await expect(
      adapter.getSchemaIdentity({ repoId: "repo 1" })
    ).rejects.toBeInstanceOf(SchemaCompatibilityError);
  });

  it("reports unsupported branch patching explicitly", async () => {
    const adapter = httpPersistence<TestState>({
      baseUrl: "https://api.example.com/object-vcs",
      fetch: createFetchMock([]).fetch
    });

    await expect(
      adapter.updateBranch({
        repoId: "repo 1",
        branchName: "main",
        headRevision: 1,
        baseRevision: 1,
        headStateHash: "sha256:one",
        status: "clean"
      })
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});

function createFetchMock(responses: Response[]): {
  readonly fetch: HttpFetch;
  readonly requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const fetch = vi.fn<HttpFetch>(async (input, init) => {
    requests.push({ input, init });
    const response = responses.shift();
    if (response === undefined) {
      throw new Error(`Unexpected fetch call to ${input}.`);
    }
    return response;
  });

  return {
    fetch,
    requests
  };
}

function jsonResponse<TBody>(status: number, body: TBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function requestBody<TBody>(request: CapturedRequest | undefined): TBody {
  if (request === undefined || typeof request.init?.body !== "string") {
    throw new Error("Request body is missing.");
  }

  return JSON.parse(request.init.body) as TBody;
}
