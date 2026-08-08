import { notFound } from 'next/navigation'
import ActivateClient from './ActivateClient'

export const dynamic = 'force-dynamic'

export default async function ActivatePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params
  if (!token || token.length < 20) notFound()
  return <ActivateClient token={token} />
}
