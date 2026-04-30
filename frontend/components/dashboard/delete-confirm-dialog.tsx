"use client"

import { useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Sender } from "@/lib/types"

interface DeleteConfirmDialogProps {
  sender: Sender | null
  onClose: () => void
}

export function DeleteConfirmDialog({ sender, onClose }: DeleteConfirmDialogProps) {
  const queryClient = useQueryClient()
  const open = sender !== null

  const previewMutation = useMutation({
    mutationFn: (domain: string) => api.previewBulkDelete(domain),
    onError: (err: Error) => {
      toast.error("Não foi possível preparar a exclusão", { description: err.message })
      onClose()
    },
  })

  const executeMutation = useMutation({
    mutationFn: (action_id: string) => api.executeBulkDelete(action_id),
    onSuccess: () => {
      toast.success("Emails movidos para a lixeira")
      queryClient.invalidateQueries({ queryKey: ["senders"] })
      onClose()
    },
    onError: (err: Error) => {
      toast.error("Falha ao excluir", { description: err.message })
    },
  })

  // When the dialog opens for a sender, kick off preview to fetch action_id + affected count
  useEffect(() => {
    if (sender && !previewMutation.isPending && !previewMutation.data) {
      previewMutation.mutate(sender.domain)
    }
    // Reset on close
    if (!sender) {
      previewMutation.reset()
      executeMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sender])

  const affected = previewMutation.data?.affected ?? sender?.total ?? 0
  const message = previewMutation.data?.message
  const isLoadingPreview = previewMutation.isPending
  const isExecuting = executeMutation.isPending

  const handleConfirm = () => {
    const actionId = previewMutation.data?.action_id
    if (!actionId) return
    executeMutation.mutate(actionId)
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isExecuting) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/15 text-destructive-foreground">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2 text-pretty">
            {isLoadingPreview ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-3.5 w-3.5" /> Calculando emails afetados...
              </span>
            ) : (
              <>
                Isso vai mover{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {affected.toLocaleString("pt-BR")}
                </span>{" "}
                email{affected === 1 ? "" : "s"} de{" "}
                <span className="font-semibold text-foreground">{sender?.domain}</span> para a lixeira. Confirmar?
              </>
            )}
          </AlertDialogDescription>
          {message && !isLoadingPreview && (
            <p className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {message}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isExecuting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={isLoadingPreview || isExecuting || !previewMutation.data?.action_id}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isExecuting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Excluindo...
              </span>
            ) : (
              "Mover para lixeira"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
