// Minimal in-memory stand-in for the Supabase query builder: just the calls the device code makes.
type Row = Record<string, unknown>

export function createFakeDb() {
  const tables: Record<string, Row[]> = { attendance_devices: [], device_user_map: [], device_punches: [], attendance: [] }
  let seq = 0
  const uniques: Record<string, string[]> = {
    device_punches: ['device_id', 'pin', 'punched_at'],
    attendance: ['member_id', 'date', 'session'],
  }
  const api = {
    tables,
    /** Return true to make that table/op fail with a DB error. */
    failOn: ((_table: string, _op: string) => false) as (table: string, op: string) => boolean,
    from(table: string) {
      type Filter = (r: Row) => boolean
      const filters: Filter[] = []
      let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
      let payload: Row | Row[] = {}
      let ignoreDuplicates = false
      let onConflict = ''
      let orderBy: { col: string; asc: boolean } | null = null
      let max = Infinity
      let single = false

      const finish = (list: Row[]) => (single ? { data: list[0] ?? null, error: null } : { data: list, error: null })

      const run = () => {
        if (api.failOn(table, op)) return { data: null, error: { message: `${table} ${op} failed` } }
        const rows = tables[table]
        if (op === 'insert' || op === 'upsert') {
          const keys = op === 'upsert' ? onConflict.split(',') : uniques[table]
          const inserted: Row[] = []
          for (const item of Array.isArray(payload) ? payload : [payload]) {
            const dup = keys && rows.some(r => keys.every(k => r[k] === item[k]))
            if (dup) {
              if (op === 'upsert' && ignoreDuplicates) continue
              return { data: null, error: { message: 'duplicate key', code: '23505' } }
            }
            const row = { id: `id${++seq}`, source: 'kiosk', check_out_time: null, member_id: null, ...item }
            rows.push(row)
            inserted.push(row)
          }
          return finish(inserted)
        }
        let matched = rows.filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          matched.forEach(r => Object.assign(r, payload))
          return { data: null, error: null }
        }
        if (orderBy) {
          const { col, asc } = orderBy
          matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
        }
        return finish(matched.slice(0, max))
      }

      const b: Record<string, unknown> = {
        select() { return b },
        insert(p: Row | Row[]) { op = 'insert'; payload = p; return b },
        upsert(p: Row[], o: { onConflict: string; ignoreDuplicates?: boolean }) { op = 'upsert'; payload = p; onConflict = o.onConflict; ignoreDuplicates = !!o.ignoreDuplicates; return b },
        update(p: Row) { op = 'update'; payload = p; return b },
        eq(c: string, v: unknown) { filters.push(r => r[c] === v); return b },
        in(c: string, v: unknown[]) { filters.push(r => v.includes(r[c])); return b },
        gte(c: string, v: string) { filters.push(r => String(r[c]) >= v); return b },
        lt(c: string, v: string) { filters.push(r => String(r[c]) < v); return b },
        lte(c: string, v: string) { filters.push(r => String(r[c]) <= v); return b },
        order(col: string, o?: { ascending?: boolean }) { orderBy = { col, asc: o?.ascending !== false }; return b },
        limit(n: number) { max = n; return b },
        maybeSingle() { single = true; return Promise.resolve(run()) },
        single() { single = true; return Promise.resolve(run()) },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej) },
      }
      return b
    },
  }
  return api
}
