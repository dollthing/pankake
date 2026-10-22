// Service detail page (`/services/:name`). Shows model info, VRAM
// estimate, placement preview, launch command, and a logs viewer.

import { isChatModel } from "../../api/chatModels.ts";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useServiceDetail, useLifecycle } from "../../api/hooks.ts";
import type { RestartEvent, ServiceStateKind } from "../../api/client.ts";
import { formatTimestamp, relativeTime, serviceProxyUrl } from "../../util.ts";
import { Card } from "../ui/Card.tsx";
import { ViewHeader } from "../ui/ViewHeader.tsx";
import { Stat } from "../ui/data/Stat.tsx";
import { Chip } from "../ui/status/Chip.tsx";
import { StatusDot } from "../ui/status/StatusDot.tsx";
import { Spinner } from "../ui/feedback/Spinner.tsx";
import { Button } from "../ui/button/Button.tsx";
import { ButtonLink } from "../ui/button/ButtonLink.tsx";
import { LogsViewer } from "../logs/LogsViewer.tsx";
import { ConfigurationPanel } from "./detail/ConfigurationPanel.tsx";
import { EstimatePanel } from "./detail/EstimatePanel.tsx";
import { LaunchCommandPanel } from "./detail/LaunchCommandPanel.tsx";
import { ModelPanel } from "./detail/ModelPanel.tsx";
import { PlacementPanel } from "./detail/PlacementPanel.tsx";
import { ServingPanel } from "./detail/ServingPanel.tsx";
import { ServiceMetrics } from "./ServiceMetrics.tsx";

export function ServiceDetailView() {
  const { t } = useTranslation();
  const { name } = useParams<{ name: string }>();
  const detail = useServiceDetail(name ?? null);
  const lifecycle = useLifecycle();

  if (detail.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <div className="p-4 text-sm text-danger">
        {detail.error?.message ?? t("serviceDetail.notFound")}
      </div>
    );
  }

  const d = detail.data;
  const pending = lifecycle.isPending && lifecycle.variables?.name === name;

  return (
    <div className="flex h-full flex-col">
      {/* Header — fixed height to align with the sidebar wordmark and
          the other views' headers, forming one continuous rule. */}
      <ViewHeader>
        <Link to="/" className="text-tertiary hover:text-secondary">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <StatusDot
          state={d.state}
          reason={d.disabled_reason}
          className="size-2.5"
        />
        <h1 className="min-w-0 truncate font-mono text-sm font-semibold tracking-[0.02em] text-primary">
          {d.name}
        </h1>
        {d.model_info?.has_mmproj && <Chip tone="vision">vision</Chip>}
        {d.modality === "embedding" && <Chip tone="embedding">embedding</Chip>}
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <Stat label={t("serviceDetail.port")} value={`:${d.port}`} />
          <Stat label={t("serviceDetail.pid")} value={d.pid ?? "—"} />
          <Stat label={t("serviceDetail.priority")} value={d.priority} />
          <Stat label={t("serviceDetail.lifecycle")} value={d.lifecycle} />
        </div>
      </ViewHeader>

      <div className="@container/detail flex-1 space-y-4 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Lifecycle actions */}
          <Card header={t("serviceDetail.actions")} className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={serviceProxyUrl(d.port)} external>
                {t("serviceDetail.open")}
              </ButtonLink>
              {isChatModel(d) && (
                <ButtonLink
                  tone="primary"
                  icon="chat"
                  to={`/chat?model=${encodeURIComponent(d.name)}`}
                >
                  {t("serviceDetail.chat")}
                </ButtonLink>
              )}
              <LifecycleActions
                state={d.state}
                pending={pending}
                onAction={(action) =>
                  lifecycle.mutate({ action, name: d.name })
                }
              />
            </div>
          </Card>

          {d.model_info && <ModelPanel model={d.model_info} />}
          <ConfigurationPanel detail={d} />
          {d.serving && (
            <ServingPanel serving={d.serving} runtime={d.runtime} />
          )}
          {d.estimate && <EstimatePanel estimate={d.estimate} detail={d} />}
          <PlacementPanel detail={d} />
          <div className="lg:col-span-2">
            <LaunchCommandPanel name={d.name} />
          </div>
        </div>

        {/* Per-service stats */}
        {d.modality !== "embedding" && <ServiceMetrics name={d.name} />}

        {/* Auto-restart history */}
        {(d.recent_restarts?.length ?? 0) > 0 && (
          <Card header={t("serviceDetail.autoRestarts")}>
            <RestartHistory restarts={d.recent_restarts ?? []} />
          </Card>
        )}

        {/* Logs */}
        <Card header={t("serviceDetail.logs")} bodyClassName="p-0">
          <LogsViewer name={d.name} />
        </Card>
      </div>
    </div>
  );
}

function RestartHistory({ restarts }: { restarts: readonly RestartEvent[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {restarts.map((r) => (
        <li
          key={`${r.at_ms}-${r.trigger}`}
          className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3"
        >
          <span
            className="shrink-0 text-tertiary tabular-nums"
            title={formatTimestamp(r.at_ms)}
          >
            {relativeTime(r.at_ms)}
          </span>
          <Chip tone="warn">{r.trigger}</Chip>
          <span className="text-primary">{r.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function LifecycleActions({
  state,
  pending,
  onAction,
}: {
  state: ServiceStateKind;
  pending: boolean;
  onAction: (
    action: "start" | "stop" | "restart" | "enable" | "disable",
  ) => void;
}) {
  const { t } = useTranslation();
  const canStart = ["idle", "stopped", "failed", "evicted"].includes(state);
  const canStop = ["running", "starting", "draining"].includes(state);
  const isDisabled = state === "disabled";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canStart && (
        <Button
          tone="start"
          icon="start"
          onClick={() => onAction("start")}
          disabled={pending}
        >
          {t("services.actions.start")}
        </Button>
      )}
      {canStop && (
        <>
          <Button
            tone="stop"
            icon="stop"
            onClick={() => onAction("stop")}
            disabled={pending}
          >
            {t("services.actions.stop")}
          </Button>
          <Button
            icon="restart"
            onClick={() => onAction("restart")}
            disabled={pending}
          >
            {t("services.actions.restart")}
          </Button>
        </>
      )}
      {isDisabled ? (
        <Button
          icon="power"
          onClick={() => onAction("enable")}
          disabled={pending}
        >
          {t("services.actions.enable")}
        </Button>
      ) : (
        <Button
          icon="disable"
          onClick={() => onAction("disable")}
          disabled={pending}
        >
          {t("services.actions.disable")}
        </Button>
      )}
    </div>
  );
}
