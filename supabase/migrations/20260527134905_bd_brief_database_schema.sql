/*
  # BD Brief Database - Full Schema

  1. New Tables
    - `issues` - Weekly BD brief records with raw text and extraction JSON
    - `bd_signals` - Individual BD intelligence signals extracted from briefs
    - `companies` - Company entity records linked to signals
    - `assets` - Drug/program asset records linked to signals
    - `signal_companies` - Join table between signals and companies
    - `signal_assets` - Join table between signals and assets
    - `leverage_resets` - Leverage reset events from briefs
    - `outreach_targets` - Recommended outreach targets from briefs
    - `precedent_comps` - Deal/asset precedent comparables
    - `mispricing_flags` - Pricing anomaly/red flag records
    - `board_summaries` - Board-level summary narratives per issue
    - `recommended_actions` - Recommended internal actions per issue
    - `deal_structure_watch` - Deal structure observations per issue

  2. Security
    - RLS enabled on all tables
    - All policies require authenticated users
    - Users can only access their own data via auth.uid()

  3. Storage
    - briefs bucket for raw document uploads
*/

-- Issues table: the root record for each ingested brief
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issue_number text,
  issue_date date,
  title text,
  source text,
  brief_type text DEFAULT 'weekly',
  raw_text text,
  extraction_json jsonb,
  storage_path text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'review', 'imported', 'error')),
  extraction_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own issues"
  ON issues FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own issues"
  ON issues FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own issues"
  ON issues FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own issues"
  ON issues FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- BD Signals table: individual intelligence signals
CREATE TABLE IF NOT EXISTS bd_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  headline text NOT NULL,
  signal_type text,
  strategic_category text,
  priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  urgency text DEFAULT 'medium' CHECK (urgency IN ('immediate', 'high', 'medium', 'low')),
  confidence text DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low', 'speculative')),
  therapeutic_area text,
  modality text,
  event_date date,
  what_changed text,
  bd_interpretation text,
  inference_chain text,
  committee_question text,
  recommended_action text,
  sources jsonb DEFAULT '[]'::jsonb,
  tags jsonb DEFAULT '[]'::jsonb,
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bd_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own signals"
  ON bd_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own signals"
  ON bd_signals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signals"
  ON bd_signals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own signals"
  ON bd_signals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  ticker text,
  company_type text,
  therapeutic_focus text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own companies"
  ON companies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own companies"
  ON companies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  asset_type text,
  therapeutic_area text,
  modality text,
  stage text,
  indication text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own assets"
  ON assets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assets"
  ON assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assets"
  ON assets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assets"
  ON assets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Signal-Company join table
CREATE TABLE IF NOT EXISTS signal_companies (
  signal_id uuid NOT NULL REFERENCES bd_signals(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text DEFAULT 'mentioned',
  PRIMARY KEY (signal_id, company_id)
);

ALTER TABLE signal_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select signal_companies"
  ON signal_companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert signal_companies"
  ON signal_companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete signal_companies"
  ON signal_companies FOR DELETE
  TO authenticated
  USING (true);

-- Signal-Asset join table
CREATE TABLE IF NOT EXISTS signal_assets (
  signal_id uuid NOT NULL REFERENCES bd_signals(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  role text DEFAULT 'mentioned',
  PRIMARY KEY (signal_id, asset_id)
);

ALTER TABLE signal_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select signal_assets"
  ON signal_assets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert signal_assets"
  ON signal_assets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete signal_assets"
  ON signal_assets FOR DELETE
  TO authenticated
  USING (true);

-- Leverage resets table
CREATE TABLE IF NOT EXISTS leverage_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company text,
  asset text,
  reset_type text,
  description text,
  strategic_implication text,
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leverage_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own leverage_resets"
  ON leverage_resets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leverage_resets"
  ON leverage_resets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leverage_resets"
  ON leverage_resets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own leverage_resets"
  ON leverage_resets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Outreach targets table
CREATE TABLE IF NOT EXISTS outreach_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company text,
  contact_role text,
  rationale text,
  timing text,
  priority text DEFAULT 'medium',
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE outreach_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own outreach_targets"
  ON outreach_targets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own outreach_targets"
  ON outreach_targets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own outreach_targets"
  ON outreach_targets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own outreach_targets"
  ON outreach_targets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Precedent comps table
CREATE TABLE IF NOT EXISTS precedent_comps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_name text,
  buyer text,
  seller text,
  target_asset text,
  deal_value text,
  deal_type text,
  therapeutic_area text,
  modality text,
  stage_at_deal text,
  deal_date date,
  key_terms text,
  strategic_rationale text,
  relevance_note text,
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE precedent_comps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own precedent_comps"
  ON precedent_comps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own precedent_comps"
  ON precedent_comps FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own precedent_comps"
  ON precedent_comps FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own precedent_comps"
  ON precedent_comps FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Mispricing flags table
CREATE TABLE IF NOT EXISTS mispricing_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_headline text NOT NULL,
  asset text,
  company text,
  current_valuation text,
  implied_value text,
  valuation_gap text,
  rationale text,
  strategic_implication text,
  urgency text DEFAULT 'medium',
  therapeutic_area text,
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mispricing_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own mispricing_flags"
  ON mispricing_flags FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mispricing_flags"
  ON mispricing_flags FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mispricing_flags"
  ON mispricing_flags FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own mispricing_flags"
  ON mispricing_flags FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Board summaries table
CREATE TABLE IF NOT EXISTS board_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  narrative text,
  key_themes jsonb DEFAULT '[]'::jsonb,
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE board_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own board_summaries"
  ON board_summaries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own board_summaries"
  ON board_summaries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own board_summaries"
  ON board_summaries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own board_summaries"
  ON board_summaries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Recommended actions table
CREATE TABLE IF NOT EXISTS recommended_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  rationale text,
  deadline text,
  owner text,
  priority text DEFAULT 'medium',
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recommended_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own recommended_actions"
  ON recommended_actions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recommended_actions"
  ON recommended_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recommended_actions"
  ON recommended_actions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recommended_actions"
  ON recommended_actions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Deal structure watch table
CREATE TABLE IF NOT EXISTS deal_structure_watch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  structure_type text,
  description text,
  companies_involved jsonb DEFAULT '[]'::jsonb,
  strategic_implications text,
  needs_review boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deal_structure_watch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own deal_structure_watch"
  ON deal_structure_watch FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deal_structure_watch"
  ON deal_structure_watch FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deal_structure_watch"
  ON deal_structure_watch FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deal_structure_watch"
  ON deal_structure_watch FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS bd_signals_issue_id_idx ON bd_signals(issue_id);
CREATE INDEX IF NOT EXISTS bd_signals_user_id_idx ON bd_signals(user_id);
CREATE INDEX IF NOT EXISTS bd_signals_signal_type_idx ON bd_signals(signal_type);
CREATE INDEX IF NOT EXISTS bd_signals_priority_idx ON bd_signals(priority);
CREATE INDEX IF NOT EXISTS bd_signals_therapeutic_area_idx ON bd_signals(therapeutic_area);
CREATE INDEX IF NOT EXISTS bd_signals_needs_review_idx ON bd_signals(needs_review);
CREATE INDEX IF NOT EXISTS issues_user_id_idx ON issues(user_id);
CREATE INDEX IF NOT EXISTS issues_status_idx ON issues(status);
CREATE INDEX IF NOT EXISTS companies_user_id_idx ON companies(user_id);
CREATE INDEX IF NOT EXISTS assets_user_id_idx ON assets(user_id);
CREATE INDEX IF NOT EXISTS precedent_comps_user_id_idx ON precedent_comps(user_id);
CREATE INDEX IF NOT EXISTS mispricing_flags_user_id_idx ON mispricing_flags(user_id);
