"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { Loader2, Trash2, Zap } from "lucide-react"
import { Rule } from "@/lib/types"

interface RulesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefillDomain?: string
}

export function RulesModal({ open, onOpenChange, prefillDomain = "" }: RulesModalProps) {
  const [name, setName] = useState("")
  const [conditionType, setConditionType] = useState("domain")
  const [conditionValue, setConditionValue] = useState("")
  const [actionType, setActionType] = useState("trash")
  const [isActive, setIsActive] = useState(true)

  const queryClient = useQueryClient()

  // Sincroniza prefillDomain
  useEffect(() => {
    if (open && prefillDomain) {
      setName(`Limpar ${prefillDomain}`)
      setConditionType("domain")
      setConditionValue(prefillDomain)
    } else if (open && !prefillDomain) {
      setName("")
      setConditionValue("")
      setConditionType("domain")
    }
  }, [open, prefillDomain])

  const { data: rules = [], isLoading: isLoadingRules } = useQuery({
    queryKey: ["rules"],
    queryFn: () => api.getRules(),
    enabled: open,
  })

  const createRuleMutation = useMutation({
    mutationFn: () =>
      api.createRule({
        name,
        condition_type: conditionType,
        condition_value: conditionValue,
        action_type: actionType,
        is_active: isActive,
      }),
    onSuccess: () => {
      toast.success("Regra criada com sucesso!")
      queryClient.invalidateQueries({ queryKey: ["rules"] })
      // Reset form
      setName("")
      setConditionValue("")
    },
    onError: () => {
      toast.error("Erro ao criar regra.")
    },
  })

  const toggleRuleMutation = useMutation({
    mutationFn: (id: string) => api.toggleRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
    },
    onError: () => {
      toast.error("Erro ao alterar status da regra.")
    },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.deleteRule(id),
    onSuccess: () => {
      toast.success("Regra deletada com sucesso!")
      queryClient.invalidateQueries({ queryKey: ["rules"] })
    },
    onError: () => {
      toast.error("Erro ao deletar regra.")
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Regras Automáticas
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Formulário de Criação */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-semibold text-sm">Criar nova regra</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="ruleName">Nome da regra</Label>
                <Input
                  id="ruleName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Limpar spam diariamente"
                />
              </div>

              <div className="space-y-2">
                <Label>Quando emails de</Label>
                <Select value={conditionType} onValueChange={setConditionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domain">Domínio específico</SelectItem>
                    <SelectItem value="category">Categoria</SelectItem>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Forem iguais a</Label>
                <Input
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  placeholder={
                    conditionType === "domain" ? "ex: newsletter.com" :
                    conditionType === "category" ? "ex: spam" : "ex: promoção"
                  }
                />
              </div>

              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label>Fazer</Label>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trash">Mover para lixeira</SelectItem>
                    <SelectItem value="mark_read">Marcar como lido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between sm:justify-start gap-4 col-span-2 sm:col-span-1 mt-6">
                <div className="flex items-center space-x-2">
                  <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
                  <Label htmlFor="isActive">Ativa</Label>
                </div>
                
                <Button
                  onClick={() => createRuleMutation.mutate()}
                  disabled={createRuleMutation.isPending || !name || !conditionValue}
                  className="ml-auto"
                >
                  {createRuleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar regra
                </Button>
              </div>
            </div>
          </div>

          {/* Lista de Regras */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Regras existentes</h3>
            
            {isLoadingRules ? (
              <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : rules.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">Nenhuma regra criada ainda.</p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule: Rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                    <div className="flex flex-col gap-1 overflow-hidden">
                      <span className="font-medium truncate">{rule.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        Se {rule.condition_type} = <strong>{rule.condition_value}</strong> → {rule.action_type === 'trash' ? 'Lixeira' : 'Ler'}
                      </span>
                      {rule.last_run_at && (
                        <span className="text-xs text-muted-foreground">Última execução: {new Date(rule.last_run_at).toLocaleString('pt-BR')}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <Switch 
                        checked={rule.is_active} 
                        onCheckedChange={() => toggleRuleMutation.mutate(rule.id)}
                        disabled={toggleRuleMutation.isPending}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja deletar esta regra?")) {
                            deleteRuleMutation.mutate(rule.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
