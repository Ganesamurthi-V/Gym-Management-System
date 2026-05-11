export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: NodeJS.Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('TIMEOUT'))
    }, ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    // @ts-ignore
    if (timeoutId) clearTimeout(timeoutId)
  })
}
