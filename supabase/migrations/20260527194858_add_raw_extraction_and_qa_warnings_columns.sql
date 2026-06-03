/*
  # Add raw extraction and QA warnings columns to issues

  1. Modified Tables
    - `issues`
      - `raw_extraction_json` (jsonb, nullable) - stores the unprocessed model output before post-processing cleanup
      - `qa_warnings` (jsonb, nullable) - stores post-processing QA warnings array with severity levels

  2. Important Notes
    - These columns support the new multi-pass extraction pipeline
    - raw_extraction_json preserves the original model output for diagnostics
    - qa_warnings stores blocking/warning/info severity warnings from post-processing
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues' AND column_name = 'raw_extraction_json'
  ) THEN
    ALTER TABLE issues ADD COLUMN raw_extraction_json jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issues' AND column_name = 'qa_warnings'
  ) THEN
    ALTER TABLE issues ADD COLUMN qa_warnings jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;