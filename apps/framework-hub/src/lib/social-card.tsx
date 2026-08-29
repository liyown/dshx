import type { Locale } from "@/lib/i18n";
import { socialCardPattern, truncateSocialText } from "./social-card-data";

export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;

/**
 * Static-image equivalents of the light DSHX semantic tokens. Satori cannot
 * resolve CSS custom properties, so the OG renderer consumes this named token
 * snapshot instead of introducing a separate visual palette.
 */
export const SOCIAL_CARD_TOKENS = {
  background: "#faf9f6",
  surface: "#fffefa",
  surface2: "#f2f0ea",
  foreground: "#252329",
  mutedForeground: "#716c76",
  border: "#dedad1",
  borderStrong: "#bdb8ae",
  accent: "#6536e8",
  accentSoft: "#eee9ff",
  ink: "#252329",
  inkForeground: "#faf9f6",
  inkMuted: "#aaa5ae",
  inkBorder: "#47434a",
  inkAccent: "#a88fff",
} as const;

const sans = "Inter Tight, Noto Sans SC";
const mono = "JetBrains Mono, Noto Sans SC";

export type HomeSocialCardInput = {
  readonly locale: Locale;
  readonly title: string;
  readonly description: string;
  readonly version: string;
};

export type PluginSocialCardInput = {
  readonly locale: Locale;
  readonly slug: string;
  readonly name: string;
  readonly packageName: string;
  readonly description: string;
  readonly author: string;
  readonly version: string;
  readonly category: string;
  readonly installCommand: string | null;
  readonly badge: "official" | "community";
};

function BrandMark({ inverted = false, size = 56 }: { inverted?: boolean; size?: number }) {
  const foreground = inverted ? SOCIAL_CARD_TOKENS.inkForeground : SOCIAL_CARD_TOKENS.foreground;
  const background = inverted ? SOCIAL_CARD_TOKENS.ink : SOCIAL_CARD_TOKENS.background;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M17 17 47 47"
        fill="none"
        stroke={foreground}
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="m47 17-30 30"
        fill="none"
        stroke={SOCIAL_CARD_TOKENS.accent}
        strokeLinecap="round"
        strokeWidth="5"
      />
      <circle cx="32" cy="32" r="5" fill={background} stroke={foreground} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="2" fill={SOCIAL_CARD_TOKENS.accent} />
    </svg>
  );
}

function CardHeader({ locale, label }: { locale: Locale; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: 62,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
        <BrandMark size={54} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: sans,
              fontSize: 27,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 1,
            }}
          >
            DSH<span style={{ color: SOCIAL_CARD_TOKENS.accent }}>X</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 7,
              color: SOCIAL_CARD_TOKENS.mutedForeground,
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: "0.14em",
            }}
          >
            FRAMEWORK / HUB
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            width: 118,
            height: 1,
            background: SOCIAL_CARD_TOKENS.border,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 30,
            padding: "0 12px",
            border: `1px solid ${SOCIAL_CARD_TOKENS.border}`,
            borderRadius: 6,
            color: SOCIAL_CARD_TOKENS.mutedForeground,
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {label} · {locale}
        </div>
      </div>
    </div>
  );
}

function PaperFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        padding: "38px 46px 34px",
        background: SOCIAL_CARD_TOKENS.background,
        color: SOCIAL_CARD_TOKENS.foreground,
        fontFamily: sans,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 22,
          display: "flex",
          width: 1,
          height: "100%",
          background: SOCIAL_CARD_TOKENS.border,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 22,
          display: "flex",
          width: 1,
          height: "100%",
          background: SOCIAL_CARD_TOKENS.border,
        }}
      />
      {children}
    </div>
  );
}

function TechnicalRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "11px 0",
        borderTop: `1px solid ${SOCIAL_CARD_TOKENS.inkBorder}`,
        fontFamily: mono,
        fontSize: 11,
      }}
    >
      <span style={{ color: SOCIAL_CARD_TOKENS.inkMuted, letterSpacing: "0.08em" }}>{label}</span>
      <span
        style={{
          maxWidth: 190,
          overflow: "hidden",
          color: SOCIAL_CARD_TOKENS.inkForeground,
          textAlign: "right",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function HomeRuntimePanel() {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: 342,
        height: 385,
        overflow: "hidden",
        padding: "25px 25px 22px",
        border: `1px solid ${SOCIAL_CARD_TOKENS.inkBorder}`,
        borderRadius: 12,
        background: SOCIAL_CARD_TOKENS.ink,
        color: SOCIAL_CARD_TOKENS.inkForeground,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: mono,
          fontSize: 10,
          letterSpacing: "0.12em",
        }}
      >
        <span style={{ color: SOCIAL_CARD_TOKENS.inkMuted }}>RUNTIME SIGNAL</span>
        <span style={{ color: SOCIAL_CARD_TOKENS.inkAccent }}>01 / BUILD</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 154,
          marginTop: 12,
        }}
      >
        <BrandMark inverted size={126} />
      </div>
      <TechnicalRow label="CLIENT" value="React · Vite · HMR" />
      <TechnicalRow label="HOST" value="typed module" />
      <TechnicalRow label="RUNTIME" value="DeepSeek Harness · Cordis" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          minHeight: 48,
          marginTop: 15,
          padding: "0 13px",
          border: `1px solid ${SOCIAL_CARD_TOKENS.inkBorder}`,
          borderRadius: 8,
          color: SOCIAL_CARD_TOKENS.inkForeground,
          fontFamily: mono,
          fontSize: 12,
        }}
      >
        <span style={{ marginRight: 10, color: SOCIAL_CARD_TOKENS.inkAccent }}>$</span>
        pnpm create dshx my-plugin
      </div>
    </div>
  );
}

function PluginInstallPanel({ input }: { input: PluginSocialCardInput }) {
  const pattern = socialCardPattern(input.slug);
  const fallback = input.locale === "zh" ? "暂无已验证安装目标" : "No verified install target";
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: 365,
        height: 397,
        overflow: "hidden",
        padding: "25px 25px 22px",
        border: `1px solid ${SOCIAL_CARD_TOKENS.inkBorder}`,
        borderRadius: 12,
        background: SOCIAL_CARD_TOKENS.ink,
        color: SOCIAL_CARD_TOKENS.inkForeground,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: `${pattern.railOffset}%`,
          left: 0,
          display: "flex",
          width: "100%",
          height: 1,
          background: SOCIAL_CARD_TOKENS.inkBorder,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: `${pattern.nodeOffset}%`,
          right: 18,
          display: "flex",
          width: 6,
          height: 6,
          borderRadius: 3,
          background: SOCIAL_CARD_TOKENS.inkAccent,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: mono,
          fontSize: 10,
          letterSpacing: "0.12em",
        }}
      >
        <span style={{ color: SOCIAL_CARD_TOKENS.inkMuted }}>INSTALL TARGET</span>
        <span style={{ color: SOCIAL_CARD_TOKENS.inkAccent }}>PROFILE / WEB</span>
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minHeight: 121,
          marginTop: 28,
        }}
      >
        <span
          style={{
            color: SOCIAL_CARD_TOKENS.inkMuted,
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: "0.1em",
          }}
        >
          PACKAGE
        </span>
        <span
          style={{
            marginTop: 12,
            color: SOCIAL_CARD_TOKENS.inkForeground,
            fontFamily: mono,
            fontSize: input.packageName.length > 31 ? 17 : 21,
            fontWeight: 500,
            lineHeight: 1.25,
            overflowWrap: "anywhere",
          }}
        >
          {truncateSocialText(input.packageName, 54)}
        </span>
      </div>
      <TechnicalRow label="VERSION" value={`v${input.version}`} />
      <TechnicalRow label="AUTHOR" value={truncateSocialText(input.author, 24)} />
      <TechnicalRow label="CATEGORY" value={truncateSocialText(input.category, 22)} />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          minHeight: 72,
          marginTop: 15,
          padding: "12px 13px",
          border: `1px solid ${SOCIAL_CARD_TOKENS.inkBorder}`,
          borderRadius: 8,
          color: input.installCommand
            ? SOCIAL_CARD_TOKENS.inkForeground
            : SOCIAL_CARD_TOKENS.inkMuted,
          fontFamily: mono,
          fontSize: 11,
          lineHeight: 1.45,
          overflowWrap: "anywhere",
        }}
      >
        <span style={{ marginRight: 9, color: SOCIAL_CARD_TOKENS.inkAccent }}>$</span>
        {truncateSocialText(input.installCommand ?? fallback, 96)}
      </div>
    </div>
  );
}

function CardFooter({ locale, detail }: { locale: Locale; detail: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingTop: 19,
        borderTop: `1px solid ${SOCIAL_CARD_TOKENS.border}`,
        color: SOCIAL_CARD_TOKENS.mutedForeground,
        fontFamily: mono,
        fontSize: 10,
        letterSpacing: "0.08em",
      }}
    >
      <span>DSHX.IO / {locale.toUpperCase()}</span>
      <span>{detail}</span>
    </div>
  );
}

export function HomeSocialCard(input: HomeSocialCardInput) {
  const description = truncateSocialText(input.description, input.locale === "zh" ? 82 : 142);
  return (
    <PaperFrame>
      <CardHeader
        locale={input.locale}
        label={input.locale === "zh" ? "构建工具" : "BUILD TOOLCHAIN"}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flex: 1,
          gap: 44,
          padding: "26px 0 25px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: SOCIAL_CARD_TOKENS.accent,
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: "0.12em",
            }}
          >
            <span>01</span>
            <span
              style={{
                display: "flex",
                width: 56,
                height: 1,
                margin: "0 12px",
                background: SOCIAL_CARD_TOKENS.accent,
              }}
            />
            DEEPSEEK HARNESS
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 25,
              fontFamily: sans,
              fontSize: input.locale === "zh" ? 55 : 58,
              fontWeight: 500,
              letterSpacing: input.locale === "zh" ? "-0.035em" : "-0.045em",
              lineHeight: 1.04,
            }}
          >
            {truncateSocialText(input.title, input.locale === "zh" ? 34 : 58)}
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 650,
              marginTop: 26,
              color: SOCIAL_CARD_TOKENS.mutedForeground,
              fontFamily: sans,
              fontSize: 22,
              fontWeight: 400,
              lineHeight: 1.48,
            }}
          >
            {description}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 29 }}>
            {["TypeScript", "React", "Vite", "HMR"].map((item) => (
              <span
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 29,
                  padding: "0 10px",
                  border: `1px solid ${SOCIAL_CARD_TOKENS.border}`,
                  borderRadius: 6,
                  background: SOCIAL_CARD_TOKENS.surface,
                  color: SOCIAL_CARD_TOKENS.mutedForeground,
                  fontFamily: mono,
                  fontSize: 10,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <HomeRuntimePanel />
      </div>
      <CardFooter locale={input.locale} detail={`OPEN SOURCE · v${input.version}`} />
    </PaperFrame>
  );
}

export function PluginSocialCard(input: PluginSocialCardInput) {
  const titleSize = input.name.length > 42 ? 43 : input.name.length > 28 ? 50 : 58;
  const description = truncateSocialText(input.description, input.locale === "zh" ? 88 : 148);
  const badge =
    input.badge === "official"
      ? input.locale === "zh"
        ? "官方插件"
        : "OFFICIAL PLUGIN"
      : input.locale === "zh"
        ? "社区插件"
        : "COMMUNITY PLUGIN";
  return (
    <PaperFrame>
      <CardHeader
        locale={input.locale}
        label={input.locale === "zh" ? "插件档案" : "PLUGIN RECORD"}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flex: 1,
          gap: 42,
          padding: "20px 0 21px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 680 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: SOCIAL_CARD_TOKENS.accent,
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: "0.11em",
            }}
          >
            <span>{badge}</span>
            <span
              style={{
                display: "flex",
                width: 50,
                height: 1,
                margin: "0 12px",
                background: SOCIAL_CARD_TOKENS.accent,
              }}
            />
            {truncateSocialText(input.category.toUpperCase(), 24)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontFamily: sans,
              fontSize: titleSize,
              fontWeight: 500,
              letterSpacing: "-0.04em",
              lineHeight: 1.04,
              overflowWrap: "anywhere",
            }}
          >
            {truncateSocialText(input.name, 62)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 15,
              color: SOCIAL_CARD_TOKENS.mutedForeground,
              fontFamily: mono,
              fontSize: 14,
              lineHeight: 1.35,
              overflowWrap: "anywhere",
            }}
          >
            {truncateSocialText(input.packageName, 72)}
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 640,
              marginTop: 27,
              color: SOCIAL_CARD_TOKENS.mutedForeground,
              fontFamily: sans,
              fontSize: 21,
              fontWeight: 400,
              lineHeight: 1.48,
            }}
          >
            {description}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 31,
              fontFamily: mono,
              fontSize: 11,
            }}
          >
            <span
              style={{
                display: "flex",
                width: 8,
                height: 8,
                marginRight: 9,
                borderRadius: 4,
                background: SOCIAL_CARD_TOKENS.accent,
              }}
            />
            <span style={{ color: SOCIAL_CARD_TOKENS.foreground }}>
              {truncateSocialText(input.author, 31)}
            </span>
            <span style={{ margin: "0 10px", color: SOCIAL_CARD_TOKENS.borderStrong }}>·</span>
            <span style={{ color: SOCIAL_CARD_TOKENS.mutedForeground }}>v{input.version}</span>
          </div>
        </div>
        <PluginInstallPanel input={input} />
      </div>
      <CardFooter locale={input.locale} detail="PUBLIC CATALOG · SOURCE REVIEW ADVISED" />
    </PaperFrame>
  );
}
