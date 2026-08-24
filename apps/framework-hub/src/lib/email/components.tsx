/* React Email components render outside the Hub browser's Fast Refresh boundary. */
/* eslint-disable react-refresh/only-export-components */

import type { CSSProperties, ReactNode } from "react";

// Email clients cannot reliably consume the site's OKLCH custom properties.
// These sRGB values are the mail-safe expression of the DSHX Hub light theme.
export const emailTheme = {
  background: "#faf9f6",
  surface: "#fffefc",
  surfaceMuted: "#f2f0ed",
  foreground: "#252329",
  muted: "#6d6973",
  border: "#e2dfe5",
  accent: "#6536e8",
  accentSoft: "#eee9fb",
  ink: "#211f29",
  inkForeground: "#efecf2",
  inkMuted: "#aaa5b2",
  success: "#237a55",
  successSoft: "#e7f5ed",
  warning: "#94620c",
  warningSoft: "#fff4d8",
  danger: "#b92d3b",
  dangerSoft: "#fbeaec",
} as const;

const sans = "'Inter Tight', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const mono = "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace";

export type EmailStatusTone = "success" | "warning" | "danger";

export function EmailShell({
  lang,
  preheader,
  children,
}: {
  lang: "en" | "zh";
  preheader: string;
  children: ReactNode;
}) {
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>{preheader}</title>
      </head>
      <body style={bodyStyle}>
        <div style={preheaderStyle}>{preheader}</div>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={pageStyle}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={containerStyle}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: "0 32px" }}>{children}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function EmailHeader() {
  return (
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        <tr>
          <td style={{ padding: "30px 0 24px", borderBottom: `1px solid ${emailTheme.border}` }}>
            <span style={markStyle}>X</span>
            <span style={wordmarkStyle}>DSHX</span>
            <span style={hubStyle}>Hub</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailStatus({ label, tone }: { label: string; tone: EmailStatusTone }) {
  const palette =
    tone === "success"
      ? { color: emailTheme.success, backgroundColor: emailTheme.successSoft }
      : tone === "warning"
        ? { color: emailTheme.warning, backgroundColor: emailTheme.warningSoft }
        : { color: emailTheme.danger, backgroundColor: emailTheme.dangerSoft };
  return <span style={{ ...statusStyle, ...palette }}>{label}</span>;
}

export function EmailFactRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={factLabelStyle}>{label}</td>
      <td style={factValueStyle}>{value}</td>
    </tr>
  );
}

export function EmailEvidence({
  label,
  approvalId,
  reasonLabel,
  reason,
}: {
  label: string;
  approvalId: string;
  reasonLabel?: string | undefined;
  reason?: string | undefined;
}) {
  return (
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={evidenceStyle}>
      <tbody>
        <tr>
          <td style={evidenceLabelStyle}>{label}</td>
        </tr>
        <tr>
          <td style={evidenceValueStyle}>{approvalId}</td>
        </tr>
        {reason && reasonLabel ? (
          <>
            <tr>
              <td style={{ ...evidenceLabelStyle, paddingTop: "20px" }}>{reasonLabel}</td>
            </tr>
            <tr>
              <td style={evidenceReasonStyle}>{reason}</td>
            </tr>
          </>
        ) : null}
      </tbody>
    </table>
  );
}

export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={buttonStyle}>
      {children}
    </a>
  );
}

export function EmailFooter({ children }: { children: ReactNode }) {
  return (
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        <tr>
          <td style={footerStyle}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

const bodyStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: emailTheme.background,
  color: emailTheme.foreground,
  fontFamily: sans,
  WebkitFontSmoothing: "antialiased",
};

const preheaderStyle: CSSProperties = {
  display: "none",
  maxHeight: 0,
  maxWidth: 0,
  overflow: "hidden",
  opacity: 0,
  color: "transparent",
  lineHeight: "1px",
};

const pageStyle: CSSProperties = {
  width: "100%",
  backgroundColor: emailTheme.background,
};

const containerStyle: CSSProperties = {
  width: "100%",
  maxWidth: "600px",
  backgroundColor: emailTheme.surface,
  border: `1px solid ${emailTheme.border}`,
  borderRadius: "14px",
};

const markStyle: CSSProperties = {
  display: "inline-block",
  marginRight: "10px",
  color: emailTheme.accent,
  fontFamily: mono,
  fontSize: "16px",
  fontWeight: 700,
};

const wordmarkStyle: CSSProperties = {
  color: emailTheme.foreground,
  fontFamily: sans,
  fontSize: "18px",
  fontWeight: 700,
  letterSpacing: "-0.03em",
};

const hubStyle: CSSProperties = {
  marginLeft: "7px",
  color: emailTheme.muted,
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const statusStyle: CSSProperties = {
  display: "inline-block",
  borderRadius: "6px",
  padding: "6px 9px",
  fontFamily: mono,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const factLabelStyle: CSSProperties = {
  width: "126px",
  padding: "10px 14px 10px 0",
  borderBottom: `1px solid ${emailTheme.border}`,
  color: emailTheme.muted,
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  verticalAlign: "top",
};

const factValueStyle: CSSProperties = {
  padding: "10px 0",
  borderBottom: `1px solid ${emailTheme.border}`,
  color: emailTheme.foreground,
  fontFamily: sans,
  fontSize: "14px",
  lineHeight: "21px",
  verticalAlign: "top",
};

const evidenceStyle: CSSProperties = {
  marginTop: "28px",
  borderRadius: "12px",
  backgroundColor: emailTheme.ink,
};

const evidenceLabelStyle: CSSProperties = {
  padding: "20px 20px 7px",
  color: emailTheme.inkMuted,
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const evidenceValueStyle: CSSProperties = {
  padding: "0 20px 20px",
  color: emailTheme.inkForeground,
  fontFamily: mono,
  fontSize: "12px",
  lineHeight: "19px",
  overflowWrap: "anywhere",
};

const evidenceReasonStyle: CSSProperties = {
  padding: "0 20px 22px",
  color: emailTheme.inkForeground,
  fontFamily: sans,
  fontSize: "13px",
  lineHeight: "21px",
  whiteSpace: "pre-wrap",
};

const buttonStyle: CSSProperties = {
  display: "inline-block",
  marginTop: "28px",
  borderRadius: "10px",
  backgroundColor: emailTheme.foreground,
  color: "#ffffff",
  fontFamily: sans,
  fontSize: "14px",
  fontWeight: 600,
  lineHeight: "20px",
  padding: "12px 18px",
  textDecoration: "none",
};

const footerStyle: CSSProperties = {
  padding: "30px 0",
  borderTop: `1px solid ${emailTheme.border}`,
  color: emailTheme.muted,
  fontFamily: sans,
  fontSize: "12px",
  lineHeight: "19px",
};
