// Chat "send" request: kicks off the model if needed, then streams
// the OpenAI-compatible chat completion and folds deltas into the
// chat store snapshot.

import { api } from "../../../api/client.ts";
import i18n from "../../../i18n.ts";
import { waitForModel } from "./modelStart.ts";
import {
  activeRun,
  EMPTY_STATS,
  endRun,
  getSnapshot,
  newMessageId,
  setSnapshot,
  type ChatSnapshot,
  type Run,
  type StreamStats,
} from "./chatStore.ts";

/// ISO8601 timestamp in the local timezone (e.g. 2026-06-27T14:30:00+02:00).
function localISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const local = new Date(d.getTime() - off * 60000).toISOString().slice(0, 19);
  return `${local}${sign}${hh}:${mm}`;
}

type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ApiMessage = {
  role: string;
  content: string | ApiContentPart[];
};

export async function send(
  selectedModel: string,
  openaiBaseUrl: string,
): Promise<void> {
  const snap = getSnapshot();
  const text = snap.input.trim();
  if (!selectedModel || !text || activeRun(snap.chatState)) return;

  // The run takes the composer's text and claims the store before the
  // first await, so a second send, a cancel, or a reset all see it.
  const controller = new AbortController();
  const imageAttachments = snap.attachments.filter((a) => a.type === "image");
  const textAttachments = snap.attachments.filter((a) => a.type === "text");
  let fullContent = text;
  for (const att of textAttachments) {
    fullContent += `\n\n${att.name}:\n${att.content}`;
  }
  const displayImages = imageAttachments.map((a) => a.content);
  const run: Run = {
    controller,
    turn: {
      id: newMessageId(),
      role: "user",
      content: text,
      images: displayImages.length > 0 ? displayImages : undefined,
      timestamp: localISO(),
    },
    draft: { input: snap.input, attachments: snap.attachments },
  };
  setSnapshot((prev) => ({
    ...prev,
    messages: [...prev.messages, run.turn],
    attachments: [],
    input: "",
    stats: EMPTY_STATS,
    chatState: { kind: "sending", run },
  }));

  /// Applies `updater` only while this send is still the store's run.
  function update(updater: (prev: ChatSnapshot) => ChatSnapshot): void {
    setSnapshot((prev) =>
      activeRun(prev.chatState) === run ? updater(prev) : prev,
    );
  }
  function fail(message: string): void {
    update((prev) => endRun(prev, run, { kind: "error", message }));
  }
  const stale = () => activeRun(getSnapshot().chatState) !== run;

  // Check if the model is running; start it if not.
  // If the state is unknown, send anyway and let the daemon start the model.
  const svc = await api.listServices().then(
    (r) => r.services.find((s) => s.name === selectedModel),
    () => undefined,
  );
  if (stale()) return;
  const needsStart = svc != null && svc.state !== "running";
  if (needsStart) {
    update((prev) => ({ ...prev, chatState: { kind: "starting", run } }));
    const outcome = await waitForModel(selectedModel, controller.signal);
    if (stale()) return;
    if (outcome.kind === "failed") {
      fail(
        outcome.failure.kind === "queue_full"
          ? i18n.t("chat.startQueueFull", { model: selectedModel })
          : i18n.t("chat.startFailed", {
              model: selectedModel,
              message: outcome.failure.message,
            }),
      );
      return;
    }
    update((prev) => ({ ...prev, chatState: { kind: "sending", run } }));
  }

  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  const finalStats: { -readonly [K in keyof StreamStats]: StreamStats[K] } = {
    ...EMPTY_STATS,
  };

  function attachStats() {
    update((prev) => {
      const next = [...prev.messages];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, stats: { ...finalStats } };
      }
      return { ...prev, messages: next };
    });
  }

  // The history is everything before this run's turn.
  const apiMessages: ApiMessage[] = [];
  if (snap.systemPrompt.trim()) {
    apiMessages.push({ role: "system", content: snap.systemPrompt.trim() });
  }
  for (const m of snap.messages) {
    apiMessages.push({ role: m.role, content: m.content });
  }
  if (imageAttachments.length > 0) {
    const parts: ApiContentPart[] = [{ type: "text", text: fullContent }];
    for (const img of imageAttachments) {
      parts.push({ type: "image_url", image_url: { url: img.content } });
    }
    apiMessages.push({ role: "user", content: parts });
  } else {
    apiMessages.push({ role: "user", content: fullContent });
  }

  try {
    const resp = await fetch(`${openaiBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: selectedModel,
        messages: apiMessages,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      fail(`${resp.status} ${resp.statusText}: ${body}`);
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      fail("the response has no body");
      return;
    }
    update((prev) => ({ ...prev, chatState: { kind: "streaming", run } }));
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_content?: string;
              };
            }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
            };
            timings?: {
              prompt_ms?: number;
              predicted_ms?: number;
              prompt_n?: number;
            };
          };

          const delta = chunk.choices?.[0]?.delta;
          const contentDelta = delta?.content;
          const reasoningDelta = delta?.reasoning_content;

          if (contentDelta || reasoningDelta) {
            if (firstTokenTime === null) {
              firstTokenTime = performance.now();
              finalStats.ttftMs = firstTokenTime - startTime;
              update((prev) => ({ ...prev, stats: { ...finalStats } }));
            }
            update((prev) => {
              const next = [...prev.messages];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: contentDelta
                    ? last.content + contentDelta
                    : last.content,
                  reasoning: reasoningDelta
                    ? (last.reasoning ?? "") + reasoningDelta
                    : last.reasoning,
                };
              } else {
                next.push({
                  id: newMessageId(),
                  role: "assistant",
                  content: contentDelta ?? "",
                  reasoning: reasoningDelta || undefined,
                  model: selectedModel,
                  timestamp: localISO(),
                });
              }
              return { ...prev, messages: next };
            });
          }

          if (chunk.usage) {
            const elapsed = (performance.now() - startTime) / 1000;
            const completionTokens = chunk.usage.completion_tokens ?? 0;
            finalStats.promptTokens = chunk.usage.prompt_tokens ?? null;
            finalStats.completionTokens = completionTokens;
            finalStats.predictedPerSecond =
              elapsed > 0 ? completionTokens / elapsed : null;

            // Engine-reported phase timings (llama.cpp). The `timings`
            // object sits next to `usage` in the final chunk and carries
            // `prompt_ms` (prefill), `predicted_ms` (decode), and
            // `prompt_n` (tokens actually evaluated — excludes cache-served
            // tokens, unlike `usage.prompt_tokens`). When present, these
            // yield the true prefill and decode rates. When absent
            // (non-llama.cpp engines), the split fields stay null and the
            // UI falls back to the effective rate above.
            const timings = chunk.timings;
            if (timings) {
              const promptMs = timings.prompt_ms;
              const predictedMs = timings.predicted_ms;
              const promptN = timings.prompt_n;
              if (
                promptMs != null &&
                promptMs > 0 &&
                promptN != null &&
                promptN > 0
              ) {
                finalStats.inputTokPerSec = promptN / (promptMs / 1000);
              }
              if (
                predictedMs != null &&
                predictedMs > 0 &&
                completionTokens > 0
              ) {
                finalStats.outputTokPerSec =
                  completionTokens / (predictedMs / 1000);
              }
            }

            update((prev) => ({ ...prev, stats: { ...finalStats } }));
          }
        } catch {
          // Skip unparseable lines.
        }
      }
    }
    attachStats();
    update((prev) => ({ ...prev, chatState: { kind: "idle" } }));
  } catch (e) {
    attachStats();
    if (e instanceof DOMException && e.name === "AbortError") {
      update((prev) => endRun(prev, run, { kind: "idle" }));
    } else {
      fail(e instanceof Error ? e.message : String(e));
    }
  }
}
