import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { init } from "@yaap/client";
import {
  getAnalyticsChoice,
  subscribeAnalyticsChoice,
} from "../lib/analytics-consent";

/** Optional analytics for this installation's public homepage only. */
export function SelfTracking() {
  const router = useRouter();
  useEffect(() => {
    const siteId = import.meta.env.VITE_YAAP_SITE_ID?.trim();
    if (!import.meta.env.PROD || !siteId) return;

    const analytics = init({
      siteId,
      host: window.location.origin,
      tracking: "paused",
    });
    if (!analytics) return;

    let disposed = false;
    const updateConsent = () => {
      const enabled = getAnalyticsChoice() !== "rejected";
      if (!enabled) analytics.pause();
      analytics.setIdentifiers(enabled);
    };
    const update = () => {
      updateConsent();
      // Pause before the tracker's queued SPA pageview. On public navigation,
      // wait for history's batched URL update before resuming collection.
      if (router.history.location.pathname !== "/") {
        analytics.pause();
        return;
      }
      queueMicrotask(() => {
        if (
          !disposed &&
          getAnalyticsChoice() !== "rejected" &&
          router.history.location.pathname === "/" &&
          window.location.pathname === "/"
        )
          analytics.resume();
      });
    };
    const unsubscribe = router.history.subscribe(update);
    const unsubscribeConsent = subscribeAnalyticsChoice(update);
    update();
    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeConsent();
      analytics.destroy();
    };
  }, [router]);
  return null;
}
