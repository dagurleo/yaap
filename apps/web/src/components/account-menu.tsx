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
} from "@/components/ui/dropdown-menu";
import { useRouter, useMatches, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Sun, Moon, Monitor } from "lucide-react";
import { authClient } from "@/auth/client";
import { useTheme } from "./theme-provider";

export function AccountMenu({
  name,
  ownsAccount = false,
}: {
  name: string;
  ownsAccount?: boolean;
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
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system")
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
  const user = useMatches({
    select: (matches) =>
      matches.find((match) => match.routeId === "/_app")?.context.access?.user,
  });
  return user ? (
    <AccountMenu name={user.name} ownsAccount={user.ownsAccount} />
  ) : null;
}
