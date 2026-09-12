import { init } from "./index.js";

const script = document.currentScript as HTMLScriptElement | null;
if (script?.dataset.siteId) {
  init({
    siteId: script.dataset.siteId,
    host: script.src,
    identifiers:
      script.dataset.identifiers !== "false" &&
      (script.dataset.consent === undefined ||
        script.dataset.consent === "granted"),
    tracking: script.dataset.tracking === "paused" ? "paused" : "active",
  });
}
