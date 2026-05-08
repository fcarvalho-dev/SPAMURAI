"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"

export function ClassifyButton() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: api.classify,
    onSuccess: (data) => {
      toast.success("Classificação concluída", {
        description: `${data.classified} remetentes classificados com IA.`,
      })
      // Recarrega a tabela de remetentes com as novas categorias
      queryClient.invalidateQueries({ queryKey: ["senders"] })
    },
    onError: (err: Error) => {
      toast.error("Falha na classificação", { description: err.message })
    },
  })

  return (
    <Button
      id="classify-ai-btn"
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="gap-2"
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Classificando...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Classificar com IA
        </>
      )}
    </Button>
  )
}
