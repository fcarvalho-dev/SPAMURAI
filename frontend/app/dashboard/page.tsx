"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { DashboardHeader } from "@/components/dashboard/header"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { ScanInbox } from "@/components/dashboard/scan-progress"
import { CategoryTabs } from "@/components/dashboard/category-tabs"
import { SendersTable } from "@/components/dashboard/senders-table"
import { DeleteConfirmDialog } from "@/components/dashboard/delete-confirm-dialog"
import { api } from "@/lib/api"
import type { CategoryFilter, Sender } from "@/lib/types"
import { CATEGORY_FILTERS } from "@/lib/types"

const USER_EMAIL = "you@gmail.com"

export default function DashboardPage() {
  const [category, setCategory] = useState<CategoryFilter>("all")
  const [pendingDelete, setPendingDelete] = useState<Sender | null>(null)

  const sendersQuery = useQuery({
    queryKey: ["senders"],
    queryFn: api.getSenders,
  })

  const senders = sendersQuery.data ?? []

  // Aggregate stats
  const stats = useMemo(() => {
    const totalEmails = senders.reduce((acc, s) => acc + s.total, 0)
    const totalUnread = senders.reduce((acc, s) => acc + s.unread, 0)
    const categories = new Set(senders.map((s) => s.ai_category || "other"))
    return {
      totalEmails,
      totalSenders: senders.length,
      totalUnread,
      totalCategories: categories.size,
    }
  }, [senders])

  // Counts per category for tabs
  const counts = useMemo(() => {
    const c: Partial<Record<CategoryFilter, number>> = { all: senders.length }
    for (const cat of CATEGORY_FILTERS) {
      if (cat === "all") continue
      c[cat] = 0
    }
    for (const s of senders) {
      const key = (s.ai_category || "other") as CategoryFilter
      if (CATEGORY_FILTERS.includes(key)) {
        c[key] = (c[key] ?? 0) + 1
      } else {
        c.other = (c.other ?? 0) + 1
      }
    }
    return c
  }, [senders])

  // Filter senders by category
  const filteredSenders = useMemo(() => {
    if (category === "all") return senders
    if (category === "other") {
      const known = new Set(["streaming", "social", "financial", "spam"])
      return senders.filter((s) => !known.has(s.ai_category) || s.ai_category === "other")
    }
    return senders.filter((s) => s.ai_category === category)
  }, [senders, category])

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userEmail={USER_EMAIL} />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <StatsCards
          totalEmails={stats.totalEmails}
          totalSenders={stats.totalSenders}
          totalUnread={stats.totalUnread}
          totalCategories={stats.totalCategories}
          isLoading={sendersQuery.isLoading}
        />

        <ScanInbox />

        <div className="flex flex-col gap-4">
          <CategoryTabs value={category} onChange={setCategory} counts={counts} />
          <SendersTable
            senders={filteredSenders}
            isLoading={sendersQuery.isLoading}
            isError={sendersQuery.isError}
            onDelete={setPendingDelete}
            onRetry={() => sendersQuery.refetch()}
          />
        </div>
      </main>

      <DeleteConfirmDialog sender={pendingDelete} onClose={() => setPendingDelete(null)} />
    </div>
  )
}
