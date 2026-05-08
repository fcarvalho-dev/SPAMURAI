import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { PlanFeatures } from "@/lib/types"

export function usePlan() {
  const { data } = useQuery({
    queryKey: ['current-plan'],
    queryFn: () => api.getPlan(),
    staleTime: 5 * 60 * 1000,
  })

  return {
    plan: data?.plan ?? 'free',
    features: data?.features ?? {},
    isPro: data?.plan === 'pro' || data?.plan === 'business',
    isBusiness: data?.plan === 'business',
    isFree: !data?.plan || data?.plan === 'free',
    hasFeature: (f: keyof PlanFeatures) => Boolean(data?.features?.[f]),
  }
}
