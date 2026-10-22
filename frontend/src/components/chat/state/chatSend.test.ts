import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancel,
  clearConversation,
  getSnapshot,
  send,
  setInput,
} from "./chatStore.ts";
import {
  BASE_URL,
  MODEL,
  installFakeDaemon,
  resetChat,
  settle,
} from "./chatTestKit.ts";

beforeEach(() => {
  vi.useFakeTimers();
  resetChat();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("send", () => {
  it("adds the message and the reply", async () => {
    installFakeDaemon(["running"]);
    setInput("hello");
    await settle(send(MODEL, BASE_URL));
    const { messages, chatState, input } = getSnapshot();
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "hello"],
      ["assistant", "reply"],
    ]);
    expect(chatState.kind).toBe("idle");
    expect(input).toBe("");
  });

  // A reset at any point of a send, starting a stopped model on the way,
  // must leave the conversation empty: nothing the send was still waiting
  // on may write the message back.
  it.each([1, 2, 3])(
    "is undone by a reset during request %i",
    async (resetAt) => {
      const daemon = installFakeDaemon(["stopped", "running"], (_, index) => {
        if (index === resetAt) clearConversation();
        return undefined;
      });
      setInput("hello");
      await settle(send(MODEL, BASE_URL));
      expect(daemon.calls.length).toBeGreaterThanOrEqual(resetAt);
      expect(getSnapshot().messages).toEqual([]);
      expect(getSnapshot().chatState.kind).toBe("idle");
    },
  );

  it("ignores a second send while the first is in flight", async () => {
    const daemon = installFakeDaemon(["running"]);
    setInput("hello");
    const first = send(MODEL, BASE_URL);
    setInput("again");
    const second = send(MODEL, BASE_URL);
    await settle(Promise.all([first, second]));
    const sent = daemon.calls.filter((c) => c.url.startsWith(BASE_URL));
    expect(sent).toHaveLength(1);
    expect(getSnapshot().messages.map((m) => m.content)).toEqual([
      "hello",
      "reply",
    ]);
  });

  it("gives the text back when cancelled before a reply", async () => {
    installFakeDaemon(["running"], (call) =>
      call.url.startsWith(BASE_URL) ? new Promise<never>(() => {}) : undefined,
    );
    setInput("hello");
    const sending = send(MODEL, BASE_URL);
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().chatState.kind).toBe("sending");
    cancel();
    expect(getSnapshot().messages).toEqual([]);
    expect(getSnapshot().input).toBe("hello");
    expect(getSnapshot().chatState.kind).toBe("idle");
    void sending;
  });
});
