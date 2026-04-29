const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include', // envia cookie de sessão
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    // Redireciona para login se sessão expirou
    window.location.href = '/';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type Sender = {
  domain: string;
  display_name: string;
  ai_category: string | null;
  total: number;
  unread: number;
  oldest: string | null;
  newest: string | null;
  has_unsubscribe: boolean;
};

export type ScanProgress = {
  status: 'pending' | 'running' | 'done' | 'failed';
  indexed: number;
  total: number;
};

export type BulkDeletePreview = {
  action_id: string;
  affected: number;
  query: string;
  message: string;
};

export type BulkDeleteResult = {
  affected: number;
  executed: boolean;
};

// ─── API calls ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    me: () => apiFetch<{ user_id: string; email: string }>('/auth/me'),
    logout: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    loginUrl: `${API_URL}/auth/login`,
  },

  gmail: {
    getSenders: () => apiFetch<Sender[]>('/gmail/senders'),

    startScan: () => apiFetch<{ scan_job_id: string }>('/gmail/scan', { method: 'POST' }),

    // SSE — retorna EventSource, não usa apiFetch
    scanProgress: (scanJobId: string): EventSource =>
      new EventSource(`${API_URL}/gmail/scan/${scanJobId}/progress`, {
        withCredentials: true,
      }),

    // PASSO 1: preview antes de deletar
    previewDelete: (senderDomain: string, beforeDate?: Date) =>
      apiFetch<BulkDeletePreview>('/gmail/bulk-delete/preview', {
        method: 'POST',
        body: JSON.stringify({
          sender_domain: senderDomain,
          before_date: beforeDate?.toISOString() ?? null,
          dry_run: true,
        }),
      }),

    // PASSO 2: executa após confirmação explícita
    executeDelete: (actionId: string) =>
      apiFetch<BulkDeleteResult>('/gmail/bulk-delete/execute', {
        method: 'POST',
        body: JSON.stringify({ action_id: actionId }),
      }),
  },
};
