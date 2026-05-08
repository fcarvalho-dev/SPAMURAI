"use client"
import { Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface Props {
  feature: string
  children: React.ReactNode
  hasAccess: boolean
}

export function UpgradeGate({ feature, children, hasAccess }: Props) {
  const router = useRouter()
  if (hasAccess) return <>{children}</>
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-40 select-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-sm rounded-lg">
        <Lock className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground text-center px-4">
          Disponível no plano Pro
        </p>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => router.push('/dashboard/settings?tab=plans')}
        >
          Ver planos
        </Button>
      </div>
    </div>
  )
}
