/*
  # Add unique constraint on assets(user_id, name)
  Required for upsert operations during brief import.
*/

ALTER TABLE assets ADD CONSTRAINT assets_user_id_name_key UNIQUE (user_id, name);
