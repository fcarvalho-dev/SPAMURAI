"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  User,
  Palette,
  CreditCard,
  Bell,
  AlertTriangle,
  Check,
  LogOut,
  Trash2,
  ChevronRight,
} from "lucide-react"
import { API_BASE, api } from "@/lib/api"
import type { PlanType } from "@/lib/types"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DashboardHeader } from "@/components/dashboard/header"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "profile" | "appearance" | "plans" | "notifications" | "account"

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Perfil", icon: <User className="h-4 w-4" /> },
  { id: "appearance", label: "Aparência", icon: <Palette className="h-4 w-4" /> },
  { id: "plans", label: "Planos", icon: <CreditCard className="h-4 w-4" /> },
  { id: "notifications", label: "Notificações", icon: <Bell className="h-4 w-4" /> },
  { id: "account", label: "Conta", icon: <AlertTriangle className="h-4 w-4" /> },
]

// ─── Theme definitions ─────────────────────────────────────────────────────────

const DARK_THEMES = ["dark-indigo", "dark-midnight", "neon-cyber"]

const THEMES = [
  { id: "dark-indigo",   name: "Dark Indigo",   bg: "#0a0d1a", accent: "#818cf8" },
  { id: "dark-midnight", name: "Dark Midnight",  bg: "#050609", accent: "#6366f1" },
  { id: "light-cloud",   name: "Light Cloud",    bg: "#e8eeff", accent: "#4F46E5" },
  { id: "light-sakura",  name: "Light Sakura",   bg: "#fde8ec", accent: "#be185d" },
  { id: "neon-cyber",    name: "Neon Cyber",     bg: "#030d07", accent: "#4ade80" },
]

const DENSITY_OPTIONS = [
  { id: "compact", label: "Compacta" },
  { id: "normal",  label: "Normal" },
  { id: "spacious", label: "Espaçada" },
]

const DATE_FORMAT_OPTIONS = [
  { id: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { id: "MM/DD/YYYY", label: "MM/DD/YYYY" },
]

// ─── Plan helpers ──────────────────────────────────────────────────────────────

function planBadgeClass(plan: PlanType) {
  if (plan === "business") return "bg-amber-500 text-white"
  if (plan === "pro") return "bg-primary text-primary-foreground"
  return "bg-muted text-muted-foreground"
}

// ─── Section: Profile ─────────────────────────────────────────────────────────

function ProfileSection({ onGoToPlans }: { onGoToPlans: () => void }) {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.getMe, retry: false })

  if (!user) {
    return <div className="h-24 animate-pulse rounded-xl bg-muted" />
  }

  const initials = user.email.slice(0, 2).toUpperCase()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Perfil</h2>
        <p className="text-sm text-muted-foreground mt-1">Suas informações de conta</p>
      </div>

      <div className="glass-card rounded-xl p-6 flex items-center gap-5">
        <div className="relative shrink-0">
          {user.picture_url ? (
            <img
              src={user.picture_url}
              alt={user.email}
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-full ring-2 ring-border object-cover"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
              {initials}
            </div>
          )}
          <span className={`absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${planBadgeClass(user.plan)}`}>
            {user.plan.toUpperCase()}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-lg truncate">{user.name || user.email}</p>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          {user.plan_expires_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Plano ativo até {new Date(user.plan_expires_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onGoToPlans}
          className="shrink-0 flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Gerenciar plano
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Section: Appearance ──────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const [selectedTheme, setSelectedTheme] = useState<string>("")
  const [density, setDensity] = useState<string>("normal")
  const [dateFormat, setDateFormat] = useState<string>("DD/MM/YYYY")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const savedTheme = localStorage.getItem("spamurai-theme") ?? "dark-indigo"
    setSelectedTheme(savedTheme)
    // Re-aplicar data-theme caso tenha perdido na navegação (ThemeInitializer já faz isso, mas garantimos aqui)
    document.documentElement.setAttribute("data-theme", savedTheme)
    setDensity(localStorage.getItem("spamurai-density") ?? "normal")
    setDateFormat(localStorage.getItem("spamurai-date-format") ?? "DD/MM/YYYY")
  }, [])

  function applyTheme(themeId: string) {
    localStorage.setItem("spamurai-theme", themeId)
    document.documentElement.setAttribute("data-theme", themeId)
    setTheme(DARK_THEMES.includes(themeId) ? "dark" : "light")
    setSelectedTheme(themeId)
  }

  function applyDensity(value: string) {
    localStorage.setItem("spamurai-density", value)
    document.documentElement.setAttribute("data-density", value)
    setDensity(value)
  }

  function applyDateFormat(value: string) {
    localStorage.setItem("spamurai-date-format", value)
    setDateFormat(value)
  }

  if (!mounted) return <div className="h-48 animate-pulse rounded-xl bg-muted" />

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Aparência</h2>
        <p className="text-sm text-muted-foreground mt-1">Personalize a interface do Spamurai</p>
      </div>

      {/* Themes */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Tema</p>
        <div className="grid grid-cols-5 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTheme(t.id)}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                selectedTheme === t.id
                  ? "border-primary"
                  : "border-border hover:border-border/80"
              }`}
            >
              <div
                className="h-10 w-full rounded-lg flex items-center justify-center"
                style={{ background: t.bg }}
              >
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ background: t.accent }}
                />
              </div>
              <span className="text-[11px] text-center leading-tight">{t.name}</span>
              {selectedTheme === t.id && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Dark/light quick toggle */}
      <div className="flex items-center justify-between glass-card rounded-xl p-4">
        <div>
          <p className="text-sm font-medium">Modo escuro</p>
          <p className="text-xs text-muted-foreground">Alterna entre claro e escuro</p>
        </div>
        <Switch
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        />
      </div>

      {/* Table density */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Densidade da tabela</p>
        <div className="flex gap-2">
          {DENSITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyDensity(opt.id)}
              className={`flex-1 rounded-lg border py-2 text-sm transition-all ${
                density === opt.id
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-border/80 text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date format */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Formato de data</p>
        <div className="flex gap-2">
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyDateFormat(opt.id)}
              className={`flex-1 rounded-lg border py-2 text-sm transition-all ${
                dateFormat === opt.id
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-border/80 text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Section: Plans ───────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  ai_classify: "Classificação IA",
  kenzo_chat: "Chat Kenzo",
  auto_rules: "Regras automáticas",
  auto_sync: "Sincronização automática",
  voice_stt: "Voz (STT)",
  reports: "Relatórios",
  subscription_monitor: "Monitor de assinaturas",
  multi_account: "Multi-conta Gmail",
}

function PlansSection() {
  const [cycle, setCycle] = useState<"monthly" | "weekly">("monthly")
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.getMe, retry: false })
  const { data: plansData } = useQuery({ queryKey: ["plans-available"], queryFn: api.getAvailablePlans })

  const currentPlan: PlanType = user?.plan ?? "free"

  const plans = plansData?.plans ?? []

  function handleSubscribe(_planId: string) {
    toast.info("Em breve — integração com Stripe")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Planos</h2>
          <p className="text-sm text-muted-foreground mt-1">Escolha o plano ideal para você</p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {(["monthly", "weekly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`rounded-md px-3 py-1.5 text-sm transition-all ${
                cycle === c
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "monthly" ? "Mensal" : "Semanal"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan
          const isPro = plan.id === "pro"
          const price = cycle === "monthly" ? plan.price_monthly : plan.price_weekly
          const period = cycle === "monthly" ? "/mês" : "/semana"

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border p-5 gap-4 ${
                isPro ? "border-primary border-2" : "border-border"
              }`}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Mais popular
                </span>
              )}

              <div>
                <p className="font-semibold text-base">{plan.name}</p>
                <p className="mt-1">
                  {price === 0 ? (
                    <span className="text-2xl font-bold">Grátis</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">R${price.toFixed(0)}</span>
                      <span className="text-sm text-muted-foreground">{period}</span>
                    </>
                  )}
                </p>
              </div>

              <ul className="space-y-2 flex-1">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const active = plan.features[key as keyof typeof plan.features]
                  if (key === "max_monitored_subscriptions") return null
                  return (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      {active ? (
                        <Check className="h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 text-center text-muted-foreground text-xs leading-4">—</span>
                      )}
                      <span className={active ? "" : "text-muted-foreground"}>{label}</span>
                    </li>
                  )
                })}
                <li className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-4 shrink-0 text-center text-xs leading-4">
                    {plan.features.max_monitored_subscriptions === -1
                      ? "∞"
                      : plan.features.max_monitored_subscriptions === 0
                      ? "—"
                      : plan.features.max_monitored_subscriptions}
                  </span>
                  <span className={plan.features.max_monitored_subscriptions === 0 ? "text-muted-foreground" : ""}>
                    Assinaturas monitoradas
                  </span>
                </li>
              </ul>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => handleSubscribe(plan.id)}
                className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                  isCurrent
                    ? "bg-muted text-muted-foreground cursor-default"
                    : isPro
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border hover:bg-accent"
                }`}
              >
                {isCurrent ? "Plano atual" : `Assinar ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Section: Notifications ───────────────────────────────────────────────────

function NotificationsSection() {
  const [subAlerts, setSubAlerts] = useState(true)
  const [unreadAlert, setUnreadAlert] = useState(false)

  useEffect(() => {
    setSubAlerts(localStorage.getItem("notif_sub_alerts") !== "false")
    setUnreadAlert(localStorage.getItem("notif_unread") === "true")
  }, [])

  function toggle(key: string, value: boolean, setter: (v: boolean) => void) {
    localStorage.setItem(key, String(value))
    setter(value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Notificações</h2>
        <p className="text-sm text-muted-foreground mt-1">Controle quais alertas você recebe</p>
      </div>

      <div className="glass-card rounded-xl divide-y divide-border">
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium">Alertas de assinatura</p>
            <p className="text-xs text-muted-foreground">Notifica quando uma assinatura está próxima de vencer</p>
          </div>
          <Switch
            checked={subAlerts}
            onCheckedChange={(v) => toggle("notif_sub_alerts", v, setSubAlerts)}
          />
        </div>

        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium">Inbox com +100 não lidos</p>
            <p className="text-xs text-muted-foreground">Notifica quando sua caixa acumular mensagens</p>
          </div>
          <Switch
            checked={unreadAlert}
            onCheckedChange={(v) => toggle("notif_unread", v, setUnreadAlert)}
          />
        </div>

        <div className="flex items-center justify-between p-4 opacity-50">
          <div>
            <p className="text-sm font-medium">Resumo semanal por email</p>
            <p className="text-xs text-muted-foreground">Em breve</p>
          </div>
          <Switch disabled checked={false} />
        </div>
      </div>
    </div>
  )
}

// ─── Section: Account ─────────────────────────────────────────────────────────

function AccountSection() {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteInput, setDeleteInput] = useState("")
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.getMe, retry: false })

  async function handleLogout() {
    await fetch(`${API_BASE}/auth/logout`, { method: "GET", credentials: "include" }).catch(() => {})
    router.push("/")
  }

  function clearKenzoHistory() {
    localStorage.removeItem("kenzo_chat_history")
    toast.success("Histórico do Kenzo apagado")
  }

  const canDelete = deleteInput === user?.email

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Conta</h2>
        <p className="text-sm text-muted-foreground mt-1">Gerencie sua conta e dados</p>
      </div>

      <div className="glass-card rounded-xl divide-y divide-border">
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium">Limpar histórico do Kenzo</p>
            <p className="text-xs text-muted-foreground">Remove todas as mensagens do chat local</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearKenzoHistory}>
            Limpar
          </Button>
        </div>

        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium">Desconectar conta Google</p>
            <p className="text-xs text-muted-foreground">Encerra sua sessão no Spamurai</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/40 p-5 space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <p className="text-sm font-semibold">Zona de perigo</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Excluir sua conta remove todos os seus dados permanentemente. Esta ação não pode ser desfeita.
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Excluir minha conta
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão de conta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Digite <span className="font-mono font-semibold text-foreground">{user?.email}</span> para confirmar.
          </p>
          <Input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder={user?.email}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!canDelete}
              onClick={() => toast.error("Exclusão de conta não disponível nesta versão")}
            >
              Excluir conta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") as Tab | null
  const [tab, setTab] = useState<Tab>(tabParam ?? "profile")

  // Sync tab with URL parameter
  useEffect(() => {
    if (tabParam && TABS.some(t => t.id === tabParam)) {
      setTab(tabParam)
    }
  }, [tabParam])

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userEmail="" />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-6">Configurações</h1>

        <div className="flex gap-8">
          {/* Sidebar nav */}
          <aside className="w-48 shrink-0">
            <nav className="flex flex-col gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                    tab === t.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {tab === "profile" && <ProfileSection onGoToPlans={() => setTab("plans")} />}
            {tab === "appearance" && <AppearanceSection />}
            {tab === "plans" && <PlansSection />}
            {tab === "notifications" && <NotificationsSection />}
            {tab === "account" && <AccountSection />}
          </main>
        </div>
      </div>
    </div>
  )
}
