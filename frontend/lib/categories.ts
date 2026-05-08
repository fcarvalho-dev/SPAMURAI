export type Category =
  | "streaming"
  | "social"
  | "financeiro"
  | "spam"
  | "newsletter"
  | "entretenimento"
  | "e-commerce"
  | "transacional"
  | "pessoal"
  | "outros"

export const CATEGORY_COLOR: Record<string, {
  dot: string           // classe Tailwind para a bolinha
  badge_light: string   // badge no light mode
  badge_dark: string    // badge no dark mode
}> = {
  streaming:      { dot: "bg-violet-500",  badge_light: "bg-violet-100 text-violet-700 border-violet-200",    badge_dark: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  social:         { dot: "bg-sky-500",     badge_light: "bg-sky-100 text-sky-700 border-sky-200",             badge_dark: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  financeiro:     { dot: "bg-emerald-500", badge_light: "bg-emerald-100 text-emerald-700 border-emerald-200", badge_dark: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  spam:           { dot: "bg-rose-500",    badge_light: "bg-rose-100 text-rose-700 border-rose-200",          badge_dark: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  newsletter:     { dot: "bg-amber-500",   badge_light: "bg-amber-100 text-amber-700 border-amber-200",       badge_dark: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  entretenimento: { dot: "bg-fuchsia-500", badge_light: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200", badge_dark: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30" },
  "e-commerce":   { dot: "bg-orange-500",  badge_light: "bg-orange-100 text-orange-700 border-orange-200",    badge_dark: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  transacional:   { dot: "bg-teal-500",    badge_light: "bg-teal-100 text-teal-700 border-teal-200",          badge_dark: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  pessoal:        { dot: "bg-indigo-500",  badge_light: "bg-indigo-100 text-indigo-700 border-indigo-200",    badge_dark: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  outros:         { dot: "bg-slate-400",   badge_light: "bg-slate-100 text-slate-600 border-slate-200",       badge_dark: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  financial:      { dot: "bg-emerald-500", badge_light: "bg-emerald-100 text-emerald-700 border-emerald-200", badge_dark: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  entertainment:  { dot: "bg-fuchsia-500", badge_light: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200", badge_dark: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30" },
  ecommerce:      { dot: "bg-orange-500",  badge_light: "bg-orange-100 text-orange-700 border-orange-200",    badge_dark: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  transactional:  { dot: "bg-teal-500",    badge_light: "bg-teal-100 text-teal-700 border-teal-200",          badge_dark: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  personal:       { dot: "bg-indigo-500",  badge_light: "bg-indigo-100 text-indigo-700 border-indigo-200",    badge_dark: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  other:          { dot: "bg-slate-400",   badge_light: "bg-slate-100 text-slate-600 border-slate-200",       badge_dark: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
}

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    streaming: "Streaming", social: "Social", financeiro: "Financeiro",
    spam: "Spam", newsletter: "Newsletter", entretenimento: "Entretenimento",
    "e-commerce": "E-commerce", transacional: "Transacional",
    pessoal: "Pessoal", outros: "Outros", all: "Todas",
    financial: "Financeiro", entertainment: "Entretenimento",
    ecommerce: "E-commerce", transactional: "Transacional",
    personal: "Pessoal", other: "Outros",
  }
  return labels[cat?.toLowerCase()] ?? cat
}

export function categoryBadgeClasses(cat: string, isDark = false): string {
  const c = CATEGORY_COLOR[cat?.toLowerCase()]
  if (!c) return isDark
    ? "bg-slate-500/20 text-slate-300 border-slate-500/30"
    : "bg-slate-100 text-slate-600 border-slate-200"
  return isDark ? c.badge_dark : c.badge_light
}

export function categoryDotClass(cat: string): string {
  return CATEGORY_COLOR[cat?.toLowerCase()]?.dot ?? "bg-slate-400"
}

export const CATEGORY_FILTERS = [
  "all", "streaming", "social", "financeiro", "spam",
  "newsletter", "entretenimento", "e-commerce", "transacional",
  "pessoal", "outros",
]
