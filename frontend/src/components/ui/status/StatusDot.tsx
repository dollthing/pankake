// A small filled dot in a tone's colour. Pass `state` to derive the tone
// from a service state, or `tone` directly.

import { useTranslation } from "react-i18next";

import { cn } from "../cn.ts";
import { toneText, type Tone } from "../tone.ts";
import { stateLabelKey, stateTone } from "./stateTone.ts";

type StatusDotProps = (
  | { readonly state: string; readonly tone?: never }
  | { readonly tone: Tone; readonly state?: never }
) & { readonly className?: string };

export function StatusDot({ state, tone, className }: StatusDotProps) {
  const { t } = useTranslation();
  const resolved = tone ?? stateTone(state ?? "");
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full bg-current",
        toneText({ tone: resolved }),
        className,
      )}
      title={
        state === undefined
          ? undefined
          : t(stateLabelKey(state), { defaultValue: state })
      }
    />
  );
}
