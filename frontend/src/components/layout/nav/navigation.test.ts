import { describe, expect, it } from "vitest";

import { sectionForPath, sectionHref, serviceFromPath } from "./navigation.ts";

describe("sectionForPath", () => {
  it.each([
    ["/", "services"],
    ["/services/a", "services"],
    ["/services/a%2Fb", "services"],
    ["/services/%E0", "services"],
    ["/chat", "chat"],
    ["/config/", "config"],
    ["/events", "events"],
    ["/stats", "stats"],
    ["/nope", undefined],
    ["/servicesx", undefined],
  ])("%s is %s", (path, section) => {
    expect(sectionForPath(path)).toBe(section);
  });
});

describe("serviceFromPath", () => {
  it.each([
    ["/services/a", "a"],
    ["/services/a%2Fb", "a/b"],
    ["/services/%E0", undefined],
    ["/services/", undefined],
    ["/", undefined],
    ["/chat", undefined],
  ])("%s names %s", (path, service) => {
    expect(serviceFromPath(path)).toBe(service);
  });
});

describe("sectionHref", () => {
  it("opens the list without a last service", () => {
    expect(sectionHref("services", undefined)).toBe("/");
  });

  it("reopens the last service, escaped", () => {
    expect(sectionHref("services", { name: "a/b" })).toBe("/services/a%2Fb");
  });

  it("preselects a chat model in chat", () => {
    expect(sectionHref("chat", { name: "qwen" })).toBe("/chat?model=qwen");
    expect(sectionHref("chat", { name: "qwen", modality: "chat" })).toBe(
      "/chat?model=qwen",
    );
  });

  it("does not preselect an embedding model in chat", () => {
    expect(sectionHref("chat", { name: "bge", modality: "embedding" })).toBe(
      "/chat",
    );
  });

  it("ignores the last service elsewhere", () => {
    expect(sectionHref("config", { name: "qwen" })).toBe("/config");
  });
});
