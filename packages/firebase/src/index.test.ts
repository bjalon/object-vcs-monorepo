import { describe, expect, it } from "vitest";

import { objectVcsFirebasePackage, type FirebasePersistenceOptions } from "./index.js";

describe("@bjalon/object-vcs-firebase public entrypoint", () => {
  it("exports minimal adapter options", () => {
    const options: FirebasePersistenceOptions = { rootCollection: "objectVcs" };

    expect(options.rootCollection).toBe("objectVcs");
    expect(objectVcsFirebasePackage).toBe("@bjalon/object-vcs-firebase");
  });
});
