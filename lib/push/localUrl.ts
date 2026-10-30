/** QStash delivers over the internet, so it can never reach a dev machine: such an app URL means "send inline". */
export function isLocalAppUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')
      || /^(10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  } catch {
    return false
  }
}
