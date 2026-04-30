import type { BulkDeletePreviewResponse, ScanStartResponse, Sender } from "./types"

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`)
  }
  return (await res.json()) as T
}

export const api = {
  getSenders: () => jsonFetch<Sender[]>(`${API_BASE}/gmail/senders`),

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
}
