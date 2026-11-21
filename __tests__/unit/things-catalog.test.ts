import { describe, expect, it } from "vitest";

import { liarsSetupPath } from "@/features/things/liars/liars-invite";

describe("liars setup paths", () => {
  it("returns the distinct public journey for each shared-engine mode", () => {
    expect(liarsSetupPath("mafia")).toBe("/things/mafia");
    expect(liarsSetupPath("imposter")).toBe("/things/imposter");
  });
});
