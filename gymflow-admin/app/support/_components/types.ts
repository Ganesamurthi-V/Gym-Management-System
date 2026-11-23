export type Gym = { id: string; name: string; owner: { email: string } }
export type Ticket = {
  id: string
  gym_id: string
  subject: string
  message: string
  type: string
  status: string
  rating: number | null
  created_at: string
  gyms: { name: string; owner_id: string }
}
