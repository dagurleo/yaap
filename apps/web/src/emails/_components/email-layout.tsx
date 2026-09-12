import type { ReactNode } from "react";
import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

export const emailColors = {
  background: "#f4f5f6",
  foreground: "#262c32",
  muted: "#67717b",
  border: "#e6e8ea",
  primary: "#2458eb",
  well: "#f7f8f9",
};

export function EmailLayout({
  preview,
  appUrl,
  assetBaseUrl,
  children,
}: {
  preview: string;
  appUrl: string;
  assetBaseUrl: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <Font
          fontFamily="InterVariable"
          fallbackFontFamily="Arial"
          webFont={{
            url: `${assetBaseUrl}/InterVariable.woff2`,
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <style>{`
          @media only screen and (max-width: 480px) {
            .email-outer { padding: 20px 12px !important; }
            .email-header { padding: 24px !important; }
            .email-content { padding: 28px 24px !important; }
            .email-title { font-size: 28px !important; line-height: 36px !important; }
            .email-metric { display: block !important; width: 100% !important; padding: 16px 0 !important; }
            .email-metric + .email-metric { border-top: 1px solid #e6e8ea !important; }
            .email-button { display: block !important; text-align: center !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: emailColors.background,
          color: emailColors.foreground,
          fontFamily:
            'InterVariable, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
          margin: "0",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <Section tdClassName="email-outer" style={{ padding: "40px 16px" }}>
          <Container style={{ width: "100%", maxWidth: "600px" }}>
            <Section
              style={{
                backgroundColor: "#ffffff",
                border: `1px solid ${emailColors.border}`,
                borderRadius: "12px",
              }}
            >
              <Section
                tdClassName="email-header"
                style={{
                  padding: "28px 36px",
                  borderBottom: `1px solid ${emailColors.border}`,
                }}
              >
                <Link
                  href={appUrl}
                  aria-label="Yaap dashboard"
                  style={{ display: "inline-block" }}
                >
                  <Img
                    src={`${assetBaseUrl}/logo-email.png`}
                    alt="Yaap"
                    width="105"
                    height="32"
                    style={{ display: "block", border: "0" }}
                  />
                </Link>
              </Section>
              <Section tdClassName="email-content" style={{ padding: "36px" }}>
                {children}
              </Section>
            </Section>
            <Text
              style={{
                fontSize: "12px",
                lineHeight: "20px",
                textAlign: "center",
                color: emailColors.muted,
                margin: "24px 12px 0",
              }}
            >
              Sent by Yaap · Your analytics, in focus.
            </Text>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}
