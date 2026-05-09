import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  BranchRecord,
  Head,
  ObjectVcsRepository,
  RevisionSummary,
  TagRecord
} from "@bjalon/object-vcs-core";

import {
  ObjectVcsProvider,
  RevisionTimeline,
  objectVcsReactPackage,
  useCommit,
  useObjectVcs,
  type UseHeadResult
} from "./index.js";

interface TestState {
  readonly counter: {
    readonly value: number;
  };
}

const state: TestState = {
  counter: {
    value: 1
  }
};

const head: Head<TestState> = {
  repoId: "repo",
  branchName: "main",
  status: "clean",
  headRevision: 1,
  baseRevision: 1,
  stateHash: "sha256:one",
  state,
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const dirtyHead: Head<TestState> = {
  ...head,
  status: "dirty",
  headRevision: null,
  baseRevision: 1
};

const revision: RevisionSummary = {
  repoId: "repo",
  revision: 1,
  parentRevision: null,
  branchName: "main",
  stateHash: "sha256:one",
  schemaVersion: 1,
  graphVersion: "test",
  message: "Initial state",
  createdAt: "2026-01-01T00:00:00.000Z",
  isEmptyRevision: false,
  isCheckpoint: true
};

const branch: BranchRecord = {
  repoId: "repo",
  name: "main",
  headRevision: 1,
  baseRevision: 1,
  headStateHash: "sha256:one",
  status: "clean",
  createdFromRevision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const tag: TagRecord = {
  repoId: "repo",
  name: "v1",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("@bjalon/object-vcs-react", () => {
  it("exports hook result types and package marker", () => {
    const result: UseHeadResult<TestState> = {
      head: null,
      state: null,
      loading: false,
      error: undefined,
      reload: async () => {
        return;
      }
    };

    expect(result.state).toBeNull();
    expect(objectVcsReactPackage).toBe("@bjalon/object-vcs-react");
  });

  it("provides the repository through context", () => {
    const repository = createRepositoryMock();

    function Probe(): ReactElement {
      const currentRepository = useObjectVcs<TestState>();
      return createElement(
        "span",
        null,
        typeof currentRepository.commit
      );
    }

    const html = renderToStaticMarkup(
      createElement(
        ObjectVcsProvider<TestState>,
        { repository },
        createElement(Probe)
      )
    );

    expect(html).toContain("function");
  });

  it("renders revision timeline state, tags and restore action", () => {
    const repository = createRepositoryMock();

    const html = renderToStaticMarkup(
      createElement(
        ObjectVcsProvider<TestState>,
        { repository },
        createElement(RevisionTimeline<TestState>, {
          branch: "main",
          revisions: [revision],
          tags: [tag],
          head: dirtyHead,
          onRestoreRevision: () => {
            return;
          }
        })
      )
    );

    expect(html).toContain("Revisions main");
    expect(html).toContain("HEAD dirty base #1");
    expect(html).toContain("#1");
    expect(html).toContain("Initial state");
    expect(html).toContain("v1");
    expect(html).toContain("Restore");
  });

  it("renders useCommit initial state", () => {
    const repository = createRepositoryMock();

    function CommitProbe(): ReactElement {
      const commit = useCommit<TestState>();
      return createElement("span", null, commit.loading ? "busy" : "idle");
    }

    const html = renderToStaticMarkup(
      createElement(
        ObjectVcsProvider<TestState>,
        { repository },
        createElement(CommitProbe)
      )
    );

    expect(html).toContain("idle");
  });
});

function createRepositoryMock(): ObjectVcsRepository<TestState> {
  return {
    async init() {
      return {
        head,
        revision
      };
    },
    async getHead() {
      return head;
    },
    watchHead(callback) {
      callback(head);
      return () => {
        return;
      };
    },
    async update() {
      return {
        head,
        createdRevision: false
      };
    },
    async edit() {
      return {
        head,
        createdRevision: false
      };
    },
    async commit() {
      return {
        head,
        revision,
        created: true
      };
    },
    async readRevision() {
      return state;
    },
    async listRevisions() {
      return [revision];
    },
    watchRevisions(callback) {
      callback([revision]);
      return () => {
        return;
      };
    },
    async tag() {
      return tag;
    },
    async listTags() {
      return [tag];
    },
    async listBranches() {
      return [branch];
    },
    async createBranch() {
      return branch;
    },
    async checkout() {
      return head;
    },
    async restore() {
      return {
        head,
        createdRevision: false
      };
    },
    async resetBranch() {
      return branch;
    }
  };
}
