// Dashboard overview — the landing page and primary management view.
// Answers "what's happening right now?" with quick stats and a full
// service list with inline activity sparklines. A header time range
// toggle controls all charts. Device memory lives in the shell's band.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useServices, useMetrics, useLifecycle } from "../../api/hooks.ts";
import { TimeRangeSelect } from "../ui/form/TimeRangeSelect.tsx";
import { useResolvedRange, useTimeRange } from "../ui/form/useTimeRange.ts";

import { toggleFavourite, useFavourites } from "../../api/favourites.ts";
import { Card } from "../ui/Card.tsx";
import { ViewHeader } from "../ui/ViewHeader.tsx";
import { Stat } from "../ui/data/Stat.tsx";
import { Spinner } from "../ui/feedback/Spinner.tsx";
import { SegmentedToggle } from "../ui/form/SegmentedToggle.tsx";
import { ServiceRow } from "./ServiceRow.tsx";
import { buildServiceSparkline } from "./dashboardSparkline.ts";

type SortOrder = "alpha" | "recent" | "size";
const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: "alpha", label: "A-Z" },
  { id: "recent", label: "Recent" },
  { id: "size", label: "Size" },
];

function isActive(state: string): boolean {
  return state === "running" || state === "starting" || state === "draining";
}

export function DashboardView() {
  const { t } = useTranslation();
  const services = useServices();
  const lifecycle = useLifecycle();
  const favourites = useFavourites();

  const [range, setRange] = useTimeRange();
  const { since, until, end, bucket } = useResolvedRange(range);
  const xMin = since / 1000;
  const xMax = end / 1000;
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    () => (localStorage.getItem("ananke-sort-order") as SortOrder) ?? "alpha",
  );
  useEffect(() => {
    localStorage.setItem("ananke-sort-order", sortOrder);
  }, [sortOrder]);
  const metrics = useMetrics({ since, until, bucket });

  const serviceSpark = useMemo(
    () => buildServiceSparkline(metrics.data?.buckets ?? []),
    [metrics.data],
  );

  const runningCount =
    services.data?.filter((s) => s.state === "running").length ?? 0;
  const totalCount = services.data?.length ?? 0;

  const inputTokens =
    metrics.data?.buckets.reduce((sum, b) => sum + b.prompt_tokens, 0) ?? 0;
  const outputTokens =
    metrics.data?.buckets.reduce((sum, b) => sum + b.completion_tokens, 0) ?? 0;

  const sortedServices = useMemo(
    () =>
      services.data
        ? [...services.data].sort((a, b) => {
            // Active services (running/starting/draining) always sort
            // above inactive ones, regardless of the selected criteria.
            const aActive = isActive(a.state);
            const bActive = isActive(b.state);
            if (aActive !== bActive) return aActive ? -1 : 1;

            // Favourited services sort above non-favourited.
            const aFav = favourites.has(a.name);
            const bFav = favourites.has(b.name);
            if (aFav !== bFav) return aFav ? -1 : 1;

            if (sortOrder === "recent") {
              const aTime = a.last_used_ms ?? 0;
              const bTime = b.last_used_ms ?? 0;
              if (aTime !== bTime) return bTime - aTime;
              return a.name.localeCompare(b.name);
            }
            if (sortOrder === "size") {
              const aSize = a.footprint_bytes ?? 0;
              const bSize = b.footprint_bytes ?? 0;
              if (aSize !== bSize) return bSize - aSize;
              return a.name.localeCompare(b.name);
            }
            return a.name.localeCompare(b.name);
          })
        : [],
    [services.data, sortOrder, favourites],
  );

  return (
    <div className="flex h-full flex-col">
      <ViewHeader className="gap-3 sm:gap-5">
        <h1 className="eyebrow !text-primary">{t("dashboard.title")}</h1>
        <TimeRangeSelect value={range} onChange={setRange} />
        <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-3 sm:w-auto sm:ml-auto">
          <Stat label={t("dashboard.totalServices")} value={totalCount} />
          <Stat label={t("dashboard.runningServices")} value={runningCount} />
          <Stat
            label={t("dashboard.inputTokens")}
            value={inputTokens.toLocaleString()}
          />
          <Stat
            label={t("dashboard.outputTokens")}
            value={outputTokens.toLocaleString()}
          />
        </div>
      </ViewHeader>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {/* Service list with activity sparklines */}
        <Card
          header={t("nav.services")}
          headerAction={
            <SegmentedToggle
              label={t("dashboard.sortOrder")}
              options={SORT_OPTIONS.map((opt) => ({
                label: opt.label,
                value: opt.id,
              }))}
              selected={sortOrder}
              onChange={setSortOrder}
            />
          }
          bodyClassName="p-0"
        >
          {services.isPending ? (
            <div className="p-4">
              <Spinner />
            </div>
          ) : services.data ? (
            <div className="divide-y divide-border-default">
              {sortedServices.map((s) => (
                <ServiceRow
                  key={s.name}
                  svc={s}
                  sparkData={serviceSpark.get(s.name)}
                  xMin={xMin}
                  xMax={xMax}
                  pending={
                    lifecycle.isPending && lifecycle.variables?.name === s.name
                  }
                  onAction={(action) =>
                    lifecycle.mutate({ action, name: s.name })
                  }
                  favourite={favourites.has(s.name)}
                  onToggleFavourite={() => toggleFavourite(s.name)}
                />
              ))}
            </div>
          ) : (
            <span className="p-4 text-sm text-danger">
              {services.error?.message}
            </span>
          )}
        </Card>
      </div>
    </div>
  );
}
