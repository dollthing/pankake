// One-line summaries of daemon events, shared by the events view and a
// service's recent events. Pure, so the wording is testable without a
// render.

import type { TFunction } from "i18next";

import type { DaemonEvent } from "../../api/client.ts";
import { reasonLabelKey, stateLabelKey } from "../ui/status/stateTone.ts";

export function summarizeEvent(event: DaemonEvent, t: TFunction): string {
  switch (event.type) {
    case "state_changed": {
      const to = t(stateLabelKey(event.to));
      const reason = event.disabled_reason;
      return t("events.stateChanged", {
        from: t(stateLabelKey(event.from)),
        to:
          reason == null
            ? to
            : t("events.stateWithReason", {
                state: to,
                reason: t(reasonLabelKey(reason)),
              }),
      });
    }
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
