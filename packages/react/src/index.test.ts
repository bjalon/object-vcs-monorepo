import { describe, expect, it } from "vitest";

import { objectVcsReactPackage, type UseHeadResult } from "./index.js";

describe("@object-vcs/react public entrypoint", () => {
  it("exports minimal hook result types", () => {
    const result: UseHeadResult<{ value: string }> = {
      state: null,
      loading: false,
      error: undefined
    };

    expect(result.state).toBeNull();
    expect(objectVcsReactPackage).toBe("@object-vcs/react");
  });
});
