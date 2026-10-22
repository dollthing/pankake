// A service state as a dot and a translated label in the state's tone.

import { useTranslation } from "react-i18next";

import { cn } from "../cn.ts";
import { toneBox } from "../tone.ts";
import { stateLabelKey, stateTone } from "./stateTone.ts";

export function StateChip({
  state,
  className,
}: {
  readonly state: string;
  readonly className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold",
        toneBox({ tone: stateTone(state) }),
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {t(stateLabelKey(state), { defaultValue: state })}
    </span>
  );
}
