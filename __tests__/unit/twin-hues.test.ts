import { describe, expect, it } from "vitest";

import { TWIN_HUE_COUNT, twinSymbolHue } from "../../features/things/twin/twin-hues";
import { twinAvailableOrders, twinDeck } from "../../features/things/twin/twin-deck";
import { TWIN_SYMBOLS } from "../../features/things/twin/twin-symbols";

describe("symbol colours", () => {
  it("gives every symbol a hue in range", () => {
    for (const symbol of TWIN_SYMBOLS) {
      const hue = twinSymbolHue(symbol.id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(TWIN_HUE_COUNT);
    }
  });

  it("uses the whole palette", () => {
    expect(new Set(TWIN_SYMBOLS.map(({ id }) => twinSymbolHue(id))).size).toBe(TWIN_HUE_COUNT);
  });

  it("avoids colour triples and keeps repeated pairs rare on the playable decks", () => {
    const decks = twinAvailableOrders().flatMap((order) => twinDeck(order));
    let repeatedPairs = 0;
    for (const card of decks) {
      const counts = new Map<number, number>();
      for (const id of card.symbolIds) {
        const hue = twinSymbolHue(id);
        counts.set(hue, (counts.get(hue) ?? 0) + 1);
      }
      for (const count of counts.values()) {
        expect(count, card.id).toBeLessThanOrEqual(2);
        if (count === 2) repeatedPairs += 1;
      }
    }
    expect(repeatedPairs / decks.length).toBeLessThanOrEqual(1.35);
  });
});
