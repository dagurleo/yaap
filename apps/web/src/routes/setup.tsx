import { createFileRoute, redirect } from "@tanstack/react-router";
import { accessFn } from "../features/dashboard/functions";
import { AuthForm } from "../components/auth-form";
export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    const access = await accessFn();
    if (!access.setupRequired)
      throw redirect({ to: access.user ? "/app" : "/login" });
  },
  component: () => <AuthForm setup />,
});
