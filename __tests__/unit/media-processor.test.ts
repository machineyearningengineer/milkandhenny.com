import { afterEach, describe, expect, it, vi } from "vitest";

describe("media processor selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects obsolete processor modes", async () => {
    vi.stubEnv("MEDIA_PROCESSOR_MODE", "worker");
    const { getMediaProcessorMode } = await import("@/features/media/config.server");
    expect(() => getMediaProcessorMode()).toThrow(/local or hybrid/);
  });
});
