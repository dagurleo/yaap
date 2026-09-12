import { useId, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { LandingFooter, LandingHeader } from "./landing-shell";

const events = new Intl.NumberFormat("en-US");
const compactEvents = new Intl.NumberFormat("en-US", { notation: "compact" });
const price = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const included = [
  "Unlimited websites",
  "Traffic & real-time analytics",
  "Custom events & properties",
  "Goals, funnels & visitor journeys",
  "Revenue attribution",
  "API & MCP access",
];

export function PricingSection({
  hosted = false,
  fullPage = false,
}: {
  hosted?: boolean;
  fullPage?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const plan = BILLING_PLANS[selected];
  const Heading = fullPage ? "h1" : "h2";

  return (
    <section
      className={`pricing-section${fullPage ? " pricing-section-page" : ""}`}
      id="pricing"
      aria-labelledby={`${id}-heading`}
    >
      <div className="wrap">
        <div className="pricing-heading">
          <Heading id={`${id}-heading`}>
            All the analytics.
            <br />
            <span>Just choose your volume.</span>
          </Heading>
          <p>
            One plan. Unlimited websites. Every core feature.
            <br />
            Pricing that grows with your traffic.
          </p>
        </div>
        <div className="pricing-board">
          <div
            className="pricing-configurator"
            data-markdown={[
              "Monthly hosted plans. Pageviews and custom events share one allowance across all websites. Billed monthly in USD, plus applicable tax.",
              "",
              "| Monthly events | USD per month |",
              "| --- | --- |",
              ...BILLING_PLANS.map(
                (tier) =>
                  `| ${events.format(tier.eventAllowance)} | ${price.format(tier.monthlyPriceCents / 100)} |`,
              ),
              "",
              "Same features at every tier. Only the event allowance changes.",
            ].join("\n")}
          >
            <label htmlFor={`${id}-volume`}>How many events per month?</label>
            <div className="pricing-volume">
              <output className="pricing-event-count" htmlFor={`${id}-volume`}>
                {events.format(plan.eventAllowance)}
              </output>
              <span>events / month</span>
            </div>
            <p id={`${id}-help`}>
              Pageviews + custom events, shared across all your websites.
            </p>
            <div
              className="pricing-slider"
              style={
                {
                  "--pricing-progress": `${(selected / (BILLING_PLANS.length - 1)) * 100}%`,
                } as CSSProperties
              }
            >
              <input
                id={`${id}-volume`}
                name="monthly-events"
                type="range"
                min="0"
                max={BILLING_PLANS.length - 1}
                step="1"
                value={selected}
                onChange={(event) => setSelected(Number(event.target.value))}
                aria-describedby={`${id}-help`}
                aria-valuetext={`${events.format(plan.eventAllowance)} events per month, ${price.format(plan.monthlyPriceCents / 100)} per month`}
              />
              <div className="pricing-stops">
                {BILLING_PLANS.map((tier, index) => (
                  <button
                    type="button"
                    key={tier.key}
                    onClick={() => setSelected(index)}
                    aria-pressed={selected === index}
                    aria-label={`${events.format(tier.eventAllowance)} events per month`}
                  >
                    {compactEvents.format(tier.eventAllowance)}
                  </button>
                ))}
              </div>
            </div>
            <p className="pricing-volume-note">
              Same features at every step. Only the event allowance changes.
            </p>
          </div>
          <div className="pricing-total">
            <div>
              <h3>Yaap hosted</h3>
              <div
                className="pricing-price"
                aria-live="polite"
                aria-atomic="true"
              >
                <span>{price.format(plan.monthlyPriceCents / 100)}</span>
                <span>/ month</span>
                <span className="pricing-sr-only">
                  {" "}
                  for {events.format(plan.eventAllowance)} events
                </span>
              </div>
              <p>Billed monthly in USD. Plus applicable tax.</p>
            </div>
            <div className="pricing-start">
              {hosted ? (
                <a className="button primary" href="/signup">
                  Start your free trial <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <p className="pricing-coming-soon">
                  Hosted plans are coming soon.
                </p>
              )}
              <p>
                14 days free · No credit card
                <br />
                100,000 events included in your trial.
              </p>
            </div>
          </div>
          <div className="pricing-included">
            <p>Included at every volume</p>
            <ul role="list">
              {included.map((feature) => (
                <li key={feature}>
                  <Check size={16} aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="pricing-after">
          <p>
            Prefer to run it yourself?{" "}
            <a href="https://github.com/dagurleo/yaap">
              Self-host Yaap <span aria-hidden="true">↗</span>
            </a>
          </p>
          {!fullPage && (
            <a className="text-link" href="/pricing">
              Explore pricing & FAQs <span aria-hidden="true">→</span>
            </a>
          )}
          {fullPage && (
            <a className="text-link" href="#pricing-questions">
              How event billing works <span aria-hidden="true">↓</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export function PricingPage({ hosted = false }: { hosted?: boolean }) {
  return (
    <div className="yaap-landing yaap-pricing">
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <LandingHeader hosted={hosted} pricing />
      <main id="top">
        <PricingSection hosted={hosted} fullPage />
        <section className="pricing-self-host">
          <div className="wrap pricing-self-host-inner">
            <div>
              <h2>
                Your infrastructure.
                <br />
                Your analytics.
              </h2>
              <p>
                Self-host Yaap in your own Cloudflare account. You manage the
                deployment and pay your infrastructure provider directly.
              </p>
            </div>
            <a
              className="text-link"
              href="https://github.com/dagurleo/yaap#readme"
            >
              Explore self-hosting <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
        <PricingQuestions />
      </main>
      <LandingFooter />
    </div>
  );
}

function PricingQuestions() {
  return (
    <section className="faq pricing-faq" id="pricing-questions">
      <div className="wrap faq-grid">
        <div>
          <h2>A little more detail</h2>
          <p>What counts, what’s included, and what happens as you grow.</p>
        </div>
        <div className="faq-list">
          <details>
            <summary>What counts as an event?</summary>
            <p>
              Each stored pageview or custom event counts once. Event properties
              are included. Heartbeats, duplicate deliveries, rejected traffic
              and payment records do not use your allowance. Reading your
              dashboard or API does not count as an event.
            </p>
          </details>
          <details>
            <summary>Is the allowance shared across websites?</summary>
            <p>
              Yes. Add unlimited websites to your workspace and share one
              monthly event allowance across them. Unused events do not roll
              over to the next billing period.
            </p>
          </details>
          <details>
            <summary>How does the free trial work?</summary>
            <p>
              Your trial includes 14 days and 100,000 events across all your
              websites, with no credit card required. The slider shows paid
              monthly plans; changing it does not change your trial allowance.
              Subscribe when you’re ready.
            </p>
          </details>
          <details>
            <summary>What if I go over my event allowance?</summary>
            <p>
              A 10% buffer gives you room to upgrade without automatic overage
              charges. At the end of that buffer, new event collection pauses
              until you upgrade or your allowance resets. Existing reports
              remain accessible. Events sent while collection is paused cannot
              be recovered.
            </p>
          </details>
          <details>
            <summary>Can I change my plan or cancel?</summary>
            <p>
              Manage your subscription from Billing. Upgrades show a prorated
              charge and keep your already-counted usage. Downgrades take effect
              at the next renewal. Cancellation takes effect at the end of your
              paid period.
            </p>
          </details>
          <details>
            <summary>
              Do you offer annual billing or more than 10M events?
            </summary>
            <p>
              The current plans are billed monthly, up to 10 million events per
              month. Annual billing and higher-volume plans are not available
              for self-service purchase yet.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
