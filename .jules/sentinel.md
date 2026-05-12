# Sentinel Journal 🛡️

## [2023-10-27] Reports Page Redesign & PDF Hardening

### Learning
- Integrated `jsPDF` and `jsPDF-autotable` for professional A4 reporting, replacing basic browser print calls.
- Implemented a pure Tailwind bar chart for revenue trends, avoiding external heavy charting libraries.
- Enhanced data fetching to include `pending_amount` for dues reporting, while maintaining RLS compliance.
- Added gym profile fields (city, GST, phone) to the `gyms` table via migration to support professional letterheads.

### Security Fix
- Ensured that sensitive member data (name, phone) is only fetched for reports when requested by the authorized gym owner.
- Hardened `geo_localities` and `geo_aliases` to be read-only for regular users to prevent data pollution.
