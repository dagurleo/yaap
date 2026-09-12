import { createFileRoute } from "@tanstack/react-router";
import { ApiAccess } from "@/features/dashboard/api-access";
export const Route = createFileRoute("/_app/app/access")({
  head: () => ({ meta: [{ title: "API & MCP access · YAAP" }] }),
  component: ApiAccess,
});
