import type {
  BranchName,
  BranchRecord,
  Head,
  ObjectVcsRepository,
  RestoreOptions,
  RevisionNumber,
  RevisionSummary,
  TagRecord
} from "@bjalon/object-vcs-core";

export interface RevisionTimelineOptions<TState = unknown> {
  readonly repo?: ObjectVcsRepository<TState>;
  readonly branch?: BranchName;
  readonly revisions?: readonly RevisionSummary[];
  readonly tags?: readonly TagRecord[];
  readonly head?: Head<TState> | null;
  readonly loading?: boolean;
  readonly error?: unknown;
  readonly autoLoad?: boolean;
  readonly onSelectRevision?: (
    revision: RevisionSummary
  ) => void | Promise<void>;
  readonly onRestoreRevision?: (
    revision: RevisionSummary,
    options?: RestoreOptions
  ) => void | Promise<void>;
}

export interface RevisionTimelineController<TState = unknown> {
  refresh(): Promise<void>;
  update(options: Partial<RevisionTimelineOptions<TState>>): void;
  destroy(): void;
}

export interface BranchSelectorOptions {
  readonly branches: readonly BranchRecord[];
  readonly selectedBranch?: BranchName;
  readonly onCheckout?: (branch: BranchName) => void | Promise<void>;
}

export interface TagListOptions {
  readonly tags: readonly TagRecord[];
}

export interface DomController<TOptions> {
  update(options: Partial<TOptions>): void;
  destroy(): void;
}

interface TimelineState<TState> {
  repo?: ObjectVcsRepository<TState>;
  branch?: BranchName;
  revisions: readonly RevisionSummary[];
  tags: readonly TagRecord[];
  head: Head<TState> | null;
  loading: boolean;
  error: unknown;
  autoLoad: boolean;
  onSelectRevision?: (
    revision: RevisionSummary
  ) => void | Promise<void>;
  onRestoreRevision?: (
    revision: RevisionSummary,
    options?: RestoreOptions
  ) => void | Promise<void>;
}

export function createRevisionTimeline<TState = unknown>(
  element: Element,
  options: RevisionTimelineOptions<TState>
): RevisionTimelineController<TState> {
  const state: TimelineState<TState> = {
    ...(options.repo === undefined ? {} : { repo: options.repo }),
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    revisions: options.revisions ?? [],
    tags: options.tags ?? [],
    head: options.head ?? null,
    loading: options.loading ?? false,
    error: options.error,
    autoLoad: options.autoLoad ?? true,
    ...(options.onSelectRevision === undefined
      ? {}
      : { onSelectRevision: options.onSelectRevision }),
    ...(options.onRestoreRevision === undefined
      ? {}
      : { onRestoreRevision: options.onRestoreRevision })
  };

  const handleClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-object-vcs-action]");
    if (button === null) {
      return;
    }

    const revision = state.revisions.find(
      item => item.revision === Number(button.dataset.revision)
    );
    if (revision === undefined) {
      return;
    }

    if (button.dataset.objectVcsAction === "select") {
      void state.onSelectRevision?.(revision);
      return;
    }

    if (button.dataset.objectVcsAction === "restore") {
      void state.onRestoreRevision?.(revision, { commit: false });
    }
  };

  element.addEventListener("click", handleClick);

  const controller: RevisionTimelineController<TState> = {
    async refresh() {
      if (state.repo === undefined || !state.autoLoad) {
        renderRevisionTimeline(element, state);
        return;
      }

      state.loading = true;
      state.error = undefined;
      renderRevisionTimeline(element, state);

      try {
        const [head, revisions, tags] = await Promise.all([
          state.repo.getHead(toGetHeadOptions(state.branch)),
          state.repo.listRevisions(toListRevisionsOptions(state.branch)),
          state.repo.listTags()
        ]);
        state.head = head;
        state.revisions = revisions;
        state.tags = tags;
      } catch (caughtError: unknown) {
        state.error = caughtError;
      } finally {
        state.loading = false;
        renderRevisionTimeline(element, state);
      }
    },

    update(nextOptions: Partial<RevisionTimelineOptions<TState>>) {
      Object.assign(state, compactOptions(nextOptions));
      renderRevisionTimeline(element, state);
    },

    destroy() {
      element.removeEventListener("click", handleClick);
      element.innerHTML = "";
    }
  };

  renderRevisionTimeline(element, state);

  if (state.repo !== undefined && state.autoLoad) {
    void controller.refresh();
  }

  return controller;
}

export function defineObjectVcsWebComponents(): void {
  if (
    typeof globalThis.customElements === "undefined" ||
    globalThis.customElements.get("object-vcs-timeline") !== undefined
  ) {
    return;
  }

  class ObjectVcsTimelineElement extends HTMLElement {
    public repo: ObjectVcsRepository<unknown> | undefined;
    private controller: RevisionTimelineController<unknown> | null = null;

    public connectedCallback(): void {
      const branch = this.getAttribute("branch");
      this.controller = createRevisionTimeline(this, {
        ...(this.repo === undefined ? {} : { repo: this.repo }),
        ...(branch === null ? {} : { branch })
      });
    }

    public disconnectedCallback(): void {
      this.controller?.destroy();
      this.controller = null;
    }
  }

  globalThis.customElements.define(
    "object-vcs-timeline",
    ObjectVcsTimelineElement
  );
}

export function createBranchSelector(
  element: Element,
  options: BranchSelectorOptions
): DomController<BranchSelectorOptions> {
  const state: BranchSelectorOptions = { ...options };
  const handleClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-branch]");
    if (button?.dataset.branch !== undefined) {
      void state.onCheckout?.(button.dataset.branch);
    }
  };

  element.addEventListener("click", handleClick);
  renderBranchSelector(element, state);

  return {
    update(nextOptions) {
      Object.assign(state, nextOptions);
      renderBranchSelector(element, state);
    },
    destroy() {
      element.removeEventListener("click", handleClick);
      element.innerHTML = "";
    }
  };
}

export function createTagList(
  element: Element,
  options: TagListOptions
): DomController<TagListOptions> {
  const state: TagListOptions = { ...options };
  renderTagList(element, state);

  return {
    update(nextOptions) {
      Object.assign(state, nextOptions);
      renderTagList(element, state);
    },
    destroy() {
      element.innerHTML = "";
    }
  };
}

export function renderRevisionTimeline<TState>(
  element: Element,
  state: Pick<
    TimelineState<TState>,
    "branch" | "error" | "head" | "loading" | "revisions" | "tags"
  >
): void {
  element.innerHTML = createRevisionTimelineMarkup(state);
}

export function createRevisionTimelineMarkup<TState>(
  state: Pick<
    TimelineState<TState>,
    "branch" | "error" | "head" | "loading" | "revisions" | "tags"
  >
): string {
  const tagsByRevision = groupTagsByRevision(state.tags);
  const title =
    state.branch === undefined ? "Revisions" : `Revisions ${state.branch}`;
  const rows =
    state.revisions.length === 0
      ? `<div class="object-vcs-muted">No revisions</div>`
      : `<ol class="object-vcs-list">${state.revisions
          .map(revision =>
            revisionMarkup(
              revision,
              tagsByRevision.get(revision.revision) ?? [],
              state.head
            )
          )
          .join("")}</ol>`;

  return `<section class="object-vcs-timeline">
  <header class="object-vcs-header">
    <strong>${escapeHtml(title)}</strong>
    <span class="object-vcs-status object-vcs-status-${escapeHtml(
      state.head?.status ?? "unknown"
    )}">${escapeHtml(headStatusText(state.head))}</span>
  </header>
  ${state.loading ? `<div class="object-vcs-muted">Loading</div>` : ""}
  ${
    state.error === undefined
      ? ""
      : `<div class="object-vcs-error">${escapeHtml(errorText(state.error))}</div>`
  }
  ${rows}
</section>`;
}

export function renderBranchSelector(
  element: Element,
  state: BranchSelectorOptions
): void {
  element.innerHTML = `<div class="object-vcs-branch-selector">${state.branches
    .map(
      branch =>
        `<button type="button" data-branch="${escapeHtml(branch.name)}" class="${
          state.selectedBranch === branch.name ? "selected" : ""
        }">${escapeHtml(branch.name)}</button>`
    )
    .join("")}</div>`;
}

export function renderTagList(element: Element, state: TagListOptions): void {
  element.innerHTML = `<div class="object-vcs-tag-list">${state.tags
    .map(
      tag =>
        `<span class="object-vcs-tag">${escapeHtml(tag.name)} -&gt; #${
          tag.revision
        }</span>`
    )
    .join("")}</div>`;
}

export const objectVcsVanillaPackage = "@bjalon/object-vcs-vanilla";

function revisionMarkup<TState>(
  revision: RevisionSummary,
  tags: readonly TagRecord[],
  head: Head<TState> | null
): string {
  const isHeadRevision =
    head?.status === "clean" && head.headRevision === revision.revision;
  const isBaseRevision =
    head?.status === "dirty" && head.baseRevision === revision.revision;
  const badges = [
    isHeadRevision ? "HEAD" : null,
    isBaseRevision ? "BASE" : null
  ].filter((value): value is string => value !== null);

  return `<li class="object-vcs-item">
    <div class="object-vcs-item-main">
      <button type="button" data-object-vcs-action="select" data-revision="${revision.revision}">#${revision.revision}</button>
      <span>${escapeHtml(revision.message ?? "Checkpoint")}</span>
      ${badges
        .map(badge => `<span class="object-vcs-badge">${badge}</span>`)
        .join("")}
    </div>
    <div class="object-vcs-meta">${escapeHtml(revision.createdAt)}${
      revision.createdBy === undefined
        ? ""
        : ` · ${escapeHtml(revision.createdBy)}`
    }</div>
    ${
      tags.length === 0
        ? ""
        : `<div class="object-vcs-tags">${tags
            .map(tag => `<span class="object-vcs-tag">${escapeHtml(tag.name)}</span>`)
            .join("")}</div>`
    }
    <button type="button" data-object-vcs-action="restore" data-revision="${revision.revision}">Restore</button>
  </li>`;
}

function compactOptions<TState>(
  options: Partial<RevisionTimelineOptions<TState>>
): Partial<TimelineState<TState>> {
  return {
    ...(options.repo === undefined ? {} : { repo: options.repo }),
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    ...(options.revisions === undefined ? {} : { revisions: options.revisions }),
    ...(options.tags === undefined ? {} : { tags: options.tags }),
    ...(options.head === undefined ? {} : { head: options.head }),
    ...(options.loading === undefined ? {} : { loading: options.loading }),
    ...(options.error === undefined ? {} : { error: options.error }),
    ...(options.autoLoad === undefined ? {} : { autoLoad: options.autoLoad }),
    ...(options.onSelectRevision === undefined
      ? {}
      : { onSelectRevision: options.onSelectRevision }),
    ...(options.onRestoreRevision === undefined
      ? {}
      : { onRestoreRevision: options.onRestoreRevision })
  };
}

function toGetHeadOptions(
  branch: BranchName | undefined
): { readonly branch?: BranchName } {
  return branch === undefined ? {} : { branch };
}

function toListRevisionsOptions(
  branch: BranchName | undefined
): { readonly branch?: BranchName } {
  return branch === undefined ? {} : { branch };
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
