import { describe, expect, it } from "vitest";
import { reachedMilestone } from "./milestones";

describe("kamienie milowe", () => {
  it("wykrywa przejście przez próg", () => {
    expect(reachedMilestone("days", 6, 7)).toBe(7);
    expect(reachedMilestone("days", 29, 30)).toBe(30);
    expect(reachedMilestone("weeks", 3, 4)).toBe(4);
  });
  it("nie świętuje bez wzrostu ani poza progiem", () => {
    expect(reachedMilestone("days", 7, 7)).toBeNull();
    expect(reachedMilestone("days", 8, 7)).toBeNull();
    expect(reachedMilestone("days", 7, 8)).toBeNull();
  });
  it("nie świętuje powrotu do serii (cofnięta wpadka, uzupełniony dzień)", () => {
    expect(reachedMilestone("days", 0, 41)).toBeNull();
    expect(reachedMilestone("days", 0, 30)).toBeNull();
    expect(reachedMilestone("days", 5, 12)).toBeNull();
  });
});
