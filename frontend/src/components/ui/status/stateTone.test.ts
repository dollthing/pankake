import { describe, expect, it } from "vitest";

import { stateLabelKey, stateTone } from "./stateTone.ts";

describe("stateTone", () => {
  it.each([
    ["running", "ok"],
    ["starting", "warn"],
    ["draining", "warn"],
    ["failed", "danger"],
    ["idle", "neutral"],
    ["stopped", "neutral"],
    ["evicted", "neutral"],
    ["disabled", "neutral"],
    ["something_new", "neutral"],
  ])("%s is %s", (state, tone) => {
    expect(stateTone(state)).toBe(tone);
  });
});

describe("stateLabelKey", () => {
  it("shares one label across disabled states", () => {
    expect(stateLabelKey("disabled")).toBe("services.states.disabled");
    expect(stateLabelKey("disabled_user")).toBe("services.states.disabled");
  });

  it("uses the state name otherwise", () => {
    expect(stateLabelKey("running")).toBe("services.states.running");
  });
});
