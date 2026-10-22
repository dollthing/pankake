// The strip across the top of every page: who and where the daemon is,
// whether the live connection is up, and the theme toggle. It owns the
// top safe-area inset, since nothing sits above it.

import { cn } from "../../ui/cn.ts";
import { BandIdentity } from "./BandIdentity.tsx";

export function HardwareBand({ className }: { readonly className?: string }) {
  return (
    <header
      className={cn(
        "border-b-2 border-line-strong bg-surface pt-[env(safe-area-inset-top)] md:flex md:h-[calc(var(--spacing-band)+env(safe-area-inset-top))] md:items-stretch md:overflow-hidden",
        className,
      )}
    >
      <BandIdentity />
    </header>
  );
}
