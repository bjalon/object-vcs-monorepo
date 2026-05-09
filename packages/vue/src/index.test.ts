import { describe, expect, it } from "vitest";

import { objectVcsVuePackage, type UseObjectVcsHeadResult } from "./index.js";

describe("@bjalon/object-vcs-vue public entrypoint", () => {
  it("exports minimal composable result types", () => {
    const result: UseObjectVcsHeadResult<{ value: string }> = {
      state: null,
      loading: false,
      error: undefined
    };

    expect(result.loading).toBe(false);
    expect(objectVcsVuePackage).toBe("@bjalon/object-vcs-vue");
  });
});
