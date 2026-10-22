import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  installLiveFakes,
  renderLive,
  service,
} from "../../test/renderLive.tsx";
import { ChatView } from "./ChatView.tsx";
import { EMPTY_STATS, getSnapshot, setSnapshot } from "./state/chatStore.ts";

beforeEach(() => {
  installLiveFakes();
  localStorage.clear();
  setSnapshot(() => ({
    messages: [],
    systemPrompt: "",
    currentModel: null,
    chatState: { kind: "idle" },
    stats: EMPTY_STATS,
    input: "",
    attachments: [],
  }));
});
afterEach(() => vi.unstubAllGlobals());

const services = [service("alpha", "running"), service("beta", "running")];

describe("ChatView", () => {
  it("switches the model mid-conversation", () => {
    setSnapshot((prev) => ({
      ...prev,
      currentModel: "alpha",
      messages: [{ role: "user", content: "hello", timestamp: "t1" }],
    }));
    renderLive(<ChatView />, { route: "/chat?model=alpha", services });

    fireEvent.click(screen.getByRole("button", { name: "alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "beta" }));

    expect(getSnapshot().currentModel).toBe("beta");
    expect(getSnapshot().messages).toHaveLength(1);
  });

  it("follows a model named in the URL", () => {
    renderLive(<ChatView />, { route: "/chat?model=beta", services });
    expect(getSnapshot().currentModel).toBe("beta");
  });
});
