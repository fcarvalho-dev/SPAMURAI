"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { DashboardHeader } from "@/components/dashboard/header"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { RotateCcw } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog"

export default function TrashPage() {
  const queryClient = useQueryClient()
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const meQ = useQuery({ queryKey: ["me"], queryFn: api.getMe, retry: false })

  const trashQ = useQuery({ queryKey: ["trash", limit, offset], queryFn: () => api.getTrash(limit, offset) })

  const restoreMut = useMutation({ mutationFn: (id: string) => api.restoreEmail(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trash"] }) })
  const emptyMut = useMutation({ mutationFn: () => api.emptyTrash(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trash"] }); setConfirmOpen(false) } })

  const items = trashQ.data?.items ?? []
  const total = trashQ.data?.total ?? 0

  return (
    <div
      className="min-h-screen bg-gradient-mesh relative"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="relative z-10">
        <DashboardHeader userEmail={meQ.data?.email ?? ""} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold">Lixeira</h1>
            <p className="text-sm text-muted-foreground">Emails na lixeira do Gmail</p>
          </div>
          <div className="flex items-center gap-2">
            {emptyMut.isPending ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Esvaziando lixeira... isso pode levar alguns minutos</span>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                Esvaziar lixeira
              </Button>
            )}
          </div>
        </div>

        <div className="glass-card p-0 overflow-hidden mt-4">
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Remetente</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.message_id} className="border-border hover:bg-white/5 dark:hover:bg-white/5 transition-colors">
                  <TableCell className="font-mono text-xs">{it.sender}</TableCell>
                  <TableCell>{it.subject}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {it.received_at ? it.received_at : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => restoreMut.mutate(it.message_id)}>
                        <RotateCcw className="h-4 w-4 text-emerald-600" /> Restaurar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">Mostrando {items.length} de {total}</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={offset === 0}>
              ←
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o + limit)} disabled={offset + limit >= total}>
              →
            </Button>
          </div>
          </div>
        </div>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar esvaziamento</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Esta ação é permanente e não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" disabled={emptyMut.isPending} onClick={() => emptyMut.mutate()}>
              {emptyMut.isPending ? "Esvaziando..." : "Esvaziar lixeira"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  )
}
