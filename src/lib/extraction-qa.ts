import { ExtractionJson, ExtractionSignal, QaMode } from './types';

export type QaBadge = 'clean' | 'needs_review' | 'possible_inference' | 'missing_source' | 'entity_confusion';
export type QaSeverity = 'blocking' | 'warning' | 'info';

export interface QaWarning {
  section: string;
  index?: number;
  field?: string;
  message: string;
  severity: QaSeverity;
  badge: QaBadge;
}

const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_URGENCIES = ['immediate', 'high', 'medium', 'low'];
const VALID_CONFIDENCES = ['high', 'medium', 'low', 'speculative'];
const VALID_STRATEGIC_CATEGORIES = ['comp_reset', 'leverage_reset', 'pricing_implication', 'screening_change', 'precedent', 'watchlist', 'mispricing', 'other'];
const VALID_BD_POSTURES = ['offensive', 'defensive', 'intelligence', 'neutral'];
const VALID_SIGNAL_TYPES = ['M&A', 'FDA approval', 'clinical data', 'regulatory', 'financing', 'appeal', 'partnership', 'deal structure', 'market signal', 'other'];
const SIGNAL_TYPE_SYNONYMS: Record<string, string> = {
  'acquisition': 'M&A',
  'm&a': 'M&A',
  'merger': 'M&A',
  'merger & acquisition': 'M&A',
  'takeover': 'M&A',
  'buyout': 'M&A',
  'licensing': 'partnership',
  'license': 'partnership',
  'collaboration': 'partnership',
  'deal_announced': 'deal structure',
  'deal announced': 'deal structure',
  'deal_structure': 'deal structure',
  'clinical_data': 'clinical data',
  'clinical': 'clinical data',
  'data readout': 'clinical data',
  'fda_approval': 'FDA approval',
  'approval': 'FDA approval',
  'regulatory_action': 'regulatory',
  'management': 'other',
  'competitive': 'market signal',
  'strategic_review': 'other',
  'strategic review': 'other',
};
const UNCERTAINTY_WORDS = /\b(depends|possibly|potentially|unclear|uncertain|perhaps|unconfirmed|rumored)\b/i;

const FIXTURE_COUNTS: Record<string, Record<string, { label: string; expected: number }>> = {
  'may_26_2026': {
    top_signals: { label: 'Top signals (high priority)', expected: 3 },
    second_tier_signals: { label: 'Second-tier signals (medium/low priority)', expected: 4 },
    deal_structure_watch: { label: 'Deal structure watch', expected: 3 },
    outreach_targets: { label: 'Outreach targets', expected: 4 },
    mispricing_flags: { label: 'Mispricing flags', expected: 1 },
    precedent_comps: { label: 'Precedent comps', expected: 5 },
    recommended_internal_actions: { label: 'Recommended internal actions', expected: 3 },
    leverage_resets: { label: 'Leverage resets', expected: 3 },
  },
  'may_31_2026': {
    top_signals: { label: 'Top items (high priority)', expected: 3 },
    second_tier_signals: { label: 'Second-tier signals', expected: 4 },
    deal_structure_watch: { label: 'Deal structure watch', expected: 3 },
    outreach_targets: { label: 'Outreach targets', expected: 5 },
    mispricing_flags: { label: 'Mispricing flags', expected: 1 },
    precedent_comps: { label: 'Precedent comps', expected: 7 },
    leverage_resets: { label: 'Leverage resets', expected: 4 },
    watchlist_items: { label: 'Watchlist items', expected: 4 },
    committee_action_queue: { label: 'Committee action queue', expected: 3 },
  },
};

const LIKELY_ASSET_PATTERNS = /^[A-Z]{2,}[-\s]?\d|tide$|mab$|nib$|ib$|zumab$|ximab$|umab$|tinib$|ciclib$|parib$|ratide$|glutide$/i;

// Company alias map: raw short name -> acceptable normalized form
const COMPANY_ALIASES: Record<string, string[]> = {
  'lilly': ['eli lilly and company', 'eli lilly', 'lilly'],
  'eli lilly': ['eli lilly and company', 'eli lilly', 'lilly'],
  'eli lilly and company': ['eli lilly', 'lilly'],
  'biomarin': ['biomarin pharmaceutical inc.', 'biomarin pharmaceutical', 'biomarin'],
  'biomarin pharmaceutical': ['biomarin', 'biomarin pharmaceutical inc.'],
  'biomarin pharmaceutical inc.': ['biomarin', 'biomarin pharmaceutical'],
  'merck': ['merck & co., inc.', 'merck & co.', 'merck'],
  'merck & co.': ['merck', 'merck & co., inc.'],
  'merck & co., inc.': ['merck', 'merck & co.'],
  'outlook': ['outlook therapeutics', 'outlook'],
  'outlook therapeutics': ['outlook'],
  'bristol myers squibb': ['bms', 'bristol-myers squibb'],
  'bristol-myers squibb': ['bms', 'bristol myers squibb'],
  'bms': ['bristol myers squibb', 'bristol-myers squibb'],
  'glaxosmithkline': ['gsk'],
  'gsk': ['glaxosmithkline'],
  'abbvie': ['abbvie'],
  'immunogen': ['immunogen'],
  'ionis': ['ionis pharmaceuticals'],
  'ionis pharmaceuticals': ['ionis'],
};

function isNormalizedMatchForRaw(normalized: string, rawCompanies: string[]): boolean {
  const normLower = normalized.toLowerCase().trim();
  for (const raw of rawCompanies) {
    const rawLower = raw.toLowerCase().trim();
    if (rawLower.includes(normLower.slice(0, 4))) return true;
    const aliases = COMPANY_ALIASES[rawLower];
    if (aliases && aliases.some(a => a.toLowerCase() === normLower)) return true;
    const normAliases = COMPANY_ALIASES[normLower];
    if (normAliases && normAliases.some(a => a.toLowerCase() === rawLower)) return true;
  }
  return false;
}

function companyAppearsInSource(companyName: string, sourceChunk: string): boolean {
  if (!companyName) return false;
  const nameLower = companyName.toLowerCase().trim();
  // Known pharma companies in alias map are always considered valid
  if (COMPANY_ALIASES[nameLower] || KNOWN_COMPANY_ABBREVIATIONS.has(nameLower)) return true;
  if (!sourceChunk) return false;
  const chunkLower = sourceChunk.toLowerCase();
  if (chunkLower.includes(nameLower)) return true;
  const aliases = COMPANY_ALIASES[nameLower];
  if (aliases) {
    for (const alias of aliases) {
      if (chunkLower.includes(alias.toLowerCase())) return true;
    }
  }
  return false;
}

const KNOWN_COMPANY_ABBREVIATIONS = new Set([
  'bms', 'gsk', 'jnj', 'msd', 'mck', 'abbvie', 'pfizer', 'roche', 'novartis',
  'sanofi', 'astrazeneca', 'amgen', 'regeneron', 'gilead', 'biogen', 'vertex',
  'ionis', 'immunogen', 'bayer', 'takeda', 'daiichi', 'eisai',
]);

function isLikelyAssetName(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (KNOWN_COMPANY_ABBREVIATIONS.has(trimmed.toLowerCase())) return false;
  if (LIKELY_ASSET_PATTERNS.test(trimmed)) return true;
  if (/^[A-Z][a-z]+[A-Z]/.test(trimmed)) return false;
  if (trimmed === trimmed.toUpperCase() && trimmed.length <= 10 && !/\s/.test(trimmed)) return true;
  return false;
}

// Placeholder detection for residual check
const PLACEHOLDER_SUBSTRINGS = [
  "e.g.", "example", "vol. 12, no. 21", "yyyy-mm-dd",
  "canonical company names", "corporate entity names from document",
  "exact names from document", "exact text from document",
  "standardized form", "drug/program names",
  "question for bd committee discussion", "fda, ema, etc.",
  "string array", "or empty if inferred", "source urls or references",
  "drug/product/pipeline names", "specific near-term action item",
  "logical reasoning connecting", "what this means from a bd perspective",
  "factual description of what occurred", "executive summary of the bd landscape",
  "publisher name", "brief title", "signal headline", "concise signal headline",
];

function containsPlaceholder(value: string): boolean {
  if (!value || value.length < 3) return false;
  const lower = value.toLowerCase().trim();
  if (lower === "string") return true;
  for (const p of PLACEHOLDER_SUBSTRINGS) {
    if (p === "string") continue;
    if (lower.includes(p)) return true;
  }
  return false;
}

function checkPlaceholderResidual(obj: unknown, path: string, warnings: QaWarning[]): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    if (containsPlaceholder(obj)) {
      warnings.push({
        section: 'placeholder_residual', field: path,
        message: `Placeholder/schema example text remains: "${obj.slice(0, 60)}"`,
        severity: 'blocking', badge: 'needs_review',
      });
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      checkPlaceholderResidual(obj[i], `${path}[${i}]`, warnings);
    }
    return;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'source_chunk_text' || key === '_qa_mode') continue;
      checkPlaceholderResidual(value, path ? `${path}.${key}` : key, warnings);
    }
  }
}

export function computeQaWarnings(data: ExtractionJson, mode: QaMode = 'production'): QaWarning[] {
  const warnings: QaWarning[] = [];

  const allCompanyNames = new Set<string>();
  const allAssetNames = new Set<string>();

  // Build global asset index per signal for cross-contamination check
  const signalAssetSets: Set<string>[] = [];

  for (const sig of data.bd_signals ?? []) {
    for (const c of [...(sig.company_names_raw ?? []), ...(sig.companies_normalized ?? []), ...(sig.companies ?? [])]) {
      if (c) allCompanyNames.add(c.toLowerCase());
    }
    const sigAssets = new Set<string>();
    for (const a of sig.assets ?? []) {
      if (a) {
        allAssetNames.add(a.toLowerCase());
        sigAssets.add(a.toLowerCase());
      }
    }
    signalAssetSets.push(sigAssets);
  }

  // Build global set of all asset names across all signals
  const globalAssetNames = new Set<string>();
  for (const sig of data.bd_signals ?? []) {
    for (const a of sig.assets ?? []) {
      if (a) globalAssetNames.add(a.toLowerCase());
    }
  }

  for (let i = 0; i < (data.bd_signals ?? []).length; i++) {
    const sig = data.bd_signals[i];

    const rawCompanies = sig.company_names_raw ?? sig.companies ?? [];
    const normCompanies = sig.companies_normalized ?? [];

    // Inferred companies (warning) - with alias map support
    if (normCompanies.length > 0 && rawCompanies.length === 0) {
      warnings.push({
        section: 'bd_signals', index: i, field: 'companies',
        message: `Signal "${sig.headline}" has normalized companies but no raw text -- possible inference`,
        severity: 'warning', badge: 'possible_inference',
      });
    }
    for (const nc of normCompanies) {
      if (nc && rawCompanies.length > 0 && !isNormalizedMatchForRaw(nc, rawCompanies)) {
        warnings.push({
          section: 'bd_signals', index: i, field: 'companies',
          message: `"${nc}" in normalized companies not clearly matched in raw text`,
          severity: 'warning', badge: 'possible_inference',
        });
      }
    }

    // Inferred/hallucinated companies: company not in any signal text (blocking)
    // Build validation text from this signal's fields AND all signals' full text content
    const allSignalText = (data.bd_signals ?? [])
      .map(s => [
        s.source_chunk_text ?? '',
        s.headline ?? '',
        s.what_changed ?? '',
        s.bd_interpretation ?? '',
        ...(s.company_names_raw ?? []),
        ...(s.companies_normalized ?? []),
        ...(s.assets ?? []),
        ...(s.sources ?? []),
      ].join(' ')).join(' ');
    const precedentCompText = (data.precedent_comps ?? [])
      .map(pc => [
        pc.company ?? '', pc.asset ?? '', pc.partner ?? '',
        pc.relevance_note ?? '', pc.key_terms ?? '',
      ].join(' ')).join(' ');
    const signalValidationText = [
      sig.source_chunk_text ?? '',
      sig.headline ?? '',
      sig.what_changed ?? '',
      sig.bd_interpretation ?? '',
      ...(sig.sources ?? []),
      allSignalText,
      precedentCompText,
    ].join(' ');
    if (signalValidationText.length > 20) {
      for (const cName of rawCompanies) {
        if (cName && !companyAppearsInSource(cName, signalValidationText)) {
          warnings.push({
            section: 'bd_signals', index: i, field: 'company_names_raw',
            message: `Inferred/hallucinated company "${cName}" not found in source text`,
            severity: 'blocking', badge: 'entity_confusion',
          });
        }
      }
    }

    // Detect acquisition targets in this signal
    const sigText = [
      sig.source_chunk_text ?? '', sig.what_changed ?? '', sig.headline ?? '',
    ].join(' ').toLowerCase();
    const acqTargets = new Set<string>();
    const ACQ_VERBS = [/acquir(?:e|ed|es|ing)\s+/g, /agreement(?:s)?\s+to\s+acquire\s+/g, /buy(?:s|ing)?\s+/g, /purchase(?:d|s)?\s+/g];
    for (const pattern of ACQ_VERBS) {
      let m;
      while ((m = pattern.exec(sigText)) !== null) {
        const after = sigText.slice(m.index + m[0].length, m.index + m[0].length + 200);
        for (const c of [...rawCompanies, ...normCompanies]) {
          if (after.includes(c.toLowerCase())) acqTargets.add(c.toLowerCase());
        }
      }
    }

    // Asset/company confusion: same exact string in both fields (blocking unless acquisition target)
    const companySet = new Set([...rawCompanies, ...normCompanies].map(c => c.toLowerCase()));
    for (const asset of sig.assets ?? []) {
      if (asset && companySet.has(asset.toLowerCase()) && !acqTargets.has(asset.toLowerCase())) {
        warnings.push({
          section: 'bd_signals', index: i, field: 'companies/assets',
          message: `"${asset}" appears in both company and asset fields -- asset/company confusion`,
          severity: 'blocking', badge: 'entity_confusion',
        });
      }
    }

    // Likely asset name appearing as company (warning, not blocking -- edge function handles removal)
    for (const cName of [...rawCompanies, ...normCompanies]) {
      if (cName && isLikelyAssetName(cName)) {
        warnings.push({
          section: 'bd_signals', index: i, field: 'companies',
          message: `"${cName}" may be a product/drug name placed in company field`,
          severity: 'warning', badge: 'entity_confusion',
        });
      }
    }

    // Cross-signal asset contamination check (blocking) - only for named products, not class/modality terms
    const MODALITY_CLASS_TERMS = new Set([
      'adc', 'trop2 adc', 'antibody-drug conjugate', 'glp-1', 'incretin',
      'vaccine', 'antiviral', 'monoclonal antibody', 'anti-vegf', 'oncology',
      'tnbc', 'hdv', 'namd', 'bispecific', 'car-t', 'cell therapy', 'gene therapy',
      'small molecule', 'biosimilar', 'checkpoint inhibitor', 'pd-1', 'pd-l1',
    ]);
    const thisSignalAssets = signalAssetSets[i] ?? new Set<string>();
    const headline = sig.headline ?? '';
    if (headline) {
      const headlineLower = headline.toLowerCase();
      for (const assetName of globalAssetNames) {
        if (assetName.length >= 4 && headlineLower.includes(assetName) && !thisSignalAssets.has(assetName)) {
          if (MODALITY_CLASS_TERMS.has(assetName)) continue;
          warnings.push({
            section: 'bd_signals', index: i, field: 'headline',
            message: `Possible cross-signal asset contamination: headline mentions "${assetName}" which belongs to another signal`,
            severity: 'blocking', badge: 'entity_confusion',
          });
        }
      }
    }

    // Modality inference check (warning)
    if (sig.modality_normalized && !sig.modality_raw) {
      warnings.push({
        section: 'bd_signals', index: i, field: 'modality_normalized',
        message: `Modality "${sig.modality_normalized}" may be inferred (no raw text source)`,
        severity: 'warning', badge: 'possible_inference',
      });
    }

    // Missing source URL (info)
    if (!sig.sources || sig.sources.length === 0 || sig.sources.every(s => !s)) {
      warnings.push({
        section: 'bd_signals', index: i, field: 'sources',
        message: `Signal "${sig.headline}" has no source references`,
        severity: 'info', badge: 'missing_source',
      });
    }

    // High fact_confidence with uncertainty language (warning)
    const factConf = sig.fact_confidence ?? sig.confidence;
    if (factConf === 'high') {
      const factualFields = [sig.headline, sig.what_changed, sig.event_date];
      for (const text of factualFields) {
        if (text && UNCERTAINTY_WORDS.test(text)) {
          warnings.push({
            section: 'bd_signals', index: i, field: 'fact_confidence',
            message: `Signal "${sig.headline}" marked high fact_confidence but factual fields contain uncertainty language`,
            severity: 'warning', badge: 'needs_review',
          });
          break;
        }
      }
    }

    // Invalid enum values (warning - edge function normalizes these automatically)
    if (sig.priority && !VALID_PRIORITIES.includes(sig.priority)) {
      warnings.push({
        section: 'bd_signals', index: i, field: 'priority',
        message: `Signal "${sig.headline}" has invalid priority: "${sig.priority}"`,
        severity: 'warning', badge: 'needs_review',
      });
    }
    if (sig.urgency && !VALID_URGENCIES.includes(sig.urgency)) {
      warnings.push({
        section: 'bd_signals', index: i, field: 'urgency',
        message: `Signal "${sig.headline}" has invalid urgency: "${sig.urgency}"`,
        severity: 'warning', badge: 'needs_review',
      });
    }
    if (sig.strategic_category && !VALID_STRATEGIC_CATEGORIES.includes(sig.strategic_category)) {
      const rawVal = sig.strategic_category;
      if (rawVal.includes('|') || rawVal.includes(',')) {
        const parts = rawVal.split(/[|,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
        const validParts = parts.filter(p => VALID_STRATEGIC_CATEGORIES.includes(p));
        if (validParts.length > 0) {
          warnings.push({
            section: 'bd_signals', index: i, field: 'strategic_category',
            message: `Multiple strategic categories normalized: "${rawVal}" -> primary="${validParts[0]}"`,
            severity: 'info', badge: 'needs_review',
          });
        } else {
          warnings.push({
            section: 'bd_signals', index: i, field: 'strategic_category',
            message: `Signal "${sig.headline}" has invalid strategic_category: "${rawVal}"`,
            severity: 'warning', badge: 'needs_review',
          });
        }
      } else {
        warnings.push({
          section: 'bd_signals', index: i, field: 'strategic_category',
          message: `Signal "${sig.headline}" has invalid strategic_category: "${rawVal}"`,
          severity: 'warning', badge: 'needs_review',
        });
      }
    }
    if (sig.bd_posture && !VALID_BD_POSTURES.includes(sig.bd_posture)) {
      warnings.push({
        section: 'bd_signals', index: i, field: 'bd_posture',
        message: `Signal "${sig.headline}" has invalid bd_posture: "${sig.bd_posture}"`,
        severity: 'warning', badge: 'needs_review',
      });
    }
    if (sig.signal_type && !VALID_SIGNAL_TYPES.includes(sig.signal_type)) {
      warnings.push({
        section: 'bd_signals', index: i, field: 'signal_type',
        message: `Signal "${sig.headline}" has signal_type "${sig.signal_type}" outside the import contract (allowed: ${VALID_SIGNAL_TYPES.join(', ')})`,
        severity: 'blocking', badge: 'needs_review',
      });
    }
    for (const confField of ['fact_confidence', 'implication_confidence', 'extraction_confidence'] as const) {
      const val = sig[confField];
      if (val && !VALID_CONFIDENCES.includes(val)) {
        warnings.push({
          section: 'bd_signals', index: i, field: confField,
          message: `Signal "${sig.headline}" has invalid ${confField}: "${val}"`,
          severity: 'warning', badge: 'needs_review',
        });
      }
    }
  }

  // Section count deviation warnings
  // Only check counts if a specific fixture is identified; otherwise info-only
  const fixtureId = data._fixture_id;
  const expectedCounts = fixtureId ? FIXTURE_COUNTS[fixtureId] : undefined;

  if (expectedCounts) {
    const highPrioritySignals = (data.bd_signals ?? []).filter(s => s.priority === 'high').length;
    const otherSignals = (data.bd_signals ?? []).length - highPrioritySignals;

    const countChecks: Array<{ key: string; actual: number }> = [
      { key: 'top_signals', actual: highPrioritySignals },
      { key: 'second_tier_signals', actual: otherSignals },
      { key: 'deal_structure_watch', actual: (data.deal_structure_watch ?? []).length },
      { key: 'outreach_targets', actual: (data.outreach_targets ?? []).length },
      { key: 'mispricing_flags', actual: (data.mispricing_flags ?? []).length },
      { key: 'precedent_comps', actual: (data.precedent_comps ?? []).length },
      { key: 'recommended_internal_actions', actual: (data.recommended_internal_actions ?? []).length },
      { key: 'leverage_resets', actual: (data.leverage_resets ?? []).length },
    ];

    for (const { key, actual } of countChecks) {
      const entry = expectedCounts[key];
      if (!entry) continue;
      const { label, expected } = entry;
      if (actual !== expected) {
        warnings.push({
          section: 'counts',
          message: `${label}: expected ~${expected}, got ${actual}`,
          severity: mode === 'test_fixture' ? 'warning' : 'info',
          badge: actual === 0 ? 'missing_source' : 'needs_review',
        });
      }
    }
  }

  // Precedent comps not explicitly in source (warning)
  for (let i = 0; i < (data.precedent_comps ?? []).length; i++) {
    const pc = data.precedent_comps[i];
    if (pc.explicitly_in_source === false) {
      warnings.push({
        section: 'precedent_comps', index: i, field: 'explicitly_in_source',
        message: `Precedent comp "${pc.deal_name}" may not be explicitly present in source document`,
        severity: 'warning', badge: 'possible_inference',
      });
    }
    if (!pc.deal_name && !pc.buyer && !pc.seller) {
      warnings.push({
        section: 'precedent_comps', index: i,
        message: `Precedent comp at index ${i} has no deal name, buyer, or seller`,
        severity: 'blocking', badge: 'needs_review',
      });
    }
  }

  // Mispricing flags with invalid urgency (warning - auto-normalizable)
  for (let i = 0; i < (data.mispricing_flags ?? []).length; i++) {
    const mf = data.mispricing_flags[i];
    if (mf.urgency && !VALID_URGENCIES.includes(mf.urgency)) {
      warnings.push({
        section: 'mispricing_flags', index: i, field: 'urgency',
        message: `Mispricing flag "${mf.flag_headline}" has invalid urgency: "${mf.urgency}"`,
        severity: 'warning', badge: 'needs_review',
      });
    }
  }

  // Global cross-check: asset names that appear in company fields (blocking)
  for (const assetName of allAssetNames) {
    if (allCompanyNames.has(assetName)) {
      warnings.push({
        section: 'global',
        message: `"${assetName}" appears as both a company and an asset across signals -- entity confusion`,
        severity: 'blocking', badge: 'entity_confusion',
      });
    }
  }

  // Final residual placeholder check (blocking)
  checkPlaceholderResidual(data, '', warnings);

  return warnings;
}

export function computeSignalBadge(sig: ExtractionSignal): QaBadge {
  const rawCompanies = sig.company_names_raw ?? sig.companies ?? [];
  const normCompanies = sig.companies_normalized ?? [];

  const companySet = new Set([...rawCompanies, ...normCompanies].map(c => c.toLowerCase()));
  for (const asset of sig.assets ?? []) {
    if (asset && companySet.has(asset.toLowerCase())) return 'entity_confusion';
  }
  for (const cName of [...rawCompanies, ...normCompanies]) {
    if (cName && isLikelyAssetName(cName)) return 'entity_confusion';
  }

  if (normCompanies.length > 0 && rawCompanies.length === 0) return 'possible_inference';
  for (const nc of normCompanies) {
    if (nc && rawCompanies.length > 0 && !isNormalizedMatchForRaw(nc, rawCompanies)) {
      return 'possible_inference';
    }
  }

  if (sig.modality_normalized && !sig.modality_raw) return 'possible_inference';

  if (!sig.sources || sig.sources.length === 0 || sig.sources.every(s => !s)) return 'missing_source';

  const factConf = sig.fact_confidence ?? sig.confidence;
  if (factConf === 'high') {
    const factualText = [sig.headline, sig.what_changed, sig.event_date].join(' ');
    if (UNCERTAINTY_WORDS.test(factualText)) return 'needs_review';
  }

  if (sig.priority && !VALID_PRIORITIES.includes(sig.priority)) return 'needs_review';
  if (sig.urgency && !VALID_URGENCIES.includes(sig.urgency)) return 'needs_review';
  if (sig.strategic_category && !VALID_STRATEGIC_CATEGORIES.includes(sig.strategic_category)) return 'needs_review';
  if (sig.bd_posture && !VALID_BD_POSTURES.includes(sig.bd_posture)) return 'needs_review';
  if (sig.signal_type && !VALID_SIGNAL_TYPES.includes(sig.signal_type)) return 'needs_review';

  return 'clean';
}

export function computeCompBadge(pc: ExtractionJson['precedent_comps'][number]): QaBadge {
  if (pc.explicitly_in_source === false) return 'possible_inference';
  if (!pc.deal_name && !pc.buyer && !pc.seller) return 'needs_review';
  return 'clean';
}

export function computeOutreachBadge(ot: ExtractionJson['outreach_targets'][number]): QaBadge {
  if (ot.priority && !VALID_PRIORITIES.includes(ot.priority)) return 'needs_review';
  if (!ot.target_category) return 'missing_source';
  return 'clean';
}

export function computeGenericBadge(item: { sources?: string[]; company?: string; priority?: string; urgency?: string }): QaBadge {
  if (item.priority && !VALID_PRIORITIES.includes(item.priority)) return 'needs_review';
  if (item.urgency && !VALID_URGENCIES.includes(item.urgency)) return 'needs_review';
  return 'clean';
}

export interface PlaceholderHit {
  path: string;
  value: string;
}

export function scanForPlaceholders(obj: unknown, path = ''): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  if (obj === null || obj === undefined) return hits;

  if (typeof obj === 'string') {
    if (containsPlaceholder(obj)) {
      hits.push({ path, value: obj.slice(0, 100) });
    }
    return hits;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      hits.push(...scanForPlaceholders(obj[i], `${path}[${i}]`));
    }
    return hits;
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'source_chunk_text') continue;
      hits.push(...scanForPlaceholders(value, path ? `${path}.${key}` : key));
    }
  }

  return hits;
}

export function finalReviewSanitizer(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    if (containsPlaceholder(obj)) return '';
    if (obj.trim() === '(none)' || obj.trim() === '(empty)') return '';
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .map(item => {
        if (typeof item === 'string') {
          if (containsPlaceholder(item)) return null;
          if (item.trim() === '(none)' || item.trim() === '(empty)') return null;
          return item || null;
        }
        if (typeof item === 'object' && item !== null) return finalReviewSanitizer(item);
        return item;
      })
      .filter(item => item !== null && item !== '');
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'source_chunk_text' || key === '_qa_mode') {
        result[key] = value;
        continue;
      }
      result[key] = finalReviewSanitizer(value);
    }
    return result;
  }

  return obj;
}

export function normalizeExtraction(data: ExtractionJson): ExtractionJson {
  const result = { ...data };
  if (Array.isArray(result.bd_signals)) {
    result.bd_signals = result.bd_signals.map(sig => {
      const updated = { ...sig };
      const rawCat = updated.strategic_category;
      if (rawCat && !VALID_STRATEGIC_CATEGORIES.includes(rawCat)) {
        if (rawCat.includes('|') || rawCat.includes(',')) {
          const parts = rawCat.split(/[|,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
          const validParts = parts.filter(p => VALID_STRATEGIC_CATEGORIES.includes(p));
          if (validParts.length > 0) {
            updated.strategic_category = validParts[0];
            updated.secondary_strategic_categories = validParts.slice(1);
          } else {
            updated.strategic_category = 'other';
            updated.secondary_strategic_categories = [];
          }
        } else {
          updated.strategic_category = 'other';
        }
      }
      const rawType = updated.signal_type;
      if (rawType && !VALID_SIGNAL_TYPES.includes(rawType)) {
        const mapped = SIGNAL_TYPE_SYNONYMS[rawType.toLowerCase().trim()];
        updated.signal_type = mapped ?? 'other';
      }
      return updated;
    });
  }
  return result;
}
