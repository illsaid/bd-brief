/*
  # Update outreach_targets to category-based schema

  1. Modified Tables
    - `outreach_targets`
      - Add `target_category` (text) - the category or type of outreach target
      - Add `why_now` (text) - reason for timeliness
      - Add `allowed_internal_action` (text) - what action is permitted
      - Add `notes` (text) - additional notes
      - Keep existing columns (company, contact_role, rationale, timing) for backward compatibility with already-imported data

  2. Important Notes
    - Old columns are preserved (not dropped) to protect existing imported data
    - New extractions will use the new fields
    - The review UI will display new fields for new extractions
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outreach_targets' AND column_name = 'target_category'
  ) THEN
    ALTER TABLE outreach_targets ADD COLUMN target_category text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outreach_targets' AND column_name = 'why_now'
  ) THEN
    ALTER TABLE outreach_targets ADD COLUMN why_now text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outreach_targets' AND column_name = 'allowed_internal_action'
  ) THEN
    ALTER TABLE outreach_targets ADD COLUMN allowed_internal_action text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outreach_targets' AND column_name = 'notes'
  ) THEN
    ALTER TABLE outreach_targets ADD COLUMN notes text;
  END IF;
END $$;