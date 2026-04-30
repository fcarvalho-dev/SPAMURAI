"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CATEGORY_FILTERS, type CategoryFilter } from "@/lib/types"
import { categoryLabel } from "@/lib/categories"

interface CategoryTabsProps {
  value: CategoryFilter
  onChange: (value: CategoryFilter) => void
  counts: Partial<Record<CategoryFilter, number>>
}

export function CategoryTabs({ value, onChange, counts }: CategoryTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as CategoryFilter)}>
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-secondary/50 p-1">
        {CATEGORY_FILTERS.map((cat) => {
          const count = counts[cat] ?? 0
          return (
            <TabsTrigger
              key={cat}
              value={cat}
              className="gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <span>{categoryLabel(cat)}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {count}
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
