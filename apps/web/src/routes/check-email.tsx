import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/auth/client";
import { accessFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/check-email")({
  beforeLoad: async () => {
    if ((await accessFn()).user) throw redirect({ to: "/app" });
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { email?: string; error?: string } => ({
    email:
      typeof search.email === "string" && search.email.length <= 254
        ? search.email
        : undefined,
    error:
      typeof search.error === "string" && search.error.length <= 80
        ? search.error
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Check your email · Yaap" }] }),
  component: CheckEmailPage,
});

function CheckEmailPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/check-email",
    });
    setMessage(
      result.error
        ? (result.error.message ?? "Could not send the email.")
        : "If the address can be verified, a new email is on its way.",
    );
    setPending(false);
  }
  return (
    <section className="mx-auto my-14 max-w-sm space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border shadow-xs dark:shadow-none">
      <p className="text-sm text-muted-foreground">EMAIL VERIFICATION</p>
      <h1>
        {search.error
          ? "That verification link is no longer valid."
          : "Check your email."}
      </h1>
      <p>
        {search.error
          ? "Request a fresh link below."
          : "Open the verification link we sent to continue. The link expires in one hour."}
      </p>
      <form className="space-y-3" onSubmit={resend}>
        <Label>
          Email
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
          />
        </Label>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Resend verification email"}
        </Button>
      </form>
      {message && <p role="status">{message}</p>}
      <p>
        <Link to="/app" className="underline">
          Continue to Yaap
        </Link>{" "}
        ·{" "}
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </p>
    </section>
  );
}
