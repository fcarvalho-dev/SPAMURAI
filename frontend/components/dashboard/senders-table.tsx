"use client"

import { useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia, EmptyContent } from "@/components/ui/empty"
import { ExternalLink, Inbox, Trash2 } from "lucide-react"
import { categoryBadgeClasses, categoryLabel } from "@/lib/categories"
import type { Sender } from "@/lib/types"

interface SendersTableProps {
  senders: Sender[]
  isLoading: boolean
  isError: boolean
  onDelete: (sender: Sender) => void
  onRetry: () => void
}

function formatDate(iso: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

export function SendersTable({ senders, isLoading, isError, onDelete, onRetry }: SendersTableProps) {
  // Group senders by category, preserving a stable order
  const groups = useMemo(() => {
    const ORDER = ["streaming", "social", "financial", "spam", "other"]
    const map = new Map<string, Sender[]>()
    for (const s of senders) {
      const key = s.ai_category || "other"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    // Sort each group by total desc
    for (const list of map.values()) {
      list.sort((a, b) => b.total - a.total)
    }
    // Return in stable order, with unknown categories at the end
    const orderedKeys = [
      ...ORDER.filter((k) => map.has(k)),
      ...[...map.keys()].filter((k) => !ORDER.includes(k)).sort(),
    ]
    return orderedKeys.map((k) => ({ category: k, senders: map.get(k)! }))
  }, [senders])

  if (isLoading) {
    return (
      <Card className="border-border bg-card p-0">
        <div className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="ml-auto h-8 w-24" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="border-border bg-card">
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Não foi possível carregar os remetentes</EmptyTitle>
            <EmptyDescription>
              Verifique se a API em <code className="font-mono text-xs">localhost:8000</code> está rodando.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={onRetry}>
              Tentar novamente
            </Button>
          </EmptyContent>
        </Empty>
      </Card>
    )
  }

  if (senders.length === 0) {
    return (
      <Card className="border-border bg-card">
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum remetente encontrado</EmptyTitle>
            <EmptyDescription>
              Execute uma varredura da caixa de entrada para indexar e categorizar seus emails.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  return (
    <Card className="border-border bg-card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-[28%]">Remetente</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Não lidos</TableHead>
              <TableHead>Email mais antigo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(({ category, senders: rows }) => (
              <GroupRows
                key={category}
                category={category}
                rows={rows}
                onDelete={onDelete}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

function GroupRows({
  category,
  rows,
  onDelete,
}: {
  category: string
  rows: Sender[]
  onDelete: (s: Sender) => void
}) {
  return (
    <>
      <TableRow className="border-border bg-secondary/30 hover:bg-secondary/30">
        <TableCell colSpan={6} className="py-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotForCategory(category)}`} aria-hidden="true" />
            {categoryLabel(category)}
            <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
              · {rows.length} remetente{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {rows.map((s) => (
        <TableRow key={s.domain} className="border-border">
          <TableCell>
            <div className="flex flex-col">
              <span className="font-medium leading-tight">{s.display_name || s.domain}</span>
              <span className="text-xs text-muted-foreground font-mono">{s.domain}</span>
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="outline" className={`capitalize ${categoryBadgeClasses(s.ai_category)}`}>
              {categoryLabel(s.ai_category)}
            </Badge>
          </TableCell>
          <TableCell className="text-right tabular-nums">{s.total.toLocaleString("pt-BR")}</TableCell>
          <TableCell className="text-right tabular-nums">
            {s.unread > 0 ? (
              <Badge variant="secondary" className="font-mono">
                {s.unread.toLocaleString("pt-BR")}
              </Badge>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </TableCell>
          <TableCell className="text-muted-foreground text-sm">{formatDate(s.oldest)}</TableCell>
          <TableCell>
            <div className="flex items-center justify-end gap-1.5">
              {s.has_unsubscribe && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <a
                    href={`mailto:unsubscribe@${s.domain}`}
                    aria-label={`Cancelar inscrição de ${s.domain}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Unsubscribe
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-destructive-foreground hover:bg-destructive/15 hover:text-destructive-foreground"
                onClick={() => onDelete(s)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Excluir
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

function dotForCategory(cat: string) {
  switch (cat) {
    case "streaming":
      return "bg-chart-1"
    case "social":
      return "bg-chart-2"
    case "financial":
      return "bg-chart-3"
    case "spam":
      return "bg-destructive"
    default:
      return "bg-muted-foreground"
  }
}
