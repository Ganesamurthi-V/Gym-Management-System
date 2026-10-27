import { DashboardMock } from './dashboard/DashboardMock';
import { MemberAppCard } from './MemberAppCard';
import { RuledList, Section, SectionHead, Showcase, Split } from './layout/Section';

const LINK_CLASS =
  'rounded font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// Facts as stated in src/data/featurePages.ts.
const POINTS = [
  {
    title: 'See who needs a call',
    text: 'Every member is marked Active, Expiring (7 days or fewer left) or Expired.',
    href: '/members',
    link: 'More on member management',
  },
  {
    title: 'Part payments stay on record',
    text: 'Take part of a fee now. What is left stays as a pending due until it is paid.',
    href: '/fees-and-dues',
    link: 'More on fees and dues',
  },
  {
    title: 'Check-in at the front desk',
    text: 'Members type their member ID on a kiosk page and the visit is recorded.',
    href: '/attendance',
    link: 'More on attendance tracking',
  },
] as const;

export function BentoFeatures() {
  return (
    <Section id="features" labelledBy="features-title">
      <Showcase
        head={
          <SectionHead
            title={
              <h2 id="features-title" className="display-2 text-balance">
                {'Everything your gym needs: members, fees, attendance, WhatsApp'}
              </h2>
            }
            lead={
              <>
                Members, payments, attendance and WhatsApp reminders in one place, with a member app
                included.{' '}
                <a href="/features" className={LINK_CLASS}>
                  See all GymFlow features
                </a>
              </>
            }
          />
        }
      >
      {/* Browser-window frame around the console mock. The canvas inside is decorative
          (aria-hidden), so the sentence below carries what it shows. */}
      <div className="w-full overflow-hidden rounded-card-lg border border-border-subtle bg-frame">
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          <span className="ml-3 rounded-full border border-border-subtle bg-subtle px-3 py-0.5 text-[12px] text-muted-foreground">
            app.gymflow.sbs
          </span>
        </div>
        <div className="p-1.5">
          <p className="sr-only">
            The GymFlow console showing active, expiring and expired members, today&apos;s
            collection and total dues. The sidebar covers members, payments, dues, attendance,
            inventory and programs.
          </p>
          <DashboardMock />
        </div>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Sample data. Click around the sidebar to try it.
      </p>

        <div className="mt-12 max-w-[760px]">
          <RuledList
            items={POINTS.map(p => ({
              title: p.title,
              text: (
                <>
                  {p.text}{' '}
                  <a href={p.href} className={LINK_CLASS}>
                    {p.link}
                  </a>
                </>
              ),
            }))}
          />
        </div>
      </Showcase>

      <div className="mt-24">
        <Split
          head={
            <div className="max-w-[560px]">
              <h3 className="display-3">Your members get their own app</h3>
              <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
                Included with GymFlow: members see their plan, visits, workout and digital card on
                their own phone.
              </p>
            </div>
          }
        >
          <MemberAppCard />
        </Split>
      </div>
    </Section>
  );
}
