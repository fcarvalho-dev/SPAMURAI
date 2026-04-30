import type { AICategory } from "./types"

export const CATEGORY_LABEL: Record<string, string> = {
  all: "Todas",
  streaming: "Streaming",
  social: "Social",
  financial: "Financeiro",
  spam: "Spam",
  other: "Outros",
}

// Tailwind classes for category badges. Uses theme tokens + a few accents.
export const CATEGORY_BADGE: Record<string, string> = {
  streaming: "bg-chart-1/15 text-chart-1 border-chart-1/30",
  social: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  financial: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  spam: "bg-destructive/15 text-destructive-foreground border-destructive/40",
  other: "bg-muted text-muted-foreground border-border",
}

export function categoryLabel(cat: AICategory) {
  return cat ? (CATEGORY_LABEL[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1)) : 'Outros'
}

export function categoryBadgeClasses(cat: AICategory) {
  return CATEGORY_BADGE[cat] ?? CATEGORY_BADGE.other
}
