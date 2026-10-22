// Legacy panel API, kept for views not yet restyled; new code uses
// `layout/Panel` directly. Deleted once the last view moves off it.

import type { ReactNode } from "react";

import { Panel } from "./layout/Panel.tsx";

type CardProps = {
  header?: ReactNode;
  /** Optional element rendered at the right edge of the header row. */
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function Card({
  header,
  headerAction,
  children,
  className,
  bodyClassName,
}: CardProps) {
  return (
    <Panel
      as="div"
      heading={header}
      actions={headerAction}
      padding="none"
      className={className}
    >
      <div className={bodyClassName || "p-4"}>{children}</div>
    </Panel>
  );
}
