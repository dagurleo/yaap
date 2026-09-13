import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useRouter, useMatches, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Sun, Moon, Monitor } from "lucide-react";
import { authClient } from "@/auth/client";
import { useTheme } from "./theme-provider";

export function AccountMenu({
  name,
  ownsAccount = false,
  canCreateAccount = false,
}: {
  name: string;
  ownsAccount?: boolean;
  canCreateAccount?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
      router.options.context.queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/login" });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign out failed");
    } finally {
      setPending(false);
    }
  }
  async function createAccount() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/account", { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Could not create your account");
      router.options.context.queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/app" });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not create your account",
      );
    } finally {
      setPending(false);
    }
  }
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="workspace-avatar rounded-full bg-secondary text-secondary-foreground hover:bg-accent data-[state=open]:bg-accent"
          aria-label="Account menu"
        >
          <span aria-hidden="true" className="workspace-initials">
            {initials}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="break-words">
          {name || "Account"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ownsAccount && (
          <>
            <DropdownMenuItem asChild>
              <Link to="/app/billing">Billing</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/access">API & MCP access</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {canCreateAccount && (
          <>
            <DropdownMenuItem
              disabled={pending}
              onSelect={(event) => {
                event.preventDefault();
                void createAccount();
              }}
            >
              Create your own account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Theme</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-40" sideOffset={4}>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => {
                  if (
                    value === "light" ||
                    value === "dark" ||
                    value === "system"
                  )
                    setTheme(value);
                }}
                aria-label="Theme"
              >
                <DropdownMenuRadioItem value="light">
                  <Sun aria-hidden="true" />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon aria-hidden="true" />
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor aria-hidden="true" />
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOut aria-hidden="true" />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
        {error && (
          <p role="alert" className="px-2 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HeaderAccount() {
  const access = useMatches({
    select: (matches) =>
      matches.find((match) => match.routeId === "/_app")?.context.access,
  });
  const user = access?.user;
  return user ? (
    <AccountMenu
      name={user.name}
      ownsAccount={user.ownsAccount}
      canCreateAccount={
        !!user.emailVerified &&
        !user.ownsAccount &&
        !!access.registrationAvailable
      }
    />
  ) : null;
}
