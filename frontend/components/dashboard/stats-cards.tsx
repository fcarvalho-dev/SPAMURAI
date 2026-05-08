"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Inbox, Users, MailOpen, Tag, Search, Sparkles, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { usePlan } from "@/lib/hooks/use-plan"
import { UpgradeGate } from "@/components/ui/upgrade-gate"

interface StatItem {
  label: string
  value: number | string
  icon: LucideIcon
}

interface StatsCardsProps {
  totalEmails: number
  totalSenders: number
  totalUnread: number
  totalCategories: number
  isLoading?: boolean
  onOpenRules?: () => void
}

export function StatsCards({
  totalEmails,
  totalSenders,
  totalUnread,
  totalCategories,
  isLoading,
  onOpenRules,
}: StatsCardsProps) {
  const { hasFeature } = usePlan()
  const items: StatItem[] = [
    { label: "Emails totais", value: totalEmails.toLocaleString("pt-BR"), icon: Inbox },
    { label: "Remetentes", value: totalSenders.toLocaleString("pt-BR"), icon: Users },
    { label: "Não lidos", value: totalUnread.toLocaleString("pt-BR"), icon: MailOpen },
    { label: "Categorias", value: totalCategories.toLocaleString("pt-BR"), icon: Tag },
  ]

  // Actions: scan + classify + rules
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<{ status: string; indexed: number; total: number } | null>(null)
  const [scanJobId, setScanJobId] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const startMutation = useMutation({ mutationFn: api.startScan, onSuccess: (data) => { setScanJobId(data.scan_job_id); setProgress({ status: "pending", indexed: 0, total: 0 }) }, onError: (err: Error) => toast.error("Falha ao iniciar a varredura", { description: err.message }) })

  useEffect(() => {
    if (!scanJobId) return
    const es = new EventSource(api.scanProgressUrl(scanJobId))
    esRef.current = es
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { status: string; indexed: number; total: number }
        setProgress(data)
        if (data.status === "completed") {
          es.close()
          esRef.current = null
          setScanJobId(null)
          toast.success("Varredura concluída", { description: `${data.indexed} emails indexados` })
          queryClient.invalidateQueries({ queryKey: ["senders"] })
        } else if (data.status === "failed") {
          es.close()
          esRef.current = null
          setScanJobId(null)
          toast.error("Varredura falhou")
        }
      } catch {
        // ignore parse errors
      }
    }
    es.onerror = () => { es.close(); esRef.current = null }
    return () => { es.close(); esRef.current = null }
  }, [scanJobId, queryClient])

  const classifyMutation = useMutation({ mutationFn: api.classify, onSuccess: () => { toast.success("Classificação concluída"); queryClient.invalidateQueries({ queryKey: ["senders"] }) }, onError: (err: Error) => toast.error("Classificação falhou", { description: err.message }) })

  const isRunning = startMutation.isPending || (progress != null && progress.status !== "completed" && progress.status !== "failed")
  const indexed = progress?.indexed ?? 0
  const total = progress?.total ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((indexed / total) * 100)) : startMutation.isPending ? 5 : 0

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-card p-5 flex flex-col gap-3 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-default">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
              <div className="rounded-lg bg-primary/10 p-1.5">
                <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
            </div>
            <div className="text-3xl font-bold tabular-nums">{isLoading ? <Skeleton className="h-8 w-28" /> : value}</div>
            <div className="text-xs text-muted-foreground">{label === "Emails totais" ? `em ${totalSenders} remetentes` : ""}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="gap-2 glass border-border/50" onClick={() => { setProgress(null); setScanJobId(null); startMutation.mutate() }} disabled={isRunning}>
          <Search className="h-4 w-4" />
          {isRunning ? (<>Indexando...</>) : (<>Escanear inbox</>)}
        </Button>

        <Button variant="outline" className="gap-2 glass border-border/50" onClick={() => classifyMutation.mutate()} disabled={classifyMutation.isPending}>
            <Sparkles className="h-4 w-4 text-primary" />
            Classificar com IA
          </Button>
        
        <Button variant="outline" className="gap-2 glass border-border/50" onClick={() => onOpenRules?.()}>
            <Zap className="h-4 w-4 text-yellow-500" />
            Regras
          </Button>
        

        {(isRunning || progress) && (
          <div className="w-full mt-3">
            <Progress value={pct} className="h-2" />
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="flex items-center gap-2 text-muted-foreground">
                {isRunning && <Spinner className="h-3 w-3" />}
                <span className="tabular-nums">{indexed.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")} emails indexados</span>
              </span>
              <span className="tabular-nums font-medium text-foreground">{pct}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

