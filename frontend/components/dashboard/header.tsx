import { Mail } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function DashboardHeader({ userEmail }: { userEmail: string }) {
  const initials = userEmail.slice(0, 2).toUpperCase()

  return (
    <header className="border-b border-border bg-card/40 backdrop-blur supports-[backdrop-filter]:bg-card/40">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold leading-tight tracking-tight text-balance">Gmail AI Agent</h1>
            <p className="text-xs text-muted-foreground">Inbox triage com inteligência artificial</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
          <Avatar className="h-9 w-9 border border-border">
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
