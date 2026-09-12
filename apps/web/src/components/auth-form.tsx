import { loginReturn } from "../lib/login-return";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { authClient } from "../auth/client";
export function AuthForm({ setup = false, returnTo }: { setup?: boolean; returnTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    try {
      if (setup) {
        const response = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const body = (await response.json()) as {
          error?: string;
          message?: string;
        };
        if (!response.ok)
          throw new Error(body.error || body.message || "Setup failed");
      } else {
        const result = await authClient.signIn.email({
          email: data.email,
          password: data.password,
        });
        if (result.error)
          throw new Error(result.error.message || "Sign in failed");
      }
      const destination = loginReturn(returnTo);
      if (destination) { window.location.assign(destination); return; }
      router.options.context.queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/app" });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="mx-auto my-14 max-w-sm space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border shadow-xs dark:shadow-none">
      <p className="text-sm text-muted-foreground">
        {setup ? "WELCOME" : "YOUR WORKSPACE"}
      </p>
      <h1>{setup ? "Make this your own." : "Welcome back."}</h1>
      {setup && (
        <p>
          Create the owner account using the setup secret you entered during
          deployment.
        </p>
      )}
      <form className="pt-3" onSubmit={submit}>
        {setup && (
          <Label>
            Your name
            <Input name="name" autoComplete="name" maxLength={120} required />
          </Label>
        )}
        <Label>
          Email
          <Input name="email" type="email" autoComplete="username" required />
        </Label>
        <Label>
          Password
          <Input
            name="password"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            minLength={setup ? 12 : undefined}
            maxLength={128}
            required
          />
          {setup && <small>At least 12 characters.</small>}
        </Label>
        {setup && (
          <Label>
            Setup secret
            <Input
              name="setupSecret"
              type="password"
              autoComplete="off"
              required
            />
          </Label>
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? "Please wait…"
            : setup
              ? "Create owner account"
              : "Sign in"}
        </Button>
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
