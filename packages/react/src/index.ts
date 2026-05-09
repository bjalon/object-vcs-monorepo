import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from "react";

import type {
  BranchName,
  BranchRecord,
  CommitOptions,
  CommitResult,
  GetHeadOptions,
  Head,
  ListRevisionsOptions,
  ObjectVcsRepository,
  RestoreOptions,
  RevisionNumber,
  RevisionSummary,
  TagRecord
} from "@bjalon/object-vcs-core";

export interface ObjectVcsProviderProps<TState> {
  readonly repository: ObjectVcsRepository<TState>;
  readonly children?: ReactNode;
}

export interface AsyncHookResult {
  readonly loading: boolean;
  readonly error: unknown;
  readonly reload: () => Promise<void>;
}

export interface UseHeadOptions extends GetHeadOptions {
  readonly enabled?: boolean;
}

export interface UseHeadResult<TState> extends AsyncHookResult {
  readonly head: Head<TState> | null;
  readonly state: TState | null;
}

export interface UseRevisionsOptions extends ListRevisionsOptions {
  readonly enabled?: boolean;
}

export interface UseRevisionsResult extends AsyncHookResult {
  readonly revisions: readonly RevisionSummary[];
}

export interface UseTagsOptions {
  readonly enabled?: boolean;
}

export interface UseTagsResult extends AsyncHookResult {
  readonly tags: readonly TagRecord[];
}

export interface UseBranchesOptions {
  readonly enabled?: boolean;
}

export interface UseBranchesResult extends AsyncHookResult {
  readonly branches: readonly BranchRecord[];
}

export interface UseCommitResult<TState> {
  readonly commit: (options?: CommitOptions) => Promise<CommitResult<TState>>;
  readonly loading: boolean;
  readonly error: unknown;
  readonly result: CommitResult<TState> | null;
  readonly reset: () => void;
}

export interface RevisionTimelineProps<TState = unknown> {
  readonly branch?: BranchName;
  readonly revisions?: readonly RevisionSummary[];
  readonly tags?: readonly TagRecord[];
  readonly head?: Head<TState> | null;
  readonly loading?: boolean;
  readonly error?: unknown;
  readonly onSelectRevision?: (
    revision: RevisionSummary
  ) => void | Promise<void>;
  readonly onRestoreRevision?: (
    revision: RevisionSummary,
    options?: RestoreOptions
  ) => void | Promise<void>;
}

const ObjectVcsContext = createContext<ObjectVcsRepository<unknown> | null>(
  null
);

export function ObjectVcsProvider<TState>(
  props: ObjectVcsProviderProps<TState>
): ReactElement {
  return createElement(
    ObjectVcsContext.Provider,
    {
      value: props.repository as ObjectVcsRepository<unknown>
    },
    props.children
  );
}

export function useObjectVcs<TState = unknown>(): ObjectVcsRepository<TState> {
  const repository = useContext(ObjectVcsContext);

  if (repository === null) {
    throw new Error("ObjectVcsProvider is missing.");
  }

  return repository as ObjectVcsRepository<TState>;
}

export function useHead<TState = unknown>(
  options: UseHeadOptions = {}
): UseHeadResult<TState> {
  const repository = useObjectVcs<TState>();
  const enabled = options.enabled ?? true;
  const branch = options.branch;
  const [head, setHead] = useState<Head<TState> | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(undefined);

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      setHead(await repository.getHead(toGetHeadOptions(branch)));
    } catch (caughtError: unknown) {
      setError(caughtError);
    } finally {
      setLoading(false);
    }
  }, [branch, enabled, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    head,
    state: head?.state ?? null,
    loading,
    error,
    reload
  };
}

export function useRevisions(
  options: UseRevisionsOptions = {}
): UseRevisionsResult {
  const repository = useObjectVcs<unknown>();
  const enabled = options.enabled ?? true;
  const branch = options.branch;
  const limit = options.limit;
  const after = options.after;
  const order = options.order;
  const [revisions, setRevisions] = useState<readonly RevisionSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(undefined);

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      setRevisions(
        await repository.listRevisions(
          toListRevisionsOptions(branch, limit, after, order)
        )
      );
    } catch (caughtError: unknown) {
      setError(caughtError);
    } finally {
      setLoading(false);
    }
  }, [after, branch, enabled, limit, order, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    revisions,
    loading,
    error,
    reload
  };
}

export function useTags(options: UseTagsOptions = {}): UseTagsResult {
  const repository = useObjectVcs<unknown>();
  const enabled = options.enabled ?? true;
  const [tags, setTags] = useState<readonly TagRecord[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(undefined);

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      setTags(await repository.listTags());
    } catch (caughtError: unknown) {
      setError(caughtError);
    } finally {
      setLoading(false);
    }
  }, [enabled, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    tags,
    loading,
    error,
    reload
  };
}

export function useBranches(
  options: UseBranchesOptions = {}
): UseBranchesResult {
  const repository = useObjectVcs<unknown>();
  const enabled = options.enabled ?? true;
  const [branches, setBranches] = useState<readonly BranchRecord[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(undefined);

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      setBranches(await repository.listBranches());
    } catch (caughtError: unknown) {
      setError(caughtError);
    } finally {
      setLoading(false);
    }
  }, [enabled, repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    branches,
    loading,
    error,
    reload
  };
}

export function useCommit<TState = unknown>(): UseCommitResult<TState> {
  const repository = useObjectVcs<TState>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [result, setResult] = useState<CommitResult<TState> | null>(null);

  const commit = useCallback(
    async (options: CommitOptions = {}) => {
      setLoading(true);
      setError(undefined);

      try {
        const commitResult = await repository.commit(options);
        setResult(commitResult);
        return commitResult;
      } catch (caughtError: unknown) {
        setError(caughtError);
        throw caughtError;
      } finally {
        setLoading(false);
      }
    },
    [repository]
  );

  const reset = useCallback(() => {
    setError(undefined);
    setResult(null);
  }, []);

  return {
    commit,
    loading,
    error,
    result,
    reset
  };
}

export function RevisionTimeline<TState = unknown>(
  props: RevisionTimelineProps<TState>
): ReactElement {
  const branch = props.branch;
  const revisionsResult = useRevisions({
    ...(branch === undefined ? {} : { branch }),
    enabled: props.revisions === undefined
  });
  const tagsResult = useTags({ enabled: props.tags === undefined });
  const headResult = useHead<TState>({
    ...(branch === undefined ? {} : { branch }),
    enabled: props.head === undefined
  });
  const revisions = props.revisions ?? revisionsResult.revisions;
  const tags = props.tags ?? tagsResult.tags;
  const head = props.head === undefined ? headResult.head : props.head;
  const loading =
    props.loading ??
    (revisionsResult.loading || tagsResult.loading || headResult.loading);
  const error =
    props.error ?? revisionsResult.error ?? tagsResult.error ?? headResult.error;
  const tagsByRevision = useMemo(() => groupTagsByRevision(tags), [tags]);

  return createElement(
    "section",
    {
      "data-object-vcs": "revision-timeline",
      style: timelineStyles.root
    },
    createElement(
      "header",
      { style: timelineStyles.header },
      createElement(
        "strong",
        null,
        branch === undefined ? "Revisions" : `Revisions ${branch}`
      ),
      createElement(
        "span",
        {
          "data-head-status": head?.status ?? "unknown",
          style: statusStyle(head?.status)
        },
        headStatusText(head)
      )
    ),
    loading
      ? createElement("div", { style: timelineStyles.muted }, "Loading")
      : null,
    error === undefined
      ? null
      : createElement("div", { style: timelineStyles.error }, errorText(error)),
    revisions.length === 0
      ? createElement("div", { style: timelineStyles.muted }, "No revisions")
      : createElement(
          "ol",
          { style: timelineStyles.list },
          revisions.map(revision =>
            createRevisionItem({
              revision,
              tags: tagsByRevision.get(revision.revision) ?? [],
              head,
              onSelectRevision: props.onSelectRevision,
              onRestoreRevision: props.onRestoreRevision
            })
          )
        )
  );
}

export const objectVcsReactPackage = "@bjalon/object-vcs-react";

function toGetHeadOptions(branch: BranchName | undefined): GetHeadOptions {
  return branch === undefined ? {} : { branch };
}

function toListRevisionsOptions(
  branch: BranchName | undefined,
  limit: number | undefined,
  after: RevisionNumber | undefined,
  order: "asc" | "desc" | undefined
): ListRevisionsOptions {
  return {
    ...(branch === undefined ? {} : { branch }),
    ...(limit === undefined ? {} : { limit }),
    ...(after === undefined ? {} : { after }),
    ...(order === undefined ? {} : { order })
  };
}

function groupTagsByRevision(
  tags: readonly TagRecord[]
): ReadonlyMap<RevisionNumber, readonly TagRecord[]> {
  const grouped = new Map<RevisionNumber, TagRecord[]>();

  for (const tag of tags) {
    const existing = grouped.get(tag.revision) ?? [];
    existing.push(tag);
    grouped.set(tag.revision, existing);
  }

  return grouped;
}

function createRevisionItem<TState>(input: {
  readonly revision: RevisionSummary;
  readonly tags: readonly TagRecord[];
  readonly head: Head<TState> | null;
  readonly onSelectRevision:
    | ((revision: RevisionSummary) => void | Promise<void>)
    | undefined;
  readonly onRestoreRevision:
    | ((revision: RevisionSummary, options?: RestoreOptions) => void | Promise<void>)
    | undefined;
}): ReactElement {
  const isHeadRevision =
    input.head?.status === "clean" &&
    input.head.headRevision === input.revision.revision;
  const isBaseRevision =
    input.head?.status === "dirty" &&
    input.head.baseRevision === input.revision.revision;

  return createElement(
    "li",
    {
      key: input.revision.revision,
      style: timelineStyles.item
    },
    createElement(
      "div",
      { style: timelineStyles.itemMain },
      createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            void input.onSelectRevision?.(input.revision);
          },
          style: timelineStyles.revisionButton
        },
        `#${input.revision.revision}`
      ),
      createElement(
        "span",
        { style: timelineStyles.message },
        input.revision.message ?? "Checkpoint"
      ),
      isHeadRevision
        ? createElement("span", { style: timelineStyles.badge }, "HEAD")
        : null,
      isBaseRevision
        ? createElement("span", { style: timelineStyles.badge }, "BASE")
        : null
    ),
    createElement(
      "div",
      { style: timelineStyles.meta },
      input.revision.createdAt,
      input.revision.createdBy === undefined
        ? null
        : ` · ${input.revision.createdBy}`
    ),
    input.tags.length === 0
      ? null
      : createElement(
          "div",
          { style: timelineStyles.tags },
          input.tags.map(tag =>
            createElement(
              "span",
              {
                key: tag.name,
                style: timelineStyles.tag
              },
              tag.name
            )
          )
        ),
    input.onRestoreRevision === undefined
      ? null
      : createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              void input.onRestoreRevision?.(input.revision, {
                commit: false
              });
            },
            style: timelineStyles.restoreButton
          },
          "Restore"
        )
  );
}

function headStatusText<TState>(head: Head<TState> | null): string {
  if (head === null) {
    return "HEAD unknown";
  }

  return head.status === "clean"
    ? `HEAD clean #${head.headRevision ?? "-"}`
    : `HEAD dirty base #${head.baseRevision ?? "-"}`;
}

function statusStyle(status: "clean" | "dirty" | undefined): CSSProperties {
  return {
    ...timelineStyles.status,
    borderColor: status === "dirty" ? "#b45309" : "#15803d",
    color: status === "dirty" ? "#92400e" : "#166534",
    background: status === "dirty" ? "#fff7ed" : "#f0fdf4"
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const timelineStyles = {
  root: {
    display: "grid",
    gap: 8,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 14,
    color: "#111827"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  status: {
    border: "1px solid",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 12,
    whiteSpace: "nowrap"
  },
  list: {
    display: "grid",
    gap: 8,
    listStyle: "none",
    margin: 0,
    padding: 0
  },
  item: {
    display: "grid",
    gap: 6,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: 10,
    background: "#ffffff"
  },
  itemMain: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0
  },
  revisionButton: {
    border: "1px solid #9ca3af",
    borderRadius: 6,
    background: "#f9fafb",
    padding: "4px 8px",
    cursor: "pointer",
    font: "inherit"
  },
  restoreButton: {
    justifySelf: "start",
    border: "1px solid #9ca3af",
    borderRadius: 6,
    background: "#ffffff",
    padding: "4px 8px",
    cursor: "pointer",
    font: "inherit"
  },
  message: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  meta: {
    color: "#6b7280",
    fontSize: 12
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4
  },
  tag: {
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    padding: "2px 6px",
    background: "#f8fafc",
    color: "#334155",
    fontSize: 12
  },
  badge: {
    border: "1px solid #bfdbfe",
    borderRadius: 6,
    padding: "2px 6px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12
  },
  muted: {
    color: "#6b7280"
  },
  error: {
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: 8
  }
} satisfies Record<string, CSSProperties>;
