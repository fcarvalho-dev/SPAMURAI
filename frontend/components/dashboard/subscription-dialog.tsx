"use client"

import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { subscriptionsApi } from "@/lib/api"
import type { SubscriptionCreate } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefillDomain?: string | null
  prefillName?: string | null
}

export function SubscriptionDialog({ open, onOpenChange, prefillDomain = null, prefillName = null }: Props) {
  const qc = useQueryClient()
  const [domain, setDomain] = useState(prefillDomain ?? "")
  const [displayName, setDisplayName] = useState(prefillName ?? "")
  const [renewalDate, setRenewalDate] = useState("")
  const [alertDaysBefore, setAlertDaysBefore] = useState<number>(7)

  useEffect(() => {
    if (open) {
      setDomain(prefillDomain ?? "")
      setDisplayName(prefillName ?? "")
    }
  }, [open, prefillDomain, prefillName])

  const createMut = useMutation({
    mutationFn: (data: SubscriptionCreate) => subscriptionsApi.create(data),
    onSuccess: () => {
      toast.success("Assinatura criada")
      qc.invalidateQueries({ queryKey: ["subscription-alerts"] })
      qc.invalidateQueries({ queryKey: ["subscriptions"] })
      onOpenChange(false)
    },
    onError: (err: any) => {
      console.error(err)
      toast.error("Falha ao criar assinatura")
    },
  })

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!domain || !renewalDate) {
      toast.error("Preencha domínio e data de renovação")
      return
    }
    createMut.mutate({ domain, display_name: displayName || undefined, renewal_date: renewalDate, alert_days_before: alertDaysBefore })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monitorar assinatura</DialogTitle>
          <DialogDescription>Crie uma assinatura para receber alertas sobre renovações ou expirations.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div>
            <Label htmlFor="domain">Domínio</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain((e.target as HTMLInputElement).value)} placeholder="ex: netflix.com" />
          </div>

          <div>
            <Label htmlFor="displayName">Nome (opcional)</Label>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName((e.target as HTMLInputElement).value)} placeholder="Netflix" />
          </div>

          <div>
            <Label htmlFor="renewal">Data de renovação</Label>
            <Input id="renewal" type="date" value={renewalDate} onChange={(e) => setRenewalDate((e.target as HTMLInputElement).value)} />
          </div>

          <div>
            <Label htmlFor="alertDays">Alertar X dias antes</Label>
            <Input id="alertDays" type="number" value={String(alertDaysBefore)} onChange={(e) => setAlertDaysBefore(Number((e.target as HTMLInputElement).value))} />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "Salvando..." : "Salvar assinatura"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default SubscriptionDialog
