import type { ReactNode } from "react";
import { ImageResponse, loadGoogleFont } from "workers-og";

import {
  SOCIAL_CARD_HEIGHT,
  SOCIAL_CARD_WIDTH,
  HomeSocialCard,
  PluginSocialCard,
  type HomeSocialCardInput,
  type PluginSocialCardInput,
} from "./social-card";

const IMAGE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const LATIN_FONT_CORPUS =
  "DSHX FRAMEWORK HUB BUILD TOOLCHAIN PLUGIN RECORD RUNTIME SIGNAL CLIENT HOST INSTALL TARGET PROFILE WEB PACKAGE VERSION AUTHOR CATEGORY PUBLIC CATALOG SOURCE REVIEW ADVISED OPEN SOURCE COMMUNITY OFFICIAL TypeScript React Vite HMR DeepSeek Harness Cordis pnpm create dshx my-plugin abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 @/._-·:$…";
const CHINESE_FONT_CORPUS = "构建工具插件档案官方社区暂无已验证安装目标面向开发使用与";

function compactFontText(value: string): string {
  return [...new Set(value.replace(/\s+/g, ""))].join("");
}

async function renderSocialCard(element: ReactNode, text: string): Promise<Response> {
  const latinText = compactFontText(`${LATIN_FONT_CORPUS} ${text}`).replace(/\p{Script=Han}/gu, "");
  const [sans, mono] = await Promise.all([
    loadGoogleFont({ family: "Inter Tight", weight: 500, text: latinText }),
    loadGoogleFont({ family: "JetBrains Mono", weight: 400, text: latinText }),
  ]);
  const fonts = [
    { name: "Inter Tight", data: sans, weight: 400 as const, style: "normal" as const },
    { name: "Inter Tight", data: sans, weight: 500 as const, style: "normal" as const },
    { name: "Inter Tight", data: sans, weight: 600 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: mono, weight: 400 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];

  if (/\p{Script=Han}/u.test(text)) {
    const data = await loadGoogleFont({
      family: "Noto Sans SC",
      weight: 500,
      text: compactFontText(`${CHINESE_FONT_CORPUS} ${text}`),
    });
    fonts.push(
      { name: "Noto Sans SC", data, weight: 400, style: "normal" },
      { name: "Noto Sans SC", data, weight: 500, style: "normal" },
      { name: "Noto Sans SC", data, weight: 600, style: "normal" },
    );
  }

  return new ImageResponse(element, {
    width: SOCIAL_CARD_WIDTH,
    height: SOCIAL_CARD_HEIGHT,
    format: "png",
    fonts,
    headers: {
      "Cache-Control": IMAGE_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function renderHomeSocialCard(input: HomeSocialCardInput): Promise<Response> {
  return renderSocialCard(<HomeSocialCard {...input} />, `${input.title} ${input.description}`);
}

export function renderPluginSocialCard(input: PluginSocialCardInput): Promise<Response> {
  return renderSocialCard(
    <PluginSocialCard {...input} />,
    [
      input.name,
      input.packageName,
      input.description,
      input.author,
      input.category,
      input.installCommand,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
}
