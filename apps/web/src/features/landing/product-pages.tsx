import { PublicPage, type PublicSection } from "./public-page";

type ProductGuide = {
  path: string;
  title: string;
  description: string;
  sections: PublicSection[];
};

export const productGuides: Record<string, ProductGuide> = {
  selfHosting: {
    path: "/self-hosted-web-analytics",
    title: "Self-hosted web analytics on Cloudflare",
    description:
      "Run Yaap in your own Cloudflare account. Keep website traffic, conversion funnels and revenue reports on infrastructure you control.",
    sections: [
      {
        id: "why-self-host",
        title: "Keep the analytics stack in your account",
        content: (
          <>
            <p>
              Self-hosted web analytics means you run the software that
              collects, stores and reports your website activity. With Yaap, the
              dashboard and event collection run in a Cloudflare Worker. You
              choose the database and manage the account that holds your data.
            </p>
            <p>
              This is useful when you want to inspect the tracking code, choose
              how long to retain events or connect reporting to your own tools.
              You can track multiple websites from one workspace and give
              collaborators access to individual websites.
            </p>
            <p>
              Yaap is source-available under the Elastic License 2.0. Read the{" "}
              <a href="https://github.com/dagurleo/yaap/blob/main/LICENSE.md">
                license
              </a>{" "}
              before modifying or redistributing it; source-available does not
              mean an unrestricted open-source license.
            </p>
          </>
        ),
      },
      {
        id: "architecture",
        title: "What runs in your Cloudflare account",
        content: (
          <>
            <p>
              The default deployment uses a Cloudflare Worker, a D1 database, an
              event queue and a dead-letter queue. The Worker serves the app and
              accepts events. Queues buffer collection before events are
              processed into analytics storage.
            </p>
            <p>
              D1 keeps the default setup within Cloudflare. PostgreSQL through
              Hyperdrive is an optional backend if you want to operate a
              separate database. The repository includes the app, the browser
              tracker and the documentation.
            </p>
            <p>
              You get traffic sources, page reports, custom events,{" "}
              <a href="/conversion-tracking">goals and conversion funnels</a>,
              and optional{" "}
              <a href="/revenue-attribution">payment attribution</a>. A scoped
              API and MCP endpoint let approved tools work with your analytics.
            </p>
          </>
        ),
      },
      {
        id: "setup",
        title: "Deploy, add a website and verify collection",
        content: (
          <>
            <p>
              Start with the{" "}
              <a href="/docs/self-hosting">self-hosting setup guide</a> and the
              full repository. Provision the database and queues, configure the
              Worker and create separate authentication and bootstrap secrets.
              After deployment, open <code>/setup</code> on your installation to
              create the owner account.
            </p>
            <p>
              Add a website, configure its allowed origins and install either
              the script snippet or{" "}
              <a href="/docs/npm">the @yaap/client npm package</a>. Visit the
              tracked site and confirm that a real pageview reaches your
              dashboard before adding goals or payments.
            </p>
            <p>
              Choose identified, anonymous or paused collection deliberately.
              Anonymous events can contribute to pageview and event totals,
              while visitor journeys and ordered funnels need identifiers. The{" "}
              <a href="/docs/collection-controls">collection controls guide</a>{" "}
              explains how to connect those choices to your site.
            </p>
          </>
        ),
      },
      {
        id: "costs",
        title: "Plan for infrastructure and maintenance",
        content: (
          <>
            <p>
              Self-hosting has no Yaap hosted subscription, but your
              infrastructure still has costs. Cloudflare usage, database
              storage, optional email and an external PostgreSQL provider can
              affect your bill. Event volume, retention and reporting workload
              determine how those costs grow.
            </p>
            <p>
              You operate upgrades, database backups, secrets and queue
              monitoring. Keep resource identifiers and authentication secrets
              stable across upgrades. Back up the database before applying
              migrations and verify the restore process; rolling back Worker
              code does not reverse a database migration.
            </p>
            <p>
              If you prefer managed infrastructure, compare{" "}
              <a href="/pricing">hosted Yaap pricing</a>. The hosted service
              starts at $9 per month for 100,000 events with a 14-day trial.
              Self-hosting is the option for teams willing to maintain their own
              installation.
            </p>
          </>
        ),
      },
    ],
  },
  conversions: {
    path: "/conversion-tracking",
    title: "Conversion tracking for websites and SaaS",
    description:
      "Measure signups, completed actions and funnel drop-off with Yaap. Connect website traffic to custom events, conversion goals and ordered journeys.",
    sections: [
      {
        id: "goals",
        title: "Define the action that matters",
        content: (
          <>
            <p>
              Conversion tracking measures whether visitors complete a useful
              action: creating an account, requesting a demo or reaching a
              confirmation page. A pageview tells you someone arrived. A
              conversion goal tells you whether they took the next step.
            </p>
            <p>
              In Yaap, create a goal from an exact page path or a custom event
              name. For example, match <code>/thanks</code> for a completed form
              or a <code>signup</code> event after account creation succeeds.
              Choose a confirmed outcome instead of a button click that might
              fail.
            </p>
            <p>
              You can add up to three property conditions. A goal for{" "}
              <code>signup</code> with <code>plan = "pro"</code> counts only
              matching events with that value. Names, paths and values are exact
              and case-sensitive, so agree on a naming convention before
              instrumenting your website.
            </p>
          </>
        ),
      },
      {
        id: "funnels",
        title: "See where the journey stops",
        content: (
          <>
            <p>
              A funnel follows an ordered sequence. For a SaaS product, start
              with a pricing pageview, then a signup event, then an activation
              event. Yaap lets you choose the identity scope and completion
              window so the report reflects the journey you intend to measure.
            </p>
            <p>
              Each step needs a later event. One event cannot satisfy two
              repeated steps. If 100 identified entrants reach pricing and 20
              complete the full sequence, that funnel has a 20% completion rate.
              Those figures are an example, not a Yaap customer benchmark.
            </p>
            <p>
              Use the drop-off between steps to choose what to investigate. A
              large gap between signup and activation might call for clearer
              onboarding. Check that the activation event actually fires before
              treating the gap as a product problem.
            </p>
          </>
        ),
      },
      {
        id: "metrics",
        title: "Separate completions from converted sessions",
        content: (
          <>
            <p>
              Goal completions count matching events, including repeated and
              anonymous events. Converted sessions count distinct identified
              sessions with a matching event. These answer different questions:
              how often an action happened, and how many sessions included that
              action.
            </p>
            <p>
              Session conversion divides converted sessions by identified
              sessions with activity matching the report range and dimensions.
              Anonymous completions do not create identified sessions. When
              there are no identified sessions, the rate is unavailable.
            </p>
            <p>
              Compare sources, campaigns and landing pages using consistent date
              ranges and filters. Keep changes to tracking mode and goal
              definitions in mind when comparing periods; changes in measurement
              can look like changes in visitor behavior.
            </p>
          </>
        ),
      },
      {
        id: "implementation",
        title: "Start with one goal and one funnel",
        content: (
          <>
            <p>
              Install the <a href="/docs/installation">browser tracker</a> or{" "}
              <a href="/docs/npm">npm client</a>, send a confirmed custom event
              and inspect it in Events. Then create a goal and walk through the
              journey yourself. The{" "}
              <a href="/docs/events">custom events guide</a> covers event names
              and properties.
            </p>
            <p>
              Use the{" "}
              <a href="/docs/goals-and-funnels">goals and funnels guide</a> to
              configure matching, identity scope and completion windows. Editing
              a definition recalculates retained history; it cannot recover raw
              events deleted by your retention policy.
            </p>
            <p>
              Ordered funnels require identified activity. If your site uses
              anonymous collection, start with event counts and goal
              completions, and review the{" "}
              <a href="/docs/collection-controls">collection controls</a> before
              enabling identifiers. For confirmed purchases and refunds, connect{" "}
              <a href="/revenue-attribution">revenue attribution</a> rather than
              relying on a browser purchase event.
            </p>
          </>
        ),
      },
    ],
  },
  revenue: {
    path: "/revenue-attribution",
    title: "Revenue attribution for Stripe, Polar and your API",
    description:
      "Connect payments to website traffic sources with Yaap. Attribute Stripe, Polar or server API revenue, account for refunds and report currencies separately.",
    sections: [
      {
        id: "sources",
        title: "Find the traffic that leads to payments",
        content: (
          <>
            <p>
              Revenue attribution connects payment records to the website
              activity that preceded them. It helps you compare sources and
              campaigns by the revenue linked to them, alongside visits and
              conversions. High traffic and high revenue do not always come from
              the same places.
            </p>
            <p>
              Yaap can receive payments from Stripe webhooks, Polar webhooks or
              a server payment API. When a payment carries a valid analytics
              visitor identifier, Yaap can connect it to recorded activity.
              Payments without a usable identifier stay unattributed; Yaap does
              not infer an identity from a customer email.
            </p>
            <p>
              Use revenue reports with{" "}
              <a href="/conversion-tracking">conversion goals and funnels</a> to
              follow acquisition, completed actions and payments in the same
              analytics workspace.
            </p>
          </>
        ),
      },
      {
        id: "connect",
        title: "Connect the payment workflow you already use",
        content: (
          <>
            <p>
              Open Revenue → Payment settings for a website. For Stripe or
              Polar, configure the appropriate webhook endpoint and signing
              secret. Keep test and live integrations separate so sample
              purchases do not affect production reporting.
            </p>
            <p>
              Your checkout integration passes the visitor identifier to your
              server only when your tracking configuration permits identifiers.
              The server attaches the required analytics metadata to the payment
              provider record. Adding a webhook secret alone does not add that
              metadata to an existing checkout flow.
            </p>
            <p>
              If you use another payment workflow, send records through the
              server payment API. Keep its credential on the server and use a
              stable payment ID for retries. Choose one ingestion path for each
              sale; sending the same sale through both a webhook and the API
              creates separate records.
            </p>
            <p>
              The <a href="/docs/integrations">integration overview</a> links to
              the full payment contract, provider metadata examples and
              signature-verification requirements.
            </p>
          </>
        ),
      },
      {
        id: "accuracy",
        title: "Keep refunds, currencies and environments visible",
        content: (
          <>
            <p>
              Revenue reports account for refunds and separate currencies.
              Compare USD with USD and JPY with JPY instead of summing unlike
              amounts into a misleading total. Test payments belong in test
              reports, even when the integration uses the same website.
            </p>
            <p>
              A browser event called <code>purchase</code> can be useful for a
              conversion goal, but it does not create a verified payment record.
              Payment amounts must come from your server or payment provider,
              not a browser-provided value.
            </p>
            <p>
              Validate the integration with a test payment, a refund and a
              payment without a visitor identifier. Confirm that the first is
              attributed when matching activity exists, the refund changes the
              totals and the last remains unattributed. These checks reveal
              missing metadata before you rely on source-level results.
            </p>
          </>
        ),
      },
      {
        id: "limits",
        title: "Understand what attribution can tell you",
        content: (
          <>
            <p>
              Attribution depends on the activity you collect, retained history
              and payment metadata. Anonymous collection, unavailable storage, a
              paused tracker or missing checkout metadata can leave a payment
              unattributed. That is a reporting limitation to investigate, not a
              reason to invent a match.
            </p>
            <p>
              A source credited with revenue shows an observed relationship. It
              does not prove that the source caused an incremental sale. Read
              the report with that distinction in mind when deciding where to
              spend time or budget.
            </p>
            <p>
              Review <a href="/docs/collection-controls">collection controls</a>
              , connect your payment workflow and compare the first reports with
              provider records. Revenue attribution is available with{" "}
              <a href="/pricing">hosted Yaap</a> and{" "}
              <a href="/self-hosted-web-analytics">self-hosted installations</a>
              .
            </p>
          </>
        ),
      },
    ],
  },
};

export function ProductGuidePage({
  guide,
  hosted,
}: {
  guide: ProductGuide;
  hosted: boolean;
}) {
  return (
    <PublicPage
      hosted={hosted}
      title={guide.title}
      description={guide.description}
      category="Web analytics"
      updated="September 16, 2026"
      sections={[
        ...guide.sections,
        {
          id: "get-started",
          title: hosted
            ? "Try Yaap with your own website"
            : "Set up your analytics workspace",
          content: (
            <>
              <p>
                {hosted
                  ? "Start a 14-day hosted trial with no credit card, or follow the documentation to run Yaap in your own Cloudflare account."
                  : "Follow the setup documentation, add a website and verify your first pageview."}
              </p>
              <p>
                <a
                  className="button primary"
                  href={hosted ? "/signup" : "/docs/self-hosting"}
                >
                  {hosted ? "Start your free trial" : "Read the setup guide"}
                </a>
              </p>
            </>
          ),
        },
      ]}
      related={[
        ...Object.values(productGuides)
          .filter((item) => item.path !== guide.path)
          .map((item) => ({ href: item.path, label: item.title })),
        { href: "/pricing", label: "Pricing" },
        { href: "/docs", label: "Documentation" },
      ]}
    />
  );
}
