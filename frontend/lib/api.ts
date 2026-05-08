import type { AuthUser, BulkDeletePreviewResponse, CurrentPlanResponse, EmailDetailFull, EmailsPage, PlanInfo, ScanStartResponse, Sender, Rule, EmailRecord, Subscription, SubscriptionAlert, SubscriptionCreate } from "./types"

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")

    const humanMessages: Record<number, string> = {
      400: "Requisição inválida. Verifique os dados e tente novamente.",
      401: "Sua sessão expirou. Faça login novamente.",
      403: (() => {
        try {
          const parsed = JSON.parse(text) as { detail?: { error?: string; limit?: number } | string }
          const d = parsed.detail
          if (typeof d === "object" && d !== null && d.error === "deletion_limit_reached") {
            return `Limite de ${d.limit ?? 50} exclusões mensais atingido. Renove no próximo mês ou faça upgrade para o Pro.`
          }
          if (typeof d === "string" && (d.includes("plan") || d.includes("upgrade") || d.includes("plano"))) {
            return "Esta função está disponível apenas em planos pagos. Acesse Configurações → Planos."
          }
        } catch {}
        return "Você não tem permissão para realizar esta ação."
      })(),
      404: "Recurso não encontrado.",
      409: "Este item já existe.",
      429: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      500: "Erro interno no servidor. Nossa equipe foi notificada.",
      502: "Serviço temporariamente indisponível. Tente novamente em instantes.",
      503: "Serviço em manutenção. Tente novamente em breve.",
    }

    throw new Error(humanMessages[res.status] ?? `Erro inesperado (${res.status}). Tente novamente.`)
  }
  return (await res.json()) as T
}

export const jsonFetch = apiFetch

export const subscriptionsApi = {
  list: () => jsonFetch<Subscription[]>(`${API_BASE}/subscriptions`),
  alerts: () => jsonFetch<{ alerts: SubscriptionAlert[]; count: number }>(`${API_BASE}/subscriptions/alerts`),
  create: (data: SubscriptionCreate) => jsonFetch(`${API_BASE}/subscriptions`, { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => jsonFetch(`${API_BASE}/subscriptions/${id}`, { method: 'DELETE' }),
  update: (id: number, data: Partial<SubscriptionCreate>) => jsonFetch(`${API_BASE}/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
}

export const api = {
  getMe: () => apiFetch<AuthUser>(`${API_BASE}/auth/me`),
  getPlan: () => apiFetch<CurrentPlanResponse>(`${API_BASE}/plans/current`),
  getAvailablePlans: () => apiFetch<{ plans: PlanInfo[] }>(`${API_BASE}/plans/available`),

  getSenders: () => jsonFetch<Sender[]>(`${API_BASE}/gmail/senders`),
  getTrash: (limit = 50, offset = 0) =>
    jsonFetch<{ items: { message_id: string; subject: string | null; sender: string; date: string | null }[]; total: number; limit: number; offset: number }>(
      `${API_BASE}/gmail/trash?limit=${limit}&offset=${offset}`,
    ).then((r) => ({
      items: r.items.map((it) => ({
        message_id: it.message_id,
        subject: it.subject,
        sender: it.sender,
        received_at: it.date ?? null,
        has_unsubscribe: false,
      } as unknown as EmailRecord)),
      total: r.total,
      limit: r.limit,
      offset: r.offset,
    })),

  restoreEmail: (messageId: string) =>
    jsonFetch<{ ok: boolean; message_id: string }>(
      `${API_BASE}/gmail/restore/${encodeURIComponent(messageId)}`,
      { method: "POST" },
    ),

  emptyTrash: () =>
    jsonFetch<{ ok: boolean; deleted: number }>(`${API_BASE}/gmail/empty-trash`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }),

  getEmailsByDomain: (domain: string, limit = 5, offset = 0) =>
    jsonFetch<EmailsPage>(
      `${API_BASE}/gmail/emails?domain=${encodeURIComponent(domain)}&limit=${limit}&offset=${offset}`,
    ),

  startScan: () =>
    jsonFetch<ScanStartResponse>(`${API_BASE}/gmail/scan`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  previewBulkDelete: (sender_domain: string) =>
    jsonFetch<BulkDeletePreviewResponse>(`${API_BASE}/gmail/bulk-delete/preview`, {
      method: "POST",
      body: JSON.stringify({ sender_domain, dry_run: true }),
    }),

  executeBulkDelete: (action_id: string) =>
    jsonFetch<{ ok?: boolean; message?: string }>(`${API_BASE}/gmail/bulk-delete/execute`, {
      method: "POST",
      body: JSON.stringify({ action_id }),
    }),

  scanProgressUrl: (scanJobId: string) => `${API_BASE}/gmail/scan/${scanJobId}/progress`,

  getEmail: (messageId: string) =>
    jsonFetch<EmailDetailFull>(`${API_BASE}/gmail/email/${encodeURIComponent(messageId)}`),

  classify: () =>
    jsonFetch<{ classified: number }>(`${API_BASE}/gmail/classify`, {
      method: "POST",
    }),

  unsubscribe: (domain: string) =>
    jsonFetch<{ ok: boolean; message?: string }>(`${API_BASE}/gmail/unsubscribe/${encodeURIComponent(domain)}`, {
      method: "POST",
    }),
  markRead: (domain: string) =>
    jsonFetch<{ ok: boolean; marked: number }>(`${API_BASE}/gmail/mark-read/${encodeURIComponent(domain)}`, {
      method: "POST",
    }),

  getRules: () => jsonFetch<Rule[]>(`${API_BASE}/rules`),

  createRule: (rule: { name: string; condition_type: string; condition_value: string; action_type: string; is_active: boolean }) =>
    jsonFetch<{ id: string }>(`${API_BASE}/rules`, {
      method: "POST",
      body: JSON.stringify(rule),
    }),

  deleteRule: (id: string) =>
    jsonFetch<{ status: string }>(`${API_BASE}/rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  toggleRule: (id: string) =>
    jsonFetch<{ status: string; is_active: boolean }>(`${API_BASE}/rules/${encodeURIComponent(id)}/toggle`, {
      method: "PATCH",
    }),
}
