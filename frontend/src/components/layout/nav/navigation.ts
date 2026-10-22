// The app's sections and how URLs map onto them. Services owns two path
// shapes (the list at `/` and one service at `/services/:name`), so
// activeness is decided here rather than by `NavLink`'s own matching.

import type { ServiceSummary } from "../../../api/client.ts";

export type Section = "services" | "chat" | "events" | "stats" | "config";

export const SECTIONS: readonly Section[] = [
  "services",
  "chat",
  "events",
  "stats",
  "config",
];

/// The section a path belongs to, or `undefined` for an unknown path.
export function sectionForPath(pathname: string): Section | undefined {
  const path = trimTrailingSlash(pathname);
  if (path === "" || path.startsWith(SERVICE_PREFIX)) return "services";
  const name = path.slice(1);
  return SECTIONS.find((section) => section !== "services" && section === name);
}

/// The service a `/services/:name` path names. A malformed escape falls
/// back to `undefined`, so the caller shows the list rather than throwing.
export function serviceFromPath(pathname: string): string | undefined {
  const path = trimTrailingSlash(pathname);
  if (!path.startsWith(SERVICE_PREFIX)) return undefined;
  const raw = path.slice(SERVICE_PREFIX.length);
  if (raw === "" || raw.includes("/")) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

export type LastService = Pick<ServiceSummary, "name" | "modality">;

/// Where a section's nav item points. Services reopens the last service,
/// and Chat preselects it when it is a chat model.
export function sectionHref(
  section: Section,
  lastService: LastService | undefined,
): string {
  switch (section) {
    case "services":
      return lastService === undefined
        ? "/"
        : `${SERVICE_PREFIX}${encodeURIComponent(lastService.name)}`;
    case "chat":
      return lastService !== undefined && isChatModel(lastService)
        ? `/chat?model=${encodeURIComponent(lastService.name)}`
        : "/chat";
    case "events":
    case "stats":
    case "config":
      return `/${section}`;
    default: {
      const unreachable: never = section;
      return unreachable;
    }
  }
}

const SERVICE_PREFIX = "/services/";

function trimTrailingSlash(pathname: string): string {
  return pathname.replace(/\/+$/, "");
}

function isChatModel(service: LastService): boolean {
  return service.modality === undefined || service.modality === "chat";
}
