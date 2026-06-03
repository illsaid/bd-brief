/*
  # Storage RLS policies for briefs bucket
  Allows authenticated users to upload and read their own files only.
*/

CREATE POLICY "Authenticated users can upload briefs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'briefs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can read own briefs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'briefs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can delete own briefs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'briefs' AND auth.uid()::text = (storage.foldername(name))[1]);
