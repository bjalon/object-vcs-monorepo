import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase/firestore";

import {
  firebasePersistence,
  objectVcsFirebasePackage,
  type FirebasePersistenceOptions
} from "./index.js";

describe("@bjalon/object-vcs-firebase public entrypoint", () => {
  it("exports adapter options and factory", () => {
    const options: FirebasePersistenceOptions = {
      db: {} as Firestore,
      rootCollection: "objectVcs",
      collections: {
        revisions: "history"
      }
    };
    const adapter = firebasePersistence(options);

    expect(options.rootCollection).toBe("objectVcs");
    expect(options.collections?.revisions).toBe("history");
    expect(adapter.createRepo).toBeTypeOf("function");
    expect(objectVcsFirebasePackage).toBe("@bjalon/object-vcs-firebase");
  });
});
