// A service's recent events: the live event history merged with the
// persisted restart log, which reaches back further than the daemon's
// in-memory window.

import type {
  DaemonEvent,
  ServiceRestartEntry,
} from "../../../../api/client.ts";

/// Events about `name` within `[since, end]`, newest first. Allocation
/// changes are dropped: a dynamic service emits one per balloon step, which
/// would bury everything else. A persisted restart that the live history
/// also holds appears once.
export function serviceEvents(
  history: readonly DaemonEvent[],
  restarts: readonly ServiceRestartEntry[],
  name: string,
  since: number,
  end: number,
): DaemonEvent[] {
  const inRange = (at: number) => at >= since && at <= end;
  const events = history.filter(
    (e) => inRange(e.at_ms) && concernsService(e, name),
  );
  const seen = new Set(
    events
      .filter((e) => e.type === "auto_restarted")
      .map((e) => restartKey(e.at_ms, e.trigger)),
  );
  for (const r of restarts) {
    if (r.service !== name || !inRange(r.at_ms)) continue;
    const key = restartKey(r.at_ms, r.trigger);
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      type: "auto_restarted",
      service: r.service,
      trigger: r.trigger,
      detail: r.detail,
      at_ms: r.at_ms,
    });
  }
  return events.sort((a, b) => b.at_ms - a.at_ms);
}

function concernsService(event: DaemonEvent, name: string): boolean {
  switch (event.type) {
    case "state_changed":
    case "estimator_drift":
    case "auto_restarted":
      return event.service === name;
    case "config_reloaded":
      return event.changed_services.includes(name);
    case "allocation_changed":
      return false;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function restartKey(atMs: number, trigger: string): string {
  return `${atMs}:${trigger}`;
}
