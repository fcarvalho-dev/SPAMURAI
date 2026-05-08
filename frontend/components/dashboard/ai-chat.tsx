"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MessageSquare, Mic, MicOff, Send, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { API_BASE, api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Sender } from "@/lib/types"
import { usePlan } from "@/lib/hooks/use-plan"
import { UpgradeGate } from "@/components/ui/upgrade-gate"
import { useRouter } from "next/navigation"
import { Lock, MessageCircle } from "lucide-react"

const MAX_HISTORY = 50

function chatKey(email: string): string {
  return email ? `gmail-ai-chat-${email}` : "gmail-ai-chat"
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  actions?: string[]
  suggestions?: string[]
  isSeparator?: boolean
}

interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  actions?: string[]
  suggestions?: string[]
}

function toStored(m: Message): StoredMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
    actions: m.actions,
    suggestions: m.suggestions,
  }
}

function fromStored(m: StoredMessage): Message {
  return { ...m, timestamp: new Date(m.timestamp) }
}

function loadHistory(key: string): Message[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const stored: StoredMessage[] = JSON.parse(raw)
    return stored.slice(-MAX_HISTORY).map(fromStored)
  } catch {
    return []
  }
}

function saveHistory(key: string, messages: Message[]) {
  // Never persist separator or welcome — only real conversation turns
  const toSave = messages
    .filter((m) => !m.isSeparator && m.id !== "welcome")
    .slice(-MAX_HISTORY)
    .map(toStored)
  try {
    if (toSave.length === 0) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(toSave))
    }
  } catch {
    // quota exceeded — ignore
  }
}

function buildWelcomeMessage(senders: Sender[]): Message {
  const spamCount = senders.filter((s) => s.ai_category === "spam").length
  const newsletterCount = senders.filter((s) => s.ai_category === "newsletter").length

  const KENZO_GREETING = "Olá! Sou o **Kenzo**, seu assistente de inbox. 👋\n\nPosso te ajudar a organizar seus emails, criar regras automáticas, monitorar assinaturas e muito mais.\n\nO que posso fazer pelo seu inbox hoje?"

  const suggestions = [
    spamCount > 0 ? `Excluir ${spamCount} remetentes de spam` : null,
    newsletterCount > 0 ? `Ver newsletters (${newsletterCount} remetentes)` : null,
    "Resumo da minha caixa de entrada",
    "Buscar emails de um remetente",
  ].filter(Boolean) as string[]

  return { id: "welcome", role: "assistant", content: KENZO_GREETING, timestamp: new Date(), suggestions }
}

function renderMarkdown(text: string) {
  const lines = text.split("\n")
  const result: React.ReactNode[] = []
  lines.forEach((line, i) => {
    if (/^[-*]\s/.test(line)) {
      result.push(
        <li key={i} className="ml-4 list-disc">
          {renderInline(line.replace(/^[-*]\s/, ""))}
        </li>,
      )
      return
    }
    if (line.trim() === "") {
      result.push(<br key={i} />)
      return
    }
    result.push(<p key={i}>{renderInline(line)}</p>)
  })
  return <>{result}</>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <span className="text-[10px] font-bold">K</span>
      </div>
      <div className="glass rounded-2xl rounded-bl-sm px-3 py-2">
        <span className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

function MessageBubble({
  msg,
  showSuggestions,
  onSuggestion,
}: {
  msg: Message
  showSuggestions: boolean
  onSuggestion: (text: string) => void
}) {
  if (msg.isSeparator) {
    return (
      <div className="flex items-center gap-3 py-1" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <span className="select-none whitespace-nowrap text-[10px] text-muted-foreground/50">
          conversa anterior · {msg.content}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    )
  }

  const isUser = msg.role === "user"

  return (
    <div className={cn("flex items-end gap-2", isUser && "flex-row-reverse")}>
      {isUser ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm select-none">
          👤
        </span>
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground select-none">
          <span className="text-[10px] font-bold">K</span>
        </div>
      )}

      <div className={cn("flex flex-col gap-1 max-w-[80%]", isUser && "items-end")}>
        <div
          className={cn(
            "px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm max-w-[85%] ml-auto shadow-sm shadow-primary/20"
              : "glass rounded-2xl rounded-tl-sm max-w-[85%]",
          )}
        >
          {isUser ? msg.content : renderMarkdown(msg.content)}
        </div>

        {showSuggestions && msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-1 w-full">
            {msg.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className="text-left text-xs rounded-full border border-border bg-background px-3 py-1.5 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {msg.actions && msg.actions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {msg.actions.map((action) => (
              <Badge key={action} variant="secondary" className="text-xs">
                {action}
              </Badge>
            ))}
          </div>
        )}

        <span className="text-[10px] text-muted-foreground/60 px-1">
          {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  )
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

interface AiChatProps {
  senders: Sender[]
  userEmail: string
  onFilterCategory?: (category: string) => void
  onFilterDomain?: (domain: string) => void
}

export function AiChat({ senders, userEmail, onFilterCategory, onFilterDomain }: AiChatProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { hasFeature } = usePlan()

  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const speechSupported =
    typeof window !== "undefined" &&
    (window.SpeechRecognition !== undefined || window.webkitSpeechRecognition !== undefined)

  const key = chatKey(userEmail)

  useEffect(() => {
    if (!userEmail) return
    const history = loadHistory(key)
    if (history.length > 0) {
      const lastDate = history[history.length - 1].timestamp
      const sep: Message = {
        id: "separator",
        role: "assistant",
        content: lastDate.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        timestamp: lastDate,
        isSeparator: true,
      }
      setMessages([sep, ...history])
    }
    setHistoryLoaded(true)
  }, [userEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show welcome when there's no loaded history and no conversation yet
  useEffect(() => {
    if (!historyLoaded) return
    if (messages.some((m) => m.role === "user")) return
    if (messages.some((m) => m.isSeparator)) return
    setMessages([buildWelcomeMessage(senders ?? [])])
  }, [historyLoaded, senders?.length ?? 0]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!historyLoaded || !userEmail) return
    saveHistory(key, messages)
  }, [messages, historyLoaded, key])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [isOpen])

  const hasUserMessage = messages.some((m) => m.role === "user")

  function clearConversation() {
    if (!window.confirm("Limpar histórico da conversa?")) return
    localStorage.removeItem(key)
    setMessages([buildWelcomeMessage(senders ?? [])])
  }

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = "pt-BR"
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript
      setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    rec.onend = () => setIsRecording(false)
    rec.onerror = () => setIsRecording(false)
    recognitionRef.current = rec
    rec.start()
    setIsRecording(true)
  }

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? inputText).trim()
    if (!text || isLoading) return

    if (!hasFeature('kenzo_chat')) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '🔒 O chat com o Kenzo está disponível nos planos Pro e Business. [Fazer upgrade](/dashboard/settings?tab=plans)',
        timestamp: new Date()
      }])
      if (!textOverride) setInputText("")
      return
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textOverride) setInputText("")
    setIsLoading(true)

    const history = messages
      .filter((m) => !m.isSeparator)
      .map(({ role, content }) => ({ role, content }))

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      })

      if (!res.ok) throw new Error(`${res.status}`)

      const data = (await res.json()) as {
        response: string
        actions_taken: string[]
        filter_action?: { type: string; value: string } | null
      }

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        actions: data.actions_taken?.length ? data.actions_taken : undefined,
      }

      setMessages((prev) => [...prev, aiMsg])

      if (data.actions_taken?.length) {
        await queryClient.invalidateQueries({ queryKey: ["senders"] })
      }

      if (data.filter_action) {
        const fa = data.filter_action
        if (fa.type === "category" && onFilterCategory) onFilterCategory(fa.value)
        if (fa.type === "domain" && onFilterDomain) onFilterDomain(fa.value)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Erro ao conectar com a IA. Verifique se o servidor está rodando.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  return (
    <>
    {isOpen && (
        <div className="fixed bottom-24 right-6 w-[420px] h-[600px] flex flex-col overflow-hidden rounded-2xl border border-border shadow-2xl z-50 bg-background">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/10">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground">K</span>
              </div>
              <span className="font-semibold text-sm">Kenzo</span>
              <span className="text-xs text-muted-foreground">· Assistente Spamurai</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={clearConversation}
                aria-label="Limpar conversa"
                title="Limpar conversa"
                type="button"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setIsOpen(false)}
                aria-label="Fechar chat"
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                showSuggestions={!hasUserMessage}
                onSuggestion={(text) => void sendMessage(text)}
              />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2 rounded-xl border border-border/50 px-3 py-2 bg-muted/50">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte ao Kenzo sobre seu inbox..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 max-h-32 overflow-y-auto leading-5"
                style={{ minHeight: "20px" }}
                aria-label="Mensagem para a IA"
              />
              <div className="flex items-center gap-1 shrink-0">
                {speechSupported && (
                  <UpgradeGate feature="voice_stt" hasAccess={hasFeature('voice_stt')}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 w-7 p-0 transition-colors",
                        isRecording
                          ? "text-destructive hover:text-destructive"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={toggleRecording}
                      aria-label={isRecording ? "Parar gravação" : "Gravar mensagem de voz"}
                      type="button"
                    >
                      {isRecording ? (
                        <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </UpgradeGate>
                )}
                <Button
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => void sendMessage()}
                  disabled={!inputText.trim() || isLoading}
                  aria-label="Enviar mensagem"
                  type="button"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
              Enter para enviar · Shift+Enter para nova linha
            </p>
          </div>
        </div>
      )}

      {hasFeature('kenzo_chat') ? (
        <button
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer z-50"
          onClick={() => setIsOpen((o) => !o)}
          aria-label={isOpen ? "Fechar chat" : "Abrir chat com IA"}
          aria-expanded={isOpen}
          type="button"
        >
          {isOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
      ) : (
        <button
          onClick={() => router.push("/dashboard/settings?tab=plans")}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 h-14 rounded-full bg-primary/20 text-primary border-2 border-primary/40 shadow-lg hover:bg-primary/30 hover:scale-105 transition-all duration-200 cursor-pointer z-50 backdrop-blur-sm"
          title="Kenzo — Disponível no Pro"
          type="button"
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <MessageCircle className="h-5 w-5" />
              <Lock className="h-3 w-3 absolute -top-1 -right-1 text-primary" />
            </div>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-xs font-bold">Kenzo IA</span>
              <span className="text-[10px] opacity-70">Upgrade para Pro</span>
            </div>
          </div>
        </button>
      )}
    </>
  )
}

