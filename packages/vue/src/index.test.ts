import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";

import type { Head, RevisionSummary, TagRecord } from "@bjalon/object-vcs-core";

import {
  RevisionTimeline,
  createObjectVcsPlugin,
  objectVcsVuePackage,
  type UseHeadResult,
  type UseTagsResult
} from "./index.js";

interface TestState {
  readonly value: number;
}

const head: Head<TestState> = {
  repoId: "repo",
  branchName: "main",
  status: "clean",
  headRevision: 1,
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
  schemaFingerprint: "manual:test",
  schemaFingerprintAlgorithm: "manual",
  message: "Initial",
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

describe("@bjalon/object-vcs-vue", () => {
  it("exports composable result types and package marker", () => {
    const result: UseHeadResult<TestState> = {
      head: ref(null),
      state: computed(() => null),
      loading: ref(false),
      error: ref(undefined),
      reload: async () => {
        return;
      }
    };

    expect(result.loading.value).toBe(false);
    expect(objectVcsVuePackage).toBe("@bjalon/object-vcs-vue");
  });

  it("exports tags composable result types", () => {
    const result: UseTagsResult = {
      tags: ref([tag]),
      loading: ref(false),
      error: ref(undefined),
      reload: async () => {
        return;
      }
    };

    expect(result.tags.value).toHaveLength(1);
  });

  it("creates a plugin object", () => {
    const repository = {
      async getHead() {
        return head;
      },
      async listRevisions() {
        return [revision];
      },
      async listTags() {
        return [tag];
      }
    };

    const plugin = createObjectVcsPlugin(repository as never);

    expect(plugin.install).toBeTypeOf("function");
  });

  it("exports the timeline component", () => {
    expect(RevisionTimeline.name).toBe("RevisionTimeline");
  });
});
