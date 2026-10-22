// Stats / observability view (`/stats`). Charts request rate, token
// throughput, error rate, auto-restarts, avg latency, and per-device
// memory utilisation from the daemon's `/api/metrics`, `/api/restarts`,
// and `/api/devices/samples` endpoints.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useMetrics,
  useDeviceSamples,
  useRestarts,
  useServices,
} from "../../api/hooks.ts";
import {
  aggregateBuckets,
  groupByService,
  toErrorsRestartsData,
} from "../../api/metrics-aggregate.ts";
import { bucketMsOf } from "../../util.ts";
import { Card } from "../ui/Card.tsx";
import { ViewHeader } from "../ui/ViewHeader.tsx";
import { Chart, type ChartSeries } from "../ui/chart/Chart.tsx";
import { categorical, deviceSeries } from "../ui/chart/series.ts";
import { TimeRangeSelect } from "../ui/form/TimeRangeSelect.tsx";
import { useResolvedRange, useTimeRange } from "../ui/form/useTimeRange.ts";

import { Spinner } from "../ui/feedback/Spinner.tsx";
import {
  groupDeviceSamples,
  resolveField,
  hasSplitTps,
  toLineData,
  toMultiSeriesData,
  toMemoryData,
} from "./metricsViewData.ts";

export function MetricsView() {
  const { t } = useTranslation();
  const [range, setRange] = useTimeRange();
  const { since, until, end, bucket } = useResolvedRange(range);
  const xMin = since / 1000;
  const xMax = end / 1000;
  const [serviceFilter, setServiceFilter] = useState<string>("");

  const services = useServices();
  const metrics = useMetrics({
    service: serviceFilter || undefined,
    since,
    until,
    bucket,
  });
  const deviceSamples = useDeviceSamples(undefined, since);
  const restarts = useRestarts(serviceFilter || undefined, since, until ?? end);

  const loading = metrics.isPending;

  const aggregated = useMemo(
    () => aggregateBuckets(metrics.data?.buckets ?? []),
    [metrics.data],
  );

  const perService = useMemo(
    () => groupByService(metrics.data?.buckets ?? []),
    [metrics.data],
  );

  const memorySeries = useMemo(
    () => groupDeviceSamples(deviceSamples.data ?? []),
    [deviceSamples.data],
  );

  const errorsRestartsData = useMemo(
    () =>
      toErrorsRestartsData(
        aggregated,
        restarts.data ?? [],
        since,
        end,
        bucketMsOf(bucket),
      ),
    [aggregated, restarts.data, since, end, bucket],
  );

  return (
    <div className="flex h-full flex-col">
      <ViewHeader>
        <h1 className="eyebrow !text-primary">{t("stats.title")}</h1>
        <TimeRangeSelect value={range} onChange={setRange} />
        <div className="ml-auto flex items-center gap-2">
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="h-7 rounded-sm border border-border-default bg-base px-2 text-xs text-primary focus:border-accent focus:outline-none"
          >
            <option value="">{t("stats.allServices")}</option>
            {(services.data ?? [])
              .filter((s) => s.modality !== "embedding")
              .map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      </ViewHeader>

      <div className="flex-1 overflow-auto p-4">
        {loading && !metrics.data ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Request rate */}
            <Card header={t("stats.requestRate")}>
              <Chart
                xMin={xMin}
                xMax={xMax}
                data={toLineData(aggregated, "requestCount")}
                series={[
                  {
                    label: t("stats.requests"),
                    color: "series-1",
                    fill: true,
                  },
                ]}
              />
            </Card>

            {/* Token throughput */}
            <Card header={t("stats.tokenThroughput")}>
              <Chart
                xMin={xMin}
                xMax={xMax}
                data={[
                  aggregated.map((b) => b.ts),
                  aggregated.map((b) => b.promptTokens),
                  aggregated.map((b) => b.completionTokens),
                ]}
                series={[
                  {
                    label: t("stats.tokensIn"),
                    color: "series-1",
                    fill: true,
                  },
                  {
                    label: t("stats.tokensOut"),
                    color: "series-2",
                    fill: true,
                  },
                ]}
              />
            </Card>

            {/* Errors and auto-restarts on one card: the error storm and
                the watchdog firing it provokes belong on the same axis. */}
            <Card header={t("stats.errorsRestarts")}>
              <Chart
                xMin={xMin}
                xMax={xMax}
                data={errorsRestartsData}
                series={[
                  {
                    label: t("stats.errors"),
                    color: "danger",
                    fill: true,
                  },
                  {
                    label: t("stats.restarts"),
                    color: "warn",
                    fill: true,
                  },
                ]}
              />
            </Card>

            {/* Avg latency */}
            <Card header={t("stats.avgLatency")}>
              <Chart
                xMin={xMin}
                xMax={xMax}
                data={toLineData(aggregated, "totalDurationMs")}
                series={[
                  {
                    label: t("stats.durationMs"),
                    color: "series-3",
                    fill: true,
                  },
                ]}
              />
            </Card>

            {/* Tokens per second. The end-to-end effective line is always
                shown; when the window has split-capable rows the input and
                output decode rates are overlaid on top of it. */}
            <Card header={t("stats.tokensPerSecond")}>
              <Chart
                xMin={xMin}
                xMax={xMax}
                data={[
                  aggregated.map((b) => b.ts),
                  ...(hasSplitTps(aggregated)
                    ? [
                        aggregated.map((b) => resolveField(b, "inputTps")),
                        aggregated.map((b) => resolveField(b, "outputTps")),
                      ]
                    : []),
                  aggregated.map((b) => resolveField(b, "effectiveTps")),
                ]}
                series={[
                  ...(hasSplitTps(aggregated)
                    ? ([
                        {
                          label: t("stats.tpsIn"),
                          color: "series-1",
                          fill: true,
                          unit: "tok/s",
                          // Decode/prefill rate is undefined when nothing is
                          // generating; break the line rather than interpolate
                          // a stale flat value across a stall.
                          spanGaps: false,
                        },
                        {
                          label: t("stats.tpsOut"),
                          color: "series-2",
                          fill: true,
                          unit: "tok/s",
                          spanGaps: false,
                        },
                      ] satisfies ChartSeries[])
                    : []),
                  {
                    label: t("stats.tpsEffective"),
                    color: "series-3",
                    fill: true,
                    unit: "tok/s",
                    spanGaps: false,
                  },
                ]}
              />
            </Card>

            {/* Memory utilisation */}
            <Card header={t("stats.memoryUtilisation")}>
              <Chart
                xMin={xMin}
                xMax={xMax}
                data={toMemoryData(memorySeries)}
                series={memorySeries.map((s) => ({
                  label: s.device,
                  color: deviceSeries(s.device),
                  fill: true,
                  unit: "GB",
                }))}
              />
            </Card>

            {/* Per-service output TPS */}
            {perService.length > 1 && !serviceFilter && (
              <Card
                header={t("stats.perServiceTpsOut")}
                className="lg:col-span-2"
              >
                <Chart
                  xMin={xMin}
                  xMax={xMax}
                  height={200}
                  data={toMultiSeriesData(perService, "outputTps")}
                  series={perService.map((s, i) => ({
                    label: s.serviceName,
                    color: categorical(i),
                    unit: "tok/s",
                    // Sparse decode rate: break the line where a service is
                    // idle or producing nothing rather than interpolating.
                    spanGaps: false,
                  }))}
                />
              </Card>
            )}

            {/* Per-service request breakdown */}
            {perService.length > 1 && !serviceFilter && (
              <Card
                header={t("stats.perServiceRequests")}
                className="lg:col-span-2"
              >
                <Chart
                  xMin={xMin}
                  xMax={xMax}
                  height={200}
                  data={toMultiSeriesData(perService, "requestCount")}
                  series={perService.map((s, i) => ({
                    label: s.serviceName,
                    color: categorical(i),
                  }))}
                />
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
