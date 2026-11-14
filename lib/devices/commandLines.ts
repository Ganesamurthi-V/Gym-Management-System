// Pure builders for the ADMS command lines a device polls for. No server-only imports so tests can load it.

export type CommandKind = 'add_user' | 'remove_user'
export type CommandDialect = 'privilege' | 'pri'

const PIN_RE = /^[0-9]{1,9}$/

/**
 * One command line for the device. Privilege is always 0 (ordinary user, never an admin) and only USERINFO
 * UPDATE / DELETE exist, so a Shell or any other command can never be produced.
 *
 * The member's real name is never sent. A device is identified by its serial alone, so anyone who learns a
 * serial can poll for these lines; the device label is `Member <pin>` so a poll reveals no personal data.
 */
export function buildCommandLine(a: { id: number; kind: CommandKind; pin: string; dialect: CommandDialect }): string {
  if (!PIN_RE.test(a.pin)) throw new Error('invalid device pin')
  if (a.kind === 'remove_user') return `C:${a.id}:DATA DELETE USERINFO PIN=${a.pin}`
  if (a.kind !== 'add_user') throw new Error('invalid command kind')
  const priv = a.dialect === 'pri' ? 'Pri=0' : 'Privilege=0'
  return `C:${a.id}:DATA UPDATE USERINFO PIN=${a.pin}\tName=Member ${a.pin}\t${priv}\tCard=`
}
