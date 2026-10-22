// The `/services/:name` route until the services master-detail view takes
// it over: the new detail pane on its own.

import { useParams } from "react-router-dom";

import { useServices } from "../../api/hooks.ts";
import { ServiceDetail } from "./detail/ServiceDetail.tsx";

export function ServiceDetailView() {
  const { name = "" } = useParams<{ name: string }>();
  const services = useServices();
  return (
    <ServiceDetail
      key={name}
      name={name}
      summary={services.data?.find((s) => s.name === name)}
      listHidden={false}
      serviceCount={services.data?.length ?? 0}
      onBrowse={() => {}}
    />
  );
}
