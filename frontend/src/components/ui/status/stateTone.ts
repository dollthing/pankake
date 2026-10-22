// Service state to tone and translation key. The daemon reports state by
// name (`ServiceState::name` in `crates/supervise`); a disabled service
// arrives as plain `disabled`, without the reason it holds internally.
// That is why `disabled` is neutral: most often the operator chose it,
// and there is nothing on the wire to tell a crash loop apart.

import type { Tone } from "../tone.ts";

export function stateTone(state: string): Tone {
  switch (state) {
    case "running":
      return "ok";
    case "starting":
    case "draining":
      return "warn";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

/// The `services.states.*` key for a state. Anything prefixed `disabled`
/// shares the one `disabled` label.
export function stateLabelKey(state: string): string {
  const base = state.startsWith("disabled") ? "disabled" : state;
  return `services.states.${base}`;
}
