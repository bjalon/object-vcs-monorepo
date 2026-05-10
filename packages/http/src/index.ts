import {
  BranchAlreadyExistsError,
  BranchNotFoundError,
  ConcurrencyConflictError,
  DirtyHeadError,
  GarbageCollectionPlanNotFoundError,
  GarbageCollectionPlanStaleError,
  GarbageCollectionUnsafeError,
  PersistenceError,
  RepositoryAlreadyExistsError,
  RepositoryNotFoundError,
  RevisionNotFoundError,
  SchemaCompatibilityError,
  TagAlreadyExistsError,
  TagNotFoundError,
  TagRevisionMismatchError,
  ValidationError,
  type BranchRecord,
  type CreateBranchInput,
  type CreateRepoInput,
  type CreateRepoResult,
  type CreateRevisionInput,
  type CreateRevisionResult,
  type CreateTagInput,
  type DeleteTagInput,
  type DeleteTagResult,
  type EstimateStorageOptions,
  type GarbageCollectionPlan,
  type GarbageCollectionRunResult,
  type GetBranchInput,
  type GetHeadInput,
  type GetRepoInput,
  type GraphIdentity,
  type Head,
  type ListBranchesInput,
  type ListRevisionsInput,
  type ListTagsInput,
  type PersistenceAdapter,
  type PersistenceEstimateStorageInput,
  type PersistencePlanGarbageCollectionInput,
  type PersistenceRunGarbageCollectionInput,
  type ReadRevisionInput,
  type ReadRevisionStateInput,
  type RepoRecord,
  type ResetBranchInput,
  type RepositoryStorageEstimate,
  type RestoreRevisionInput,
  type RevisionRecord,
  type RevisionSummary,
  type StoredRevision,
  type TagRecord,
  type UpdateBranchInput,
  type WriteHeadInput,
  type WriteHeadResult
} from "@bjalon/object-vcs-core";

export type HttpFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type HeadersProvider = () => HeadersInit | Promise<HeadersInit>;
export type AuthTokenProvider = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;
export type IdempotencyKeyProvider = () => string | Promise<string>;

export interface HttpPersistenceOptions {
  readonly baseUrl: string;
  readonly apiVersion?: string;
  readonly fetch?: HttpFetch;
  readonly headers?: HeadersInit | HeadersProvider;
  readonly getAuthToken?: AuthTokenProvider;
  readonly getIdempotencyKey?: IdempotencyKeyProvider;
  readonly clientVersion?: string;
}

export interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export type StorageModeDto = "snapshot" | "patch" | "hybrid";

export interface RepoDto {
  readonly repoId: string;
  readonly schemaVersion: number;
  readonly graphVersion: string;
  readonly schemaFingerprint: string;
  readonly schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
  readonly defaultBranch: string;
  readonly storageMode: StorageModeDto;
  readonly nextRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HeadDto<TState = unknown> {
  readonly repoId: string;
  readonly branchName: string;
  readonly status: "clean" | "dirty";
  readonly headRevision: number | null;
  readonly baseRevision: number | null;
  readonly stateHash: string;
  readonly state: TState;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

export type BranchDto = BranchRecord;
export type RevisionDto = RevisionRecord;
export type TagDto = TagRecord;

export interface CreateRepoRequest<TState = unknown> {
  readonly repoId: string;
  readonly schemaVersion: number;
  readonly graphVersion: string;
  readonly schemaFingerprint: string;
  readonly schemaFingerprintAlgorithm: "manual" | "zod-json-schema-sha256-v1";
  readonly defaultBranch?: string;
  readonly storageMode?: StorageModeDto;
  readonly initialState: TState;
  readonly commit?: boolean;
  readonly message?: string;
  readonly author?: string;
  readonly ifNotExists?: boolean;
}

export interface CreateRepoResponse<TState = unknown> {
  readonly repo: RepoDto;
  readonly head: HeadDto<TState>;
  readonly revision?: RevisionDto;
}

export interface GetRepoResponse {
  readonly repo: RepoDto;
}

export interface ListBranchesResponse {
  readonly branches: BranchDto[];
}

export interface CreateBranchRequest {
  readonly name: string;
  readonly from: number | "HEAD";
  readonly sourceBranch?: string;
  readonly checkout?: boolean;
  readonly author?: string;
}

export interface CreateBranchResponse<TState = unknown> {
  readonly branch: BranchDto;
  readonly head?: HeadDto<TState>;
}

export interface GetHeadResponse<TState = unknown> {
  readonly head: HeadDto<TState>;
}

export interface WriteHeadRequest<TState = unknown> {
  readonly state: TState;
  readonly stateHash: string;
  readonly expectedHeadHash?: string;
  readonly baseRevision?: number | null;
  readonly author?: string;
  readonly concurrency?: "strict" | "last-write-wins";
}

export interface WriteHeadResponse<TState = unknown> {
  readonly head: HeadDto<TState>;
}

export interface CommitRequest<TState = unknown> {
  readonly state?: TState;
  readonly stateHash?: string;
  readonly graphIdentity?: GraphIdentity;
  readonly message?: string;
  readonly author?: string;
  readonly allowEmpty?: boolean;
  readonly expectedHeadHash?: string;
}

export interface CommitResponse<TState = unknown> {
  readonly revision: RevisionDto;
  readonly head: HeadDto<TState>;
  readonly created: boolean;
}

export interface RestoreRequest {
  readonly revision: number;
  readonly commit?: boolean;
  readonly message?: string;
  readonly author?: string;
  readonly expectedHeadHash?: string;
}

export interface RestoreResponse<TState = unknown> {
  readonly head: HeadDto<TState>;
  readonly revision?: RevisionDto;
}

export interface ResetBranchRequest {
  readonly to: number;
  readonly mode: "hard";
  readonly author?: string;
  readonly expectedHeadHash?: string;
}

export interface ResetBranchResponse<TState = unknown> {
  readonly branch: BranchDto;
  readonly head: HeadDto<TState>;
}

export interface ListRevisionsResponse {
  readonly revisions: RevisionDto[];
  readonly nextCursor?: string;
}

export interface GetRevisionResponse {
  readonly revision: RevisionDto;
}

export interface GetRevisionStateResponse<TState = unknown> {
  readonly revision: RevisionDto;
  readonly state: TState;
  readonly stateHash: string;
}

export interface ListTagsResponse {
  readonly tags: TagDto[];
}

export type DeleteTagResponse = DeleteTagResult;

export interface CreateTagRequest {
  readonly name: string;
  readonly revision?: number | "HEAD";
  readonly branch?: string;
  readonly annotation?: string;
  readonly author?: string;
  readonly createRevisionIfDirty?: boolean;
  readonly overwrite?: boolean;
  readonly messageIfRevisionCreated?: string;
  readonly expectedHeadHash?: string;
}

export interface CreateTagResponse<TState = unknown> {
  readonly tag: TagDto;
  readonly revision?: RevisionDto;
  readonly head?: HeadDto<TState>;
}

export type PlanGarbageCollectionRequest = Omit<
  PersistencePlanGarbageCollectionInput,
  "repoId"
>;

export type PlanGarbageCollectionResponse = GarbageCollectionPlan;

export interface RunGarbageCollectionRequest {
  readonly plan: GarbageCollectionPlan;
  readonly dryRun?: boolean;
  readonly recomputeBeforeRun?: true;
  readonly allowStalePlan?: false;
  readonly author?: string;
}

export type RunGarbageCollectionResponse = GarbageCollectionRunResult;

export type StorageEstimateRequest = EstimateStorageOptions;

export type StorageEstimateResponse = RepositoryStorageEstimate;

export type SchemaIdentityResponse = GraphIdentity;

export interface HttpPersistenceAdapter<TState>
  extends PersistenceAdapter<TState> {
  planGarbageCollection(
    input: PersistencePlanGarbageCollectionInput
  ): Promise<GarbageCollectionPlan>;
  runGarbageCollection(
    input: PersistenceRunGarbageCollectionInput
  ): Promise<GarbageCollectionRunResult>;
  estimateStorage(
    input: PersistenceEstimateStorageInput
  ): Promise<RepositoryStorageEstimate>;
  getSchemaIdentity(input: GetRepoInput): Promise<GraphIdentity>;
}

interface ResolvedHttpPersistenceOptions {
  readonly baseUrl: string;
  readonly apiVersion: string;
  readonly fetch: HttpFetch;
  readonly headers?: HeadersInit | HeadersProvider;
  readonly getAuthToken?: AuthTokenProvider;
  readonly getIdempotencyKey?: IdempotencyKeyProvider;
  readonly clientVersion: string;
}

export function httpPersistence<TState>(
  options: HttpPersistenceOptions
): HttpPersistenceAdapter<TState> {
  const resolvedOptions = resolveOptions(options);
  const client = createHttpClient(resolvedOptions);

  return {
    async getRepo(input: GetRepoInput): Promise<RepoRecord | null> {
      try {
        const response = await client.request<GetRepoResponse>({
          method: "GET",
          path: `/repos/${encodePath(input.repoId)}`
        });
        return response.repo;
      } catch (error) {
        if (error instanceof RepositoryNotFoundError) {
          return null;
        }
        throw error;
      }
    },

    async createRepo(
      input: CreateRepoInput<TState>
    ): Promise<CreateRepoResult<TState>> {
      const response = await client.request<CreateRepoResponse<TState>, CreateRepoRequest<TState>>({
        method: "POST",
        path: "/repos",
        write: true,
        body: {
          repoId: input.repoId,
          schemaVersion: input.schemaVersion,
          graphVersion: input.graphVersion,
          schemaFingerprint: input.schemaFingerprint,
          schemaFingerprintAlgorithm: input.schemaFingerprintAlgorithm,
          defaultBranch: input.defaultBranch,
          storageMode: input.storageMode,
          initialState: input.initialState,
          commit: input.commit,
          ...(input.message === undefined ? {} : { message: input.message }),
          ...(input.author === undefined ? {} : { author: input.author })
        }
      });

      return {
        repo: response.repo,
        head: response.head,
        ...(response.revision === undefined
          ? {}
          : { revision: response.revision })
      };
    },

    async getBranch(input: GetBranchInput): Promise<BranchRecord | null> {
      const branches = await this.listBranches({ repoId: input.repoId });
      return (
        branches.find(branch => branch.name === input.branchName) ?? null
      );
    },

    async getHead(input: GetHeadInput): Promise<Head<TState> | null> {
      try {
        const response = await client.request<GetHeadResponse<TState>>({
          method: "GET",
          path: `/repos/${encodePath(input.repoId)}/branches/${encodePath(input.branchName)}/head`
        });
        return response.head;
      } catch (error) {
        if (error instanceof BranchNotFoundError) {
          return null;
        }
        throw error;
      }
    },

    async listBranches(input: ListBranchesInput): Promise<BranchRecord[]> {
      const response = await client.request<ListBranchesResponse>({
        method: "GET",
        path: `/repos/${encodePath(input.repoId)}/branches`
      });
      return response.branches;
    },

    async writeHead(
      input: WriteHeadInput<TState>
    ): Promise<WriteHeadResult<TState>> {
      const response = await client.request<WriteHeadResponse<TState>, WriteHeadRequest<TState>>({
        method: "PUT",
        path: `/repos/${encodePath(input.repoId)}/branches/${encodePath(input.branchName)}/head`,
        write: true,
        body: {
          state: input.state,
          stateHash: input.stateHash,
          ...(input.expectedHeadHash === undefined
            ? {}
            : { expectedHeadHash: input.expectedHeadHash }),
          ...(input.baseRevision === undefined
            ? {}
            : { baseRevision: input.baseRevision }),
          ...(input.author === undefined ? {} : { author: input.author }),
          ...(input.concurrency === undefined
            ? {}
            : { concurrency: input.concurrency })
        }
      });

      return { head: response.head };
    },

    async createRevision(
      input: CreateRevisionInput<TState>
    ): Promise<CreateRevisionResult<TState>> {
      const response = await client.request<CommitResponse<TState>, CommitRequest<TState>>({
        method: "POST",
        path: `/repos/${encodePath(input.repoId)}/branches/${encodePath(input.branchName)}/commit`,
        write: true,
        body: {
          state: input.state,
          stateHash: input.stateHash,
          ...(input.message === undefined ? {} : { message: input.message }),
          ...(input.author === undefined ? {} : { author: input.author }),
          ...(input.allowEmpty === undefined
            ? {}
            : { allowEmpty: input.allowEmpty }),
          ...(input.expectedHeadHash === undefined
            ? {}
            : { expectedHeadHash: input.expectedHeadHash }),
          ...(input.graphIdentity === undefined
            ? {}
            : { graphIdentity: input.graphIdentity })
        }
      });

      return {
        revision: response.revision,
        head: response.head,
        created: response.created
      };
    },

    async readRevision(
      input: ReadRevisionInput
    ): Promise<StoredRevision<TState> | null> {
      try {
        const response = await client.request<GetRevisionStateResponse<TState>>({
          method: "GET",
          path: `/repos/${encodePath(input.repoId)}/revisions/${input.revision}/state`
        });
        return {
          revision: response.revision,
          state: response.state
        };
      } catch (error) {
        if (error instanceof RevisionNotFoundError) {
          return null;
        }
        throw error;
      }
    },

    async readRevisionState(
      input: ReadRevisionStateInput
    ): Promise<TState | null> {
      const storedRevision = await this.readRevision(input);
      return storedRevision?.state ?? null;
    },

    async listRevisions(
      input: ListRevisionsInput
    ): Promise<RevisionSummary[]> {
      const response = await client.request<ListRevisionsResponse>({
        method: "GET",
        path: `/repos/${encodePath(input.repoId)}/revisions`,
        query: {
          ...(input.branchName === undefined ? {} : { branch: input.branchName }),
          ...(input.limit === undefined ? {} : { limit: String(input.limit) }),
          ...(input.after === undefined ? {} : { after: String(input.after) }),
          ...(input.order === undefined ? {} : { order: input.order })
        }
      });
      return response.revisions;
    },

    async createTag(input: CreateTagInput): Promise<TagRecord> {
      const response = await client.request<CreateTagResponse<TState>, CreateTagRequest>({
        method: "POST",
        path: `/repos/${encodePath(input.repoId)}/tags`,
        write: true,
        body: {
          name: input.name,
          ...(input.revision === undefined ? {} : { revision: input.revision }),
          ...(input.branchName === undefined ? {} : { branch: input.branchName }),
          ...(input.annotation === undefined
            ? {}
            : { annotation: input.annotation }),
          ...(input.author === undefined ? {} : { author: input.author }),
          ...(input.createRevisionIfDirty === undefined
            ? {}
            : { createRevisionIfDirty: input.createRevisionIfDirty }),
          ...(input.overwrite === undefined
            ? {}
            : { overwrite: input.overwrite }),
          ...(input.expectedHeadHash === undefined
            ? {}
            : { expectedHeadHash: input.expectedHeadHash })
        }
      });
      return response.tag;
    },

    async listTags(input: ListTagsInput): Promise<TagRecord[]> {
      const response = await client.request<ListTagsResponse>({
        method: "GET",
        path: `/repos/${encodePath(input.repoId)}/tags`
      });
      return response.tags;
    },

    async deleteTag(input: DeleteTagInput): Promise<DeleteTagResult> {
      return client.request<DeleteTagResponse>({
        method: "DELETE",
        path: `/repos/${encodePath(input.repoId)}/tags/${encodePath(input.name)}`,
        query: {
          missing: input.missing ?? "throw",
          ...(input.expectedRevision === undefined
            ? {}
            : { expectedRevision: String(input.expectedRevision) })
        },
        write: true
      });
    },

    async planGarbageCollection(
      input: PersistencePlanGarbageCollectionInput
    ): Promise<GarbageCollectionPlan> {
      return client.request<
        PlanGarbageCollectionResponse,
        PlanGarbageCollectionRequest
      >({
        method: "POST",
        path: `/repos/${encodePath(input.repoId)}/garbage-collection/plan`,
        write: true,
        body: {
          ...(input.beforeRevision === undefined
            ? {}
            : { beforeRevision: input.beforeRevision }),
          ...(input.keepTagged === undefined
            ? {}
            : { keepTagged: input.keepTagged }),
          ...(input.keepBranchHeads === undefined
            ? {}
            : { keepBranchHeads: input.keepBranchHeads }),
          ...(input.keepDirtyBaseRevisions === undefined
            ? {}
            : { keepDirtyBaseRevisions: input.keepDirtyBaseRevisions }),
          ...(input.includeOrphanBlobs === undefined
            ? {}
            : { includeOrphanBlobs: input.includeOrphanBlobs }),
          ...(input.protectRevisions === undefined
            ? {}
            : { protectRevisions: input.protectRevisions }),
          ...(input.maxRevisionsToDelete === undefined
            ? {}
            : { maxRevisionsToDelete: input.maxRevisionsToDelete }),
          ...(input.estimateStorage === undefined
            ? {}
            : { estimateStorage: input.estimateStorage })
        }
      });
    },

    async runGarbageCollection(
      input: PersistenceRunGarbageCollectionInput
    ): Promise<GarbageCollectionRunResult> {
      return client.request<
        RunGarbageCollectionResponse,
        RunGarbageCollectionRequest
      >({
        method: "POST",
        path: `/repos/${encodePath(input.repoId)}/garbage-collection/run`,
        write: true,
        body: {
          plan: input.plan,
          ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
          ...(input.recomputeBeforeRun === undefined
            ? {}
            : { recomputeBeforeRun: input.recomputeBeforeRun }),
          ...(input.allowStalePlan === undefined
            ? {}
            : { allowStalePlan: input.allowStalePlan }),
          ...(input.author === undefined ? {} : { author: input.author })
        }
      });
    },

    async estimateStorage(
      input: PersistenceEstimateStorageInput
    ): Promise<RepositoryStorageEstimate> {
      const response = await client.request<StorageEstimateResponse>({
        method: "GET",
        path: `/repos/${encodePath(input.repoId)}/storage-estimate`,
        query: booleanQuery({
          includeRevisions: input.includeRevisions,
          includeBlobs: input.includeBlobs,
          includeHeads: input.includeHeads,
          includeBranches: input.includeBranches,
          includeTags: input.includeTags,
          adapterSpecific: input.adapterSpecific
        })
      });
      return response;
    },

    async getSchemaIdentity(input: GetRepoInput): Promise<GraphIdentity> {
      return client.request<SchemaIdentityResponse>({
        method: "GET",
        path: `/repos/${encodePath(input.repoId)}/schema`
      });
    },

    async createBranch(input: CreateBranchInput): Promise<BranchRecord> {
      const response = await client.request<CreateBranchResponse<TState>, CreateBranchRequest>({
        method: "POST",
        path: `/repos/${encodePath(input.repoId)}/branches`,
        write: true,
        body: {
          name: input.name,
          from: input.from,
          ...(input.sourceBranch === undefined
            ? {}
            : { sourceBranch: input.sourceBranch }),
          ...(input.checkout === undefined ? {} : { checkout: input.checkout }),
          ...(input.author === undefined ? {} : { author: input.author })
        }
      });
      return response.branch;
    },

    async updateBranch(input: UpdateBranchInput): Promise<BranchRecord> {
      void input;
      throw new PersistenceError(
        "HTTP contract does not expose a generic branch update endpoint."
      );
    },

    async restoreRevision(
      input: RestoreRevisionInput<TState>
    ): Promise<WriteHeadResult<TState>> {
      const response = await client.request<RestoreResponse<TState>, RestoreRequest>({
        method: "POST",
        path: `/repos/${encodePath(input.repoId)}/branches/${encodePath(input.branchName)}/restore`,
        write: true,
        body: {
          revision: input.revision,
          ...(input.commit === undefined ? {} : { commit: input.commit }),
          ...(input.message === undefined ? {} : { message: input.message }),
          ...(input.author === undefined ? {} : { author: input.author }),
          ...(input.expectedHeadHash === undefined
            ? {}
            : { expectedHeadHash: input.expectedHeadHash })
        }
      });
      return { head: response.head };
    },

    async resetBranch(input: ResetBranchInput): Promise<BranchRecord> {
      const response = await client.request<ResetBranchResponse<TState>, ResetBranchRequest>({
        method: "POST",
        path: `/repos/${encodePath(input.repoId)}/branches/${encodePath(input.branchName)}/reset`,
        write: true,
        body: {
          to: input.to,
          mode: input.mode,
          ...(input.author === undefined ? {} : { author: input.author }),
          ...(input.expectedHeadHash === undefined
            ? {}
            : { expectedHeadHash: input.expectedHeadHash })
        }
      });
      return response.branch;
    }
  };
}

export const objectVcsHttpPackage = "@bjalon/object-vcs-http";

interface HttpRequest<TBody> {
  readonly method: "DELETE" | "GET" | "POST" | "PUT";
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: TBody;
  readonly write?: boolean;
}

interface HttpClient {
  request<TResponse, TBody = never>(
    request: HttpRequest<TBody>
  ): Promise<TResponse>;
}

function resolveOptions(
  options: HttpPersistenceOptions
): ResolvedHttpPersistenceOptions {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (fetchImplementation === undefined) {
    throw new PersistenceError(
      "No fetch implementation available. Pass options.fetch."
    );
  }

  return {
    baseUrl: trimSlashes(options.baseUrl),
    apiVersion: trimSlashes(options.apiVersion ?? "v1"),
    fetch: fetchImplementation,
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    ...(options.getAuthToken === undefined
      ? {}
      : { getAuthToken: options.getAuthToken }),
    ...(options.getIdempotencyKey === undefined
      ? {}
      : { getIdempotencyKey: options.getIdempotencyKey }),
    clientVersion: options.clientVersion ?? "0.1.0"
  };
}

function createHttpClient(options: ResolvedHttpPersistenceOptions): HttpClient {
  return {
    async request<TResponse, TBody = never>(
      request: HttpRequest<TBody>
    ): Promise<TResponse> {
      const response = await options.fetch(buildUrl(options, request), {
        method: request.method,
        headers: await buildHeaders(options, request.write === true),
        ...(request.body === undefined
          ? {}
          : { body: JSON.stringify(request.body) })
      });

      if (!response.ok) {
        throw await httpErrorToObjectVcsError(response);
      }

      if (response.status === 204) {
        return undefined as TResponse;
      }

      return readJsonResponse<TResponse>(response);
    }
  };
}

async function buildHeaders(
  options: ResolvedHttpPersistenceOptions,
  write: boolean
): Promise<Headers> {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("X-Object-Vcs-Client-Version", options.clientVersion);

  if (options.headers !== undefined) {
    const providedHeaders =
      typeof options.headers === "function"
        ? await options.headers()
        : options.headers;
    new Headers(providedHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const token = await options.getAuthToken?.();
  if (token !== undefined && token !== null && token.length > 0) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (write && options.getIdempotencyKey !== undefined) {
    headers.set("X-Idempotency-Key", await options.getIdempotencyKey());
  }

  return headers;
}

function buildUrl<TBody>(
  options: ResolvedHttpPersistenceOptions,
  request: HttpRequest<TBody>
): string {
  const query = new URLSearchParams(request.query).toString();
  return `${options.baseUrl}/${options.apiVersion}${request.path}${
    query.length === 0 ? "" : `?${query}`
  }`;
}

async function readJsonResponse<TResponse>(
  response: Response
): Promise<TResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new PersistenceError("HTTP response is not JSON.");
  }

  return (await response.json()) as TResponse;
}

async function httpErrorToObjectVcsError(
  response: Response
): Promise<Error> {
  const errorResponse = await readErrorResponse(response);
  const code = errorResponse?.error.code ?? "";
  const message =
    errorResponse?.error.message ??
    `HTTP request failed with status ${response.status}.`;

  switch (code) {
    case "REPOSITORY_NOT_FOUND":
      return new RepositoryNotFoundError(message);
    case "REPOSITORY_ALREADY_EXISTS":
      return new RepositoryAlreadyExistsError(message);
    case "BRANCH_NOT_FOUND":
      return new BranchNotFoundError(message);
    case "BRANCH_ALREADY_EXISTS":
      return new BranchAlreadyExistsError(message);
    case "REVISION_NOT_FOUND":
      return new RevisionNotFoundError(message);
    case "TAG_ALREADY_EXISTS":
      return new TagAlreadyExistsError(message);
    case "TAG_NOT_FOUND":
      return new TagNotFoundError(message);
    case "TAG_REVISION_MISMATCH":
      return new TagRevisionMismatchError(message);
    case "GARBAGE_COLLECTION_PLAN_STALE":
      return new GarbageCollectionPlanStaleError(message);
    case "GARBAGE_COLLECTION_UNSAFE":
      return new GarbageCollectionUnsafeError(message);
    case "GARBAGE_COLLECTION_PLAN_NOT_FOUND":
      return new GarbageCollectionPlanNotFoundError(message);
    case "SCHEMA_COMPATIBILITY_ERROR":
      return new SchemaCompatibilityError(message);
    case "DIRTY_HEAD":
      return new DirtyHeadError(message);
    case "CONCURRENCY_CONFLICT":
      return new ConcurrencyConflictError(message);
    case "VALIDATION_ERROR":
      return new ValidationError(message, [
        {
          path: [],
          message,
          ...(errorResponse?.error.details === undefined
            ? {}
            : { cause: errorResponse.error.details })
        }
      ]);
    default:
      return fallbackHttpError(response.status, code, message);
  }
}

async function readErrorResponse(
  response: Response
): Promise<ErrorResponse | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  const body = (await response.json()) as unknown;
  if (!isRecord(body) || !isRecord(body.error)) {
    return null;
  }

  const code = body.error.code;
  const message = body.error.message;
  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }

  return {
    error: {
      code,
      message,
      ...(Object.hasOwn(body.error, "details")
        ? { details: body.error.details }
        : {})
    }
  };
}

function fallbackHttpError(
  status: number,
  code: string,
  message: string
): Error {
  if (status === 404) {
    if (code.includes("GARBAGE_COLLECTION")) {
      return new GarbageCollectionPlanNotFoundError(message);
    }
    if (code.includes("TAG")) {
      return new TagNotFoundError(message);
    }
    return new RepositoryNotFoundError(message);
  }

  if (status === 409) {
    if (code.includes("BRANCH")) {
      return new BranchAlreadyExistsError(message);
    }
    if (code.includes("REPOSITORY")) {
      return new RepositoryAlreadyExistsError(message);
    }
    if (code.includes("TAG")) {
      return code.includes("REVISION_MISMATCH")
        ? new TagRevisionMismatchError(message)
        : new TagAlreadyExistsError(message);
    }
    if (code.includes("GARBAGE_COLLECTION")) {
      return code.includes("STALE")
        ? new GarbageCollectionPlanStaleError(message)
        : new GarbageCollectionUnsafeError(message);
    }
    return new ConcurrencyConflictError(message);
  }

  if (status === 422) {
    if (code.includes("SCHEMA")) {
      return new SchemaCompatibilityError(message);
    }
    return new ValidationError(message, [{ path: [], message }]);
  }

  return new PersistenceError(message);
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/u, "").replace(/^\/+/u, "");
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function booleanQuery(
  input: Readonly<Record<string, boolean | undefined>>
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = String(value);
    }
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
