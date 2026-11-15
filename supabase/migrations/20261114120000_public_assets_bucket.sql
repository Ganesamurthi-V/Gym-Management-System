-- Public bucket for files that email clients must load by plain URL (the logo in
-- transactional emails). Public buckets serve objects by URL without RLS, and there are
-- no client policies: only the service role uploads, so the bucket is read-only to the
-- world. Idempotent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('assets', 'assets', true, 2097152, ARRAY['image/png', 'image/jpeg'])
  ON CONFLICT (id) DO UPDATE
    SET public             = true,
        file_size_limit    = 2097152,
        allowed_mime_types = ARRAY['image/png', 'image/jpeg'];
