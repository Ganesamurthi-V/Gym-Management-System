'use client'

import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'
import type { TemplateApprovalStatus, WhatsAppTemplateStatus } from '@/types/member-app'
import { Badge, Card, EmptyState, SectionHeader } from './ui'
import type { BadgeTone } from './ui'

const STATUS_LABELS: Record<TemplateApprovalStatus, string> = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
}

const STATUS_TONES: Record<TemplateApprovalStatus, BadgeTone> = {
  approved: 'green',
  pending: 'amber',
  rejected: 'red',
}

export default function WhatsAppTemplates({ templates }: { templates: WhatsAppTemplateStatus[] }) {
  return (
    <Card>
      <SectionHeader
        title="WhatsApp Templates"
        description="Message templates used by the member app notification flows."
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="w-5 h-5" />}
          title="No templates configured"
          message="Connect WhatsApp in Account settings to manage templates."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {templates.map(template => (
            <div
              key={template.templateId}
              className="bg-white rounded-2xl border border-surface-border p-4 flex flex-col gap-3 hover:border-brand-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 truncate">{template.displayName}</p>
                </div>
                <Badge tone={STATUS_TONES[template.status]}>{STATUS_LABELS[template.status]}</Badge>
              </div>

              {/* Configuration lives in Account settings until the module owns it. */}
              <Link
                href="/account"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors mt-auto"
              >
                Configure
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
