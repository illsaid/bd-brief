-- Public-facing read-only viewer: allow anon SELECT on the remaining related tables.
-- issues and bd_signals already have public read policies. These add anon read for the
-- tables that issue/signal/company/asset detail and list pages depend on.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'companies',
    'assets',
    'precedent_comps',
    'mispricing_flags',
    'leverage_resets',
    'recommended_actions',
    'outreach_targets',
    'board_summaries',
    'deal_structure_watch',
    'signal_assets',
    'signal_companies'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'Public read ' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (true)',
        'Public read ' || t, t
      );
    END IF;
  END LOOP;
END $$;
