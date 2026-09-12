import { dashboardPending } from "@/features/dashboard/dashboard-pending";
import {
  createFileRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { accessFn } from "../features/dashboard/functions";
export const Route = createFileRoute("/_app")({
  ...dashboardPending,
  beforeLoad: async () => {
    const access = await accessFn();
    if (access.setupRequired) throw redirect({ to: "/setup" });
    if (!access.user) throw redirect({ to: "/login" });
    return { access };
  },
  component: Outlet,
});
