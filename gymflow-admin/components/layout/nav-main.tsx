'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

import { NAV_GROUPS, isNavActive } from './nav-items'

// Poll interval in ms - no realtime needed, lightweight polling is sufficient
const POLL_INTERVAL = 30_000

export function NavMain() {
  const pathname = usePathname()
  const [openTicketsCount, setOpenTicketsCount] = useState(0)

  useEffect(() => {
    async function fetchTicketCount() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/support/ticket-count')
        if (!res.ok) return
        const data = await res.json()
        setOpenTicketsCount(data.count ?? 0)
      } catch {
        // Silently fail - non-critical UI badge
      }
    }

    fetchTicketCount()
    const timer = setInterval(fetchTicketCount, POLL_INTERVAL)
    // Refresh straight away when the tab becomes visible again after being hidden.
    document.addEventListener('visibilitychange', fetchTicketCount)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', fetchTicketCount)
    }
  }, [])

  return (
    <>
      {NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.id}>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={isNavActive(pathname, item.url)}>
                    <Link prefetch={false} href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.url === '/support' && openTicketsCount > 0 && (
                    <SidebarMenuBadge className="bg-destructive/10 text-destructive">{openTicketsCount > 99 ? '99+' : openTicketsCount}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
