import { useRef, useState, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  getAnalyticsChoice,
  setAnalyticsChoice,
  subscribeAnalyticsChoice,
} from "../lib/analytics-consent";

export function AnalyticsConsent() {
  const choice = useSyncExternalStore(
    subscribeAnalyticsChoice,
    getAnalyticsChoice,
    () => "unknown" as const,
  );
  const [editing, setEditing] = useState(false);
  const settings = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const homepage = useRouterState({
    select: (state) => state.location.pathname === "/",
  });
  // Preview the consent UI locally even when self-tracking is not configured.
  if (import.meta.env.PROD && !import.meta.env.VITE_YAAP_SITE_ID?.trim())
    return null;
  const visible = editing || (homepage && choice === "unknown");
  function choose(value: "accepted" | "rejected" | "dismissed") {
    const restoreFocus = panel.current?.contains(document.activeElement);
    setAnalyticsChoice(value);
    setEditing(false);
    if (restoreFocus) settings.current?.focus({ preventScroll: true });
  }
  return (
    <>
      <button
        ref={settings}
        type="button"
        className="analytics-settings"
        aria-expanded={visible}
        aria-controls="analytics-consent"
        onClick={() => setEditing(true)}
      >
        Analytics preferences
      </button>
      {visible && (
        <section
          ref={panel}
          id="analytics-consent"
          className="analytics-consent"
          aria-label="Analytics notice"
        >
          <p>
            {choice === "rejected"
              ? "Analytics is off for this browser."
              : "We use Yaap analytics to improve this site."}{" "}
            <a href="/privacy#storage">Learn more</a>.
          </p>
          <div className="analytics-consent-actions">
            <button
              type="button"
              onClick={() =>
                choose(choice === "rejected" ? "accepted" : "rejected")
              }
            >
              {choice === "rejected" ? "Enable analytics" : "Opt out"}
            </button>
            <button
              type="button"
              className="analytics-notice-close"
              aria-label="Dismiss analytics notice"
              onClick={() =>
                choose(choice === "unknown" ? "dismissed" : choice)
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m4 4 8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </section>
      )}
    </>
  );
}
