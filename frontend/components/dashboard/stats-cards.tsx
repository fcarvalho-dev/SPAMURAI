import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Inbox, Users, MailOpen, Tag } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface StatItem {
  label: string
  value: number | string
  icon: LucideIcon
}

interface StatsCardsProps {
  totalEmails: number
  totalSenders: number
  totalUnread: number
  totalCategories: number
  isLoading?: boolean
}

export function StatsCards({
  totalEmails,
  totalSenders,
  totalUnread,
  totalCategories,
  isLoading,
}: StatsCardsProps) {
  const items: StatItem[] = [
    { label: "Emails totais", value: totalEmails.toLocaleString("pt-BR"), icon: Inbox },
    { label: "Remetentes", value: totalSenders.toLocaleString("pt-BR"), icon: Users },
    { label: "Não lidos", value: totalUnread.toLocaleString("pt-BR"), icon: MailOpen },
    { label: "Categorias", value: totalCategories.toLocaleString("pt-BR"), icon: Tag },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {items.map(({ label, value, icon: Icon }) => (
        <Card key={label} className="border-border bg-card">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
              )}
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
