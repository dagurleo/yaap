import { loginReturn } from "../lib/login-return";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { accessFn } from "../features/dashboard/functions";
import { AuthForm } from "../components/auth-form";
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } => ({
    returnTo: loginReturn(search.returnTo),
  }),
  beforeLoad: async ({ search }) => {
    const access = await accessFn();
    if (access.setupRequired) throw redirect({ to: "/setup" });
    if (access.user && search.returnTo)
      throw redirect({ href: search.returnTo });
    if (access.user) throw redirect({ to: "/app" });
    return access;
  },
  component: LoginPage,
});

function LoginPage() {
  const { registrationAvailable } = Route.useRouteContext();
  return (
    <AuthForm
      returnTo={Route.useSearch().returnTo}
      registrationAvailable={registrationAvailable}
    />
  );
}
