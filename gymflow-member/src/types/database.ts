export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type MembersRow = {
  id: string
  gym_id: string
  auth_user_id: string | null
  member_number: number
  member_code: string | null
  name: string
  phone: string
  email: string | null
  photo_url: string | null
  gender: 'male' | 'female' | 'other' | null
  area: string | null
  age: number | null
  date_of_birth: string | null
  blood_group: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null
  emergency_name: string | null
  emergency_phone: string | null
  medical_notes: string | null
  pending_amount: number
  legacy_member_id: string | null
  is_imported: boolean
  created_at: string
}

type GymsRow = {
  id: string
  name: string
  logo_url: string | null
  brand_color: string | null
  brand_color_2: string | null
  timezone: string | null
}

export type Database = {
  public: {
    Tables: {
      members: {
        Row: MembersRow
        Insert: Omit<MembersRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<MembersRow, 'id' | 'created_at'>>
        Relationships: []
      }
      gyms: {
        Row: GymsRow
        Insert: Omit<GymsRow, 'id'> & { id?: string }
        Update: Partial<Omit<GymsRow, 'id'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Member = MembersRow
export type Gym = GymsRow
