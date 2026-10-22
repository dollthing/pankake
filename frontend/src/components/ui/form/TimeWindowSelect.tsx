// Shared time-window selector: relative presets plus a custom absolute
// range. Used by the logs viewer, per-service stats, the stats view, and
// the dashboard so they all present the same controls. A custom range
// applies as it is typed. The model and helpers live in `timeWindow.ts`
// so this file stays components-only for react-refresh.

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SegmentedToggle } from "./SegmentedToggle.tsx";
import { TextInput } from "./TextInput.tsx";
import {
  TIME_WINDOW_PRESETS,
  datetimeToMs,
  msToDatetime,
  type TimeWindow,
  type TimeWindowPreset,
} from "./timeWindow.ts";

export function TimeWindowSelect({
  presets = TIME_WINDOW_PRESETS,
  onChange,
}: {
  readonly presets?: readonly TimeWindowPreset[];
  readonly onChange: (window: TimeWindow) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetIdx, setPresetIdx] = useState(0);
  const [sinceInput, setSinceInput] = useState("");
  const [untilInput, setUntilInput] = useState("");

  function emitCustom(since: string, until: string) {
    const sinceMs = datetimeToMs(since);
    if (sinceMs === null) return;
    onChange({ kind: "absolute", sinceMs, untilMs: datetimeToMs(until) });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedToggle<number | "custom">
        label={t("common.timeRange")}
        options={[
          ...presets.map((p, i) => ({ label: p.label, value: i })),
          { label: t("common.custom"), value: "custom" },
        ]}
        selected={mode === "preset" ? presetIdx : "custom"}
        onChange={(v) => {
          if (v === "custom") {
            if (mode !== "custom") {
              const since = msToDatetime(Date.now() - 60 * 60 * 1000);
              setSinceInput(since);
              setUntilInput("");
              setMode("custom");
              emitCustom(since, "");
            }
          } else {
            const preset = presets[v];
            if (!preset) return;
            setPresetIdx(v);
            setMode("preset");
            onChange({ kind: "relative", durationMs: preset.durationMs });
          }
        }}
      />
      {mode === "custom" && (
        <>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            {t("common.from")}
            <TextInput
              type="datetime-local"
              size="sm"
              mono
              className="px-1.5 text-xs"
              value={sinceInput}
              onChange={(e) => {
                setSinceInput(e.target.value);
                emitCustom(e.target.value, untilInput);
              }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            {t("common.to")}
            <TextInput
              type="datetime-local"
              size="sm"
              mono
              className="px-1.5 text-xs"
              value={untilInput}
              onChange={(e) => {
                setUntilInput(e.target.value);
                emitCustom(sinceInput, e.target.value);
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
