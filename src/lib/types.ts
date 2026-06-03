export type IssueStatus = 'pending' | 'extracting' | 'review' | 'imported' | 'error';
export type Priority = 'high' | 'medium' | 'low';
export type Urgency = 'immediate' | 'high' | 'medium' | 'low';
export type Confidence = 'high' | 'medium' | 'low' | 'speculative';
export type StrategicCategory = 'comp_reset' | 'leverage_reset' | 'pricing_implication' | 'screening_change' | 'precedent' | 'watchlist' | 'mispricing' | 'other';
export type BdPosture = 'offensive' | 'defensive' | 'intelligence' | 'neutral';
export type ReviewStatus = 'pending' | 'approved' | 'flagged' | 'rejected';

export interface Issue {
  id: string;
  user_id: string;
  issue_number: string | null;
  issue_date: string | null;
  title: string | null;
  source: string | null;
  brief_type: string;
  raw_text: string | null;
  extraction_json: ExtractionJson | null;
  raw_extraction_json: Record<string, unknown> | null;
  qa_warnings: Array<{ section: string; index?: number; field?: string; message: string; severity: string }>;
  storage_path: string | null;
  status: IssueStatus;
  extraction_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BdSignal {
  id: string;
  issue_id: string;
  user_id: string;
  headline: string;
  signal_type: string | null;
  strategic_category: string | null;
  priority: Priority;
  urgency: Urgency;
  confidence: Confidence;
  therapeutic_area: string | null;
  modality: string | null;
  event_date: string | null;
  what_changed: string | null;
  bd_interpretation: string | null;
  inference_chain: string | null;
  committee_question: string | null;
  recommended_action: string | null;
  sources: string[];
  tags: string[];
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  ticker: string | null;
  company_type: string | null;
  therapeutic_focus: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  user_id: string;
  name: string;
  company_id: string | null;
  asset_type: string | null;
  therapeutic_area: string | null;
  modality: string | null;
  stage: string | null;
  indication: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrecedentComp {
  id: string;
  issue_id: string | null;
  user_id: string;
  deal_name: string | null;
  buyer: string | null;
  seller: string | null;
  target_asset: string | null;
  deal_value: string | null;
  deal_type: string | null;
  therapeutic_area: string | null;
  modality: string | null;
  stage_at_deal: string | null;
  deal_date: string | null;
  key_terms: string | null;
  strategic_rationale: string | null;
  relevance_note: string | null;
  needs_review: boolean;
  created_at: string;
}

export interface MispricingFlag {
  id: string;
  issue_id: string | null;
  user_id: string;
  flag_headline: string;
  asset: string | null;
  company: string | null;
  current_valuation: string | null;
  implied_value: string | null;
  valuation_gap: string | null;
  rationale: string | null;
  strategic_implication: string | null;
  urgency: Urgency;
  therapeutic_area: string | null;
  needs_review: boolean;
  created_at: string;
}

export interface LeverageReset {
  id: string;
  issue_id: string;
  user_id: string;
  company: string | null;
  asset: string | null;
  reset_type: string | null;
  description: string | null;
  strategic_implication: string | null;
  needs_review: boolean;
  created_at: string;
}

export interface OutreachTarget {
  id: string;
  issue_id: string;
  user_id: string;
  target_category: string | null;
  why_now: string | null;
  allowed_internal_action: string | null;
  priority: Priority;
  notes: string | null;
  needs_review: boolean;
  created_at: string;
}

export interface BoardSummary {
  id: string;
  issue_id: string;
  user_id: string;
  narrative: string | null;
  key_themes: string[];
  needs_review: boolean;
  created_at: string;
}

export interface RecommendedAction {
  id: string;
  issue_id: string;
  user_id: string;
  action: string;
  rationale: string | null;
  deadline: string | null;
  owner: string | null;
  priority: Priority;
  needs_review: boolean;
  created_at: string;
}

export interface DealStructureWatch {
  id: string;
  issue_id: string;
  user_id: string;
  structure_type: string | null;
  description: string | null;
  companies_involved: string[];
  strategic_implications: string | null;
  needs_review: boolean;
  created_at: string;
}

// Extraction contract shape (from extraction_contract.json)
export interface ExtractionSignal {
  headline: string;
  signal_type: string;
  strategic_category: StrategicCategory | string;
  secondary_strategic_categories?: string[];
  bd_posture: BdPosture | string;
  priority: Priority;
  urgency: Urgency;
  fact_confidence: Confidence;
  implication_confidence: Confidence;
  extraction_confidence: Confidence;
  review_status: ReviewStatus;
  confidence?: Confidence; // legacy compat
  therapeutic_area_raw: string;
  therapeutic_area_normalized: string | null;
  therapeutic_area?: string; // legacy compat
  modality?: string; // legacy compat
  modality_raw: string;
  modality_normalized: string;
  event_date: string;
  what_changed: string;
  bd_interpretation: string;
  inference_chain: string;
  committee_question: string;
  recommended_action: string;
  company_names_raw: string[];
  companies_normalized: string[];
  companies?: string[]; // legacy compat
  assets: string[];
  regulators: string[];
  source_entities: string[];
  sources: string[];
  tags: string[];
  source_chunk_text?: string;
}

export type QaMode = 'production' | 'test_fixture';

export interface ExtractionJson {
  _qa_mode?: QaMode;
  _fixture_id?: string;
  issue_metadata: {
    issue_number: string;
    issue_date: string;
    title: string;
    source: string;
    brief_type: string;
  };
  board_summary: {
    narrative: string;
    key_themes: string[];
  };
  leverage_resets: Array<{
    company: string;
    asset: string;
    reset_type: string;
    description: string;
    strategic_implication: string;
  }>;
  recommended_internal_actions: Array<{
    action: string;
    rationale: string;
    deadline: string;
    owner: string;
    priority: Priority;
  }>;
  bd_signals: ExtractionSignal[];
  deal_structure_watch: Array<{
    structure_type: string;
    description: string;
    companies_involved: string[];
    strategic_implications: string;
  }>;
  outreach_targets: Array<{
    target_category: string;
    why_now: string;
    allowed_internal_action: string;
    priority: Priority;
    notes: string;
  }>;
  precedent_comps: Array<{
    deal_name: string;
    buyer: string;
    seller: string;
    target_asset: string;
    deal_value: string;
    deal_type: string;
    therapeutic_area: string;
    modality: string;
    stage_at_deal: string;
    deal_date: string;
    key_terms: string;
    strategic_rationale: string;
    relevance_note: string;
    explicitly_in_source?: boolean;
  }>;
  mispricing_flags: Array<{
    flag_headline: string;
    asset: string;
    company: string;
    current_valuation: string;
    implied_value: string;
    valuation_gap: string;
    rationale: string;
    strategic_implication: string;
    urgency: Urgency;
    therapeutic_area: string;
  }>;
}
