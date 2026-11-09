import { describe, expect, it } from 'vitest'
import { applyCommand, devicecmdBody, parseCommandLines, type User } from '../tools/simulate-device.js'

const upd = (id: string, body: string) => ({ id, command: `DATA UPDATE USERINFO ${body}` })

describe('parseCommandLines', () => {
  it('returns nothing for OK', () => expect(parseCommandLines('OK')).toEqual([]))
  it('parses several lines, LF and CRLF', () => {
    const t = 'C:1:DATA UPDATE USERINFO PIN=7\tName=A\r\nC:2:DATA DELETE USERINFO PIN=7\n'
    expect(parseCommandLines(t)).toEqual([
      { id: '1', command: 'DATA UPDATE USERINFO PIN=7\tName=A' },
      { id: '2', command: 'DATA DELETE USERINFO PIN=7' },
    ])
  })
})

describe('applyCommand', () => {
  it('adds, updates and deletes users', () => {
    const users = new Map<string, User>()
    expect(applyCommand(users, upd('1', 'PIN=7\tName=Test\tPrivilege=0\tCard='))).toEqual({ id: '1', ret: 0, cmd: 'DATA UPDATE' })
    expect(users.get('7')).toEqual({ name: 'Test', privilege: '0' })
    applyCommand(users, upd('2', 'PIN=7\tName=New\tPrivilege=14\tCard='))
    expect(users.get('7')).toEqual({ name: 'New', privilege: '14' })
    expect(applyCommand(users, { id: '3', command: 'DATA DELETE USERINFO PIN=7' }).ret).toBe(0)
    expect(users.size).toBe(0)
  })
  it('enforces the dialect', () => {
    const users = new Map<string, User>()
    expect(applyCommand(users, upd('1', 'PIN=7\tName=A\tPri=0'), 'privilege').ret).toBe(-1002)
    expect(applyCommand(users, upd('2', 'PIN=7\tName=A\tPrivilege=0'), 'pri').ret).toBe(-1002)
    expect(users.size).toBe(0)
    expect(applyCommand(users, upd('3', 'PIN=7\tName=A\tPri=0'), 'pri').ret).toBe(0)
    expect(users.get('7')).toEqual({ name: 'A', privilege: '0' })
  })
  it('rejects unknown commands with -1002', () => {
    expect(applyCommand(new Map(), { id: '9', command: 'REBOOT NOW' })).toEqual({ id: '9', ret: -1002, cmd: 'REBOOT NOW' })
  })
})

describe('devicecmdBody', () => {
  it('formats one line per result', () => {
    expect(devicecmdBody([{ id: '1', ret: 0, cmd: 'DATA UPDATE' }, { id: '2', ret: -1002, cmd: 'REBOOT' }])).toBe(
      'ID=1&Return=0&CMD=DATA UPDATE\r\nID=2&Return=-1002&CMD=REBOOT\r\n',
    )
  })
})
