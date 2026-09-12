import { Button, Heading, Section, Text } from "react-email";
import { EmailLayout, emailColors } from "./_components/email-layout";

export interface SiteInvitationEmailProps {
  inviterName: string;
  siteName: string;
  siteOrigin: string;
  acceptUrl: string;
  expiresLabel: string;
}

export default function SiteInvitationEmail({
  inviterName,
  siteName,
  siteOrigin,
  acceptUrl,
  expiresLabel,
}: SiteInvitationEmailProps) {
  const url = new URL(acceptUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Invitation links must use an absolute HTTPS URL.");
  return (
    <EmailLayout
      preview={`${inviterName} invited you to view ${siteName}`}
      appUrl={`${url.origin}/app`}
      assetBaseUrl={`${url.origin}/brand`}
    >
      <Text
        style={{
          color: emailColors.primary,
          fontSize: "13px",
          fontWeight: "500",
          lineHeight: "20px",
          margin: "0 0 12px",
        }}
      >
        Website invitation
      </Text>
      <Heading
        as="h1"
        style={{
          fontSize: "30px",
          fontWeight: "600",
          lineHeight: "38px",
          letterSpacing: "-0.8px",
          margin: "0 0 14px",
        }}
      >
        View {siteName} in Yaap
      </Heading>
      <Text
        style={{
          color: emailColors.muted,
          fontSize: "16px",
          lineHeight: "26px",
          margin: "0 0 24px",
        }}
      >
        {inviterName} invited you to view all analytics for this website,
        including visitor details and revenue.
      </Text>
      <Section
        style={{
          backgroundColor: emailColors.well,
          border: `1px solid ${emailColors.border}`,
          borderRadius: "8px",
          padding: "18px 20px",
        }}
      >
        <Text
          style={{ fontSize: "15px", fontWeight: "600", margin: "0 0 4px" }}
        >
          {siteName}
        </Text>
        <Text
          style={{
            color: emailColors.muted,
            fontSize: "14px",
            lineHeight: "22px",
            margin: "0",
            overflowWrap: "anywhere",
          }}
        >
          {siteOrigin}
        </Text>
      </Section>
      <Section style={{ paddingTop: "28px" }}>
        <Button
          href={url.href}
          style={{
            backgroundColor: emailColors.primary,
            border: `1px solid ${emailColors.primary}`,
            borderRadius: "8px",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: "500",
            lineHeight: "20px",
            padding: "13px 18px",
            textDecoration: "none",
          }}
        >
          Review invitation
        </Button>
        <Text
          style={{
            color: emailColors.muted,
            fontSize: "12px",
            lineHeight: "20px",
            margin: "14px 0 0",
          }}
        >
          This single-use invitation expires {expiresLabel}. If you were not
          expecting it, you can ignore this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}

SiteInvitationEmail.PreviewProps = {
  inviterName: "Dagur",
  siteName: "Example Store",
  siteOrigin: "https://example.com",
  acceptUrl: "https://analytics.example.com/invite/example-token",
  expiresLabel: "September 19, 2026",
} satisfies SiteInvitationEmailProps;
