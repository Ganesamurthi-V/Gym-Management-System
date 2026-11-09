// Pure builders for the ADMS command lines a device polls for. No server-only imports so tests can load it.

export type CommandKind = 'add_user' | 'remove_user'
export type CommandDialect = 'privilege' | 'pri'

const PIN_RE = /^[0-9]{1,9}$/
const MAX_NAME = 24

/** Removes everything that could break the tab-separated command or inject a field (tab, CR, LF, '=', NUL, controls). */
export function sanitizeName(name: string): string {
  return name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
    .trim()
}

/**
 * One command line for the device. Privilege is always 0 (ordinary user, never an admin) and only USERINFO
 * UPDATE / DELETE exist, so a Shell or any other command can never be produced.
 */
export function buildCommandLine(a: { id: number; kind: CommandKind; pin: string; name?: string; dialect: CommandDialect }): string {
  if (!PIN_RE.test(a.pin)) throw new Error('invalid device pin')
  if (a.kind === 'remove_user') return `C:${a.id}:DATA DELETE USERINFO PIN=${a.pin}`
  if (a.kind !== 'add_user') throw new Error('invalid command kind')
  const priv = a.dialect === 'pri' ? 'Pri=0' : 'Privilege=0'
  return `C:${a.id}:DATA UPDATE USERINFO PIN=${a.pin}\tName=${sanitizeName(a.name ?? '')}\t${priv}\tCard=`
}
