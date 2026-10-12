/** The report's five questions. Plain module so the server page and the client tabs share one list. */
export const TOPICS = ['members', 'money', 'dues', 'leaving', 'attendance'] as const
export type Topic = (typeof TOPICS)[number]

export function parseTopic(value: string | string[] | undefined): Topic {
  const first = Array.isArray(value) ? value[0] : value
  return TOPICS.find(topic => topic === first) ?? 'members'
}
