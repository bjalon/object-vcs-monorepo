import { describe, expect, it } from "vitest";

import { goblinTavernExample } from "./index.js";

describe("goblin tavern example scaffold", () => {
  it("declares the example metadata", () => {
    expect(goblinTavernExample.name).toBe("Goblin Tavern VCS");
    expect(goblinTavernExample.deploymentTarget).toBe("github-pages");
  });
});
