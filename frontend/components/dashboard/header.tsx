"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, LogOut, Settings, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "./theme-toggle"
import { API_BASE, api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { AuthUser } from "@/lib/types"

function SpamuraiLogo() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-0 hover:opacity-80 transition-opacity shrink-0"
    >
      <span className="font-black text-xl italic tracking-tight">SP</span>
      <svg
        width="24"
        height="27"
        viewBox="0 0 98 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="mx-1 text-foreground"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M2.88353 0.091847C2.61308 0.268584 2.05311 1.5362 1.63925 2.90916C-0.606129 10.3606 -0.537969 21.2908 1.80174 28.932C4.11201 36.4768 11.3667 46.1564 18.2223 50.8399C19.4218 51.6597 20.526 52.46 20.6759 52.6188C20.8259 52.7775 21.3166 53.0626 21.7665 53.2514C22.2163 53.4401 23.3205 54.0382 24.2201 54.5804C26.0838 55.7032 27.4464 56.2983 31.3085 57.6758C41.8179 61.4237 54.107 61.6269 64.842 58.2299C67.4331 57.4102 74.1944 54.5694 74.6567 54.1066C75.2102 53.5519 78.4414 51.5868 78.7991 51.5868C79.1628 51.5868 87.4758 43.8962 88.5772 42.5418C91.592 38.8328 94.8516 32.5556 96.5833 27.1232C97.8445 23.1666 98.4366 13.0391 97.634 9.14989C96.3772 3.05893 95.8003 0.884671 95.2937 0.323505C94.7278 -0.303564 90.7817 1.04543 84.1988 4.11637C82.3994 4.95562 80.6819 5.65258 80.382 5.66457C80.0821 5.67705 79.3662 6.01255 78.7915 6.41096C77.774 7.11592 77.7729 7.1853 78.7347 9.01608C79.2789 10.051 79.9403 11.2343 80.2048 11.6462C80.4697 12.0581 80.8269 12.776 80.9987 13.2413C81.2228 13.8479 81.5652 13.9642 82.2097 13.6512C84.4856 12.5473 88.1525 11.1469 88.767 11.1469C89.6132 11.1469 89.3232 20.5769 88.3597 24.3773C87.2283 28.8406 83.7152 35.7449 81.4823 37.8937C80.816 38.5347 79.3307 38.02 75.7963 35.9241C72.6633 34.0668 67.0018 31.7518 64.5705 31.3339C63.5138 31.1527 62.5143 30.8047 62.3502 30.5616C62.1861 30.3179 61.3398 30.1187 60.4696 30.1187C58.7597 30.1187 58.9669 30.5181 56.8453 23.1291C56.4118 21.6189 55.7258 19.2599 55.3213 17.8869C54.9167 16.5139 54.4178 14.4959 54.2127 13.4026C53.5268 9.743 53.2918 9.59073 48.5971 9.75349L44.4101 9.89877L44.0158 11.6462C42.1139 20.0787 39.1537 29.6804 38.3969 29.8736C30.7534 31.8257 23.7032 34.5976 19.0843 37.4678L17.1426 38.674L15.8684 37.2671C14.4643 35.7174 11.3951 30.1337 10.0183 26.6239C8.88304 23.7302 8.208 11.1469 9.18784 11.1469C9.54553 11.1469 11.1824 11.7291 12.8253 12.441C15.9856 13.8095 17.4044 13.7575 17.4044 12.2722C17.4044 11.7755 17.7223 10.9258 18.1105 10.3846C18.4993 9.84286 19.093 8.80989 19.4306 8.08996C20.1165 6.62664 20.4726 6.88875 14.4054 4.38596C12.6061 3.64357 10.1524 2.60062 8.95283 2.06841C4.87592 0.259097 3.3759 -0.229176 2.88353 0.091847ZM49.7525 29.245C49.9199 29.8631 50.4265 31.7163 50.8779 33.3639C51.9761 37.37 53.2236 41.9726 54.1598 45.4709C54.583 47.0501 55.1931 49.1165 55.5165 50.0636C55.9396 51.3032 55.9369 51.8799 55.5077 52.123C53.7389 53.124 42.9089 53.116 42.2317 52.113C41.9869 51.7496 42.9051 47.7575 44.3631 42.8498C45.9182 37.6146 46.8981 33.9465 47.5311 30.9924C48.1604 28.0578 49.2067 27.2345 49.7525 29.245ZM35.5926 41.9761C35.1542 43.5553 34.5675 45.8169 34.2884 47.0021C33.4656 50.4999 33.7338 50.4994 27.2169 47.0261C25.1536 45.9267 23.9475 44.9167 23.9475 44.2882C23.9475 43.5488 33.5915 39.1054 35.1973 39.1054C36.3783 39.1054 36.3822 39.1333 35.5926 41.9761ZM67.6927 40.8383C72.3094 42.8563 74.6333 44.4195 73.8323 44.9682C72.4435 45.9197 68.6305 48.104 66.7308 49.0361L64.6376 50.0636L63.9315 48.2043C63.5432 47.1814 62.9822 45.2213 62.685 43.8483C62.3884 42.4754 61.9871 40.8468 61.794 40.2287C61.281 38.5851 62.926 38.7549 67.6927 40.8383ZM2.13707 53.7122V57.9019L5.27232 59.1965C10.3351 61.2869 14.4621 62.9819 17.8133 64.3464C22.8668 66.4043 22.9573 66.4412 26.9464 68.0783C29.0457 68.9395 31.8674 70.0938 33.2169 70.6435C34.5664 71.1927 36.8974 72.1612 38.3969 72.7953C44.0055 75.1678 47.9422 76.5497 49.0895 76.5497C49.7405 76.5497 51.4041 76.0724 52.7863 75.4888C54.1691 74.9052 56.2815 74.0295 57.481 73.5427C62.679 71.4323 66.4222 69.8901 69.4768 68.601C71.2761 67.8417 74.2205 66.6794 76.0199 66.0189C77.8192 65.3579 79.3732 64.6489 79.473 64.4427C79.5734 64.2365 79.895 64.0683 80.1884 64.0683C80.4817 64.0683 81.9949 63.5191 83.551 62.8481C85.1067 62.1766 88.3428 60.8635 90.7419 59.9294L95.104 58.2314L95.261 53.9523C95.4164 49.7156 95.4055 49.6762 94.1705 49.9532C93.484 50.1075 92.6776 50.4021 92.3777 50.6083C92.0778 50.8145 90.2375 51.5918 88.2882 52.3362C84.8689 53.6413 82.8095 54.481 75.202 57.6728C73.2527 58.4906 70.9217 59.4621 70.022 59.8321C69.1223 60.2015 66.7128 61.1935 64.6676 62.0363C62.6223 62.8795 60.8655 63.569 60.763 63.569C60.516 63.569 52.2907 66.9844 51.0819 67.589C49.8872 68.1861 47.5535 68.2036 47.1582 67.6185C46.9935 67.3743 46.1996 67.0229 45.3931 66.8376C44.0458 66.5281 41.2045 65.3998 34.0348 62.3284C32.5354 61.6858 30.2044 60.7163 28.8548 60.1736C27.5053 59.6309 24.7441 58.4881 22.719 57.6338C20.6939 56.7791 18.9295 56.0801 18.7981 56.0801C18.6667 56.0801 16.3978 55.1615 13.756 54.0387C0.886785 48.5683 2.13707 48.6032 2.13707 53.7122ZM8.92067 67.4383C8.74182 68.1931 8.37595 69.2605 8.10713 69.8097C7.25217 71.5601 7.26525 73.643 8.13494 74.0769C8.58478 74.3016 10.5477 75.1383 12.497 75.9366C14.4463 76.7349 17.081 77.8173 18.3526 78.3415C20.1896 79.0999 20.6645 79.5567 20.6699 80.5687C20.6792 82.4989 19.8242 83.0136 17.6328 82.398C16.6072 82.1099 15.7686 81.6871 15.7686 81.4584C15.7686 81.2298 15.5096 81.043 15.1933 81.043C14.5319 81.043 10.2107 79.3645 7.99753 78.2477C6.33939 77.4109 5.41299 77.6621 5.40045 78.9506C5.39609 79.415 5.0384 80.6936 4.60655 81.7919C3.4626 84.6996 3.5782 85.2163 5.54495 85.9867C7.87049 86.8978 13.8035 89.3547 16.7228 90.6158C18.6765 91.4596 19.0402 91.847 19.0402 93.0856C19.0402 95.7931 18.7272 95.7237 5.25161 90.0102C3.81539 89.4011 2.57819 88.9882 2.50186 89.0921C2.27666 89.3991 0.917326 94.1615 0.644696 95.5969C0.44404 96.6533 0.65233 96.9943 1.67415 97.2864C2.37862 97.4876 4.42717 98.2749 6.22653 99.0358C8.02589 99.7967 10.9703 101.024 12.7697 101.763C18.623 104.167 22.0096 105.608 23.5762 106.362C24.4219 106.769 25.2441 106.982 25.4039 106.836C25.7572 106.512 26.4601 101.961 27.1896 95.2719C27.489 92.526 28.001 88.7067 28.3276 86.7845C28.6542 84.8624 29.1024 81.3022 29.3238 78.8733L29.7267 74.4568L26.1553 72.9775C24.1912 72.1637 21.1121 70.8562 19.3128 70.0713C17.5134 69.287 15.0597 68.2705 13.8602 67.8127C12.6606 67.3544 11.2533 66.7742 10.7326 66.5226C9.3765 65.8676 9.28163 65.9155 8.92067 67.4383ZM85.8346 67.0778C82.5281 68.4617 76.3181 71.0214 73.5662 72.1348C68.371 74.2367 68.3803 74.2272 68.4435 77.1458C68.4751 78.6027 68.9032 82.8279 69.3955 86.5349C69.8879 90.2419 70.6458 96.1716 71.0798 99.7123C71.5144 103.253 72.0744 106.337 72.3241 106.566C72.5738 106.795 74.2162 106.327 75.9735 105.528C77.7309 104.728 79.9327 103.794 80.8662 103.454C82.515 102.852 86.7015 101.142 92.4791 98.7093C94.0342 98.0543 95.538 97.5186 95.8199 97.5186C96.9562 97.5186 97.5337 96.192 97.0326 94.7342C96.7567 93.9319 96.2638 92.3283 95.9377 91.171C95.2872 88.8629 95.1743 88.8539 90.7419 90.7596C89.8422 91.146 87.1917 92.2833 84.852 93.2858C82.5123 94.2889 80.2429 94.9843 79.8084 94.832C79.3689 94.6773 79.0188 93.9089 79.0188 93.0981C79.0188 91.3118 79.593 90.9593 87.6405 87.802L93.8085 85.3826L93.4578 83.3376C92.9709 80.4944 92.1182 77.5482 91.7817 77.5482C91.6269 77.5482 90.4704 77.9771 89.2125 78.5013C77.5444 83.3641 77.401 83.3886 77.3983 80.5438C77.3978 79.4998 77.9534 79.06 80.798 77.8533C82.6683 77.0599 85.1263 75.9925 86.2604 75.4818C87.394 74.9706 88.5772 74.5527 88.8891 74.5527C89.9251 74.5527 90.9371 73.2491 90.4557 72.5357C90.2032 72.1612 89.8357 70.7878 89.6399 69.4842C89.1688 66.3474 88.5358 65.9475 85.8346 67.0778ZM32.4699 95.4267C32.3456 95.6164 32.1564 97.4332 32.049 99.4642L31.8538 103.158L33.5942 104.056C34.5512 104.55 36.6368 105.447 38.229 106.049C39.8206 106.651 42.6576 107.787 44.5327 108.572C46.4079 109.357 48.4226 110 49.0104 110C50.0099 110 52.9537 108.845 62.4931 104.709L66.414 103.009L66.0912 99.3898C65.775 95.847 65.1714 94.6913 64.0427 95.4661C63.7324 95.6788 61.2706 96.7038 58.5715 97.7432C55.8725 98.7827 53.4188 99.8017 53.1189 100.008C52.819 100.215 51.6904 100.644 50.6102 100.962C48.9531 101.451 48.2727 101.394 46.2481 100.598C40.7502 98.4387 38.3473 97.4581 37.5005 97.0308C35.4269 95.9828 32.6793 95.1071 32.4699 95.4267Z"
          fill="currentColor"
        />
      </svg>
      <span className="font-black text-xl italic tracking-tight">MURAI</span>
    </Link>
  )
}

function UserAvatar({ authUser, email }: { authUser: AuthUser | undefined; email: string }) {
  if (authUser?.picture_url) {
    return (
      <img
        src={authUser.picture_url}
        alt={email}
        className="h-8 w-8 rounded-full object-cover ring-2 ring-border"
        referrerPolicy="no-referrer"
      />
    )
  }
  const initials = email ? email.slice(0, 2).toUpperCase() : "??"
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
      {initials}
    </div>
  )
}

export function DashboardHeader({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const pathname = usePathname()

  const { data: trashData } = useQuery({
    queryKey: ["trashCount"],
    queryFn: () => api.getTrash(1, 0).then((r) => ({ total: r.total })),
  })
  const trashTotal = trashData?.total ?? 0

  const { data: authUser } = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    retry: false,
  })

  const displayEmail = authUser?.email ?? userEmail

  async function handleLogout() {
    await fetch(`${API_BASE}/auth/logout`, { method: "GET", credentials: "include" }).catch(() => {})
    router.push("/")
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-white border-gray-200 dark:bg-background/80 dark:backdrop-blur-xl dark:border-border/50">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <SpamuraiLogo />

        <nav className="flex items-center gap-1" aria-label="Navegação principal">
          <Link
            href="/dashboard"
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              pathname === "/dashboard"
                ? "text-foreground bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/settings?tab=plans"
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              pathname?.includes("plans")
                ? "text-foreground bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            Planos
          </Link>
          <Link
            href="/dashboard/trash"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              pathname === "/dashboard/trash"
                ? "text-foreground bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            Lixeira
            {trashTotal > 0 && (
              <span className="tabular-nums rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                {trashTotal.toLocaleString("pt-BR")}
              </span>
            )}
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity outline-none"
              >
                <UserAvatar authUser={authUser} email={displayEmail} />
                <span className="hidden lg:block text-sm text-muted-foreground max-w-[160px] truncate">
                  {displayEmail}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-popover border border-border shadow-lg" align="end">
              <div className="flex items-center gap-3 px-3 py-3">
                <UserAvatar authUser={authUser} email={displayEmail} />
                <div className="flex flex-col min-w-0 flex-1">
                  {authUser?.name && (
                    <span className="text-sm font-medium truncate">{authUser.name}</span>
                  )}
                  <span className="text-xs text-muted-foreground truncate">{displayEmail}</span>
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                  authUser?.plan === "business"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : authUser?.plan === "pro"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}>
                  {(authUser?.plan ?? "free").toUpperCase()}
                </span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => window.open("https://myaccount.google.com/personal-info", "_blank")}
                className="gap-2 cursor-pointer"
              >
                <User className="h-4 w-4" />
                <div>
                  <div className="text-sm">Alterar foto</div>
                  <div className="text-xs text-muted-foreground">Abre Google Account</div>
                </div>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/dashboard/settings")}
                className="gap-2 cursor-pointer"
              >
                <Settings className="h-4 w-4" />
                <div>
                  <div className="text-sm">Configurações</div>
                  <div className="text-xs text-muted-foreground">Temas, planos e conta</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2 text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
    </header>
  )
}
