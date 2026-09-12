import type { MouseEvent, KeyboardEvent } from "react";
import { useLandingMotion } from "./use-landing-motion";

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

export function LandingPage({ hosted = false }: { hosted?: boolean }) {
  const motionRoot = useLandingMotion();
  return (
    <div className="yaap-landing" ref={motionRoot}>
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <LandingHeader hosted={hosted} />
      <main id="top">
        <Hero hosted={hosted} />
        <Features />
        <Ownership />
        <Setup />
        <Questions />
      </main>
      <LandingFooter />
    </div>
  );
}

function LandingHeader({ hosted }: { hosted: boolean }) {
  return (
    <header>
      <div className="wrap nav">
        <div className="wordmark">
          <a href="#top" aria-label="Yaap homepage">
            <img
              className="brand-lockup"
              src="/brand/logo-light.svg"
              alt=""
              width="209"
              height="64"
            />
          </a>
        </div>
        <nav aria-label="Main">
          <a href="#product">Product</a>
          <a href="#ownership">Self-hosting</a>
          <a href="#questions">Questions</a>
        </nav>
        <div className="nav-end">
          <a href={hosted ? "/signup" : "/app"}>
            {hosted ? "Sign up" : "Sign in"} <span aria-hidden="true">↗</span>
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
              <a href="#product">Product</a>
              <a href="#ownership">Self-hosting</a>
              <a href="#questions">Questions</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function Hero({ hosted }: { hosted: boolean }) {
  return (
    <section className="hero">
      <div className="wrap">
        <h1>
          See what brings people in.
          <br />
          <span>
            And what makes them <em>customers.</em>
          </span>
        </h1>
        <div className="hero-bottom">
          <p>
            Open-source web analytics, from first visit to revenue.
            <br className="desktop-break" />{" "}
            {hosted
              ? "Start hosted, with a 14-day trial."
              : "Self-hosted on your own Cloudflare account."}
          </p>
          <div className="actions">
            <a className="button primary" href={hosted ? "/signup" : "/app"}>
              {hosted ? "Start your trial" : "Make it yours"}
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15A10.8 10.8 0 0 1 12 6.16c.96 0 1.91.13 2.81.38 2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.69.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.04.76 2.1v3.09c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" />
              </svg>
            </a>
            <a className="text-link" href="#product">
              Explore the dashboard <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className="product-window" id="product">
          <div className="window-top">
            <div>
              Yaap / <strong>Atlas Demo</strong>
            </div>
            <div className="sample">
              <span className="dot"></span> Illustrative data
            </div>
          </div>
          <div className="dashboard">
            <aside className="sidebar">
              <div className="mini-brand" role="img" aria-label="Yaap">
                <img
                  className="brand-lockup"
                  src="/brand/logo-light.svg"
                  alt=""
                  width="209"
                  height="64"
                />
              </div>
              <div className="site">
                Atlas Demo <span>⌄</span>
                <small>atlas-demo.example</small>
              </div>
              <div className="side-active">
                Overview <span>•</span>
              </div>
              <div>Visitors</div>
              <div>Funnels</div>
              <div>Revenue</div>
              <div>Events</div>
              <div className="settings">Settings</div>
              <div className="sidebar-foot">Your data. Your workspace.</div>
            </aside>
            <div className="workspace">
              <div className="dash-heading">
                <div>
                  <p>Atlas Demo</p>
                  <h2>Overview</h2>
                </div>
                <div className="period">
                  Last 30 days <span>⌄</span>
                </div>
              </div>
              <div className="tabs">
                <strong>Traffic</strong>
                <span>Conversions</span>
                <span>Revenue</span>
              </div>
              <dl className="metrics">
                <div>
                  <dt>Pageviews</dt>
                  <dd>
                    48,291 <small>+12.8%</small>
                  </dd>
                </div>
                <div>
                  <dt>Identified visitors</dt>
                  <dd>
                    12,608 <small>+9.6%</small>
                  </dd>
                </div>
                <div>
                  <dt>Sessions</dt>
                  <dd>
                    16,394 <small>+11.2%</small>
                  </dd>
                </div>
                <div>
                  <dt>Purchase conversion</dt>
                  <dd>
                    4.8% <small>+0.6 pp</small>
                  </dd>
                </div>
              </dl>
              <div className="chart-head">
                <strong>Pageviews</strong>
                <span>Daily</span>
              </div>
              <div className="chart">
                <div className="axis">
                  <span>3k</span>
                  <span>2k</span>
                  <span>1k</span>
                  <span>0</span>
                </div>
                <svg
                  viewBox="0 0 900 165"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Illustrative pageviews over 30 days, with several peaks"
                >
                  <path
                    className="grid"
                    d="M0 10H900M0 55H900M0 100H900M0 145H900"
                  />
                  <path
                    className="area"
                    d="M0 125L30 135L60 112L90 110L120 125L150 103L180 113L210 120L240 85L270 25L300 40L330 122L360 96L390 108L420 82L450 98L480 66L510 74L540 97L570 68L600 75L630 45L660 55L690 8L720 95L750 79L780 50L810 64L840 40L870 55L900 32V165H0Z"
                  />
                  <path
                    className="previous"
                    d="M0 145L30 142L60 133L90 140L120 135L150 130L180 143L210 139L240 135L270 122L300 130L330 144L360 130L390 136L420 125L450 127L480 111L510 125L540 140L570 126L600 120L630 130L660 115L690 102L720 138L750 124L780 119L810 125L840 105L870 118L900 100"
                  />
                  <path
                    className="current"
                    pathLength={1}
                    d="M0 125L30 135L60 112L90 110L120 125L150 103L180 113L210 120L240 85L270 25L300 40L330 122L360 96L390 108L420 82L450 98L480 66L510 74L540 97L570 68L600 75L630 45L660 55L690 8L720 95L750 79L780 50L810 64L840 40L870 55L900 32"
                  />
                </svg>
              </div>
              <div className="dates">
                <span>Aug 12</span>
                <span>Aug 19</span>
                <span>Aug 26</span>
                <span>Sep 2</span>
                <span>Sep 10</span>
              </div>
              <div className="report-grid">
                <div>
                  <h3>Traffic sources</h3>
                  <div className="table-row table-label">
                    <span>Source</span>
                    <span>Pageviews</span>
                  </div>
                  <div className="table-row">
                    <span>Direct / unknown</span>
                    <span>18,351</span>
                  </div>
                  <div className="table-row">
                    <span>Google</span>
                    <span>12,608</span>
                  </div>
                  <div className="table-row">
                    <span>Hacker News</span>
                    <span>7,294</span>
                  </div>
                </div>
                <div>
                  <h3>Top pages</h3>
                  <div className="table-row table-label">
                    <span>Page</span>
                    <span>Pageviews</span>
                  </div>
                  <div className="table-row">
                    <span>/</span>
                    <span>21,482</span>
                  </div>
                  <div className="table-row">
                    <span>/pricing</span>
                    <span>10,305</span>
                  </div>
                  <div className="table-row">
                    <span>/docs</span>
                    <span>6,918</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="proof-strip">
          <span>Traffic & campaigns</span>
          <span>Goals & funnels</span>
          <span>Visitor journeys</span>
          <span>Payment attribution</span>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="features">
      <div className="wrap">
        <div className="section-heading">
          <h2>
            From “where did they come from?”
            <br />
            to “what brought them back?”
          </h2>
        </div>
        <dl className="feature-grid">
          <div>
            <div className="feature-number">01 / ACQUISITION</div>
            <dt>Find your way in</dt>
            <dd>
              See the pages, sources and campaigns bringing people to your site.
            </dd>
            <div className="mini-report">
              <div>
                <span>Google</span>
                <b>42%</b>
              </div>
              <div className="bar bar-one"></div>
              <div>
                <span>Hacker News</span>
                <b>28%</b>
              </div>
              <div className="bar bar-two"></div>
              <div>
                <span>Direct / unknown</span>
                <b>18%</b>
              </div>
              <div className="bar bar-three"></div>
            </div>
          </div>
          <div>
            <div className="feature-number">02 / CONVERSION</div>
            <dt>Understand the next step</dt>
            <dd>
              Follow visitor journeys and see where people drop out of your
              funnels.
            </dd>
            <div className="funnel">
              <div>
                <span>Pricing page</span>
                <b>1,204</b>
              </div>
              <div>
                <span>Checkout</span>
                <b>486</b>
              </div>
              <div>
                <span>Purchase</span>
                <b>231</b>
              </div>
            </div>
          </div>
          <div>
            <div className="feature-number">03 / REVENUE</div>
            <dt>Connect visits to value</dt>
            <dd>
              Attribute payments to traffic sources, with refunds and currencies
              accounted for.
            </dd>
            <div className="revenue">
              <p>Attributed revenue · USD</p>
              <div>
                $8,642<span>Illustrative data</span>
              </div>
              <div className="receipt">
                Google / organic <strong>$3,482</strong>
              </div>
            </div>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Ownership() {
  return (
    <section className="ownership" id="ownership">
      <div className="wrap split">
        <div>
          <h2>
            Your analytics.
            <br />
            Your Cloudflare account.
          </h2>
          <p>
            Run Yaap on infrastructure you control. Keep the dashboard, event
            collection and storage together in your own account.
          </p>
          <a className="text-link" href="#setup">
            See how it fits together <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="architecture">
          <div className="architecture-title">
            YOUR CLOUDFLARE ACCOUNT <span>↗</span>
          </div>
          <div className="worker">
            <div className="worker-brand" role="img" aria-label="Yaap">
              <img
                className="brand-lockup"
                src="/brand/logo-light.svg"
                alt=""
                width="209"
                height="64"
              />
            </div>
            <span>Dashboard + API + event collection</span>
            <small>Cloudflare Worker</small>
          </div>
          <div className="connect-line"></div>
          <div className="infra-grid">
            <div>
              <strong>D1</strong>
              <span>Analytics storage</span>
            </div>
            <div>
              <strong>Queues</strong>
              <span>Event processing</span>
            </div>
          </div>
          <p>One workspace. Infrastructure you own.</p>
        </div>
      </div>
    </section>
  );
}

function Setup() {
  return (
    <section className="setup" id="setup">
      <div className="wrap">
        <div className="setup-top">
          <div>
            <h2>Make room for another platform.</h2>
          </div>
          <p>This one lives in your account.</p>
        </div>
        <ol className="steps" role="list">
          <li>
            <span>01</span>
            <div>
              <h3>Deploy your workspace</h3>
              <p>Provision Yaap in your Cloudflare account.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Add your website</h3>
              <p>Install the tracking snippet on your site.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Follow what matters</h3>
              <p>Explore traffic, set goals and connect payments.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section className="faq" id="questions">
      <div className="wrap faq-grid">
        <div>
          <h2>Before you jump in</h2>
        </div>
        <div>
          <details>
            <summary>Where does my data live?</summary>
            <p>
              In your own Cloudflare account, using D1 for storage and Queues
              for event processing.
            </p>
          </details>
          <details>
            <summary>Can I connect payments?</summary>
            <p>
              Yes. Optional payment attribution connects transactions to traffic
              sources, including refunds and separate currency reporting.
            </p>
          </details>
          <details>
            <summary>Is this a hosted subscription?</summary>
            <p>
              Yaap is self-hosted. You operate the deployment and cover your own
              Cloudflare infrastructure costs.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer>
      <div className="wrap footer">
        <div className="wordmark">
          <a href="#top" aria-label="Yaap homepage">
            <img
              className="brand-lockup"
              src="/brand/logo-light.svg"
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
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
