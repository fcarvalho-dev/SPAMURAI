"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Loader2, RefreshCw, ScanLine } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { ScanProgressEvent } from "@/lib/types"

export function ScanInbox() {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null)
  const [scanJobId, setScanJobId] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const startMutation = useMutation({
    mutationFn: api.startScan,
    onSuccess: (data) => {
      setScanJobId(data.scan_job_id)
      setProgress({ status: "pending", indexed: 0, total: 0 })
    },
    onError: (err: Error) => {
      toast.error("Falha ao iniciar a varredura", { description: err.message })
    },
  })

  // SSE subscription
  useEffect(() => {
    if (!scanJobId) return
    const url = api.scanProgressUrl(scanJobId)
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ScanProgressEvent
        setProgress(data)
        if (data.status === "completed") {
          es.close()
          esRef.current = null
          toast.success("Varredura concluída", {
            description: `${data.indexed} emails indexados`,
          })
          queryClient.invalidateQueries({ queryKey: ["senders"] })
        } else if (data.status === "failed") {
          es.close()
          esRef.current = null
          toast.error("Varredura falhou")
        }
      } catch {
        // ignore malformed events
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [scanJobId, queryClient])

  const isRunning =
    startMutation.isPending ||
    (progress != null && progress.status !== "completed" && progress.status !== "failed")

  const indexed = progress?.indexed ?? 0
  const total = progress?.total ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((indexed / total) * 100)) : startMutation.isPending ? 5 : 0

  const handleStart = () => {
    setProgress(null)
    setScanJobId(null)
    startMutation.mutate()
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold tracking-tight">Varredura da caixa de entrada</h2>
            <p className="text-xs text-muted-foreground text-pretty">
              Indexa e categoriza seus emails com IA para liberar espaço.
            </p>
          </div>
          <Button onClick={handleStart} disabled={isRunning} className="gap-2">
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Indexando...
              </>
            ) : progress?.status === "completed" ? (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Escanear novamente
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4" aria-hidden="true" />
                Escanear caixa de entrada
              </>
            )}
          </Button>
        </div>

        {(isRunning || progress) && (
          <div className="flex flex-col gap-2">
            <Progress value={pct} className="h-2" />
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                {isRunning && <Spinner className="h-3 w-3" />}
                <span className="tabular-nums">
                  {indexed.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")} emails indexados
                </span>
              </span>
              <span className="tabular-nums font-medium text-foreground">{pct}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
