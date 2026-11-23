'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

import { useBreadcrumbLabel } from './breadcrumb-context'
import { getBreadcrumbs } from './nav-items'
import { ThemeSwitcher } from './theme-switcher'

export function SiteHeader() {
  const pathname = usePathname()
  const detailLabel = useBreadcrumbLabel()
  const crumbs = getBreadcrumbs(pathname, detailLabel)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center justify-between px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-1 lg:gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
          />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1
                // The group label (first crumb of a multi-crumb trail) is context only, so it is
                // dropped on phones to leave room for the page and detail names.
                const hideOnMobile = i === 0 && crumbs.length > 1
                return (
                  <Fragment key={`${crumb.label}-${i}`}>
                    <BreadcrumbItem className={hideOnMobile ? 'hidden md:inline-flex' : 'min-w-0'}>
                      {isLast ? (
                        <BreadcrumbPage className="max-w-[40vw] truncate md:max-w-sm" title={crumb.label}>
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : crumb.href ? (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      ) : (
                        <span className="text-muted-foreground">{crumb.label}</span>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator className={hideOnMobile ? 'hidden md:block' : undefined} />}
                  </Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  )
}
