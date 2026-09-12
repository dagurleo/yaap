import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/auth/client";
import {
  acceptInvitationFn,
  invitationPreviewFn,
} from "@/features/dashboard/functions";

export const Route = createFileRoute("/invite/$token")({
  loader: ({ params }) =>
    invitationPreviewFn({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Website invitation · Yaap" },
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvitationPage,
});

function InvitationPage() {
  const preview = Route.useLoaderData();
  const { token } = Route.useParams();
  const router = useRouter();
  const [error, setError] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [registering, setRegistering] = useState(false);
  const returnTo = `/invite/${encodeURIComponent(token)}`;
  const accept = useMutation({
    mutationFn: () => acceptInvitationFn({ data: { token } }),
    onSuccess: async (result) => {
      router.options.context.queryClient.clear();
      await router.navigate({
        to: "/app/$siteId/overview",
        params: { siteId: result.site.id },
        search: { days: 7 },
      });
    },
  });

  if (
    !preview.available ||
    ["unavailable", "expired", "revoked"].includes(preview.status)
  )
    return (
      <InvitationShell>
        <h1>This invitation is no longer available.</h1>
        <p>
          It may have expired, been revoked, or the website may no longer exist.
        </p>
        <Button asChild>
          {preview.signedIn ? (
            <Link to="/app">Go to websites</Link>
          ) : (
            <Link to="/login">Go to sign in</Link>
          )}
        </Button>
      </InvitationShell>
    );

  return (
    <InvitationShell>
      <div className="invitation-icon" aria-hidden="true">
        <CheckCircle2 />
      </div>
      <div className="invitation-heading">
        <p>Website invitation</p>
        <h1>
          {preview.inviterName} invited you to view {preview.siteName}.
        </h1>
        <p>{preview.siteOrigin}</p>
      </div>
      <div className="invitation-scope">
        <strong>Viewer access</strong>
        <p>
          You can view all analytics for this website, including visitor details
          and revenue. You cannot change settings or invite other people.
        </p>
      </div>

      {!preview.signedIn && !registering && (
        <div className="invitation-actions">
          <Button asChild variant="primary">
            <Link to="/login" search={{ returnTo }}>
              Sign in to continue
            </Link>
          </Button>
          <Button onClick={() => setRegistering(true)}>
            Create an account
          </Button>
          <p>Use the invited address ({preview.recipientHint}).</p>
        </div>
      )}

      {!preview.signedIn && registering && (
        <RegistrationForm
          token={token}
          onCancel={() => setRegistering(false)}
        />
      )}

      {preview.signedIn && !preview.emailMatches && (
        <div className="invitation-actions">
          <p>
            You are signed in with a different email. Switch to the invited
            address ({preview.recipientHint}) to continue.
          </p>
          <Button
            variant="primary"
            onClick={async () => {
              await authClient.signOut();
              router.options.context.queryClient.clear();
              window.location.assign(
                `/login?returnTo=${encodeURIComponent(returnTo)}`,
              );
            }}
          >
            Switch account
          </Button>
        </div>
      )}

      {preview.signedIn && preview.emailMatches && !preview.emailVerified && (
        <div className="invitation-actions">
          <p>Verify your email address before accepting this invitation.</p>
          <Button
            variant="primary"
            onClick={async () => {
              setError("");
              setVerificationSent(false);
              const result = await authClient.sendVerificationEmail({
                email: preview.actorEmail ?? "",
                callbackURL: returnTo,
              });
              if (result.error)
                setError(
                  result.error.message ?? "Could not send verification email.",
                );
              else setVerificationSent(true);
            }}
          >
            Send verification email
          </Button>
          {verificationSent && (
            <p role="status">Verification email sent. Check your inbox.</p>
          )}
        </div>
      )}

      {preview.signedIn && preview.emailMatches && preview.emailVerified && (
        <div className="invitation-actions">
          <Button
            variant="primary"
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? "Accepting…" : "Accept invitation"}
          </Button>
          <p>This grants read-only access to this website only.</p>
        </div>
      )}
      {(error || accept.error) && (
        <p className="text-destructive" role="alert">
          {accept.error instanceof Error ? accept.error.message : error}
        </p>
      )}
    </InvitationShell>
  );
}

function RegistrationForm({
  token,
  onCancel,
}: {
  token: string;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          result.message || result.error || "Could not create account.",
        );
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create account.",
      );
      setPending(false);
    }
  }
  return (
    <form className="invitation-registration" onSubmit={submit}>
      <Label htmlFor="invitation-name">
        Your name
        <Input
          id="invitation-name"
          name="name"
          autoComplete="name"
          maxLength={120}
          required
        />
      </Label>
      <Label htmlFor="invitation-email">
        Invited email
        <Input
          id="invitation-email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </Label>
      <Label htmlFor="invitation-password">
        Password
        <Input
          id="invitation-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <small>At least 12 characters.</small>
      </Label>
      <div className="invitation-form-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function InvitationShell({ children }: { children: ReactNode }) {
  return <section className="invitation-page">{children}</section>;
}
