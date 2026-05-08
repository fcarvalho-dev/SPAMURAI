"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="h-8 w-16 rounded-full bg-muted animate-pulse" aria-hidden="true" />

  const isDark = theme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-0.5 rounded-full bg-muted p-1 h-8 border border-border/50 transition-all hover:border-border"
      title={isDark ? "Modo claro" : "Modo escuro"}
      aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ${
          !isDark ? "bg-background shadow-sm" : "text-muted-foreground"
        }`}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ${
          isDark ? "bg-background shadow-sm" : "text-muted-foreground"
        }`}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </button>
  )
}
