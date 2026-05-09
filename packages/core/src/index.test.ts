import { describe, expect, it } from "vitest";

import { objectVcsCorePackage, type HeadStatus } from "./index.js";

describe("@bjalon/object-vcs-core public entrypoint", () => {
  it("exports minimal typed primitives", () => {
    const status: HeadStatus = "clean";

    expect(status).toBe("clean");
    expect(objectVcsCorePackage).toBe("@bjalon/object-vcs-core");
  });
});
