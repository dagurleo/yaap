import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { token?: string; error?: string } => ({
    token:
      typeof search.token === "string" && search.token.length <= 256
        ? search.token
        : undefined,
    error:
      typeof search.error === "string" && search.error.length <= 80
        ? search.error
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Choose a new password · Yaap" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: password, token }),
    });
    if (response.ok) setComplete(true);
    else
      setError("This reset link is invalid or has expired. Request a new one.");
    setPending(false);
  }
  const invalid = linkError || !token;
  return (
    <section className="mx-auto my-14 max-w-sm space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border shadow-xs dark:shadow-none">
      <p className="text-sm text-muted-foreground">PASSWORD RECOVERY</p>
      <h1>
        {complete
          ? "Password updated."
          : invalid
            ? "That reset link is no longer valid."
            : "Choose a new password."}
      </h1>
      {!invalid && !complete && (
        <form className="space-y-3" onSubmit={submit}>
          <Label>
            New password
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
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      <p>
        <Link
          to={complete ? "/login" : "/forgot-password"}
          className="underline"
        >
          {complete ? "Sign in" : "Request a new link"}
        </Link>
      </p>
    </section>
  );
}
