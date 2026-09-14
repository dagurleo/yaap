import { useEffect, type MouseEvent, type KeyboardEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { documentationUrl, repositoryUrl } from "./policy-details";
import {
  registerPublicAgentTools,
  type PublicModelContext,
} from "@/lib/public-agent-tools";

function closeMobileMenu(event: MouseEvent<HTMLDivElement>) {
  if ((event.target as HTMLElement).closest("a"))
    event.currentTarget.querySelector("details")?.removeAttribute("open");
}
function dismissMobileMenu(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Escape") {
    event.currentTarget.querySelector("details")?.removeAttribute("open");
    event.currentTarget.querySelector("summary")?.focus();
  }
}

export function LandingHeader({
  hosted,
  pricing = false,
}: {
  hosted: boolean;
  pricing?: boolean;
}) {
  const { setTheme } = useTheme();
  useEffect(() => {
    const context = (
      document as Document & { modelContext?: PublicModelContext }
    ).modelContext;
    if (context?.registerTool)
      return registerPublicAgentTools(context, window.location.origin, hosted);
  }, [hosted]);
  function toggleTheme() {
    setTheme(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    );
  }
  return (
    <header>
      <div className="wrap nav">
        <div className="wordmark">
          <a href="/" aria-label="Yaap homepage">
            <img
              className="brand-lockup brand-lockup-light"
              src="/brand/logo-light.svg"
              alt=""
              width="209"
              height="64"
            />
            <img
              className="brand-lockup brand-lockup-dark"
              src="/brand/logo-dark.svg"
              alt=""
              width="209"
              height="64"
            />
          </a>
        </div>
        <nav aria-label="Main">
          <a href="/#product">Product</a>
          <a href="/#ownership">Self-hosting</a>
          <a href="/pricing" aria-current={pricing ? "page" : undefined}>
            Pricing
          </a>
          <a href={documentationUrl}>Docs</a>
        </nav>
        <div className="nav-end">
          <a href={hosted ? "/signup" : "/app"}>
            {hosted ? "Sign up" : "Sign in"}
          </a>
        </div>
        <a
          className="github-button"
          href="https://github.com/dagurleo/yaap"
          title="Yaap on GitHub"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15A10.8 10.8 0 0 1 12 6.16c.96 0 1.91.13 2.81.38 2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.69.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.04.76 2.1v3.09c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" />
          </svg>
          <span>GitHub</span>
        </a>
        <button
          className="theme-toggle"
          type="button"
          onClick={toggleTheme}
          aria-label="Switch between light and dark mode"
          title="Switch color theme"
        >
          <Moon className="theme-toggle-moon" aria-hidden="true" />
          <Sun className="theme-toggle-sun" aria-hidden="true" />
        </button>
        <div
          className="mobile-menu"
          onClick={closeMobileMenu}
          onKeyDown={dismissMobileMenu}
        >
          <details>
            <summary>Menu</summary>
            <nav aria-label="Mobile">
              <a href={hosted ? "/signup" : "/app"}>
                {hosted ? "Sign up" : "Sign in"}
              </a>
              <a href="/#product">Product</a>
              <a href="/#ownership">Self-hosting</a>
              <a href="/pricing" aria-current={pricing ? "page" : undefined}>
                Pricing
              </a>
              <a href={documentationUrl}>Docs</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="wrap">
        <div className="footer-main">
          <div className="footer-brand">
            <div className="wordmark">
              <a href="/" aria-label="Yaap homepage">
                <img
                  className="brand-lockup brand-lockup-light"
                  src="/brand/logo-light.svg"
                  alt=""
                  width="209"
                  height="64"
                />
                <img
                  className="brand-lockup brand-lockup-dark"
                  src="/brand/logo-dark.svg"
                  alt=""
                  width="209"
                  height="64"
                />
              </a>
            </div>
            <p>
              Yet another analytics platform.
              <br />
              Your data deserves a place of its own.
            </p>
          </div>
          <nav aria-label="Product links">
            <h2>Product</h2>
            <ul role="list">
              <li>
                <a href="/#product">Overview</a>
              </li>
              <li>
                <a href="/pricing">Pricing</a>
              </li>
              <li>
                <a href="/#ownership">Self-hosting</a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Resource links">
            <h2>Resources</h2>
            <ul role="list">
              <li>
                <a href={documentationUrl}>Documentation</a>
              </li>
              <li>
                <a href="/docs/api.md">API & MCP</a>
              </li>
              <li>
                <a href={repositoryUrl}>GitHub</a>
              </li>
              <li>
                <a href="/contact">Contact</a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Legal and security links">
            <h2>Legal & security</h2>
            <ul role="list">
              <li>
                <a href="/privacy">Privacy Policy</a>
              </li>
              <li>
                <a href="/terms">Terms of Service</a>
              </li>
              <li>
                <a href="/security">Security</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>
            Source-available under{" "}
            <a href={`${repositoryUrl}/blob/main/LICENSE.md`}>
              Elastic License 2.0
            </a>
            .
          </p>
          <a href="#top">Back to top</a>
        </div>
      </div>
    </footer>
  );
}
