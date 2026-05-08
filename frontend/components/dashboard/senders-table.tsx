"use client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { categoryBadgeClasses, categoryDotClass, categoryLabel } from "@/lib/categories"
import { useTheme } from "next-themes"

import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "@/components/ui/empty"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  ExternalLink,
  Inbox,
  Paperclip,
  Trash2,
  MailOpen,
  Bell,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { EmailDetailFull, EmailRecord, EmailsPage, Sender } from "@/lib/types"
import { RulesModal } from "./rules-modal"
import { Zap } from "lucide-react"

const PAGE_SIZE = 5

interface SendersTableProps {
  senders: Sender[]
  isLoading: boolean
  isError: boolean
  onDelete: (sender: Sender) => void
  onRetry: () => void
  externalSelectedDomain?: string | null
  onSelectedDomainChange?: (domain: string | null) => void
  onMonitorSubscription?: (domain: string, name?: string) => void
}

function formatDate(iso: string | null | undefined, time = false) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  if (time) {
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function EmailBodySkeleton() {
  return (
    <div className="space-y-2 mt-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

function EmailDetail({ email }: { email: EmailRecord }) {
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${email.message_id}`

  const { data, isLoading, isError } = useQuery<EmailDetailFull>({
    queryKey: ["email", email.message_id],
    queryFn: () => api.getEmail(email.message_id),
    staleTime: 5 * 60_000,
  })

  const subject = data?.subject ?? email.subject
  const senderEmail = data?.sender_email ?? email.sender_email ?? email.sender
  const receivedAt = data?.received_at ?? email.received_at
  const hasAttachment = data?.has_attachment ?? email.has_attachment ?? false

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4 mt-2 space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-0.5">Assunto</p>
        <p className="text-sm font-medium leading-snug">
          {subject || "(sem assunto)"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">De:</span>{" "}
          {senderEmail}
        </span>
        <span>
          <span className="font-medium text-foreground">Data:</span>{" "}
          {formatDate(receivedAt, true)}
        </span>
        {hasAttachment && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Paperclip className="h-3 w-3" aria-hidden="true" />
            📎 Tem anexo
          </Badge>
        )}
      </div>

      {isLoading && <EmailBodySkeleton />}

      {isError && (
        <p className="text-xs text-muted-foreground italic">
          Não foi possível carregar o corpo do email.
        </p>
      )}

      {data && (
        <div className="mt-1">
          {data.body_html ? (
            // Iframe sandboxed — isola HTML do email, sem scripts (segurança XSS)
            <iframe
              srcDoc={data.body_html}
              sandbox="allow-same-origin"
              className="w-full min-h-[400px] border-0 rounded bg-white"
              title={`Corpo do email: ${subject ?? ""}`}
              onLoad={(e) => {
                const iframe = e.target as HTMLIFrameElement
                if (iframe.contentDocument?.body) {
                  iframe.style.height =
                    iframe.contentDocument.body.scrollHeight + 32 + "px"
                }
              }}
            />
          ) : data.body_text ? (
            <pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-sans overflow-x-auto max-h-[500px] overflow-y-auto">
              {data.body_text}
            </pre>
          ) : data.snippet ? (
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              {data.snippet}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Sem conteúdo disponível.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" asChild>
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Abrir no Gmail
          </a>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs text-destructive-foreground border-destructive/40 hover:bg-destructive/10 hover:text-destructive-foreground hover:border-destructive/60"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
          Mover para lixeira
        </Button>
      </div>
    </div>
  )
}

function EmailListRow({
  email,
  isOpen,
  onToggle,
}: {
  email: EmailRecord
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-t border-border/40 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        aria-expanded={isOpen}
      >
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate leading-snug">
            {email.subject || "(sem assunto)"}
          </span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            {formatDate(email.received_at)}
          </span>
        </span>
        {email.has_attachment && (
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-label="Tem anexo" />
        )}
      </button>

      {isOpen && (
        <div className="px-3 pb-3">
          <EmailDetail email={email} />
        </div>
      )}
    </div>
  )
}

function SenderEmailList({ domain }: { domain: string }) {
  const [page, setPage] = useState(1)
  const [openEmailId, setOpenEmailId] = useState<string | null>(null)

  useEffect(() => {
    setOpenEmailId(null)
  }, [page])

  const { data, isLoading, isError } = useQuery<EmailsPage>({
    queryKey: ["emails", domain, page],
    queryFn: () => api.getEmailsByDomain(domain, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    staleTime: 60_000,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 px-3 py-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-xs text-muted-foreground px-3 py-3">
        Não foi possível carregar os emails deste remetente.
      </p>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-3 py-3">
        Nenhum email encontrado para este remetente.
      </p>
    )
  }

  return (
    <div>
      <div className="divide-y-0">
        {data.items.map((email) => (
          <EmailListRow
            key={email.message_id}
            email={email}
            isOpen={openEmailId === email.message_id}
            onToggle={() =>
              setOpenEmailId(openEmailId === email.message_id ? null : email.message_id)
            }
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}

function GroupRows({
  category,
  rows,
  onDelete,
  onCreateRule,
  selectedDomain,
  onToggleDomain,
  onMonitorSubscription,
}: {
  category: string
  rows: Sender[]
  onDelete: (s: Sender) => void
  onCreateRule: (s: Sender) => void
  selectedDomain: string | null
  onToggleDomain: (domain: string) => void
  onMonitorSubscription?: (domain: string, name?: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const queryClient = useQueryClient()
  const [unsubLoading, setUnsubLoading] = useState(false)
  const [markLoading, setMarkLoading] = useState(false)
  return (
    <>
      <TableRow className="border-border bg-primary/10 hover:bg-primary/10">
        <TableCell colSpan={6} className="py-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <span
              className={`inline-block h-2 w-2 rounded-full ${categoryDotClass(category)}`}
              aria-hidden="true"
            />
            {categoryLabel(category)}
            <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
              · {rows.length} remetente{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        </TableCell>
      </TableRow>

      {rows.map((s) => {
        const isExpanded = selectedDomain === s.domain
        return (
          <Fragment key={s.domain}>
            <TableRow
              className={`border-border cursor-pointer transition-colors duration-150 hover:bg-white/5 dark:hover:bg-white/5 ${isExpanded ? "bg-white/5 dark:bg-white/5" : ""}`}
              onClick={() => onToggleDomain(s.domain)}
            >
                <TableCell>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={(e: MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation()
                      onToggleDomain(s.domain)
                    }}
                    aria-expanded={isExpanded}
                  >
                  <ChevronDown
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200"
                    style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      {s.unread > 0 && (
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 animate-pulse ${categoryDotClass(s.ai_category ?? "")}`} />
                      )}
                      <span className={`font-medium leading-tight ${s.unread === 0 ? 'text-muted-foreground' : ''}`}>
                        {s.display_name || s.domain}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {s.domain}
                    </span>
                  </div>
                </button>
              </TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryBadgeClasses(s.ai_category, isDark)}`}>
                  {categoryLabel(s.ai_category)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.total.toLocaleString("pt-BR")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.unread > 0 ? (
                  <Badge variant="secondary" className="font-mono">
                    {s.unread.toLocaleString("pt-BR")}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(s.oldest)}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-44 bg-popover border border-border shadow-lg z-50" align="end">
                      {s.unread > 0 && (
                        <DropdownMenuItem onClick={(e: MouseEvent) => { e.stopPropagation(); (async () => { setMarkLoading(true); try { const res = await api.markRead(s.domain); if (res.ok) { toast.success(`${res.marked} emails marcados como lidos`); queryClient.invalidateQueries({ queryKey: ["senders"] }); } else { toast.error("Falha ao marcar como lido") } } catch (err) { console.error(err); toast.error("Falha ao marcar como lido") } finally { setMarkLoading(false) } })() }} className="gap-2">
                          <MailOpen className="h-4 w-4" /> Marcar como lido
                        </DropdownMenuItem>
                      )}

                      {s.has_unsubscribe && (
                        <DropdownMenuItem onClick={(e: MouseEvent) => { e.stopPropagation(); (async () => { setUnsubLoading(true); try { const res = await api.unsubscribe(s.domain); if (res.ok) { toast.success(`Unsubscribe enviado para ${s.domain}`); queryClient.invalidateQueries({ queryKey: ["senders"] }); } else { toast.error("Falha no unsubscribe") } } catch (err) { console.error(err); toast.error("Falha ao enviar unsubscribe") } finally { setUnsubLoading(false) } })() }} className="gap-2">
                          <ExternalLink className="h-4 w-4" /> Cancelar inscrição
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem onClick={(e: MouseEvent) => { e.stopPropagation(); onMonitorSubscription?.(s.domain, s.display_name) }} className="gap-2">
                        <Bell className="h-4 w-4" /> Monitorar assinatura
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={(e: MouseEvent) => { e.stopPropagation(); onCreateRule(s) }} className="gap-2">
                        <Zap className="h-4 w-4" /> Criar regra
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem onClick={(e: MouseEvent) => { e.stopPropagation(); onDelete(s) }} className="gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4" /> Excluir emails
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>

            {isExpanded && (
              <TableRow className="border-0">
                <TableCell colSpan={6} className="p-0 pb-2">
                  <div className="mx-2 rounded-lg border border-border/40 bg-card shadow-sm">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                      <span className="text-xs font-medium text-muted-foreground">
                        Emails de{" "}
                        <span className="font-mono text-foreground">{s.domain}</span>
                      </span>
                    </div>
                    <SenderEmailList domain={s.domain} />
                  </div>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        )
      })}
    </>
  )
}

export function SendersTable({
  senders,
  isLoading,
  isError,
  onDelete,
  onRetry,
  externalSelectedDomain = null,
  onSelectedDomainChange,
}: SendersTableProps) {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(externalSelectedDomain ?? null)
  const [ruleDialogSender, setRuleDialogSender] = useState<Sender | null>(null)

  useEffect(() => {
    setSelectedDomain(null)
    if (onSelectedDomainChange) onSelectedDomainChange(null)
  }, [senders])

  useEffect(() => {
    if (externalSelectedDomain !== undefined && externalSelectedDomain !== selectedDomain) {
      setSelectedDomain(externalSelectedDomain)
    }
  }, [externalSelectedDomain])

  const groups = useMemo(() => {
    const ORDER = [
      "streaming",
      "social",
      "financial",
      "spam",
      "newsletter",
      "entertainment",
      "ecommerce",
      "transactional",
      "personal",
      "other",
    ]
    const map = new Map<string, Sender[]>()
    for (const s of senders) {
      const key = s.ai_category || "other"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.total - a.total)
    }
    const orderedKeys = [
      ...ORDER.filter((k) => map.has(k)),
      ...[...map.keys()].filter((k) => !ORDER.includes(k)).sort(),
    ]
    return orderedKeys.map((k) => ({ category: k, senders: map.get(k)! }))
  }, [senders])

  function handleToggleDomain(domain: string) {
    const next = selectedDomain === domain ? null : domain
    if (onSelectedDomainChange) onSelectedDomainChange(next)
    else setSelectedDomain(next)
  }

  if (isLoading) {
    return (
      <Card className="glass-card p-0 overflow-hidden">
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
      <Card className="glass-card p-0 overflow-hidden">
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Não foi possível carregar os remetentes</EmptyTitle>
            <EmptyDescription>
              Verifique se a API em{" "}
              <code className="font-mono text-xs">localhost:8000</code> está rodando.
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
      <Card className="glass-card p-0 overflow-hidden">
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum remetente encontrado</EmptyTitle>
            <EmptyDescription>
              Execute uma varredura da caixa de entrada para indexar e categorizar seus
              emails.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  return (
    <Card className="glass-card p-0 overflow-hidden">
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
                onCreateRule={setRuleDialogSender}
                selectedDomain={selectedDomain}
                onToggleDomain={handleToggleDomain}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <RulesModal
        open={ruleDialogSender !== null}
        onOpenChange={(open) => !open && setRuleDialogSender(null)}
        prefillDomain={ruleDialogSender?.domain ?? ""}
      />
    </Card>
  )
}




