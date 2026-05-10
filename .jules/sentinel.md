## 2025-05-22 - [RLS] Hardened Global Geo Policies

**Vulnerability:** The `geo_localities` and `geo_aliases` tables allowed any authenticated user to perform `INSERT` and `UPDATE` operations, leading to potential data corruption or vandalism of global geographic reference data.

**Learning:** When using global reference tables in a multi-tenant SaaS application, ensure that RLS policies are set to read-only (`SELECT`) for regular users. If users need to create their own variations of the data, implement tenant-scoped tables with restricted policies.

**Prevention:** Always default to the principle of least privilege. For global metadata tables, regular users should only have read access. For user-contributed data, enforce strict ownership checks that verify the user belongs to the correct tenant (gym) and is the author of the record.
