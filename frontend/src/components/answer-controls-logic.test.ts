import { describe, expect, it } from "vitest";
import { getNextCardIndex, isSessionComplete } from "./answer-controls-logic.js";

describe("answer-controls-logic", () => {
  describe("isSessionComplete", () => {
    it("does not complete early in Study mode when multiple due cards remain", () => {
      expect(
        isSessionComplete({
          practiceAll: false,
          currentCardIndex: 2,
          totalCards: 3,
        }),
      ).toBe(false);
    });

    it("completes in Study mode on the last due card", () => {
      expect(
        isSessionComplete({
          practiceAll: false,
          currentCardIndex: 0,
          totalCards: 1,
        }),
      ).toBe(true);
    });

    it("completes in Preview mode only when moving past last index", () => {
      expect(
        isSessionComplete({
          practiceAll: true,
          currentCardIndex: 1,
          totalCards: 3,
        }),
      ).toBe(false);

      expect(
        isSessionComplete({
          practiceAll: true,
          currentCardIndex: 2,
          totalCards: 3,
        }),
      ).toBe(true);
    });
  });

  describe("getNextCardIndex", () => {
    it("keeps index at zero in Study mode", () => {
      expect(getNextCardIndex({ practiceAll: false, currentCardIndex: 7 })).toBe(0);
    });

    it("increments index in Preview mode", () => {
      expect(getNextCardIndex({ practiceAll: true, currentCardIndex: 7 })).toBe(8);
    });
  });
});
