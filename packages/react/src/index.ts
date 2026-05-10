import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

export interface UseRevisionOptions {
  readonly revision?: RevisionNumber | null;
  readonly enabled?: boolean;
}

export interface UseRevisionResult<TState> extends AsyncHookResult {
  readonly state: TState | null;
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

export interface UseCheckoutResult<TState> {
  readonly checkout: (branch: BranchName) => Promise<Head<TState>>;
  readonly loading: boolean;
  readonly error: unknown;
  readonly head: Head<TState> | null;
  readonly reset: () => void;
}

export interface RevisionTimelineProps<TState = unknown> {
  readonly branch?: BranchName;
  readonly revisions?: readonly RevisionSummary[];
  readonly tags?: readonly TagRecord[];
  readonly branches?: readonly BranchRecord[];
  readonly head?: Head<TState> | null;
  readonly selectedRevision?: RevisionNumber | null;
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

export interface RevisionPickerProps {
  readonly revisions: readonly RevisionSummary[];
  readonly selectedRevision?: RevisionNumber | null;
  readonly onSelectRevision?: (
    revision: RevisionSummary
  ) => void | Promise<void>;
}

export interface BranchSelectorProps {
  readonly branches: readonly BranchRecord[];
  readonly selectedBranch?: BranchName;
  readonly onCheckout?: (branch: BranchName) => void | Promise<void>;
}

export interface TagListProps {
  readonly tags: readonly TagRecord[];
}

export interface DiffViewerProps {
  readonly before?: unknown;
  readonly after?: unknown;
}

interface AsyncGuard {
  next(): number;
  isCurrent(requestId: number): boolean;
}

const ObjectVcsContext = createContext<ObjectVcsRepository<unknown> | null>(
  null
);

function useAsyncGuard(): AsyncGuard {
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useMemo(
    () => ({
      next() {
        requestIdRef.current += 1;
        return requestIdRef.current;
      },
      isCurrent(requestId: number) {
        return mountedRef.current && requestIdRef.current === requestId;
      }
    }),
    []
  );
}

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
  const guard = useAsyncGuard();

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const requestId = guard.next();
    setLoading(true);
    setError(undefined);

    try {
      const nextHead = await repository.getHead(toGetHeadOptions(branch));
      if (guard.isCurrent(requestId)) {
        setHead(nextHead);
      }
    } catch (caughtError: unknown) {
      if (guard.isCurrent(requestId)) {
        setError(caughtError);
      }
    } finally {
      if (guard.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [branch, enabled, guard, repository]);

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
  const guard = useAsyncGuard();

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const requestId = guard.next();
    setLoading(true);
    setError(undefined);

    try {
      const nextRevisions = await repository.listRevisions(
        toListRevisionsOptions(branch, limit, after, order)
      );
      if (guard.isCurrent(requestId)) {
        setRevisions(nextRevisions);
      }
    } catch (caughtError: unknown) {
      if (guard.isCurrent(requestId)) {
        setError(caughtError);
      }
    } finally {
      if (guard.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [after, branch, enabled, guard, limit, order, repository]);

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

export function useRevision<TState = unknown>(
  options: UseRevisionOptions
): UseRevisionResult<TState> {
  const repository = useObjectVcs<TState>();
  const enabled = options.enabled ?? true;
  const revision = options.revision;
  const [state, setState] = useState<TState | null>(null);
  const [loading, setLoading] = useState(enabled && revision != null);
  const [error, setError] = useState<unknown>(undefined);
  const guard = useAsyncGuard();

  const reload = useCallback(async () => {
    if (!enabled || revision === undefined || revision === null) {
      return;
    }

    const requestId = guard.next();
    setLoading(true);
    setError(undefined);

    try {
      const nextState = await repository.readRevision(revision);
      if (guard.isCurrent(requestId)) {
        setState(nextState);
      }
    } catch (caughtError: unknown) {
      if (guard.isCurrent(requestId)) {
        setError(caughtError);
      }
    } finally {
      if (guard.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [enabled, guard, repository, revision]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    state,
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
  const guard = useAsyncGuard();

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const requestId = guard.next();
    setLoading(true);
    setError(undefined);

    try {
      const nextTags = await repository.listTags();
      if (guard.isCurrent(requestId)) {
        setTags(nextTags);
      }
    } catch (caughtError: unknown) {
      if (guard.isCurrent(requestId)) {
        setError(caughtError);
      }
    } finally {
      if (guard.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [enabled, guard, repository]);

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
  const guard = useAsyncGuard();

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const requestId = guard.next();
    setLoading(true);
    setError(undefined);

    try {
      const nextBranches = await repository.listBranches();
      if (guard.isCurrent(requestId)) {
        setBranches(nextBranches);
      }
    } catch (caughtError: unknown) {
      if (guard.isCurrent(requestId)) {
        setError(caughtError);
      }
    } finally {
      if (guard.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [enabled, guard, repository]);

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

export function useCheckout<TState = unknown>(): UseCheckoutResult<TState> {
  const repository = useObjectVcs<TState>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [head, setHead] = useState<Head<TState> | null>(null);

  const checkout = useCallback(
    async (branch: BranchName) => {
      setLoading(true);
      setError(undefined);

      try {
        const nextHead = await repository.checkout(branch);
        setHead(nextHead);
        return nextHead;
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
    setHead(null);
  }, []);

  return {
    checkout,
    loading,
    error,
    head,
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
  const branchesResult = useBranches({ enabled: props.branches === undefined });
  const headResult = useHead<TState>({
    ...(branch === undefined ? {} : { branch }),
    enabled: props.head === undefined
  });
  const revisions = props.revisions ?? revisionsResult.revisions;
  const tags = props.tags ?? tagsResult.tags;
  const branches = props.branches ?? branchesResult.branches;
  const head = props.head === undefined ? headResult.head : props.head;
  const loading =
    props.loading ??
    (revisionsResult.loading ||
      tagsResult.loading ||
      branchesResult.loading ||
      headResult.loading);
  const error =
    props.error ??
    revisionsResult.error ??
    tagsResult.error ??
    branchesResult.error ??
    headResult.error;
  const tagsByRevision = useMemo(() => groupTagsByRevision(tags), [tags]);
  const branchesByRevision = useMemo(
    () => groupBranchesByRevision(branches),
    [branches]
  );
  const graphByRevision = useMemo(
    () => buildRevisionGraph(revisions),
    [revisions]
  );

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
          revisions.map((revision, index) =>
            createRevisionItem({
              revision,
              index,
              graph: graphByRevision.get(revision.revision) ?? {
                text: "*",
                title: "revision"
              },
              tags: tagsByRevision.get(revision.revision) ?? [],
              branches: branchesByRevision.get(revision.revision) ?? [],
              head,
              selected:
                props.selectedRevision === revision.revision ||
                (props.selectedRevision === undefined &&
                  head?.status === "clean" &&
                  head.headRevision === revision.revision),
              onSelectRevision: props.onSelectRevision,
              onRestoreRevision: props.onRestoreRevision
            })
          )
        )
  );
}

export function RevisionPicker(props: RevisionPickerProps): ReactElement {
  return createElement(
    "div",
    { style: timelineStyles.tags },
    props.revisions.map(revision =>
      createElement(
        "button",
        {
          key: revision.revision,
          type: "button",
          style:
            props.selectedRevision === revision.revision
              ? timelineStyles.selectedButton
              : timelineStyles.revisionButton,
          onClick: () => {
            void props.onSelectRevision?.(revision);
          }
        },
        `#${revision.revision}`
      )
    )
  );
}

export function BranchSelector(props: BranchSelectorProps): ReactElement {
  return createElement(
    "div",
    { style: timelineStyles.tags },
    props.branches.map(branch =>
      createElement(
        "button",
        {
          key: branch.name,
          type: "button",
          style:
            props.selectedBranch === branch.name
              ? timelineStyles.selectedButton
              : timelineStyles.revisionButton,
          onClick: () => {
            void props.onCheckout?.(branch.name);
          }
        },
        branch.name
      )
    )
  );
}

export function TagList(props: TagListProps): ReactElement {
  return createElement(
    "div",
    { style: timelineStyles.tags },
    props.tags.map(tag =>
      createElement(
        "span",
        {
          key: tag.name,
          style: timelineStyles.tag
        },
        `${tag.name} -> #${tag.revision}`
      )
    )
  );
}

export function DiffViewer(props: DiffViewerProps): ReactElement {
  return createElement(
    "pre",
    { style: timelineStyles.diff },
    JSON.stringify(
      {
        before: props.before ?? null,
        after: props.after ?? null
      },
      null,
      2
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

function groupBranchesByRevision(
  branches: readonly BranchRecord[]
): ReadonlyMap<RevisionNumber, readonly BranchRecord[]> {
  const grouped = new Map<RevisionNumber, BranchRecord[]>();

  for (const branch of branches) {
    if (branch.headRevision === null) {
      continue;
    }

    const existing = grouped.get(branch.headRevision) ?? [];
    existing.push(branch);
    grouped.set(branch.headRevision, existing);
  }

  return grouped;
}

interface RevisionGraphCell {
  readonly text: string;
  readonly title: string;
}

interface BranchRange {
  readonly start: number;
  readonly end: number;
}

interface BranchConnection {
  readonly childBranch: BranchName;
  readonly parentBranch: BranchName;
  readonly parentIndex: number;
}

function buildRevisionGraph(
  revisions: readonly RevisionSummary[]
): ReadonlyMap<RevisionNumber, RevisionGraphCell> {
  const revisionIndex = new Map<RevisionNumber, number>();
  const revisionByNumber = new Map<RevisionNumber, RevisionSummary>();
  const branchRows = new Map<BranchName, number[]>();
  const lanes: BranchName[] = [];

  revisions.forEach((revision, index) => {
    revisionIndex.set(revision.revision, index);
    revisionByNumber.set(revision.revision, revision);

    if (!branchRows.has(revision.branchName)) {
      branchRows.set(revision.branchName, []);
      lanes.push(revision.branchName);
    }

    branchRows.get(revision.branchName)?.push(index);
  });

  const laneByBranch = new Map<BranchName, number>(
    lanes.map((branchName, index) => [branchName, index])
  );
  const ranges = new Map<BranchName, BranchRange>();
  const connections: BranchConnection[] = [];

  for (const [branchName, rows] of branchRows.entries()) {
    const branchStart = Math.min(...rows);
    const branchLastOwnRow = Math.max(...rows);
    let branchEnd = branchLastOwnRow;

    for (const row of rows) {
      const revision = revisions[row];
      if (revision === undefined || revision.parentRevision === null) {
        continue;
      }

      const parent = revisionByNumber.get(revision.parentRevision);
      const parentIndex = revisionIndex.get(revision.parentRevision);
      if (
        parent === undefined ||
        parentIndex === undefined ||
        parent.branchName === revision.branchName
      ) {
        continue;
      }

      connections.push({
        childBranch: revision.branchName,
        parentBranch: parent.branchName,
        parentIndex
      });
      branchEnd = Math.max(branchEnd, parentIndex);
    }

    ranges.set(branchName, {
      start: branchStart,
      end: branchEnd
    });
  }

  const graph = new Map<RevisionNumber, RevisionGraphCell>();

  revisions.forEach((revision, index) => {
    const currentLane = laneByBranch.get(revision.branchName) ?? 0;
    const cells: string[] = lanes.map(branchName => {
      const range = ranges.get(branchName);
      return range !== undefined && index >= range.start && index <= range.end
        ? "│"
        : " ";
    });

    for (const connection of connections.filter(item => item.parentIndex === index)) {
      const childLane = laneByBranch.get(connection.childBranch);
      const parentLane = laneByBranch.get(connection.parentBranch);
      if (childLane === undefined || parentLane === undefined) {
        continue;
      }

      const minLane = Math.min(childLane, parentLane);
      const maxLane = Math.max(childLane, parentLane);
      for (let lane = minLane + 1; lane < maxLane; lane += 1) {
        cells[lane] = "─";
      }
      cells[childLane] = childLane < parentLane ? "╰" : "╯";
    }

    cells[currentLane] = "*";
    graph.set(revision.revision, {
      text: cells.join(" "),
      title:
        revision.parentRevision === null
          ? `${revision.branchName}: root revision`
          : `${revision.branchName}: parent #${revision.parentRevision}`
    });
  });

  return graph;
}

function createRevisionItem<TState>(input: {
  readonly revision: RevisionSummary;
  readonly index: number;
  readonly graph: RevisionGraphCell;
  readonly tags: readonly TagRecord[];
  readonly branches: readonly BranchRecord[];
  readonly head: Head<TState> | null;
  readonly selected: boolean;
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
  const shortHash = input.revision.stateHash.replace(/^sha256:/, "").slice(0, 8);
  const message = input.revision.message ?? "Checkpoint";
  const parentText =
    input.revision.parentRevision === null
      ? "root"
      : `parent #${input.revision.parentRevision}`;
  const refs = [
    ...input.branches.map(branch => ({
      key: `branch:${branch.name}`,
      label: branch.name,
      style: timelineStyles.branchPill
    })),
    ...input.tags.map(tag => ({
      key: `tag:${tag.name}`,
      label: tag.name,
      style: timelineStyles.tagPill
    })),
    ...(isHeadRevision
      ? [
          {
            key: "head",
            label: "HEAD",
            style: timelineStyles.headPill
          }
        ]
      : []),
    ...(isBaseRevision
      ? [
          {
            key: "base",
            label: "BASE",
            style: timelineStyles.basePill
          }
        ]
      : [])
  ];

  return createElement(
    "li",
    {
      key: input.revision.revision,
      style: input.selected ? timelineStyles.selectedItem : timelineStyles.item
    },
    createElement(
      "div",
      { style: timelineStyles.graphRow },
      createElement(
        "pre",
        {
          "aria-hidden": true,
          title: input.graph.title,
          style: timelineStyles.graphCell
        },
        input.graph.text
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            void input.onSelectRevision?.(input.revision);
          },
          style: input.selected
            ? timelineStyles.selectedRevisionLine
            : timelineStyles.revisionLine
        },
        createElement(
          "span",
          { style: timelineStyles.oneline },
          createElement("span", { style: timelineStyles.revisionNumber }, `#${input.revision.revision}`),
          createElement("span", { style: timelineStyles.shortHash }, shortHash),
          createElement("span", { style: timelineStyles.parentRef }, parentText),
          createElement("span", { style: timelineStyles.message }, message)
        ),
        refs.length === 0
          ? null
          : createElement(
              "span",
              { style: timelineStyles.refs },
              refs.map(ref =>
                createElement(
                  "span",
                  {
                    key: ref.key,
                    style: ref.style
                  },
                  ref.label
                )
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
    ),
    createElement(
      "div",
      { style: timelineStyles.meta },
      input.revision.createdAt,
      input.revision.createdBy === undefined
        ? null
        : ` · ${input.revision.createdBy}`
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
    border: "1px solid #d8dee9",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#ffffff"
  },
  selectedItem: {
    display: "grid",
    gap: 6,
    border: "1px solid #0f766e",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#ecfdf5",
    boxShadow: "0 1px 2px rgb(15 118 110 / 18%)"
  },
  graphRow: {
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 8,
    minWidth: 0
  },
  graphCell: {
    color: "#0f766e",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1,
    margin: 0,
    minWidth: 18,
    overflow: "visible",
    whiteSpace: "pre"
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
    color: "#111827",
    padding: "4px 8px",
    cursor: "pointer",
    font: "inherit"
  },
  selectedButton: {
    border: "1px solid #2563eb",
    borderRadius: 6,
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "4px 8px",
    cursor: "pointer",
    font: "inherit"
  },
  restoreButton: {
    justifySelf: "start",
    border: "1px solid #9ca3af",
    borderRadius: 6,
    background: "#ffffff",
    color: "#334155",
    padding: "4px 8px",
    cursor: "pointer",
    font: "inherit"
  },
  revisionLine: {
    alignItems: "center",
    background: "transparent",
    border: "0",
    borderRadius: 6,
    color: "#111827",
    cursor: "pointer",
    display: "flex",
    flexWrap: "wrap",
    font: "inherit",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 34,
    minWidth: 0,
    padding: "5px 6px",
    textAlign: "left"
  },
  selectedRevisionLine: {
    alignItems: "center",
    background: "#d1fae5",
    border: "0",
    borderRadius: 6,
    color: "#064e3b",
    cursor: "pointer",
    display: "flex",
    flexWrap: "wrap",
    font: "inherit",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 34,
    minWidth: 0,
    padding: "5px 6px",
    textAlign: "left"
  },
  oneline: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    minWidth: 0
  },
  revisionNumber: {
    color: "#0f766e",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontWeight: 800,
    whiteSpace: "nowrap"
  },
  shortHash: {
    color: "#64748b",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    whiteSpace: "nowrap"
  },
  parentRef: {
    color: "#64748b",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    whiteSpace: "nowrap"
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
  refs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "flex-end"
  },
  tag: {
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    padding: "2px 6px",
    background: "#f8fafc",
    color: "#334155",
    fontSize: 12
  },
  tagPill: {
    border: "1px solid #fde68a",
    borderRadius: 999,
    padding: "2px 7px",
    background: "#fffbeb",
    color: "#92400e",
    fontSize: 12,
    fontWeight: 700
  },
  branchPill: {
    border: "1px solid #99f6e4",
    borderRadius: 999,
    padding: "2px 7px",
    background: "#f0fdfa",
    color: "#0f766e",
    fontSize: 12,
    fontWeight: 700
  },
  headPill: {
    border: "1px solid #bfdbfe",
    borderRadius: 999,
    padding: "2px 7px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800
  },
  basePill: {
    border: "1px solid #fed7aa",
    borderRadius: 999,
    padding: "2px 7px",
    background: "#fff7ed",
    color: "#c2410c",
    fontSize: 12,
    fontWeight: 800
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
  },
  diff: {
    overflow: "auto",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: 8,
    background: "#f9fafb",
    fontSize: 12
  }
} satisfies Record<string, CSSProperties>;
