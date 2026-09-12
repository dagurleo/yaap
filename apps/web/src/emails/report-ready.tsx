import { Button, Column, Heading, Row, Section, Text } from "react-email";
import { EmailLayout, emailColors } from "./_components/email-layout";

export interface ReportReadyEmailProps {
  siteName: string;
  periodLabel: string;
  dashboardUrl: string;
  /** Public directory containing the email logo and font; defaults to the app's /brand. */
  assetBaseUrl?: string;
  /** Formatted values supplied by the caller; no sample data is used in real sends. */
  metrics?: { visitors: string; pageviews: string; conversions: string };
}

export default function ReportReadyEmail({
  siteName,
  periodLabel,
  dashboardUrl,
  assetBaseUrl,
  metrics,
}: ReportReadyEmailProps) {
  const url = new URL(dashboardUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(
      "Report links must use an absolute HTTPS URL without credentials.",
    );
  }
  return (
    <EmailLayout
      preview={`Your report for ${siteName} · ${periodLabel}`}
      appUrl={`${url.origin}/app`}
      assetBaseUrl={assetBaseUrl ?? `${url.origin}/brand`}
    >
      <Text
        style={{
          fontSize: "13px",
          fontWeight: "500",
          lineHeight: "20px",
          color: emailColors.primary,
          margin: "0 0 12px",
        }}
      >
        Website report
      </Text>
      <Heading
        as="h1"
        className="email-title"
        style={{
          fontSize: "32px",
          fontWeight: "600",
          lineHeight: "40px",
          letterSpacing: "-1px",
          overflowWrap: "anywhere",
          margin: "0 0 12px",
        }}
      >
        {siteName}, at a glance
      </Heading>
      <Text
        style={{
          fontSize: "14px",
          lineHeight: "22px",
          color: emailColors.muted,
          margin: "0 0 28px",
        }}
      >
        {periodLabel}
      </Text>
      <Section
        style={{
          backgroundColor: emailColors.well,
          border: `1px solid ${emailColors.border}`,
          borderRadius: "8px",
          padding: "20px",
        }}
      >
        <Text
          style={{
            fontSize: "16px",
            fontWeight: "500",
            lineHeight: "24px",
            margin: "0 0 6px",
          }}
        >
          Your report is ready
        </Text>
        <Text
          style={{
            fontSize: "16px",
            lineHeight: "26px",
            color: emailColors.muted,
            margin: "0",
          }}
        >
          A fresh look at your traffic, visitors, and conversions. See what
          brought people in and what happened next.
        </Text>
      </Section>
      {metrics && (
        <Section
          style={{
            margin: "24px 0 0",
            borderBottom: `1px solid ${emailColors.border}`,
            paddingBottom: "12px",
          }}
        >
          <Row>
            {(
              [
                ["Visitors", metrics.visitors],
                ["Pageviews", metrics.pageviews],
                ["Conversions", metrics.conversions],
              ] as const
            ).map(([label, value]) => (
              <Column
                key={label}
                className="email-metric"
                style={{
                  width: "33.333%",
                  verticalAlign: "top",
                  padding: "0 8px 16px 0",
                }}
              >
                <Text
                  style={{
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: emailColors.muted,
                    margin: "0 0 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: "28px",
                    lineHeight: "36px",
                    fontWeight: "600",
                    letterSpacing: "-0.75px",
                    fontVariantNumeric: "tabular-nums",
                    overflowWrap: "anywhere",
                    margin: "0",
                  }}
                >
                  {value}
                </Text>
              </Column>
            ))}
          </Row>
        </Section>
      )}
      <Section style={{ paddingTop: "28px" }}>
        <Button
          href={url.href}
          className="email-button"
          style={{
            backgroundColor: emailColors.primary,
            border: `1px solid ${emailColors.primary}`,
            borderRadius: "8px",
            color: "#ffffff",
            fontSize: "14px",
            lineHeight: "20px",
            fontWeight: "500",
            textDecoration: "none",
            padding: "13px 18px",
          }}
        >
          View full report <span aria-hidden="true">↗</span>
        </Button>
        <Text
          style={{
            fontSize: "12px",
            lineHeight: "20px",
            color: emailColors.muted,
            margin: "14px 0 0",
          }}
        >
          Explore the details in your Yaap dashboard.
        </Text>
      </Section>
    </EmailLayout>
  );
}

ReportReadyEmail.PreviewProps = {
  siteName: "Acme",
  periodLabel: "September 1–7, 2026",
  dashboardUrl: "https://analytics.example.com/app/example/overview",
  assetBaseUrl: "/static",
  metrics: { visitors: "12,408", pageviews: "28,916", conversions: "384" },
} satisfies ReportReadyEmailProps;
