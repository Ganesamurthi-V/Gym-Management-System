import { CalendarCheck, ChartColumn, Check, FileText, X, IndianRupee, MessageCircle, User, Users, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Section, SectionHead } from './layout/Section';

/* One row per gym management task. The GymFlow side is limited to behaviour already stated on the feature
   pages (the 7 day absence list, the 10 digit number tidy up on import, five reports with a PDF); the
   register side is the pain described on /gym-software-vs-excel. No outcome figures. */
const hl = (text: string) => <b className="cmp__hl">{text}</b>;

const ROWS: { job: string; icon: LucideIcon; before: string; fix: ReactNode }[] = [
  {
    job: 'Memberships',
    icon: User,
    before: 'Track expiry dates by hand',
    fix: <>{hl('Active, Expiring, Expired')} shown for you</>,
  },
  {
    job: 'Fees and dues',
    icon: IndianRupee,
    before: 'Work out pending fees by hand',
    fix: 'Part payments and dues tracked',
  },
  {
    job: 'WhatsApp reminders',
    icon: MessageCircle,
    before: 'Message every member yourself',
    fix: 'Renewal and payment reminders sent for you',
  },
  {
    job: 'Attendance',
    icon: CalendarCheck,
    before: 'Flip through the register',
    fix: <>See who has been away {hl('7+ days')}</>,
  },
  {
    job: 'Member data',
    icon: Users,
    before: 'Clean up spreadsheet rows',
    fix: 'Import from Excel with a preview',
  },
  {
    job: 'Reports',
    icon: ChartColumn,
    before: 'Add up totals by hand',
    fix: <>Reports ready, with {hl('PDF download')}</>,
  },
];

export function Problems() {
  return (
    <Section id="problems" labelledBy="problems-title" tone="paper">
      <SectionHead
        title={
          <h2 id="problems-title" className="h2">
            Gym software vs register or Excel sheet
          </h2>
        }
        lead="Where a register or sheet starts to cost you time, and what GymFlow does about each job."
      />

      <div className="panel cmp-panel overflow-clip">
        <table className="cmp">
          <caption className="sr-only">
            Six gym management tasks, done with a register or Excel sheet and done with GymFlow
          </caption>
          <thead>
            <tr>
              <th scope="col">Gym management task</th>
              <th scope="col" className="cmp__head-bad">
                <span>
                  <FileText aria-hidden className="size-5" strokeWidth={1.75} />
                  Register or Excel
                </span>
              </th>
              <th scope="col" className="cmp__head-fix">
                <span>
                  <FileText aria-hidden className="size-5" strokeWidth={1.75} />
                  GymFlow Gym Management Software
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.job}>
                <th scope="row">
                  <span className="cmp__job">
                    <span aria-hidden className="cmp__icon">
                      <row.icon className="size-5" strokeWidth={1.75} />
                    </span>
                    {row.job}
                  </span>
                </th>
                <td data-label="Register or Excel:" className="cmp__bad">
                  <span>
                    <span aria-hidden className="cmp__x">
                      <X className="size-3.5" strokeWidth={3} />
                    </span>
                    <span className="min-w-0">{row.before}</span>
                  </span>
                </td>
                <td data-label="GymFlow:" className="cmp__fix">
                  <span>
                    <span aria-hidden className="cmp__tick">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    <span className="min-w-0">{row.fix}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6">
        <a href="/gym-software-vs-excel" className="link">
          <span>Read the full comparison</span>
        </a>
      </p>
    </Section>
  );
}
