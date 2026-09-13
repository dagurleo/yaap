import type { ReactNode } from "react";
import { PublicPage, type PublicSection } from "./public-page";
import {
  documentationUrl,
  policyDetails,
  repositoryUrl,
} from "./policy-details";

function ContactLink({ children = "contact us" }: { children?: ReactNode }) {
  return (
    <a
      href={
        policyDetails.contactEmail
          ? `mailto:${policyDetails.contactEmail}`
          : "/contact"
      }
    >
      {children}
    </a>
  );
}

const privacySections: PublicSection[] = [
  {
    id: "scope",
    title: "Who this covers",
    content: (
      <>
        <p>
          This notice describes how Yaap handles information when you visit its
          website, create an account, contact support or use the hosted
          analytics service.
        </p>
        <p>
          {policyDetails.operator
            ? `${policyDetails.operator} operates Yaap.`
            : "The legal operator’s name and address will be included in the final notice."}{" "}
          For questions about this notice, <ContactLink />.
        </p>
        <p>
          When a customer uses hosted Yaap to measure their website, that
          customer decides what to collect and why. Yaap processes that
          analytics data on their behalf. The customer’s own privacy notice
          explains their use of the data.
        </p>
        <p>
          With self-hosting, the installation operator controls the
          infrastructure and database. Installing Yaap does not give the Yaap
          project access to that database. Contact the operator of the website
          you visited about data held in their installation.
        </p>
      </>
    ),
  },
  {
    id: "information",
    title: "Information handled",
    content: (
      <>
        <ul role="list">
          <li>
            <strong>Accounts:</strong> name, email address, password hash,
            verification and recovery records, sessions and website access
            permissions. Authentication records can include IP addresses and
            browser information.
          </li>
          <li>
            <strong>Analytics:</strong> page paths, timestamps, referring
            domains, supported campaign labels, device and browser categories,
            approximate geography and custom events with properties supplied by
            the website operator. Identified tracking also supports visitor
            journeys and session attribution.
          </li>
          <li>
            <strong>Payment attribution:</strong> when configured by a customer,
            transaction references, amounts, currencies, refunds and attribution
            identifiers. These records are separate from the customer’s Yaap
            subscription.
          </li>
          <li>
            <strong>Subscription billing:</strong> customer and subscription
            references, plan, payment status, billing periods and usage records.
            Checkout collects payment details through the billing provider.
          </li>
          <li>
            <strong>Support and operations:</strong> information you include in
            requests and technical records needed to investigate errors, deliver
            the service and protect accounts.
          </li>
        </ul>
        <p>
          The analytics pipeline derives coarse geography and device categories
          from incoming requests. Raw IP addresses and raw user-agent strings
          are not put in the analytics queue. This does not mean that hosting
          infrastructure or authentication records never process them.
        </p>
        <p>
          Website operators should keep personal details out of page paths,
          event names, campaign labels and custom properties.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Cookies and browser storage",
    content: (
      <>
        <p>
          Signing in uses session cookies. The dashboard also stores your theme
          preference in your browser.
        </p>
        <p>
          In full analytics mode, the tracker stores a random visitor ID in
          local storage for 180 days from creation and a session ID in the tab’s
          session storage. Sessions renew after 30 minutes without a tracked
          event. These identify a browser or session, not a verified person. IDs
          are hashed with a site-specific input and server secret before
          entering the analytics queue.
        </p>
        <p>
          Anonymous mode sends events without accessing visitor or session
          storage. Paused mode stops collection. Enabling tracking does not
          itself record consent; website operators control when collection and
          identifiers are allowed.
        </p>
        <p>
          Yaap includes optional analytics for its own homepage, using the same
          tracker with identifiers enabled when configured. Collection is paused
          on other pages, including account and dashboard pages. Previously
          created browser identifiers may remain stored.
        </p>
        <p>
          You can clear stored data using your browser controls. To change a
          website’s tracking choices, use that website’s privacy controls or
          contact its operator. See the{" "}
          <a href={`${repositoryUrl}/blob/main/docs/TRACKING.md`}>
            tracking guide
          </a>{" "}
          for the available modes.
        </p>
      </>
    ),
  },
  {
    id: "purposes",
    title: "How information is used",
    content: (
      <>
        <p>
          Account and operational information supports signing in, managing
          websites and permissions, delivering reports, handling support,
          protecting the service and administering subscriptions. Customer
          analytics is used to produce the reports that customer requests.
        </p>
        <p>
          The final notice will identify the applicable legal basis for each
          purpose, including contract performance, legal obligations, legitimate
          interests and consent where relevant. Website operators are
          responsible for establishing the basis for analytics on their own
          websites.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Providers and data locations",
    content: (
      <>
        <p>
          Yaap runs on Cloudflare infrastructure. An installation can store data
          in Cloudflare D1 or PostgreSQL. Cloudflare can also deliver
          transactional email when configured. Hosted subscriptions integrate
          with Polar for checkout and billing.
        </p>
        <p>
          The final hosted provider list will identify the production database
          provider, processing locations and applicable safeguards for
          international transfers. An infrastructure provider’s global presence
          is not a promise that data stays in a particular country.
        </p>
        <p>
          Self-hosted operators choose and manage their own providers.
          Third-party services you connect handle information under their own
          terms and privacy notices.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Retention and deletion",
    content: (
      <>
        <p>
          Analytics and payment history have separate retention settings.
          Self-hosted installations can disable automatic retention; in that
          case, records remain until the operator deletes them or enables a
          retention policy.
        </p>
        <p>
          Browser identifier lifetimes are described above. They do not
          determine how long server-side analytics records remain.
        </p>
        <p>
          The final hosted notice will specify analytics retention, account
          closure and post-cancellation deletion timelines, along with retention
          of backups, support, operational and billing records. Cancelling a
          subscription does not itself delete the analytics history.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    content: (
      <>
        <p>
          Depending on applicable law, you may request access to, correction,
          deletion or a portable copy of your personal information, and
          restriction of its processing. You may also withdraw consent where
          processing relies on it.
        </p>
        <p>
          <strong>
            You may have the right to object to processing based on legitimate
            interests.
          </strong>{" "}
          <ContactLink /> to raise an objection or another privacy request.
          Identity or authority may need to be verified before information can
          be disclosed or changed.
        </p>
        <p>
          For analytics collected by another website, contact that website’s
          operator first. They control the collection and can identify the
          relevant installation. You may also complain to the data protection
          authority in your jurisdiction.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this notice",
    content: (
      <>
        <p>
          The date at the top identifies this version. The final notice and any
          subsequent updates will be published here, with additional notice of
          material changes where required.
        </p>
      </>
    ),
  },
];

const termsSections: PublicSection[] = [
  {
    id: "service",
    title: "The service and these terms",
    content: (
      <>
        <p>
          Yaap provides website analytics, custom events, funnels, visitor
          journeys and payment attribution. These draft terms describe the
          proposed relationship between the hosted service operator and its
          customers. They are not yet an effective agreement.
        </p>
        <p>
          {policyDetails.operator
            ? `The hosted service operator is ${policyDetails.operator}.`
            : "The final agreement will identify the legal service operator and its address."}{" "}
          The plan and checkout describe the subscription you choose.
          Self-hosted software is governed by the license described below.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and responsibilities",
    content: (
      <>
        <p>
          Provide accurate account information, keep your login and API
          credentials secure, and grant website access only to people you
          authorize. You must have authority to act for any organization whose
          account you create.
        </p>
        <p>
          Only collect data from websites you own or are authorized to measure.
          You are responsible for your tracking configuration, privacy notices,
          lawful basis and any required consent. Installing a tracking script or
          enabling identifiers is not proof of consent.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>
          Do not use Yaap for unlawful activity, unauthorized surveillance,
          collecting credentials or payment card details, or infringing others’
          rights. Keep sensitive personal information out of analytics events.
        </p>
        <p>
          Do not attempt to access another customer’s data, bypass access or
          usage controls, send deliberately abusive traffic, or disrupt the
          service. Report suspected vulnerabilities through the private contact
          route on the <a href="/security">Security page</a>.
        </p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Trials, billing and limits",
    content: (
      <>
        <p>
          The hosted offer includes a 14-day trial without a payment card. A
          paid subscription begins when you complete checkout. Prices, billing
          intervals, taxes and event allowances are shown with your plan and at
          checkout.
        </p>
        <p>
          Pageviews and custom events that are successfully stored count toward
          the event allowance. Duplicate deliveries, rejected traffic,
          live-presence heartbeats and payment records do not count as billable
          analytics events.
        </p>
        <p>
          Usage limits can pause new collection. Events that are not collected
          during a pause cannot be reconstructed later. Review the current
          allowance and collection status in Billing.
        </p>
        <p>
          Polar handles hosted checkout and subscription billing. Review the
          terms presented at checkout along with Yaap’s service terms. Plan
          changes and any prorated charge are shown before you confirm the
          change.
        </p>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "Cancellation and refunds",
    content: (
      <>
        <p>
          You can manage cancellation through the billing portal linked from
          Billing. A scheduled cancellation keeps paid access until the
          confirmed end of the billing period. Cancelling does not itself delete
          your analytics.
        </p>
        <p>
          For a billing error or refund request, <ContactLink /> with the order
          reference. Do not include payment card details. The final terms will
          state the refund policy, failed-payment grace period and access
          available after the subscription ends. Applicable mandatory consumer
          rights remain unaffected.
        </p>
      </>
    ),
  },
  {
    id: "customer-data",
    title: "Your data",
    content: (
      <>
        <p>
          You retain your rights in the data you submit. The proposed service
          permission is limited to processing that data to provide, maintain and
          protect Yaap, and to follow your lawful instructions.
        </p>
        <p>
          The <a href="/privacy">Privacy Policy</a> explains the data handled by
          the service. A hosted data processing agreement will set out the
          respective responsibilities for customer visitor data.
        </p>
        <p>
          Final retention, export and post-termination deletion arrangements
          will be specified before these terms take effect. Do not treat a
          subscription cancellation as a request to erase data, or assume that
          deleted history can be recovered.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and service changes",
    content: (
      <>
        <p>
          Analytics depends on browsers, networks, installed scripts and
          external infrastructure. Blockers, interruptions and configuration
          choices can prevent events from being recorded. Reports reflect
          collected activity and may not represent every visit or transaction.
        </p>
        <p>
          The final hosted agreement will specify service commitments,
          maintenance and change notices, suspension and termination procedures,
          warranties and any limitations of liability. This draft does not
          establish an uptime guarantee.
        </p>
      </>
    ),
  },
  {
    id: "self-hosting",
    title: "Self-hosting and the license",
    content: (
      <>
        <p>
          Yaap is source-available under the{" "}
          <a href={`${repositoryUrl}/blob/main/LICENSE.md`}>
            Elastic License 2.0
          </a>
          . The full license governs use and modification of the software. It
          permits personal and internal business use subject to its conditions
          and restricts offering a substantial set of Yaap’s features to third
          parties as a hosted or managed service.
        </p>
        <p>
          Self-hosted operators manage their own infrastructure costs, security,
          updates, backups and data handling. A self-hosted installation does
          not include a hosted Yaap subscription.
        </p>
      </>
    ),
  },
  {
    id: "questions",
    title: "Questions and final agreement",
    content: (
      <>
        <p>
          <ContactLink>Contact us</ContactLink> about these terms. The final
          version will include its effective date, governing law, dispute
          arrangements and the process for notifying customers of changes.
        </p>
      </>
    ),
  },
];

const securitySections: PublicSection[] = [
  {
    id: "infrastructure",
    title: "Where your data lives",
    content: (
      <>
        <p>
          Yaap runs its dashboard, API and event collection on a Cloudflare
          Worker. Events pass through a queue before being stored in D1 or
          PostgreSQL.
        </p>
        <p>
          When you self-host, those resources belong to your own infrastructure
          accounts. With hosted Yaap, the service operator manages the
          infrastructure. The <a href="/privacy#providers">privacy notice</a>{" "}
          describes provider and location information.
        </p>
      </>
    ),
  },
  {
    id: "access",
    title: "Account and website access",
    content: (
      <>
        <p>
          The dashboard requires authentication. Passwords are hashed, and
          authentication endpoints apply rate limits. Website reports and
          settings are scoped to the signed-in user’s permissions.
        </p>
        <p>
          Owners can invite viewers to specific websites. Public API credentials
          carry explicit scopes and website access. Treat credentials as secrets
          and revoke them when they are no longer needed.
        </p>
        <p>
          A tracking site ID is public: it identifies the destination of an
          event and does not grant dashboard access. Origin checks and
          collection filters help control ingestion, but are not a substitute
          for authentication.
        </p>
      </>
    ),
  },
  {
    id: "collection",
    title: "Collection controls",
    content: (
      <>
        <p>
          Choose full, anonymous or paused tracking. Configure allowed origins,
          path exclusions, bot filtering and retention to match the website’s
          requirements.
        </p>
        <p>
          Raw browser visitor IDs are hashed with a site-specific input and
          server secret before queueing. The analytics pipeline keeps coarse
          device and location categories instead of queueing raw IP addresses or
          user-agent strings. Hashed identifiers still support linking events
          and should not be treated as fully anonymous data.
        </p>
        <p>
          Optional payment integrations verify webhook signatures. Keep webhook
          secrets and server API credentials on the server.
        </p>
      </>
    ),
  },
  {
    id: "operations",
    title: "Operating your installation",
    content: (
      <>
        <p>
          Self-hosted operators are responsible for HTTPS, infrastructure
          permissions, secret management, database access, updates and backups.
          Restrict administrative access and review any third-party integrations
          you enable.
        </p>
        <p>
          Keep the installation’s identity secret stable: changing it breaks
          continuity with existing analytics identifiers. Plan backups and test
          recovery for the database provider you use. Retention removes history;
          it is not a backup strategy.
        </p>
        <p>
          See the{" "}
          <a href={`${repositoryUrl}/blob/main/docs/OPERATIONS.md`}>
            operations guide
          </a>{" "}
          and{" "}
          <a href={`${repositoryUrl}/blob/main/docs/DEPLOYMENT.md`}>
            deployment guide
          </a>{" "}
          for current instructions.
        </p>
      </>
    ),
  },
  {
    id: "reporting",
    title: "Report a vulnerability",
    content: (
      <>
        <p>
          Send security reports privately. Include the affected version or URL,
          a description of the issue, its likely impact and the minimum steps
          needed to reproduce it. Use your own test data and avoid accessing
          another person’s information.
        </p>
        {policyDetails.contactEmail ? (
          <p>
            <ContactLink>Send a private security report</ContactLink>. Please
            keep exploit details out of public issues while the report is being
            investigated.
          </p>
        ) : (
          <p>
            A private security contact will be published here before hosted
            launch. Do not post vulnerabilities, credentials or customer data in
            public GitHub issues.
          </p>
        )}
      </>
    ),
  },
];

const contactSections: PublicSection[] = [
  {
    id: "help",
    title: "Product help",
    content: (
      <>
        {policyDetails.contactEmail && (
          <p>
            For help or general questions, email{" "}
            <ContactLink>{policyDetails.contactEmail}</ContactLink>.
          </p>
        )}
        <p>
          Need help installing Yaap or understanding a report? Start with the
          documentation, or open an issue for a reproducible bug or feature
          request.
        </p>
        <div className="public-actions">
          <a className="button primary" href={documentationUrl}>
            Read the docs
          </a>
          <a href={`${repositoryUrl}/issues`}>
            Open a GitHub issue
          </a>
        </div>
        <p>
          Include the Yaap version, whether you use hosted or self-hosted Yaap,
          and what you expected to happen. Remove credentials and personal data
          from screenshots and logs before sharing them publicly.
        </p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Accounts and billing",
    content: (
      <>
        <p>
          Existing hosted customers can find their plan, usage, invoices and
          subscription management in Billing after signing in.
        </p>
        <p>
          <a href="/app/billing">
            Go to Billing
          </a>
        </p>
        {policyDetails.contactEmail ? (
          <p>
            For account help or a billing question, <ContactLink /> with your
            account email and order reference, if relevant. Never send your
            password or card details.
          </p>
        ) : (
          <p>
            A direct support email will be published before hosted launch.
            Please keep account and payment information out of public GitHub
            issues.
          </p>
        )}
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy requests",
    content: (
      <>
        <p>
          For data collected on a website using Yaap, contact that website’s
          operator. They decide what to collect and control access to the
          relevant analytics.
        </p>
        {policyDetails.contactEmail ? (
          <p>
            For information held by Yaap about your own account, <ContactLink />{" "}
            and describe your request. See the{" "}
            <a href="/privacy">Privacy Policy</a> for more information.
          </p>
        ) : (
          <p>
            Yaap’s direct privacy contact is being confirmed for launch. The{" "}
            <a href="/privacy">draft Privacy Policy</a> explains the data
            handled by the product.
          </p>
        )}
      </>
    ),
  },
  {
    id: "security",
    title: "Security reports",
    content: (
      <>
        <p>
          Found a potential vulnerability? Follow the private reporting
          instructions on the <a href="/security#reporting">Security page</a>.
          Please do not share exploit details or secrets in a public issue.
        </p>
      </>
    ),
  },
];

export function PrivacyPage({ hosted }: { hosted: boolean }) {
  return (
    <PublicPage
      hosted={hosted}
      category="Legal"
      title="Privacy Policy"
      description="What Yaap handles, where it goes, and the choices you have."
      sections={privacySections}
      draft={policyDetails.legalDraft}
    />
  );
}
export function TermsPage({ hosted }: { hosted: boolean }) {
  return (
    <PublicPage
      hosted={hosted}
      category="Legal"
      title="Terms of Service"
      description="The terms for using hosted Yaap, and how self-hosting differs."
      sections={termsSections}
      draft={policyDetails.legalDraft}
    />
  );
}
export function SecurityPage({ hosted }: { hosted: boolean }) {
  return (
    <PublicPage
      hosted={hosted}
      category="Trust"
      title="Security at Yaap"
      description="How access, collection and infrastructure work together to protect your analytics."
      sections={securitySections}
    />
  );
}
export function ContactPage({ hosted }: { hosted: boolean }) {
  return (
    <PublicPage
      hosted={hosted}
      category="Support"
      title="Let’s talk"
      description="A little help getting started, a billing question, or something we should know about."
      sections={contactSections}
    />
  );
}
