import { describe, expect, it } from "vitest";

import type { Head, RevisionSummary, TagRecord } from "@bjalon/object-vcs-core";

import {
  createRevisionTimeline,
  createRevisionTimelineMarkup,
  objectVcsVanillaPackage
} from "./index.js";

interface TestState {
  readonly value: number;
}

const head: Head<TestState> = {
  repoId: "repo",
  branchName: "main",
  status: "dirty",
  headRevision: null,
  baseRevision: 1,
  stateHash: "sha256:one",
  state: { value: 1 },
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const revision: RevisionSummary = {
  repoId: "repo",
  revision: 1,
  parentRevision: null,
  branchName: "main",
  stateHash: "sha256:one",
  schemaVersion: 1,
  graphVersion: "test",
  message: "Initial <script>",
  createdAt: "2026-01-01T00:00:00.000Z",
  isEmptyRevision: false,
  isCheckpoint: true
};

const tag: TagRecord = {
  repoId: "repo",
  name: "v1",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("@bjalon/object-vcs-vanilla", () => {
  it("exports package marker", () => {
    expect(objectVcsVanillaPackage).toBe("@bjalon/object-vcs-vanilla");
  });

  it("creates escaped revision timeline markup", () => {
    const html = createRevisionTimelineMarkup({
      branch: "main",
      revisions: [revision],
      tags: [tag],
      head,
      loading: false,
      error: undefined
    });

    expect(html).toContain("Revisions main");
    expect(html).toContain("HEAD dirty base #1");
    expect(html).toContain("Initial &lt;script&gt;");
    expect(html).toContain("v1");
    expect(html).toContain("data-object-vcs-action=\"restore\"");
  });

  it("renders into a DOM-like element and destroys itself", () => {
    const element = createElementStub();
    const controller = createRevisionTimeline(element, {
      revisions: [revision],
      tags: [tag],
      head,
      autoLoad: false
    });

    expect(element.innerHTML).toContain("#1");
    controller.destroy();
    expect(element.innerHTML).toBe("");
  });
});

function createElementStub(): Element {
  const listeners = new Map<string, EventListener>();
  return {
    innerHTML: "",
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    }
  } as unknown as Element;
}
