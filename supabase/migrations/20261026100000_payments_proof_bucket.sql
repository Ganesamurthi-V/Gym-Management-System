-- Payment screenshots now live in the `Payments_proof` bucket (was `payment-proofs`).
-- Same rules as before: private, 10 MB of JPG/PNG/PDF, owners write and read only inside
-- a folder named after their own auth uid, and there is no UPDATE or DELETE policy.
-- Idempotent. Run in the Supabase SQL editor together with the deploy that switches the
-- code to the new bucket name.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('Payments_proof', 'Payments_proof', false, 10485760,
          ARRAY['image/jpeg', 'image/png', 'application/pdf'])
  ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = 10485760,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];

DROP POLICY IF EXISTS "gym owner upload payment proof" ON storage.objects;
CREATE POLICY "gym owner upload payment proof"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'Payments_proof'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.gyms WHERE owner_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "gym owner read own payment proofs" ON storage.objects;
CREATE POLICY "gym owner read own payment proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'Payments_proof'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
