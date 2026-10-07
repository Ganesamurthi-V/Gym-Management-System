-- Search the gym owners the admin may want to email, by gym name, owner name or email.
--
-- The admin app's "New message" screen lets the admin write to any existing customer, not only
-- to people who have already emailed support. A gym owner's email address lives in auth.users,
-- which the API cannot filter with ILIKE, so the search runs here. SECURITY DEFINER because it
-- reads auth.users; closed to everyone but the service role, like gym_id_for_owner_email.
--
-- Idempotent: CREATE OR REPLACE, and the grants can be repeated.

CREATE OR REPLACE FUNCTION public.search_gym_owner_contacts(p_q TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE (email TEXT, owner_name TEXT, gym_id UUID, gym_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.email::text,
         NULLIF(u.raw_user_meta_data ->> 'full_name', '')::text,
         g.id,
         g.name::text
    FROM public.gyms g
    JOIN auth.users u ON u.id = g.owner_id
   WHERE u.email IS NOT NULL
     AND (
       COALESCE(p_q, '') = ''
       OR u.email ILIKE '%' || p_q || '%'
       OR g.name ILIKE '%' || p_q || '%'
       OR COALESCE(u.raw_user_meta_data ->> 'full_name', '') ILIKE '%' || p_q || '%'
     )
   ORDER BY g.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.search_gym_owner_contacts(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_gym_owner_contacts(TEXT, INT) TO service_role;
