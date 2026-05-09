import { describe, expect, it } from "vitest";

import { objectVcsVanillaPackage, type ObjectVcsElementOptions } from "./index.js";

describe("@bjalon/object-vcs-vanilla public entrypoint", () => {
  it("exports minimal DOM options", () => {
    const target = {} as Element;
    const options: ObjectVcsElementOptions = { target };

    expect(options.target).toBe(target);
    expect(objectVcsVanillaPackage).toBe("@bjalon/object-vcs-vanilla");
  });
});
