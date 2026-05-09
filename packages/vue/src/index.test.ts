import { describe, expect, it } from "vitest";

import { objectVcsVuePackage, type UseObjectVcsHeadResult } from "./index.js";

describe("@object-vcs/vue public entrypoint", () => {
  it("exports minimal composable result types", () => {
    const result: UseObjectVcsHeadResult<{ value: string }> = {
      state: null,
      loading: false,
      error: undefined
    };

    expect(result.loading).toBe(false);
    expect(objectVcsVuePackage).toBe("@object-vcs/vue");
  });
});
