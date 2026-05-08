"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useEffect, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"

const DARK_THEMES = ["dark-indigo", "dark-midnight", "neon-cyber"]

function ThemeInitializer() {
  const { setTheme } = useTheme()

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("spamurai-theme") ?? "dark-indigo"
      document.documentElement.setAttribute("data-theme", savedTheme)
      setTheme(DARK_THEMES.includes(savedTheme) ? "dark" : "light")
    } catch {
      // localStorage indisponível (iframe restritivo ou SSR)
    }
  }, [setTheme])

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <ThemeInitializer />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
