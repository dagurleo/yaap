import { Button, Heading, Section, Text } from "react-email";
import { EmailLayout, emailColors } from "./_components/email-layout";

export interface BillingNoticeEmailProps {
  preview: string;
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
  billingUrl: string;
  actionLabel?: string | null;
}

export default function BillingNoticeEmail({
  preview,
  eyebrow,
  title,
  body,
  detail,
  billingUrl,
  actionLabel = "View billing",
}: BillingNoticeEmailProps) {
  const url = new URL(billingUrl);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password
  )
    throw new Error("Billing links must use HTTPS (or localhost HTTP).");
  return (
    <EmailLayout
      preview={preview}
      appUrl={`${url.origin}/app`}
      assetBaseUrl={`${url.origin}/brand`}
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
        {eyebrow}
      </Text>
      <Heading
        as="h1"
        className="email-title"
        style={{
          fontSize: "32px",
          fontWeight: "600",
          lineHeight: "40px",
          letterSpacing: "-1px",
          margin: "0 0 16px",
        }}
      >
        {title}
      </Heading>
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "26px",
          color: emailColors.muted,
          margin: "0",
        }}
      >
        {body}
      </Text>
      {detail && (
        <Section
          style={{
            backgroundColor: emailColors.well,
            border: `1px solid ${emailColors.border}`,
            borderRadius: "8px",
            marginTop: "24px",
            padding: "16px 18px",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              lineHeight: "22px",
              color: emailColors.foreground,
              margin: "0",
            }}
          >
            {detail}
          </Text>
        </Section>
      )}
      {actionLabel && (
        <Section style={{ paddingTop: "28px" }}>
          <Button
            href={url.href}
            className="email-button"
            style={{
              backgroundColor: emailColors.primary,
              borderRadius: "8px",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: "600",
              padding: "12px 18px",
              textDecoration: "none",
            }}
          >
            {actionLabel}
          </Button>
        </Section>
      )}
    </EmailLayout>
  );
}

BillingNoticeEmail.PreviewProps = {
  preview: "You have used all events included in your plan",
  eyebrow: "Billing notice",
  title: "You’ve reached your included event limit",
  body: "Analytics collection is still active during your buffer. Upgrade before the buffer is exhausted to avoid a pause.",
  detail:
    "100,000 of 100,000 included events used · collection pauses at 110,000",
  billingUrl: "https://example.com/app/billing",
  actionLabel: "Choose a larger plan",
} satisfies BillingNoticeEmailProps;
