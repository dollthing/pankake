// Event feed — the daemon's recent event history, kept current by the
// live socket's `events` subscription. Shows timestamp, event type, service name, and key
// fields as one-line summaries in a table layout. Oldest events at
// the top, newest at the bottom; autoscrolls to the bottom when new
// events arrive unless the user has scrolled up.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { DaemonEvent } from "../../api/client.ts";
import { useEventFeed } from "../../api/hooks.ts";
import { useLiveSocket, useLiveStatus } from "../../api/live/useLive.ts";
import { useStickToBottom } from "../../hooks/useStickToBottom.ts";
import { formatTimestamp } from "../../util.ts";
import { ViewHeader } from "../ui/ViewHeader.tsx";
import { Badge, type BadgeVariant } from "../ui/Badge.tsx";
import { EmptyState } from "../ui/feedback/EmptyState.tsx";

const EVENT_TYPES = [
  "state_changed",
  "allocation_changed",
  "config_reloaded",
  "estimator_drift",
  "auto_restarted",
] as const satisfies readonly DaemonEvent["type"][];

const NO_EVENTS: readonly DaemonEvent[] = [];

export function EventsView() {
  const { t } = useTranslation();
  const events = useEventFeed().data?.events ?? NO_EVENTS;
  const socket = useLiveSocket();
  const connected = useLiveStatus() === "open";
  const [typeFilter, setTypeFilter] = useState<Set<string>>(
    new Set(EVENT_TYPES),
  );

  const filtered = events.filter(
    (e) => typeFilter.size === 0 || typeFilter.has(e.type),
  );

  function toggleType(type: string) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const { scrollRef, onScroll } = useStickToBottom(events.length);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <ViewHeader className="gap-2">
        <h1 className="eyebrow !text-primary">{t("events.title")}</h1>
        <div className="mx-2 h-3 w-px bg-border-default" />
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={`rounded-sm px-2 py-0.5 text-xs transition-colors ${
              typeFilter.has(type)
                ? "bg-elevated text-primary"
                : "text-tertiary hover:text-secondary"
            }`}
          >
            {type}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-tertiary">
          {connected ? (
            <span className="text-success">{t("events.connected")}</span>
          ) : (
            <span className="text-danger">{t("events.disconnected")}</span>
          )}
          <button
            onClick={() => socket.reconnect()}
            className="rounded-sm px-2 py-0.5 text-tertiary transition-colors hover:text-secondary"
            title={t("events.forceReconnect")}
          >
            ↻
          </button>
        </div>
      </ViewHeader>

      {/* Event table */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <EmptyState message={t("events.emptyState")} />
        ) : (
          <table className="min-w-full">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border-default text-left">
                <th className="w-28 px-4 py-1.5 text-xs font-medium text-tertiary">
                  {t("events.time")}
                </th>
                <th className="w-40 px-4 py-1.5 text-xs font-medium text-tertiary">
                  {t("events.type")}
                </th>
                <th className="w-40 px-4 py-1.5 text-xs font-medium text-tertiary">
                  {t("events.service")}
                </th>
                <th className="px-4 py-1.5 text-xs font-medium text-tertiary">
                  {t("events.summary")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event, i) => (
                <EventRow
                  key={`${event.at_ms}-${event.type}-${i}`}
                  event={event}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: DaemonEvent }) {
  const { t } = useTranslation();
  const variant = EVENT_VARIANTS[event.type];
  return (
    <tr className="border-b border-border-default/50 text-xs hover:bg-elevated/60">
      <td className="px-4 py-1.5 font-mono text-tertiary">
        {formatTimestamp(event.at_ms)}
      </td>
      <td className="px-4 py-1.5">
        <Badge variant={variant}>{event.type}</Badge>
      </td>
      <td className="px-4 py-1.5 font-mono text-primary">
        {"service" in event ? event.service : "—"}
      </td>
      <td className="px-4 py-1.5 text-secondary">{summarizeEvent(event, t)}</td>
    </tr>
  );
}

const EVENT_VARIANTS: Record<DaemonEvent["type"], BadgeVariant> = {
  state_changed: "success",
  allocation_changed: "accent",
  config_reloaded: "warning",
  estimator_drift: "vision",
  auto_restarted: "warning",
};

function summarizeEvent(event: DaemonEvent, t: TFunction): string {
  switch (event.type) {
    case "state_changed":
      return t("events.stateChanged", { from: event.from, to: event.to });
    case "allocation_changed":
      return t("events.allocationChanged");
    case "config_reloaded":
      return t("events.configReloaded");
    case "estimator_drift":
      return t("events.estimatorDriftCorrection", {
        class: event.class,
        value: event.rolling_mean.toFixed(3),
      });
    case "auto_restarted":
      return event.detail
        ? t("events.autoRestarted", {
            trigger: event.trigger,
            detail: event.detail,
          })
        : t("events.autoRestartedShort", { trigger: event.trigger });
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
