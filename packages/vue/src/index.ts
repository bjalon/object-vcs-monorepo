import {
  computed,
  defineComponent,
  h,
  inject,
  onMounted,
  provide,
  ref,
  unref,
  watch,
  type App,
  type ComputedRef,
  type InjectionKey,
  type PropType,
  type Ref,
  type VNode
} from "vue";

import type {
  BranchName,
  Head,
  ObjectVcsRepository,
  RestoreOptions,
  RevisionNumber,
  RevisionSummary,
  TagRecord
} from "@bjalon/object-vcs-core";

export type MaybeRef<TValue> = TValue | Ref<TValue>;

export interface ObjectVcsPluginOptions<TState> {
  readonly repository: ObjectVcsRepository<TState>;
}

export interface AsyncComposableResult {
  readonly loading: Ref<boolean>;
  readonly error: Ref<unknown>;
  readonly reload: () => Promise<void>;
}

export interface UseHeadOptions {
  readonly branch?: MaybeRef<BranchName | undefined>;
  readonly enabled?: MaybeRef<boolean>;
}

export interface UseHeadResult<TState> extends AsyncComposableResult {
  readonly head: Ref<Head<TState> | null>;
  readonly state: ComputedRef<TState | null>;
}

export interface UseRevisionsOptions {
  readonly branch?: MaybeRef<BranchName | undefined>;
  readonly limit?: number;
  readonly after?: RevisionNumber;
  readonly order?: "asc" | "desc";
  readonly enabled?: MaybeRef<boolean>;
}

export interface UseRevisionsResult extends AsyncComposableResult {
  readonly revisions: Ref<readonly RevisionSummary[]>;
}

export interface UseTagsOptions {
  readonly enabled?: MaybeRef<boolean>;
}

export interface UseTagsResult extends AsyncComposableResult {
  readonly tags: Ref<readonly TagRecord[]>;
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

const objectVcsInjectionKey: InjectionKey<ObjectVcsRepository<unknown>> =
  Symbol("ObjectVcsRepository");

export function createObjectVcsPlugin<TState>(
  options: ObjectVcsPluginOptions<TState> | ObjectVcsRepository<TState>
): { install(app: App): void } {
  const repository =
    "repository" in options ? options.repository : options;

  return {
    install(app: App) {
      app.provide(
        objectVcsInjectionKey,
        repository as ObjectVcsRepository<unknown>
      );
    }
  };
}

export function provideObjectVcs<TState>(
  repository: ObjectVcsRepository<TState>
): void {
  provide(objectVcsInjectionKey, repository as ObjectVcsRepository<unknown>);
}

export function useObjectVcs<TState = unknown>(): ObjectVcsRepository<TState> {
  const repository = inject(objectVcsInjectionKey);

  if (repository === undefined) {
    throw new Error("Object VCS Vue plugin is missing.");
  }

  return repository as ObjectVcsRepository<TState>;
}

export function useHead<TState = unknown>(
  options: UseHeadOptions = {}
): UseHeadResult<TState> {
  const repository = useObjectVcs<TState>();
  const head = ref<Head<TState> | null>(null) as Ref<Head<TState> | null>;
  const loading = ref(unref(options.enabled) ?? true);
  const error = ref<unknown>(undefined);
  const state = computed(() => head.value?.state ?? null);

  const reload = async () => {
    if ((unref(options.enabled) ?? true) !== true) {
      return;
    }

    loading.value = true;
    error.value = undefined;

    try {
      head.value = await repository.getHead(
        toGetHeadOptions(unref(options.branch))
      );
    } catch (caughtError: unknown) {
      error.value = caughtError;
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    void reload();
  });
  watch(
    () => [unref(options.branch), unref(options.enabled)] as const,
    () => {
      void reload();
    }
  );

  return {
    head,
    state,
    loading,
    error,
    reload
  };
}

export function useRevisions(
  options: UseRevisionsOptions = {}
): UseRevisionsResult {
  const repository = useObjectVcs<unknown>();
  const revisions = ref<readonly RevisionSummary[]>([]);
  const loading = ref(unref(options.enabled) ?? true);
  const error = ref<unknown>(undefined);

  const reload = async () => {
    if ((unref(options.enabled) ?? true) !== true) {
      return;
    }

    loading.value = true;
    error.value = undefined;

    try {
      revisions.value = await repository.listRevisions(
        toListRevisionsOptions(options)
      );
    } catch (caughtError: unknown) {
      error.value = caughtError;
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    void reload();
  });
  watch(
    () =>
      [
        unref(options.branch),
        options.limit,
        options.after,
        options.order,
        unref(options.enabled)
      ] as const,
    () => {
      void reload();
    }
  );

  return {
    revisions,
    loading,
    error,
    reload
  };
}

export function useTags(options: UseTagsOptions = {}): UseTagsResult {
  const repository = useObjectVcs<unknown>();
  const tags = ref<readonly TagRecord[]>([]);
  const loading = ref(unref(options.enabled) ?? true);
  const error = ref<unknown>(undefined);

  const reload = async () => {
    if ((unref(options.enabled) ?? true) !== true) {
      return;
    }

    loading.value = true;
    error.value = undefined;

    try {
      tags.value = await repository.listTags();
    } catch (caughtError: unknown) {
      error.value = caughtError;
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    void reload();
  });
  watch(
    () => unref(options.enabled),
    () => {
      void reload();
    }
  );

  return {
    tags,
    loading,
    error,
    reload
  };
}

export const RevisionTimeline = defineComponent({
  name: "RevisionTimeline",
  props: {
    branch: {
      type: String,
      required: false
    },
    revisions: {
      type: Array as PropType<readonly RevisionSummary[]>,
      required: false
    },
    tags: {
      type: Array as PropType<readonly TagRecord[]>,
      required: false
    },
    head: {
      type: Object as PropType<Head<unknown> | null>,
      required: false
    },
    loading: {
      type: Boolean,
      required: false
    },
    error: {
      type: null as unknown as PropType<unknown>,
      required: false
    },
    onSelectRevision: {
      type: Function as PropType<
        (revision: RevisionSummary) => void | Promise<void>
      >,
      required: false
    },
    onRestoreRevision: {
      type: Function as PropType<
        (revision: RevisionSummary, options?: RestoreOptions) => void | Promise<void>
      >,
      required: false
    }
  },
  setup(props) {
    const shouldLoadRevisions = computed(() => props.revisions === undefined);
    const shouldLoadHead = computed(() => props.head === undefined);
    const shouldLoadTags = computed(() => props.tags === undefined);
    const revisionsResult = useRevisions({
      branch: computed(() => props.branch),
      enabled: shouldLoadRevisions
    });
    const tagsResult = useTags({
      enabled: shouldLoadTags
    });
    const headResult = useHead({
      branch: computed(() => props.branch),
      enabled: shouldLoadHead
    });

    return () => {
      const revisions = props.revisions ?? revisionsResult.revisions.value;
      const tags = props.tags ?? tagsResult.tags.value;
      const head = props.head === undefined ? headResult.head.value : props.head;
      const loading =
        props.loading ??
        (revisionsResult.loading.value ||
          tagsResult.loading.value ||
          headResult.loading.value);
      const error =
        props.error ??
        revisionsResult.error.value ??
        tagsResult.error.value ??
        headResult.error.value;
      const tagsByRevision = groupTagsByRevision(tags);

      return h(
        "section",
        {
          "data-object-vcs": "revision-timeline",
          style: timelineStyles.root
        },
        [
          h("header", { style: timelineStyles.header }, [
            h(
              "strong",
              props.branch === undefined
                ? "Revisions"
                : `Revisions ${props.branch}`
            ),
            h(
              "span",
              {
                "data-head-status": head?.status ?? "unknown",
                style: statusStyle(head?.status)
              },
              headStatusText(head)
            )
          ]),
          loading ? h("div", { style: timelineStyles.muted }, "Loading") : null,
          error === undefined
            ? null
            : h("div", { style: timelineStyles.error }, errorText(error)),
          revisions.length === 0
            ? h("div", { style: timelineStyles.muted }, "No revisions")
            : h(
                "ol",
                { style: timelineStyles.list },
                revisions.map(revision =>
                  revisionNode({
                    revision,
                    tags: tagsByRevision.get(revision.revision) ?? [],
                    head,
                    onSelectRevision: props.onSelectRevision,
                    onRestoreRevision: props.onRestoreRevision
                  })
                )
              )
        ]
      );
    };
  }
});

export const objectVcsVuePackage = "@bjalon/object-vcs-vue";

function revisionNode(input: {
  readonly revision: RevisionSummary;
  readonly tags: readonly TagRecord[];
  readonly head: Head<unknown> | null;
  readonly onSelectRevision:
    | ((revision: RevisionSummary) => void | Promise<void>)
    | undefined;
  readonly onRestoreRevision:
    | ((revision: RevisionSummary, options?: RestoreOptions) => void | Promise<void>)
    | undefined;
}): VNode {
  const isHeadRevision =
    input.head?.status === "clean" &&
    input.head.headRevision === input.revision.revision;
  const isBaseRevision =
    input.head?.status === "dirty" &&
    input.head.baseRevision === input.revision.revision;

  return h(
    "li",
    {
      key: input.revision.revision,
      style: timelineStyles.item
    },
    [
      h("div", { style: timelineStyles.itemMain }, [
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              void input.onSelectRevision?.(input.revision);
            },
            style: timelineStyles.button
          },
          `#${input.revision.revision}`
        ),
        h(
          "span",
          { style: timelineStyles.message },
          input.revision.message ?? "Checkpoint"
        ),
        isHeadRevision
          ? h("span", { style: timelineStyles.badge }, "HEAD")
          : null,
        isBaseRevision
          ? h("span", { style: timelineStyles.badge }, "BASE")
          : null
      ]),
      h("div", { style: timelineStyles.meta }, input.revision.createdAt),
      input.tags.length === 0
        ? null
        : h(
            "div",
            { style: timelineStyles.tags },
            input.tags.map(tag =>
              h("span", { key: tag.name, style: timelineStyles.tag }, tag.name)
            )
          ),
      input.onRestoreRevision === undefined
        ? null
        : h(
            "button",
            {
              type: "button",
              onClick: () => {
                void input.onRestoreRevision?.(input.revision, {
                  commit: false
                });
              },
              style: timelineStyles.button
            },
            "Restore"
          )
    ]
  );
}

function toGetHeadOptions(
  branch: BranchName | undefined
): { readonly branch?: BranchName } {
  return branch === undefined ? {} : { branch };
}

function toListRevisionsOptions(options: UseRevisionsOptions): {
  readonly branch?: BranchName;
  readonly limit?: number;
  readonly after?: RevisionNumber;
  readonly order?: "asc" | "desc";
} {
  const branch = unref(options.branch);
  return {
    ...(branch === undefined ? {} : { branch }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.after === undefined ? {} : { after: options.after }),
    ...(options.order === undefined ? {} : { order: options.order })
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

function headStatusText<TState>(head: Head<TState> | null): string {
  if (head === null) {
    return "HEAD unknown";
  }

  return head.status === "clean"
    ? `HEAD clean #${head.headRevision ?? "-"}`
    : `HEAD dirty base #${head.baseRevision ?? "-"}`;
}

function statusStyle(status: "clean" | "dirty" | undefined) {
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
    gap: "8px",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: "14px",
    color: "#111827"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px"
  },
  status: {
    border: "1px solid",
    borderRadius: "6px",
    padding: "2px 8px",
    fontSize: "12px"
  },
  list: {
    display: "grid",
    gap: "8px",
    listStyle: "none",
    margin: "0",
    padding: "0"
  },
  item: {
    display: "grid",
    gap: "6px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    padding: "10px",
    background: "#ffffff"
  },
  itemMain: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  button: {
    border: "1px solid #9ca3af",
    borderRadius: "6px",
    background: "#f9fafb",
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
    fontSize: "12px"
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px"
  },
  tag: {
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    padding: "2px 6px",
    background: "#f8fafc",
    color: "#334155",
    fontSize: "12px"
  },
  badge: {
    border: "1px solid #bfdbfe",
    borderRadius: "6px",
    padding: "2px 6px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: "12px"
  },
  muted: {
    color: "#6b7280"
  },
  error: {
    color: "#991b1b",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "8px"
  }
} as const;
