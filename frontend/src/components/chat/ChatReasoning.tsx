// A reply's reasoning trace: a disclosure whose capped scroll box follows
// the trace as it streams, the way the transcript does, until the reader
// scrolls up inside it.

import { useTranslation } from "react-i18next";

import { useStickToBottom } from "../../hooks/useStickToBottom.ts";
import { MarkdownContent } from "./ChatMarkdown.tsx";

export function Reasoning({ text }: { readonly text: string }) {
  const { t } = useTranslation();
  const { scrollRef, onScroll } = useStickToBottom(text);
  return (
    <details
      open
      className="open:mb-2 open:border-b open:border-border-default open:pb-2 [&_summary]:list-none"
    >
      <summary className="cursor-pointer select-none text-xs text-secondary hover:text-primary">
        {t("chat.reasoning")}
      </summary>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="mt-1 max-h-40 overflow-y-auto break-words text-xs text-secondary"
      >
        <MarkdownContent>{text}</MarkdownContent>
      </div>
    </details>
  );
}
