import { Check } from 'lucide-react';
import { Rise } from './fx';
import { CenterHead, Section } from './layout/Section';
import '../styles/problems.css';

/* One row per everyday job. The GymFlow side is limited to behaviour already stated on the feature
   pages (the 18 day reminder start, the 7 day absence list, the 10 digit number tidy up on import,
   five reports with a PDF); the register side is the pain described on /gym-software-vs-excel.
   No outcome figures. */
const ROWS: { job: string; before: string; fix: string }[] = [
  {
    job: 'Spotting plans that are ending',
    before: 'You sort the sheet and check it every day, or a renewal slips by.',
    fix: 'Every member shows as Active, Expiring or Expired, and expiry reminders start 18 days before the end date.',
  },
  {
    job: 'Knowing who owes how much',
    before: 'Part payments end up in rows, notes and memory.',
    fix: 'Part payments stay on the member as a pending due, with a list of who owes what.',
  },
  {
    job: 'Sending reminders',
    before: 'You type every message yourself, on your own time.',
    fix: 'Welcome, renewal, expiry, payment due and birthday messages go out on WhatsApp by themselves.',
  },
  {
    job: 'Noticing who stopped coming',
    before: 'The register shows who came, not who stopped.',
    fix: 'A report lists members with a current plan who have not checked in for 7 days or more.',
  },
  {
    job: 'Keeping lists and numbers clean',
    before: 'Numbers typed with spaces, +91 or a leading 0 break bulk messages.',
    fix: 'Import an Excel or CSV file, see a preview before anything is saved, and numbers are tidied to 10 digits.',
  },
  {
    job: 'Seeing the month at a glance',
    before: 'You build the totals and formulas yourself.',
    fix: 'Five reports in plain English on members, money, dues, expiries and attendance, with a PDF to download.',
  },
];

export function Problems() {
  return (
    <Section id="problems" labelledBy="problems-title" tone="paper">
      <CenterHead
        title={
          <h2 id="problems-title" className="display-2 text-balance">
            Gym software vs a register or Excel sheet
          </h2>
        }
        lead="Where a register or sheet starts to cost you time, and what GymFlow does about each job."
      />

      <Rise className="panel panel-lg cmp-panel mt-12 md:mt-16">
        <table className="cmp-table">
          <caption className="sr-only">
            Six everyday gym jobs, done with a register or Excel sheet and done with GymFlow
          </caption>
          <thead>
            <tr>
              <th scope="col" className="cmp-head">The everyday job</th>
              <th scope="col" className="cmp-head">With a register or Excel</th>
              <th scope="col" className="cmp-head">With GymFlow</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.job} className="cmp-row">
                <th scope="row" className="cmp-job">{row.job}</th>
                <td data-label="Register or Excel:" className="cmp-before">{row.before}</td>
                <td data-label="GymFlow:" className="cmp-after">
                  <div className="cmp-fix">
                    <Check aria-hidden className="mt-[3px] size-4 shrink-0 text-accent-text" strokeWidth={2.5} />
                    <span className="min-w-0">{row.fix}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rise>

      <p className="mt-6 text-center">
        <a
          href="/gym-software-vs-excel"
          className="inline-flex min-h-[44px] items-center text-[16px] font-medium text-accent-text underline-offset-2 hover:underline"
        >
          Read the full comparison
        </a>
      </p>
    </Section>
  );
}
