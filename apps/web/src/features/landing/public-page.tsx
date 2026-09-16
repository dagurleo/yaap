import type { ReactNode } from "react";
import { LandingFooter, LandingHeader } from "./landing-shell";

export type PublicSection = {
  id: string;
  title: string;
  content: ReactNode;
};

function ContentsLinks({ sections }: { sections: PublicSection[] }) {
  return (
    <ol role="list">
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`}>{section.title}</a>
        </li>
      ))}
    </ol>
  );
}

export function PublicPage({
  hosted,
  title,
  description,
  category,
  sections,
  draft = false,
  updated = "September 12, 2026",
  related,
}: {
  hosted: boolean;
  title: string;
  description: string;
  category: string;
  sections: PublicSection[];
  draft?: boolean;
  updated?: string;
  related?: { href: string; label: string }[];
}) {
  return (
    <div className="yaap-landing">
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <LandingHeader hosted={hosted} />
      <main id="top" tabIndex={-1} className="public-page">
        <div className="public-intro">
          <div className="wrap">
            <p className="public-eyebrow">{category}</p>
            <h1>{title}</h1>
            <p className="public-description">{description}</p>
            <p className="public-date">
              {draft ? "Draft prepared" : "Last updated"} {updated}
            </p>
          </div>
        </div>
        <div className="wrap public-layout">
          <aside className="public-sidebar">
            <nav aria-label="On this page" className="public-desktop-contents">
              <p>On this page</p>
              <ContentsLinks sections={sections} />
            </nav>
            <details className="public-mobile-contents">
              <summary>On this page</summary>
              <nav aria-label="On this page">
                <ContentsLinks sections={sections} />
              </nav>
            </details>
            <p className="public-sidebar-help">
              Have a question?
              <br />
              <a href="/contact">Get in touch</a>
            </p>
          </aside>
          <div className="public-article">
            {draft && (
              <div className="public-notice" role="note">
                <p>
                  <strong>Draft for review</strong>
                </p>
                <p>
                  This document is being prepared for launch and is not yet an
                  effective policy. Operator details and final hosted service
                  policies are still being confirmed.
                </p>
              </div>
            )}
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-heading`}
                tabIndex={-1}
              >
                <div className="public-section-heading">
                  <span aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 id={`${section.id}-heading`}>{section.title}</h2>
                </div>
                <div className="public-prose">{section.content}</div>
              </section>
            ))}
            <div className="public-related">
              <p>More about Yaap</p>
              <nav aria-label="Related pages">
                {related ? (
                  related.map((link) => (
                    <a key={link.href} href={link.href}>
                      {link.label}
                    </a>
                  ))
                ) : (
                  <>
                    <a href="/privacy">Privacy</a>
                    <a href="/terms">Terms</a>
                    <a href="/security">Security</a>
                    <a href="/contact">Contact</a>
                  </>
                )}
              </nav>
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
