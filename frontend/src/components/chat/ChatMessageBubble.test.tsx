import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "./ChatMessageBubble.tsx";
import type { Message } from "./state/chatStore.ts";

function reply(reasoning: string): Message {
  return {
    id: 1,
    role: "assistant",
    content: "",
    reasoning,
    model: "m",
    timestamp: "t",
  };
}

/// jsdom has no layout, so the trace's scroll box is given one.
function layOut(el: HTMLElement, box: { height: number }): void {
  Object.defineProperty(el, "clientHeight", { get: () => 100 });
  Object.defineProperty(el, "scrollHeight", { get: () => box.height });
}

describe("MessageBubble", () => {
  it("follows the reasoning trace until the reader scrolls up in it", () => {
    const { container, rerender } = render(
      <MessageBubble message={reply("a")} modelName="m" liveStats={null} />,
    );
    const trace = container.querySelector<HTMLElement>(
      "details [class*=overflow-y-auto]",
    );
    if (!trace) throw new Error("no reasoning trace");
    const box = { height: 500 };
    layOut(trace, box);

    const grow = (reasoning: string, height: number) => {
      box.height = height;
      rerender(
        <MessageBubble
          message={reply(reasoning)}
          modelName="m"
          liveStats={null}
        />,
      );
    };

    grow("a b", 500);
    expect(trace.scrollTop).toBe(500);

    trace.scrollTop = 100;
    fireEvent.scroll(trace);
    grow("a b c", 800);
    expect(trace.scrollTop).toBe(100);

    trace.scrollTop = 700;
    fireEvent.scroll(trace);
    grow("a b c d", 900);
    expect(trace.scrollTop).toBe(900);
  });
});
