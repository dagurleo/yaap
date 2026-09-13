import { type CSSProperties } from "react";
import { LandingHeader, LandingFooter } from "./landing-shell";
import { PricingSection } from "./pricing";
import { VisitorGlobe } from "./visitor-globe";

export function LandingPage({
  hosted = false,
  demoAvailable = false,
}: {
  hosted?: boolean;
  demoAvailable?: boolean;
}) {
  return (
    <div className="yaap-landing yaap-home">
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <LandingHeader hosted={hosted} />
      <main id="top">
        <Hero hosted={hosted} demoAvailable={demoAvailable} />
        <ProductPreview />
        <Features />
        <PricingSection hosted={hosted} />
        <Ownership />
        <Setup />
        <Questions hosted={hosted} />
      </main>
      <LandingFooter />
    </div>
  );
}

function Hero({
  hosted,
  demoAvailable,
}: {
  hosted: boolean;
  demoAvailable: boolean;
}) {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="wrap hero-layout">
        <div className="hero-copy">
          <h1 id="hero-heading">
            See what brings people in.
            <br />
            And what makes them <em>customers.</em>
          </h1>
          <p>
            Source-available web analytics.
            <span className="hosting-choice">
              {hosted
                ? "Start hosted, or run it in your own Cloudflare account."
                : "Run it in your own Cloudflare account."}
            </span>
          </p>
          <div className="actions">
            <a className="button primary" href={hosted ? "/signup" : "/app"}>
              {hosted ? "Start your trial" : "Open your workspace"}
            </a>
            <a
              className="text-link"
              href={demoAvailable ? "/demo" : "#product"}
            >
              {demoAvailable ? "View demo" : "Explore the dashboard"}
            </a>
          </div>
          <p className="hero-note">
            {hosted
              ? "14 days free · No credit card"
              : "Your infrastructure. Your analytics."}
          </p>
        </div>
        <VisitorGlobe />
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <section
      className="product-section"
      id="product"
      aria-label="Yaap traffic overview"
    >
      <div className="wrap">
        <figure className="product-figure">
          <picture className="product-capture">
            <source
              media="(max-width: 700px)"
              srcSet="/landing/traffic-mobile.png"
              width="380"
              height="720"
            />
            <img
              src="/landing/traffic-desktop.png"
              width="1708"
              height="974"
              alt="Yaap traffic overview with 77,565 pageviews, 16,887 visitors, 18,437 sessions and 5.3% purchase conversion; a daily chart and source and page rankings."
              decoding="async"
            />
          </picture>
          <figcaption className="product-caption">
            <span>Atlas Demo · Traffic overview</span>
            <span>Aug 15 – Sep 13, 2026 · Sample data</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function ReportRows({
  rows,
  funnel = false,
}: {
  rows: { label: string; value: string; proportion: number }[];
  funnel?: boolean;
}) {
  return (
    <div
      className={`feature-report${funnel ? " feature-funnel" : ""}`}
      data-markdown-skip
    >
      {rows.map((row) => (
        <div
          className="feature-report-row"
          key={row.label}
          style={{ "--row-proportion": `${row.proportion}%` } as CSSProperties}
        >
          <span>{row.label}</span>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  );
}

function Features() {
  return (
    <section
      className="features"
      aria-label="Acquisition, conversion and revenue"
    >
      <div className="wrap">
        <dl className="feature-grid">
          <div>
            <dt>
              <span className="feature-label">Acquisition</span>Compare sources
              and campaigns
            </dt>
            <dd>
              <p>
                See the pages, sources and campaigns bringing people to your
                site.
              </p>
              <ReportRows
                rows={[
                  {
                    label: "Direct / unknown",
                    value: "19.9%",
                    proportion: 100,
                  },
                  {
                    label: "Google / referral",
                    value: "10.2%",
                    proportion: 51.3,
                  },
                  {
                    label: "LinkedIn / campaign",
                    value: "10.1%",
                    proportion: 50.8,
                  },
                ]}
              />
            </dd>
          </div>
          <div>
            <dt>
              <span className="feature-label">Conversion</span>Find where
              visitors drop off
            </dt>
            <dd>
              <p>
                Follow visitor journeys and see where people drop out of your
                funnels.
              </p>
              <ReportRows
                funnel
                rows={[
                  { label: "Homepage", value: "8,180", proportion: 100 },
                  { label: "Pricing", value: "4,450", proportion: 54.4 },
                  { label: "Signup", value: "1,573", proportion: 19.2 },
                ]}
              />
            </dd>
          </div>
          <div>
            <dt>
              <span className="feature-label">Revenue</span>Attribute payments
              to sources
            </dt>
            <dd>
              <p>
                Attribute payments to traffic sources, with refunds and
                currencies accounted for.
              </p>
              <div className="feature-revenue" data-markdown-skip>
                <p>Sample net revenue · USD</p>
                <div className="feature-revenue-total">$66,388.50</div>
                <div className="feature-revenue-source">
                  <span>Google / referral</span>
                  <b>$5,799.00</b>
                </div>
              </div>
            </dd>
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
            See how it fits together
          </a>
        </div>
        <div className="architecture">
          <div className="architecture-title">YOUR CLOUDFLARE ACCOUNT</div>
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
            <h2>
              Self-host Yaap
              <br />
              in three steps.
            </h2>
          </div>
          <p>
            Deploy to Cloudflare, add the snippet,
            <br />
            and start exploring your traffic.
          </p>
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

function Questions({ hosted }: { hosted: boolean }) {
  return (
    <section className="faq" id="questions">
      <div className="wrap faq-grid">
        <div>
          <h2>Before you jump in</h2>
        </div>
        <div>
          <details open>
            <summary>Where does my data live?</summary>
            <p>
              {hosted
                ? "With hosted Yaap, we manage the infrastructure. If you self-host, analytics stays in the infrastructure accounts you control."
                : "In the infrastructure accounts you control, with Cloudflare handling event collection and D1 or PostgreSQL storing your analytics."}
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
              {hosted
                ? "You can start a hosted subscription with a 14-day trial, or self-host Yaap and cover your own infrastructure costs."
                : "Hosted plans are coming soon. You can already self-host Yaap and cover your own Cloudflare infrastructure costs."}
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
