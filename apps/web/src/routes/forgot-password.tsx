import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset your password · Yaap" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/reset-password" }),
      });
    } finally {
      // The result is deliberately neutral for registered and unknown emails.
      setSent(true);
      setPending(false);
    }
  }
  return (
    <section className="mx-auto my-14 max-w-sm space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border shadow-xs dark:shadow-none">
      <p className="text-sm text-muted-foreground">PASSWORD RECOVERY</p>
      <h1>Reset your password.</h1>
      {sent ? (
        <p role="status">
          If that address has an account, a reset link is on its way.
        </p>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
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
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link to="/login" className="text-sm underline">
        Back to sign in
      </Link>
    </section>
  );
}
