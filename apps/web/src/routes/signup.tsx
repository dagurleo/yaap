import { useState, type FormEvent } from "react";
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { accessFn } from "@/features/dashboard/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const access = await accessFn();
    if (access.setupRequired) throw redirect({ to: "/setup" });
    if (access.user) throw redirect({ to: "/app" });
    if (!access.registrationAvailable) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Create your account · Yaap" }] }),
  component: SignupPage,
});

function SignupPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error || result.message || "Could not create account.",
        );
      await router.navigate({
        to: "/check-email",
        search: { email: String(data.email ?? "") },
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create account.",
      );
      setPending(false);
    }
  }
  return (
    <section className="mx-auto my-14 max-w-sm space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border shadow-xs dark:shadow-none">
      <p className="text-sm text-muted-foreground">START YOUR WORKSPACE</p>
      <h1>Create your account.</h1>
      <p>Verify your email before adding your first website.</p>
      <form className="space-y-3 pt-3" onSubmit={submit}>
        <Label>
          Your name
          <Input name="name" autoComplete="name" maxLength={120} required />
        </Label>
        <Label>
          Email
          <Input
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
          />
        </Label>
        <Label>
          Password
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
          <small>At least 12 characters.</small>
        </Label>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </p>
    </section>
  );
}
