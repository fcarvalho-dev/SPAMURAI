"use client"

import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { DashboardHeader } from "@/components/dashboard/header"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { SendersTable } from "@/components/dashboard/senders-table"
import { DeleteConfirmDialog } from "@/components/dashboard/delete-confirm-dialog"
import { AiChat } from "@/components/dashboard/ai-chat"
import { RulesModal } from "@/components/dashboard/rules-modal"
import SubscriptionDialog from "@/components/dashboard/subscription-dialog"
import { api, subscriptionsApi } from "@/lib/api"
import { categoryLabel } from "@/lib/categories"
import type { CategoryFilter, Sender, ScanProgressEvent } from "@/lib/types"
import { CATEGORY_FILTERS } from "@/lib/types"
import { ChevronDown, Filter, Search, Sparkles, X, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function DashboardPage() {
  const [category, setCategory] = useState<CategoryFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Sender | null>(null)
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [rulesModalOpen, setRulesModalOpen] = useState(false)
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    retry: false,
  })

  const sendersQuery = useQuery({
    queryKey: ["senders"],
    queryFn: api.getSenders,
  })

  const queryClient = useQueryClient()
  const esRef = useRef<EventSource | null>(null)

  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false)
  const [subscriptionPrefill, setSubscriptionPrefill] = useState<{ domain: string; name?: string } | null>(null)

  const subscriptionAlertsQuery = useQuery({
    queryKey: ["subscription-alerts"],
    queryFn: () => subscriptionsApi.alerts(),
    refetchInterval: 60_000,
    enabled: true,
  })

  const senders = sendersQuery.data ?? []
  const userEmail = meQuery.data?.email ?? ""


  const stats = useMemo(() => {
    const totalEmails = senders.reduce((acc, s) => acc + s.total, 0)
    const totalUnread = senders.reduce((acc, s) => acc + s.unread, 0)
    const categories = new Set(senders.map((s) => s.ai_category || "other"))
    return {
      totalEmails,
      totalSenders: senders.length,
      totalUnread,
      totalCategories: categories.size,
    }
  }, [senders])

  const counts = useMemo(() => {
    const knownCats: Set<string> = new Set(CATEGORY_FILTERS.filter((c) => c !== "all" && c !== "other"))
    const c: Partial<Record<CategoryFilter, number>> = { all: senders.length }
    for (const cat of CATEGORY_FILTERS) {
      if (cat === "all") continue
      c[cat] = 0
    }
    for (const s of senders) {
      const key = s.ai_category || "other"
      if (knownCats.has(key as CategoryFilter)) {
        c[key as CategoryFilter] = (c[key as CategoryFilter] ?? 0) + 1
      } else {
        c.other = (c.other ?? 0) + 1
      }
    }
    return c
  }, [senders])

  const filteredSenders = useMemo(() => {
    let result = senders

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          s.domain.toLowerCase().includes(q) ||
          s.display_name?.toLowerCase().includes(q)
      )
    }

    if (category !== "all") {
      if (category === "other") {
        const known: Set<string> = new Set(CATEGORY_FILTERS.filter((c) => c !== "all" && c !== "other"))
        result = result.filter((s) => !known.has((s.ai_category || "other") as CategoryFilter))
      } else {
        result = result.filter((s) => s.ai_category === category)
      }
    }

    if (showUnreadOnly) {
      result = result.filter((s) => s.unread > 0)
    }

    return result
  }, [senders, category, searchQuery, showUnreadOnly])

  return (
    <div
      className="min-h-screen bg-gradient-mesh relative"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="relative z-10">
        <DashboardHeader userEmail={userEmail} />

        <main className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <StatsCards
            totalEmails={stats.totalEmails}
            totalSenders={stats.totalSenders}
            totalUnread={stats.totalUnread}
            totalCategories={stats.totalCategories}
            isLoading={sendersQuery.isLoading}
            onOpenRules={() => setRulesModalOpen(true)}
          />
          {subscriptionAlertsQuery.data && subscriptionAlertsQuery.data.alerts.length > 0 && (
            <div className="rounded-md border border-border/40 bg-muted/30 p-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <strong className="mr-2">Assinaturas:</strong>
                {subscriptionAlertsQuery.data.count} alerta(s) pendente(s)
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setSubscriptionsOpen(true)}>Gerenciar</Button>
              </div>
            </div>
          )}
          


        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar remetente..." className="pl-9 glass border-border/50" value={searchQuery} onChange={e => setSearchQuery((e.target as HTMLInputElement).value)} />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 glass border-border/50 min-w-[160px] justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <span>{categoryLabel(category)}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48 bg-popover border border-border shadow-lg z-50" align="start">
                {CATEGORY_FILTERS.map(cat => (
                  <DropdownMenuItem
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`flex items-center justify-between ${category === cat ? 'text-primary font-medium' : ''}`}
                  >
                    <span>{categoryLabel(cat)}</span>
                    <span className="text-xs text-muted-foreground">{counts[cat] ?? 0}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setShowUnreadOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                showUnreadOnly
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${showUnreadOnly ? "bg-primary-foreground" : "bg-primary"} animate-pulse`} />
              Não lidos
              {showUnreadOnly && (
                <span className="text-xs opacity-70">({senders.filter((s) => s.unread > 0).length})</span>
              )}
            </button>

            {category !== "all" && (
              <Badge variant="secondary" className="gap-1">
                {categoryLabel(category)}
                <button onClick={() => setCategory("all")}><X className="h-3 w-3" /></button>
              </Badge>
            )}
          </div>

          <SendersTable
            senders={filteredSenders}
            isLoading={sendersQuery.isLoading}
            isError={sendersQuery.isError}
            onDelete={setPendingDelete}
            onRetry={() => sendersQuery.refetch()}
            externalSelectedDomain={selectedDomain}
            onSelectedDomainChange={setSelectedDomain}
            onMonitorSubscription={(domain, name) => { setSubscriptionPrefill({ domain, name }); setSubscriptionsOpen(true) }}
          />
        </div>
      </main>

      <DeleteConfirmDialog sender={pendingDelete} onClose={() => setPendingDelete(null)} />
      <RulesModal open={rulesModalOpen} onOpenChange={setRulesModalOpen} />
      <SubscriptionDialog open={subscriptionsOpen} onOpenChange={(open) => { if (!open) setSubscriptionPrefill(null); setSubscriptionsOpen(open) }} prefillDomain={subscriptionPrefill?.domain ?? null} prefillName={subscriptionPrefill?.name ?? null} />
      <AiChat
        senders={senders}
        userEmail={userEmail}
        onFilterCategory={(c) => setCategory(c as CategoryFilter)}
        onFilterDomain={(d) => setSelectedDomain(d)}
      />
      </div>
    </div>
  )
}
