/** Bump when a template-only change must invalidate cached social images. */
export const SOCIAL_CARD_REVISION = "2";

export function truncateSocialText(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  const candidate = normalized.slice(0, maximum - 1).trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor(maximum * 0.68) ? candidate.slice(0, lastSpace) : candidate;
  return `${cut.replace(/[.,;:!?，。；：！？、]+$/u, "")}…`;
}

export function socialCardPattern(slug: string): {
  readonly railOffset: number;
  readonly nodeOffset: number;
} {
  let hash = 2_166_136_261;
  for (const character of slug) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  const positive = hash >>> 0;
  return {
    railOffset: 26 + (positive % 44),
    nodeOffset: 18 + ((positive >>> 8) % 60),
  };
}
