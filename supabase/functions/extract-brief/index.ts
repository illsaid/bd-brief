import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function resolveModel(envVar: string, fallback: string): string {
  const val = Deno.env.get(envVar);
  if (val && val.startsWith("claude-")) return val;
  return fallback;
}

const HAIKU = resolveModel("ANTHROPIC_EXTRACT_MODEL", "claude-haiku-4-5-20251001");
const SONNET = resolveModel("ANTHROPIC_FALLBACK_MODEL", "claude-sonnet-4-6");

// --- Shared prompt rules ---

const SHARED_RULES = `Rules:
- Do NOT infer company ownership or deal parties unless explicitly stated in the provided text.
- Do NOT add company owners, sponsors, acquirers, licensors, or partners from outside knowledge.
- If an asset is named but its corporate owner is not named in the provided chunk, leave companies empty.
- Drug/brand/product/trial/asset names are NOT companies. Only named corporate entities are companies.
- FDA, EMA, and other regulators are NOT companies. Place them in regulators array.
- Keep values concise. Extract faithfully without expanding beyond source text.
- Use empty string "" for missing strings, empty array [] for missing arrays.
- Do NOT use placeholder text like "e.g.", "YYYY-MM-DD", "string", etc. Only use real extracted values or empty.
- Return ONLY valid JSON. No markdown, no explanation.`;

// --- Section prompts ---

const PROMPT_METADATA = `You extract issue metadata and board summary from a biotech BD brief.

${SHARED_RULES}

- Do NOT invent issue_number, issue_date, title, or source. If a field is not explicitly stated in the text, return "".

Return this exact shape:
{
  "issue_metadata": {
    "issue_number": "",
    "issue_date": "",
    "title": "",
    "source": "",
    "brief_type": "weekly | monthly | special"
  },
  "board_summary": {
    "narrative": "",
    "key_themes": []
  }
}`;

const PROMPT_BD_SIGNALS = `You extract BD signals from a biotech business development brief.

${SHARED_RULES}

SECTION HIERARCHY -- FOLLOW STRICTLY:
- Items under "TOP 3 ITEMS" or "TOP 3" or "FULL ANALYSIS" headings = HIGH priority bd_signals. Extract ALL of them.
- Items under "SECOND TIER" or "SECOND-TIER" headings = MEDIUM priority bd_signals. Extract ALL of them.
- Items under "WATCH LIST", "WATCH LIST -- REVIEWED, NOT ELEVATED", "Reviewed, not elevated", or "Not elevated" headings = extract them as bd_signals BUT keep them structurally contained:
    * strategic_category = "watchlist"
    * priority = "low"
    * urgency = "low"
    * bd_posture = "defensive" or "intelligence" (choose based on content; default "intelligence")
    * review_status = "pending"
    * Do NOT assign high fact_confidence unless the source text clearly supports it; otherwise leave fact_confidence empty or "low".
  Never elevate them to high/medium priority and never treat them as Top 3 / Second Tier items. They must be preserved (not dropped) so they import as watchlist rows.
- WATCH LIST CONTAINMENT: a watchlist item is for visibility only. Do NOT also emit it as a precedent_comp, recommended_internal_action, deal_structure_watch record, outreach_target, or mispricing_flag UNLESS that same item is independently and explicitly listed under that other section's heading. Example: "Takeda zasocitinib head-to-head psoriasis data" appearing only under WATCH LIST stays a low-priority watchlist bd_signal only -- it must not become a precedent comp, recommended action, or outreach target.
- WATCH LIST ENTITY PRESERVATION: even though a watchlist item is contained, you MUST still extract explicitly named entities from its title/body. Companies named in the item go in company_names_raw/companies_normalized; named drugs/assets go in assets; regulators go in regulators ONLY if explicitly stated. Do NOT move explicitly named companies/assets into tags only. Examples: "Takeda zasocitinib head-to-head psoriasis data" -> companies: ["Takeda"], assets: ["zasocitinib"], strategic_category: "watchlist", priority: "low", sources: empty if none given. "Moderna flu vaccine AdCom" -> companies: ["Moderna"], assets: ["flu vaccine"] (only if a descriptive program name is acceptable, else empty), regulators: ["FDA"] only if explicitly stated, strategic_category: "watchlist", priority: "low".
- A watchlist item with no explicit source citation: leave sources empty. Do not fabricate a source.
- When in doubt about priority: if an item has its own full analysis section with subsections (what_changed, bd_interpretation, etc.), treat it as high priority.

DO NOT INVENT FIELDS:
- Only populate a field if it is EXPLICITLY stated in the source. If owner, deadline, issue number, modality, stage, event_date, or therapeutic area are not explicitly stated, return null/empty for that field.
- Exceptions: _normalized fields and inference_chain/bd_interpretation/recommended_action may be derived. Never fabricate a factual field (event_date, modality_raw, therapeutic_area_raw, stage) that is not in the text.
- Preserve economics figures EXACTLY as written, including qualifiers and approximation marks. Do NOT round, merge, or "clean up" dollar figures. Example: if the source says milestones "up to ~$1.03B" and a broader/total marker "up-to-$1.14B", keep both distinct values verbatim; never collapse them into one number.

CRITICAL RULES FOR COMPANIES:
- Only include companies that are EXPLICITLY NAMED in the source text chunk you are given.
- Do NOT infer or hallucinate company names from world knowledge (e.g. do not add "Genmab" to a Datroway signal unless "Genmab" literally appears in the text).
- If a drug/asset is mentioned but its owner/sponsor is not named, leave company_names_raw and companies_normalized as empty arrays.
- Include source_chunk_text: the exact sentence(s) from the source that mention the companies you extracted.

SOURCE CHUNK TEXT RULES:
- source_chunk_text MUST include the item's heading/title line AND the descriptor line (e.g. "AbbVie / ImmunoGen · CD123-directed conjugate · BPDCN").
- For second-tier items: include the item heading, the company/modality/indication descriptor line, and any bracket citation (e.g. "[Source: FDA]", "[BMS]", "[Pfizer]").
- Do NOT limit source_chunk_text to just the body paragraph -- include ALL text that identifies the item including heading lines, company attributions, and source citations.
- sources array: extract bracket citations like [FDA], [BMS], [Pfizer], [AbbVie] as source entries. These indicate the data source for that item.

Additional rules for signals:
- signal_type MUST be exactly one of: M&A, FDA approval, clinical data, regulatory, financing, appeal, partnership, deal structure, market signal, other. Use these exact strings (correct spacing/casing). NEVER output "acquisition" (use "M&A"), "licensing"/"collaboration" (use "partnership"), "clinical_data" (use "clinical data"), "guidance" (use "regulatory"), or "mispricing" (use "market signal"). If none fit, use "other".
- ASSETS vs MODALITY/CLASS: the assets array holds only NAMED drugs, products, trials, platforms, programs, or specific deal assets (e.g. navacaprant, KOASTAL-2, AMT-130, Utebzi, PIVOT-PO, prifemilast). Do NOT put broad drug classes or modalities in assets -- those go in modality_raw. Class/modality terms include: ADC, DAC, ASO, siRNA, PARP, KOR antagonist, PDE4 inhibitor, senior debt, synthetic royalty, multispecific antibody, TCE.
- COMPANIES: do not drop an explicitly named company. If the raw text lists "Jazz, AbCellera" then both Jazz and AbCellera must appear in company_names_raw and companies_normalized. Known abbreviations (J&J, JNJ, BMS, GSK, Lilly, Merck, AZ, Roche, Sanofi, Takeda, Moderna) are companies, not drug names.
- SOURCE LABELS: preserve source labels exactly as written (e.g. "JNJ.com", "AbCellera Investors", "Neumora Therapeutics, Inc.", "PR Newswire", "Endpoints News", "Select Committee on the CCP"). Do not rewrite them.
- Do not extract deal-structure-watch, outreach-target, precedent-table, or mispricing-flag items unless they are explicitly written as BD signals.
- For _raw and _normalized variants: _raw = exact text from document, _normalized = standardized form or empty.
- modality_raw: only the exact modality text from the source. modality_normalized: only if clearly supported by document text.
- Confidence ratings: fact_confidence, implication_confidence, extraction_confidence (high|medium|low|speculative).
- FDA, EMA, or other regulators are NOT companies. Place them in regulators array, not company fields.

Return this exact shape:
{
  "bd_signals": [
    {
      "headline": "",
      "signal_type": "M&A | FDA approval | clinical data | regulatory | financing | appeal | partnership | deal structure | market signal | other",
      "strategic_category": "comp_reset | leverage_reset | pricing_implication | screening_change | precedent | watchlist | mispricing | other",
      "bd_posture": "offensive | defensive | intelligence | neutral",
      "priority": "high | medium | low",
      "urgency": "immediate | high | medium | low",
      "fact_confidence": "high | medium | low | speculative",
      "implication_confidence": "high | medium | low | speculative",
      "extraction_confidence": "high | medium | low | speculative",
      "review_status": "pending",
      "therapeutic_area_raw": "",
      "therapeutic_area_normalized": "",
      "modality_raw": "",
      "modality_normalized": "",
      "event_date": "",
      "what_changed": "",
      "bd_interpretation": "",
      "inference_chain": "",
      "committee_question": "",
      "recommended_action": "",
      "company_names_raw": [],
      "companies_normalized": [],
      "assets": [],
      "regulators": [],
      "source_entities": [],
      "sources": [],
      "tags": [],
      "source_chunk_text": ""
    }
  ]
}`;

const PROMPT_LEVERAGE_RESETS = `You extract leverage resets from a biotech BD brief.

${SHARED_RULES}

- ONLY create leverage_resets from explicit source sections labeled "Comp / Leverage Reset", "Leverage Reset", or "Slide 2 -- Comp / Leverage Reset".
- Do NOT create leverage reset records from Top BD signals, Second Tier signals, Watch List signals, Deal Structure Watch, Board Summary, or Recommended Internal Actions.
- Create exactly one record per explicit leverage reset bullet in that section. If the section has 2 bullets, return exactly 2 records.

Return this exact shape:
{
  "leverage_resets": [
    {
      "company": "",
      "asset": "",
      "reset_type": "",
      "description": "",
      "strategic_implication": ""
    }
  ]
}`;

const PROMPT_RECOMMENDED_ACTIONS = `You extract recommended internal actions from a biotech BD brief.

${SHARED_RULES}

- ONLY extract global actions that are explicitly listed under a global action section: "Recommended Internal Actions", "Committee Action Queue", or "Slide 3 -- Recommended Internal Actions". If the source lists 3 such actions, return exactly 3.
- Do NOT manufacture a global action from every Second Tier signal. A Second Tier item's "Action:" text belongs in that signal's recommended_action field, NOT here.
- Do NOT create global actions from Watch List items.
- "rationale" may be derived from the brief's analysis. But "owner" and "deadline" are factual fields: only populate them if the source EXPLICITLY names an owner or a deadline. Otherwise return "" -- never generate or guess an owner or deadline.

Return this exact shape:
{
  "recommended_internal_actions": [
    {
      "action": "",
      "rationale": "",
      "deadline": "",
      "owner": "",
      "priority": "high | medium | low"
    }
  ]
}`;

const PROMPT_DEAL_STRUCTURE = `You extract deal structure watch items and outreach targets from a biotech BD brief.

${SHARED_RULES}

- deal_structure_watch: ONLY extract from explicit "Deal Structure Watch" content. Create exactly one record per distinct pressure point/item in that section -- do NOT split a single pressure point into multiple records, and do NOT convert Second Tier regulatory items or Watch List items into deal-structure records unless they appear under Deal Structure Watch.
- outreach_targets: category-based, not necessarily company-specific. Extract the target category, why it is timely, and what action is allowed. Do NOT create outreach targets from Watch List items.

Return this exact shape:
{
  "deal_structure_watch": [
    {
      "structure_type": "",
      "description": "",
      "companies_involved": [],
      "strategic_implications": ""
    }
  ],
  "outreach_targets": [
    {
      "target_category": "",
      "why_now": "",
      "allowed_internal_action": "",
      "priority": "high | medium | low",
      "notes": ""
    }
  ]
}`;

const PROMPT_PRECEDENT_COMPS = `You extract precedent comps from a biotech BD brief.

${SHARED_RULES}

Extract only precedent-table / active-comp items explicitly present in the text.

- ONLY create precedent_comps from rows explicitly listed under "PRECEDENT TABLE", "PRECEDENT TABLE -- ACTIVE COMPS THIS CYCLE", or "PRECEDENT COMPS". The number of precedent_comps MUST equal the number of rows in that explicit table. Do NOT add rows sourced from the Board summary, Top signals, Second Tier signals, Watch List signals, Deal Structure Watch, or Recommended Internal Actions unless that same deal is also a row in the explicit precedent table.
- Preserve deal economics EXACTLY as written in deal_value and key_terms, including approximation marks (~), "up to" qualifiers, and distinct milestone vs. total figures. Do NOT round or merge values. Example: keep milestones "up to ~$1.03B" separate from a broader total "up-to-$1.14B".
- Do NOT invent deal_value, stage_at_deal, modality, therapeutic_area, or deal_date. If not explicitly stated, return "".

Return this exact shape:
{
  "precedent_comps": [
    {
      "deal_name": "",
      "buyer": "",
      "seller": "",
      "target_asset": "",
      "deal_value": "",
      "deal_type": "",
      "therapeutic_area": "",
      "modality": "",
      "stage_at_deal": "",
      "deal_date": "",
      "key_terms": "",
      "strategic_rationale": "",
      "relevance_note": "",
      "explicitly_in_source": true
    }
  ]
}`;

const PROMPT_MISPRICING = `You extract mispricing flags from a biotech BD brief.

${SHARED_RULES}

CRITICAL: Only extract items that are EXPLICITLY labeled as "MISPRICING FLAG" or "VALUATION FLAG" in the source.
- Do NOT infer or create mispricing flags from general BD commentary, deal analysis, or pricing implications mentioned elsewhere.
- If the source text does not explicitly mark something as a mispricing flag / valuation gap, do NOT include it.
- Typical BD implications about pricing, comps, or financing that appear in signal analysis sections belong in bd_signals, leverage_resets, or deal_structure_watch -- NOT here.
- When in doubt, leave this array empty. One correctly identified mispricing flag is better than three inferred ones.

Return this exact shape:
{
  "mispricing_flags": [
    {
      "flag_headline": "",
      "asset": "",
      "company": "",
      "current_valuation": "",
      "implied_value": "",
      "valuation_gap": "",
      "rationale": "",
      "strategic_implication": "",
      "urgency": "immediate | high | medium | low",
      "therapeutic_area": ""
    }
  ]
}`;

// --- Types ---

interface ExtractionRequest {
  text: string;
  issue_id?: string;
}

interface DiagnosticLog {
  timestamp: string;
  step: string;
  detail?: string;
}

type SectionSourceMode = "strict_chunk" | "chunk_plus_neighbors" | "full_document_fallback";

interface SectionStatus {
  section: string;
  status: "success" | "failed" | "skipped";
  model_used: string;
  elapsed_ms: number;
  error_message?: string;
  source_mode: SectionSourceMode;
}

interface SectionResult {
  data: Record<string, unknown> | null;
  status: SectionStatus;
}

// --- Helpers ---

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number,
  maxTokens: number
): Promise<{ text: string; status: number; duration: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const rawBody = await res.text();
    const duration = Date.now() - start;

    if (!res.ok) {
      throw new Error(`Anthropic API error (${res.status}): ${rawBody.slice(0, 500)}`);
    }

    const data = JSON.parse(rawBody);
    const block = data.content?.[0];

    if (block?.type === "text") {
      return { text: block.text, status: res.status, duration };
    }

    throw new Error("No text content in Anthropic response");
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function cleanJson(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    if (firstBrace !== -1) {
      cleaned = cleaned.slice(firstBrace);
      cleaned = repairTruncatedJson(cleaned);
    }
    return cleaned;
  }
}

function repairTruncatedJson(text: string): string {
  let result = text;
  const openBraces = (result.match(/\{/g) || []).length;
  const closeBraces = (result.match(/\}/g) || []).length;
  const openBrackets = (result.match(/\[/g) || []).length;
  const closeBrackets = (result.match(/\]/g) || []).length;

  result = result.replace(/,\s*"[^"]*$/, "");
  result = result.replace(/,\s*$/, "");
  result = result.replace(/:\s*"[^"]*$/, ': ""');
  result = result.replace(/:\s*$/, ': ""');

  const bracketsNeeded = openBrackets - closeBrackets;
  const bracesNeeded = openBraces - closeBraces;

  for (let i = 0; i < bracketsNeeded; i++) result += "]";
  for (let i = 0; i < bracesNeeded; i++) result += "}";

  return result;
}

// Salvages the valid object elements of a named top-level array, skipping any malformed ones.
// Used when a section's JSON is partially corrupt (e.g. one bad signal object) so a single
// malformed element does not discard the entire extraction.
function salvageArrayObjects(text: string, key: string): Record<string, unknown>[] | null {
  const keyIdx = text.indexOf(`"${key}"`);
  if (keyIdx === -1) return null;
  const arrStart = text.indexOf("[", keyIdx);
  if (arrStart === -1) return null;

  const objects: Record<string, unknown>[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;

  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const objStr = text.slice(objStart, i + 1);
        try {
          objects.push(JSON.parse(objStr));
        } catch {
          // skip malformed object, keep the rest
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }
  return objects.length > 0 ? objects : null;
}

// Parses a section's model output. Falls back to per-element salvage of the primary array
// (when provided) if the whole-document parse fails.
function parseSection(text: string, primaryArrayKey?: string): Record<string, unknown> {
  try {
    return JSON.parse(cleanJson(text));
  } catch (err) {
    if (primaryArrayKey) {
      const salvaged = salvageArrayObjects(text, primaryArrayKey);
      if (salvaged && salvaged.length > 0) {
        return { [primaryArrayKey]: salvaged };
      }
    }
    throw err;
  }
}

// --- Section Splitter ---

interface SectionChunks {
  metadata: string;
  bd_signals: string;
  leverage_resets: string;
  recommended_actions: string;
  deal_structure: string;
  precedent_comps: string;
  mispricing_flags: string;
}

const SECTION_PATTERNS: { key: keyof SectionChunks; patterns: RegExp[] }[] = [
  {
    key: "metadata",
    patterns: [
      /(?:^|\n)#{1,3}\s*(?:issue\s*metadata|brief\s*info|about\s*this\s*brief)/i,
      /(?:^|\n)(?:issue|brief)\s*(?:#|number|no\.?)/i,
    ],
  },
  {
    key: "bd_signals",
    patterns: [
      /(?:^|\n)#{1,3}\s*(?:bd\s*signals?|business\s*development\s*signals?|signals?\s*(?:&|and)\s*intelligence)/i,
      /(?:^|\n)#{1,3}\s*(?:top\s*\d+\s*items?|full\s*analysis|top\s*signals?)/i,
      /(?:^|\n)(?:bd\s*signals?|key\s*signals?|top\s*\d+\s*items?)/i,
    ],
  },
  {
    key: "leverage_resets",
    patterns: [
      /(?:^|\n)#{1,3}\s*(?:leverage\s*resets?|negotiating\s*leverage)/i,
      /(?:^|\n)leverage\s*resets?/i,
    ],
  },
  {
    key: "recommended_actions",
    patterns: [
      /(?:^|\n)#{1,3}\s*(?:recommended\s*(?:internal\s*)?actions?|action\s*items?|next\s*steps?)/i,
      /(?:^|\n)(?:recommended\s*actions?|action\s*items?)/i,
    ],
  },
  {
    key: "deal_structure",
    patterns: [
      /(?:^|\n)#{1,3}\s*(?:deal\s*structure|outreach|deal\s*watch)/i,
      /(?:^|\n)(?:deal\s*structure|outreach\s*targets?)/i,
    ],
  },
  {
    key: "precedent_comps",
    patterns: [
      /(?:^|\n)#{1,3}\s*(?:precedent\s*comps?|comp\s*table|comparable\s*deals?|active\s*comps?)/i,
      /(?:^|\n)(?:precedent\s*comps?|comp\s*table)/i,
    ],
  },
  {
    key: "mispricing_flags",
    patterns: [
      /(?:^|\n)#{1,3}\s*(?:mispricing|valuation\s*(?:flags?|gaps?)|mispriced)/i,
      /(?:^|\n)(?:mispricing\s*flags?|valuation\s*flags?)/i,
    ],
  },
];

function sectionizeBrief(fullText: string): { chunks: SectionChunks; detected: Set<keyof SectionChunks> } {
  const detected = new Set<keyof SectionChunks>();
  const positions: { key: keyof SectionChunks; start: number }[] = [];

  for (const { key, patterns } of SECTION_PATTERNS) {
    for (const pattern of patterns) {
      const match = fullText.match(pattern);
      if (match && match.index !== undefined) {
        positions.push({ key, start: match.index });
        detected.add(key);
        break;
      }
    }
  }

  positions.sort((a, b) => a.start - b.start);

  const chunks: SectionChunks = {
    metadata: fullText,
    bd_signals: fullText,
    leverage_resets: fullText,
    recommended_actions: fullText,
    deal_structure: fullText,
    precedent_comps: fullText,
    mispricing_flags: fullText,
  };

  if (positions.length >= 2) {
    for (let i = 0; i < positions.length; i++) {
      const { key, start } = positions[i];
      const end = i < positions.length - 1 ? positions[i + 1].start : fullText.length;
      const neighborStart = i > 0 ? positions[i - 1].start : 0;
      const neighborEnd = i < positions.length - 2 ? positions[i + 2].start : fullText.length;

      const chunk = fullText.slice(start, end);
      if (chunk.trim().length > 30) {
        chunks[key] = chunk;
      } else {
        chunks[key] = fullText.slice(neighborStart, neighborEnd);
      }
    }

    // For bd_signals: extend chunk to include SECOND TIER and WATCH LIST content.
    // Watchlist items are now extracted as bd_signals (classified as watchlist), so the
    // chunk must reach through the watch-list section, ending at the first genuine
    // non-signal section (leverage resets, deal structure, comps, mispricing, actions).
    if (detected.has("bd_signals")) {
      const bdStart = positions.find(p => p.key === "bd_signals")?.start ?? 0;
      const secondTierMatch = fullText.match(/(?:^|\n)#{1,3}\s*(?:second[\s-]*tier|additional\s*signals?)/i);
      const watchListMatch = fullText.match(/(?:^|\n)#{1,3}\s*(?:watch\s*list|watchlist|monitoring)/i);

      const extensionMarkers = [secondTierMatch?.index, watchListMatch?.index]
        .filter((idx): idx is number => idx !== undefined);

      if (extensionMarkers.length > 0) {
        const lastMarker = Math.max(...extensionMarkers);
        // End at the first non-signal detected section that starts after the last marker.
        const nonSignalAfter = positions
          .filter(p => p.key !== "bd_signals" && p.key !== "metadata" && p.start > lastMarker)
          .sort((a, b) => a.start - b.start);
        const end = nonSignalAfter.length > 0 ? nonSignalAfter[0].start : fullText.length;
        const extendedChunk = fullText.slice(Math.min(bdStart, ...extensionMarkers), end);
        if (extendedChunk.length > chunks.bd_signals.length) {
          chunks.bd_signals = extendedChunk;
        }
      }
    }

    if (detected.has("metadata")) {
      const firstNonMeta = positions.find((p) => p.key !== "metadata");
      if (firstNonMeta) {
        chunks.metadata = fullText.slice(0, firstNonMeta.start);
      }
    } else {
      const firstSection = positions[0];
      if (firstSection) {
        chunks.metadata = fullText.slice(0, firstSection.start + 200);
      }
    }
  }

  return { chunks, detected };
}

function getSourceMode(
  key: keyof SectionChunks,
  detected: Set<keyof SectionChunks>,
  chunks: SectionChunks,
  fullText: string
): SectionSourceMode {
  if (!detected.has(key)) return "full_document_fallback";
  if (chunks[key] === fullText) return "full_document_fallback";
  if (chunks[key].length > fullText.length * 0.6) return "chunk_plus_neighbors";
  return "strict_chunk";
}

// --- Per-Section Extraction ---

async function extractSection(
  apiKey: string,
  sectionName: string,
  prompt: string,
  text: string,
  timeoutMs: number,
  maxTokens: number,
  sourceMode: SectionSourceMode,
  primaryArrayKey?: string
): Promise<SectionResult> {
  const start = Date.now();
  const userContent = `BRIEF TEXT:\n\n${text}\n\n---\n\nReturn ONLY valid JSON.`;

  try {
    const result = await callClaude(apiKey, HAIKU, prompt, userContent, timeoutMs, maxTokens);
    const parsed = parseSection(result.text, primaryArrayKey);

    return {
      data: parsed,
      status: {
        section: sectionName,
        status: "success",
        model_used: HAIKU,
        elapsed_ms: Date.now() - start,
        source_mode: sourceMode,
      },
    };
  } catch (haikuErr) {
    const haikuMsg = haikuErr instanceof Error ? haikuErr.message : "Unknown";
    console.log(`[extract-brief] ${sectionName} Haiku failed: ${haikuMsg}, trying Sonnet`);

    try {
      const fallback = await callClaude(apiKey, SONNET, prompt, userContent, 85000, maxTokens);
      const parsed = parseSection(fallback.text, primaryArrayKey);

      return {
        data: parsed,
        status: {
          section: sectionName,
          status: "success",
          model_used: SONNET,
          elapsed_ms: Date.now() - start,
          source_mode: sourceMode,
        },
      };
    } catch (sonnetErr) {
      const sonnetMsg = sonnetErr instanceof Error ? sonnetErr.message : "Unknown";
      return {
        data: null,
        status: {
          section: sectionName,
          status: "failed",
          model_used: SONNET,
          elapsed_ms: Date.now() - start,
          error_message: `Haiku: ${haikuMsg}; Sonnet: ${sonnetMsg}`,
          source_mode: sourceMode,
        },
      };
    }
  }
}

// --- Merge Results ---

function mergeExtractionResults(results: SectionResult[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    issue_metadata: { issue_number: "", issue_date: "", title: "", source: "", brief_type: "weekly" },
    board_summary: { narrative: "", key_themes: [] },
    bd_signals: [],
    leverage_resets: [],
    recommended_internal_actions: [],
    deal_structure_watch: [],
    outreach_targets: [],
    precedent_comps: [],
    mispricing_flags: [],
  };

  for (const result of results) {
    if (!result.data) continue;
    for (const [key, value] of Object.entries(result.data)) {
      if (value !== null && value !== undefined) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function validateMergedExtraction(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!data.issue_metadata || typeof data.issue_metadata !== "object")
    errors.push("Missing issue_metadata");
  if (!data.board_summary || typeof data.board_summary !== "object")
    errors.push("Missing board_summary");
  if (!Array.isArray(data.bd_signals))
    errors.push("bd_signals must be an array");
  return errors;
}

// --- Post-Processing ---

// Controlled vocabulary for signal_type (import contract). Any output value must be one of these.
const VALID_SIGNAL_TYPES = [
  "M&A", "FDA approval", "clinical data", "regulatory", "financing",
  "appeal", "partnership", "deal structure", "market signal", "other",
];

// Maps common LLM synonyms / legacy values to the controlled vocabulary.
const SIGNAL_TYPE_SYNONYMS: Record<string, string> = {
  "acquisition": "M&A",
  "m&a": "M&A",
  "merger": "M&A",
  "merger & acquisition": "M&A",
  "takeover": "M&A",
  "buyout": "M&A",
  "licensing": "partnership",
  "license": "partnership",
  "collaboration": "partnership",
  "deal_announced": "deal structure",
  "deal announced": "deal structure",
  "deal_structure": "deal structure",
  "clinical_data": "clinical data",
  "clinical": "clinical data",
  "data readout": "clinical data",
  "fda_approval": "FDA approval",
  "approval": "FDA approval",
  "regulatory_action": "regulatory",
  "guidance": "regulatory",
  "regulatory_guidance": "regulatory",
  "mispricing": "market signal",
  "management": "other",
  "competitive": "market signal",
  "strategic_review": "other",
  "strategic review": "other",
};

// Normalizes a raw signal_type to the controlled vocabulary, or null if it cannot be mapped.
function normalizeSignalType(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const exact = VALID_SIGNAL_TYPES.find(v => v.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  const mapped = SIGNAL_TYPE_SYNONYMS[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return null;
}

type QaSeverity = "blocking" | "warning" | "info";

interface PostProcessWarning {
  section: string;
  index?: number;
  field?: string;
  message: string;
  severity: QaSeverity;
}

const ASSET_DENYLIST = new Set([
  "datroway", "hepcludex", "retatrutide", "voxzogo", "lytenava", "sac-tmt",
]);

// Broad drug classes / modalities that must NOT be stored as named assets.
const CLASS_MODALITY_TERMS = new Set([
  "adc", "dac", "aso", "sirna", "parp", "kor antagonist", "pde4 inhibitor",
  "senior debt", "synthetic royalty", "multispecific antibody", "tce",
  "antibody-drug conjugate", "bispecific", "monoclonal antibody", "small molecule",
]);

const REGULATOR_NAMES = new Set([
  "fda", "u.s. food and drug administration", "ema", "european medicines agency",
  "mhra", "pmda", "health canada", "tga",
]);

// Company alias map for source-chunk validation
const COMPANY_ALIAS_MAP: Record<string, string[]> = {
  "eli lilly and company": ["lilly", "eli lilly"],
  "eli lilly": ["lilly", "eli lilly and company"],
  "lilly": ["eli lilly", "eli lilly and company"],
  "biomarin pharmaceutical inc.": ["biomarin", "biomarin pharmaceutical"],
  "biomarin pharmaceutical": ["biomarin", "biomarin pharmaceutical inc."],
  "biomarin": ["biomarin pharmaceutical", "biomarin pharmaceutical inc."],
  "merck & co., inc.": ["merck", "merck & co."],
  "merck & co.": ["merck", "merck & co., inc."],
  "merck": ["merck & co.", "merck & co., inc."],
  "outlook therapeutics": ["outlook"],
  "outlook": ["outlook therapeutics"],
  "bristol myers squibb": ["bms", "bristol-myers squibb"],
  "bristol-myers squibb": ["bms", "bristol myers squibb"],
  "bms": ["bristol myers squibb", "bristol-myers squibb"],
  "glaxosmithkline": ["gsk"],
  "gsk": ["glaxosmithkline"],
  "abbvie": ["abbvie"],
  "immunogen": ["immunogen"],
  "ionis": ["ionis pharmaceuticals"],
  "ionis pharmaceuticals": ["ionis"],
};

// Known company names/abbreviations that are always valid (never flagged as hallucinated).
const KNOWN_COMPANY_NAMES = new Set([
  "bms", "gsk", "jnj", "j&j", "msd", "mck", "abbvie", "pfizer", "roche", "novartis",
  "sanofi", "astrazeneca", "az", "amgen", "regeneron", "gilead", "biogen", "vertex",
  "ionis", "immunogen", "bayer", "takeda", "daiichi", "eisai", "lilly", "merck", "moderna",
]);

function companyAppearsInSourceChunk(companyName: string, sourceChunk: string): boolean {
  if (!companyName) return false;
  const nameLower = companyName.toLowerCase().trim();
  // Known pharma companies in alias map / known-names set always pass validation
  if (COMPANY_ALIAS_MAP[nameLower] || KNOWN_COMPANY_NAMES.has(nameLower)) return true;
  if (!sourceChunk) return false;
  const chunkLower = sourceChunk.toLowerCase();

  // Direct match
  if (chunkLower.includes(nameLower)) return true;

  // Alias match
  const aliases = COMPANY_ALIAS_MAP[nameLower];
  if (aliases) {
    for (const alias of aliases) {
      if (chunkLower.includes(alias.toLowerCase())) return true;
    }
  }

  return false;
}

// Extracts the body text of a named source section (heading until the next heading/divider).
function extractSectionText(fullText: string, headingPattern: RegExp): string {
  const re = new RegExp(
    `(?:^|\\n)#{0,3}\\s*(?:${headingPattern.source})[\\s\\S]*?(?=\\n#{1,3}\\s|\\n---|\\n\\*\\*\\*|$)`,
    "i",
  );
  const m = fullText.match(re);
  return m ? m[0].toLowerCase() : "";
}

function postProcessExtraction(raw: Record<string, unknown>, fullText: string): {
  processed: Record<string, unknown>;
  qa_warnings: PostProcessWarning[];
} {
  const data = JSON.parse(JSON.stringify(raw));
  const warnings: PostProcessWarning[] = [];

  // --- BD Signals processing ---
  const signals = data.bd_signals as Array<Record<string, unknown>> | undefined;
  const mispricingFlags = data.mispricing_flags as Array<Record<string, unknown>> | undefined;

  if (Array.isArray(signals)) {
    const mispricingKeys = new Set<string>();
    if (Array.isArray(mispricingFlags)) {
      for (const mf of mispricingFlags) {
        const company = String(mf.company ?? "").toLowerCase();
        const asset = String(mf.asset ?? "").toLowerCase();
        if (company) mispricingKeys.add(company);
        if (asset) mispricingKeys.add(asset);
      }
    }

    const signalsToRemove: number[] = [];

    for (let i = 0; i < signals.length; i++) {
      const sig = signals[i];

      // Determine source chunk for this signal
      const sourceChunk = String(sig.source_chunk_text ?? "");
      // Build comprehensive validation text from all signal text fields + full document
      const signalTextFields = [
        sourceChunk,
        String(sig.headline ?? ""),
        String(sig.what_changed ?? ""),
        String(sig.bd_interpretation ?? ""),
        ...(Array.isArray(sig.sources) ? sig.sources.map(String) : []),
      ].join(" ");
      // Use signal text fields first; if too short, also include full document
      const validationText = signalTextFields.length > 20
        ? signalTextFields + " " + fullText
        : fullText;

      // --- FDA/regulator handling ---
      let rawCompanies = (sig.company_names_raw as string[]) ?? [];
      let normCompanies = (sig.companies_normalized as string[]) ?? [];
      const regulators: string[] = (sig.regulators as string[]) ?? [];

      const moveToRegulators = (name: string): boolean => {
        const lower = name.toLowerCase().trim();
        if (REGULATOR_NAMES.has(lower)) {
          if (!regulators.some(r => r.toLowerCase() === lower)) {
            regulators.push(name);
          }
          return true;
        }
        return false;
      };

      rawCompanies = rawCompanies.filter(c => !moveToRegulators(c));
      normCompanies = normCompanies.filter(c => !moveToRegulators(c));
      sig.regulators = regulators;
      if (!sig.source_entities) sig.source_entities = [];

      // --- Asset/company denylist cleanup ---
      const assets = (sig.assets as string[]) ?? [];
      const assetSet = new Set(assets.map((a: string) => a.toLowerCase()));

      // Detect acquisition targets: companies that appear after acquisition verbs should be preserved
      const signalText = [
        String(sig.source_chunk_text ?? ""),
        String(sig.what_changed ?? ""),
        String(sig.headline ?? ""),
      ].join(" ").toLowerCase();
      const ACQUISITION_PATTERNS = [
        /acquir(?:e|ed|es|ing)\s+/g,
        /agreement(?:s)?\s+to\s+acquire\s+/g,
        /buy(?:s|ing)?\s+/g,
        /purchase(?:d|s)?\s+/g,
        /takeover\s+of\s+/g,
      ];
      const acquisitionTargets = new Set<string>();
      for (const pattern of ACQUISITION_PATTERNS) {
        let match;
        while ((match = pattern.exec(signalText)) !== null) {
          const afterVerb = signalText.slice(match.index + match[0].length, match.index + match[0].length + 200);
          for (const cName of [...rawCompanies, ...normCompanies]) {
            if (afterVerb.includes(cName.toLowerCase())) {
              acquisitionTargets.add(cName.toLowerCase());
            }
          }
        }
      }

      const filterCompanyDenylist = (name: string): boolean => {
        const lower = name.toLowerCase().trim();
        if (ASSET_DENYLIST.has(lower)) {
          if (!assetSet.has(lower)) {
            assets.push(name);
            assetSet.add(lower);
          }
          warnings.push({
            section: "bd_signals", index: i, field: "company_names_raw",
            message: `Moved known product "${name}" from company field to assets (denylist)`,
            severity: "info",
          });
          return false;
        }
        if (assetSet.has(lower) && !acquisitionTargets.has(lower)) {
          warnings.push({
            section: "bd_signals", index: i, field: "company_names_raw",
            message: `Removed "${name}" from company field (already in assets)`,
            severity: "info",
          });
          return false;
        }
        return true;
      };

      rawCompanies = rawCompanies.filter(filterCompanyDenylist);
      normCompanies = normCompanies.filter(filterCompanyDenylist);

      // --- Source-chunk entity validation ---
      // Remove companies not found in source chunk text (inferred/hallucinated)
      rawCompanies = rawCompanies.filter(name => {
        if (companyAppearsInSourceChunk(name, validationText)) return true;
        warnings.push({
          section: "bd_signals", index: i, field: "company_names_raw",
          message: `Removed inferred/hallucinated company "${name}" (not found in source text)`,
          severity: "blocking",
        });
        return false;
      });

      normCompanies = normCompanies.filter(name => {
        // Normalized name is valid if: it appears in source, OR its raw counterpart does
        if (companyAppearsInSourceChunk(name, validationText)) return true;
        // Check if any remaining raw company is an alias
        const aliases = COMPANY_ALIAS_MAP[name.toLowerCase().trim()] ?? [];
        const hasRawMatch = rawCompanies.some(raw =>
          raw.toLowerCase().trim() === name.toLowerCase().trim() ||
          aliases.includes(raw.toLowerCase().trim())
        );
        if (hasRawMatch) return true;
        warnings.push({
          section: "bd_signals", index: i, field: "companies_normalized",
          message: `Removed inferred/hallucinated company "${name}" (not found in source text)`,
          severity: "blocking",
        });
        return false;
      });

      sig.company_names_raw = rawCompanies;
      // --- Preserve explicitly named raw companies in normalized field ---
      // Every validated raw company must appear in companies_normalized unless a retained
      // normalized entry is a confirmed alias that already represents it.
      const rawRepresented = (raw: string): boolean => {
        const lower = raw.toLowerCase().trim();
        if (normCompanies.some(n => n.toLowerCase().trim() === lower)) return true;
        return normCompanies.some(n => {
          const aliases = COMPANY_ALIAS_MAP[n.toLowerCase().trim()] ?? [];
          return aliases.includes(lower);
        });
      };
      for (const raw of rawCompanies) {
        if (!rawRepresented(raw)) {
          normCompanies.push(raw);
        }
      }
      sig.companies_normalized = normCompanies;
      // Drop broad drug-class / modality terms from assets (assets must be named products only).
      const classTermsInAssets: string[] = [];
      const namedAssets = assets.filter((a: string) => {
        if (CLASS_MODALITY_TERMS.has(String(a).toLowerCase().trim())) {
          classTermsInAssets.push(a);
          return false;
        }
        return true;
      });
      if (classTermsInAssets.length > 0) {
        if (!sig.modality_raw) sig.modality_raw = classTermsInAssets[0];
        warnings.push({
          section: "bd_signals", index: i, field: "assets",
          message: `Removed broad class/modality term(s) from assets: ${classTermsInAssets.join(", ")} (moved to modality)`,
          severity: "info",
        });
      }
      sig.assets = namedAssets;

      // --- Modality cleanup ---
      if (sig.modality !== undefined && sig.modality_raw === undefined) {
        sig.modality_raw = sig.modality;
        sig.modality_normalized = sig.modality;
        delete sig.modality;
      }
      if (sig.modality_normalized && !sig.modality_raw) {
        warnings.push({
          section: "bd_signals", index: i, field: "modality_normalized",
          message: `Modality "${sig.modality_normalized}" may be inferred (no raw text)`,
          severity: "warning",
        });
        sig.modality_normalized = "";
      }

      // --- Normalize strategic_category (handle pipe/comma-separated values) ---
      const VALID_STRATEGIC_CATEGORIES = [
        "comp_reset", "leverage_reset", "pricing_implication", "screening_change",
        "precedent", "watchlist", "mispricing", "other",
      ];
      const rawStratCat = String(sig.strategic_category ?? "").trim();
      if (rawStratCat.includes("|") || rawStratCat.includes(",")) {
        const parts = rawStratCat.split(/[|,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
        const validParts = parts.filter(p => VALID_STRATEGIC_CATEGORIES.includes(p));
        if (validParts.length > 0) {
          sig.strategic_category = validParts[0];
          sig.secondary_strategic_categories = validParts.slice(1);
          warnings.push({
            section: "bd_signals", index: i, field: "strategic_category",
            message: `Multiple strategic categories normalized: "${rawStratCat}" -> primary="${validParts[0]}"`,
            severity: "info",
          });
        } else {
          sig.strategic_category = "other";
          sig.secondary_strategic_categories = [];
        }
      } else if (rawStratCat && !VALID_STRATEGIC_CATEGORIES.includes(rawStratCat.toLowerCase())) {
        sig.strategic_category = "other";
        warnings.push({
          section: "bd_signals", index: i, field: "strategic_category",
          message: `Invalid strategic_category "${rawStratCat}" normalized to "other"`,
          severity: "info",
        });
      }

      // --- Normalize + validate signal_type against the controlled contract enum ---
      const rawSignalType = String(sig.signal_type ?? "").trim();
      if (rawSignalType) {
        const normalizedType = normalizeSignalType(rawSignalType);
        if (normalizedType) {
          if (normalizedType !== rawSignalType) {
            warnings.push({
              section: "bd_signals", index: i, field: "signal_type",
              message: `signal_type "${rawSignalType}" normalized to contract value "${normalizedType}"`,
              severity: "info",
            });
          }
          sig.signal_type = normalizedType;
        } else {
          // Out-of-contract value that cannot be mapped: reject (blocking) per import contract.
          warnings.push({
            section: "bd_signals", index: i, field: "signal_type",
            message: `signal_type "${rawSignalType}" is not in the allowed contract enum (${VALID_SIGNAL_TYPES.join(", ")})`,
            severity: "blocking",
          });
          sig.signal_type = "other";
        }
      }

      // --- Watchlist items: preserve but keep structurally contained (never elevated) ---
      if (String(sig.strategic_category ?? "").toLowerCase() === "watchlist") {
        const pri = String(sig.priority ?? "").toLowerCase();
        if (pri !== "low") {
          warnings.push({
            section: "bd_signals", index: i, field: "priority",
            message: `Watchlist signal "${sig.headline}" had priority "${pri || "(empty)"}"; set to "low" (watchlist items are not elevated)`,
            severity: "info",
          });
          sig.priority = "low";
        }
        const urg = String(sig.urgency ?? "").toLowerCase();
        if (urg !== "low") {
          sig.urgency = "low";
        }
        // bd_posture must be defensive or intelligence for watchlist items
        const posture = String(sig.bd_posture ?? "").toLowerCase();
        if (posture !== "defensive" && posture !== "intelligence") {
          sig.bd_posture = "intelligence";
        }
        // Do not assign high fact confidence to watchlist items unless source clearly supports it.
        if (String(sig.fact_confidence ?? "").toLowerCase() === "high") {
          warnings.push({
            section: "bd_signals", index: i, field: "fact_confidence",
            message: `Watchlist signal "${sig.headline}" had high fact_confidence; lowered to "low" (watchlist items are unverified)`,
            severity: "info",
          });
          sig.fact_confidence = "low";
        }
        sig.review_status = "pending";
      }

      // --- Mispricing dedup ---
      const stratCat = String(sig.strategic_category ?? "").toLowerCase();
      const headline = String(sig.headline ?? "").toLowerCase();
      const sigType = String(sig.signal_type ?? "").toLowerCase();
      const sigEntities = [...(sig.company_names_raw as string[] ?? []), ...(sig.assets as string[] ?? [])];

      const isMispricingDup =
        stratCat === "mispricing" ||
        headline.includes("mispricing") ||
        (sigType === "financing" && sigEntities.some(c => mispricingKeys.has(c.toLowerCase())));

      if (isMispricingDup) {
        signalsToRemove.push(i);
        warnings.push({
          section: "bd_signals", index: i, field: "strategic_category",
          message: `Signal "${sig.headline}" is a mispricing item; kept in mispricing_flags only`,
          severity: "info",
        });
      }
    }

    for (const idx of signalsToRemove.sort((a, b) => b - a)) {
      signals.splice(idx, 1);
    }

    data.bd_signals = signals;
  }

  // --- Watch List leakage containment ---
  // Watchlist-only entities (companies/assets that appear ONLY in watchlist signals) must not
  // generate related-table records unless they also appear in that table's explicit source section.
  if (Array.isArray(data.bd_signals)) {
    const sigList = data.bd_signals as Array<Record<string, unknown>>;
    const entityTokens = (sig: Record<string, unknown>): string[] => [
      ...((sig.company_names_raw as string[]) ?? []),
      ...((sig.companies_normalized as string[]) ?? []),
      ...((sig.assets as string[]) ?? []),
    ].map(s => String(s).toLowerCase().trim()).filter(t => t.length >= 4);

    const watchlistEntities = new Set<string>();
    const nonWatchlistEntities = new Set<string>();
    for (const sig of sigList) {
      const isWatch = String(sig.strategic_category ?? "").toLowerCase() === "watchlist";
      for (const tok of entityTokens(sig)) {
        (isWatch ? watchlistEntities : nonWatchlistEntities).add(tok);
      }
    }
    const watchlistOnly = [...watchlistEntities].filter(t => !nonWatchlistEntities.has(t));

    if (watchlistOnly.length > 0) {
      const sectionTexts: Record<string, string> = {
        precedent_comps: extractSectionText(fullText, /precedent\s*(?:table|comps?)|active\s*comps/),
        recommended_internal_actions: extractSectionText(fullText, /recommended\s*(?:internal\s*)?actions?|committee\s*action\s*queue|action\s*items?/),
        deal_structure_watch: extractSectionText(fullText, /deal\s*structure\s*watch|deal\s*structure/),
        outreach_targets: extractSectionText(fullText, /outreach\s*targets?/),
        mispricing_flags: extractSectionText(fullText, /mispricing|valuation\s*(?:flags?|gaps?)/),
      };

      const recordText = (rec: Record<string, unknown>): string =>
        Object.values(rec)
          .map(v => Array.isArray(v) ? v.join(" ") : String(v ?? ""))
          .join(" ")
          .toLowerCase();

      for (const tableKey of Object.keys(sectionTexts)) {
        const arr = data[tableKey] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const sectionText = sectionTexts[tableKey];
        const kept = arr.filter((rec, idx) => {
          const text = recordText(rec);
          const leakedEntity = watchlistOnly.find(t => text.includes(t));
          if (!leakedEntity) return true;
          // Allowed if the same watchlist entity also appears in this table's explicit section.
          if (sectionText && sectionText.includes(leakedEntity)) return true;
          warnings.push({
            section: tableKey, index: idx, field: "classification",
            message: `Removed "${leakedEntity}" ${tableKey} record -- watchlist-only item leaked into related table (not present in its explicit source section)`,
            severity: "info",
          });
          return false;
        });
        data[tableKey] = kept;
      }
    }
  }

  // --- Outreach targets legacy migration ---
  const outreach = data.outreach_targets as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(outreach)) {
    for (const ot of outreach) {
      if (ot.company && !ot.target_category) {
        ot.target_category = ot.company;
        delete ot.company;
      }
      if (ot.rationale && !ot.why_now) {
        ot.why_now = ot.rationale;
        delete ot.rationale;
      }
      if (ot.contact_role && !ot.allowed_internal_action) {
        ot.allowed_internal_action = ot.contact_role;
        delete ot.contact_role;
      }
      if (ot.timing && !ot.notes) {
        ot.notes = ot.timing;
        delete ot.timing;
      }
    }
  }

  // --- Mispricing flags: only keep items whose company/asset appears in the MISPRICING section ---
  // Detect the mispricing section text from the source
  const mispricingSectionMatch = fullText.match(
    /(?:^|\n)#{1,3}\s*(?:mispricing|valuation\s*(?:flags?|gaps?))([\s\S]*?)(?=\n#{1,3}\s|\n---|\n\*\*\*|$)/i
  );
  const mispricingSectionText = mispricingSectionMatch ? mispricingSectionMatch[0].toLowerCase() : "";

  const mfArray = data.mispricing_flags as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(mfArray) && mispricingSectionText.length > 20) {
    const validFlags: Array<Record<string, unknown>> = [];
    for (let idx = 0; idx < mfArray.length; idx++) {
      const mf = mfArray[idx];
      const company = String(mf.company ?? "").toLowerCase();
      const asset = String(mf.asset ?? "").toLowerCase();
      const headline = String(mf.flag_headline ?? "").toLowerCase();
      const inSection = (company && mispricingSectionText.includes(company)) ||
        (asset && mispricingSectionText.includes(asset)) ||
        (headline && mispricingSectionText.includes(headline.slice(0, 30)));
      if (inSection) {
        validFlags.push(mf);
      } else {
        warnings.push({
          section: "mispricing_flags", index: idx, field: "classification",
          message: `Removed mispricing flag "${mf.flag_headline}" -- not found in MISPRICING section of source`,
          severity: "info",
        });
      }
    }
    data.mispricing_flags = validFlags;
  }

  return { processed: data, qa_warnings: warnings };
}

// --- Recursive Placeholder Sanitizer ---

const PLACEHOLDER_SUBSTRINGS = [
  "e.g.",
  "example",
  "vol. 12, no. 21",
  "yyyy-mm-dd",
  "canonical company names",
  "corporate entity names from document",
  "exact names from document",
  "exact text from document",
  "standardized form",
  "drug/program names",
  "question for bd committee discussion",
  "fda, ema, etc.",
  "string array",
  "or empty if inferred",
  "source urls or references",
  "drug/product/pipeline names",
  "specific near-term action item",
  "logical reasoning connecting",
  "what this means from a bd perspective",
  "factual description of what occurred",
  "executive summary of the bd landscape",
  "publisher name",
  "brief title",
  "signal headline",
  "concise signal headline",
  "high | medium | low",
  "immediate | high | medium | low",
  "deal_announced | partnership",
  "comp_reset | leverage_reset",
  "offensive | defensive | intelligence",
  "weekly | monthly | special",
  "high | medium | low | speculative",
];

function containsPlaceholder(value: string): boolean {
  if (!value || value.length < 3) return false;
  const lower = value.toLowerCase().trim();
  if (lower === "string") return true;
  if (lower === "pending") return false; // valid review_status
  for (const p of PLACEHOLDER_SUBSTRINGS) {
    if (p === "string") continue;
    if (lower.includes(p)) return true;
  }
  return false;
}

interface SanitizeStats {
  cleaned_strings: number;
  cleaned_array_items: number;
}

function sanitizeExtractionObject(
  obj: unknown,
  warnings: PostProcessWarning[],
  stats: SanitizeStats,
  path = ""
): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    if (containsPlaceholder(obj)) {
      stats.cleaned_strings++;
      warnings.push({
        section: "sanitizer",
        field: path,
        message: `Removed placeholder: "${obj.slice(0, 80)}"`,
        severity: "blocking",
      });
      return "";
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    const cleaned: unknown[] = [];
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (typeof item === "string") {
        if (containsPlaceholder(item)) {
          stats.cleaned_array_items++;
          warnings.push({
            section: "sanitizer",
            field: `${path}[${i}]`,
            message: `Removed placeholder array item: "${item.slice(0, 80)}"`,
            severity: "blocking",
          });
        } else if (item) {
          cleaned.push(item);
        }
      } else if (typeof item === "object" && item !== null) {
        cleaned.push(sanitizeExtractionObject(item, warnings, stats, `${path}[${i}]`));
      } else {
        cleaned.push(item);
      }
    }
    return cleaned;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fieldPath = path ? `${path}.${key}` : key;
      result[key] = sanitizeExtractionObject(value, warnings, stats, fieldPath);
    }
    return result;
  }

  return obj;
}

// --- Issue Error Marking ---

async function markIssueError(issueId: string, errorMessage: string): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, supabaseKey);

    await client
      .from("issues")
      .update({ status: "error", extraction_error: errorMessage.slice(0, 2000) })
      .eq("id", issueId);
  } catch (e) {
    console.error(`[extract-brief] Failed to mark issue error:`, e);
  }
}

// --- Main Handler ---

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const logs: DiagnosticLog[] = [];
  const log = (step: string, detail?: string) => {
    const entry = { timestamp: new Date().toISOString(), step, detail };
    logs.push(entry);
    console.log(`[extract-brief] ${step}${detail ? ": " + detail : ""}`);
  };

  try {
    log("request_received");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      log("error", "ANTHROPIC_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured", logs }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: ExtractionRequest = await req.json();
    log("body_parsed", `text_length=${body.text?.length ?? 0}, issue_id=${body.issue_id ?? "none"}`);

    if (!body.text || body.text.trim().length < 50) {
      log("error", "Text too short");
      return new Response(
        JSON.stringify({ error: "Text is too short to extract from", logs }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Sectionize
    log("sectionize_start");
    const { chunks, detected } = sectionizeBrief(body.text);
    log("sectionize_done", `detected_sections=${[...detected].join(",") || "none"}`);

    // Step 2: Run parallel section extractions
    log("parallel_extraction_start", `model=${HAIKU}, fallback=${SONNET}`);

    const sectionConfigs: {
      name: string;
      key: keyof SectionChunks;
      prompt: string;
      timeoutMs: number;
      maxTokens: number;
      primaryArrayKey?: string;
    }[] = [
      { name: "metadata_and_summary", key: "metadata", prompt: PROMPT_METADATA, timeoutMs: 45000, maxTokens: 1500 },
      { name: "bd_signals", key: "bd_signals", prompt: PROMPT_BD_SIGNALS, timeoutMs: 60000, maxTokens: 12000, primaryArrayKey: "bd_signals" },
      { name: "leverage_resets", key: "leverage_resets", prompt: PROMPT_LEVERAGE_RESETS, timeoutMs: 45000, maxTokens: 2500, primaryArrayKey: "leverage_resets" },
      { name: "recommended_actions", key: "recommended_actions", prompt: PROMPT_RECOMMENDED_ACTIONS, timeoutMs: 45000, maxTokens: 2500, primaryArrayKey: "recommended_internal_actions" },
      { name: "deal_structure_and_outreach", key: "deal_structure", prompt: PROMPT_DEAL_STRUCTURE, timeoutMs: 45000, maxTokens: 2500 },
      { name: "precedent_comps", key: "precedent_comps", prompt: PROMPT_PRECEDENT_COMPS, timeoutMs: 45000, maxTokens: 3500, primaryArrayKey: "precedent_comps" },
      { name: "mispricing_flags", key: "mispricing_flags", prompt: PROMPT_MISPRICING, timeoutMs: 45000, maxTokens: 2500, primaryArrayKey: "mispricing_flags" },
    ];

    const extractionPromises = sectionConfigs.map((cfg) => {
      const sourceMode = getSourceMode(cfg.key, detected, chunks, body.text);
      const text = chunks[cfg.key];
      return extractSection(apiKey, cfg.name, cfg.prompt, text, cfg.timeoutMs, cfg.maxTokens, sourceMode, cfg.primaryArrayKey);
    });

    const results = await Promise.allSettled(extractionPromises);

    const sectionResults: SectionResult[] = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        data: null,
        status: {
          section: sectionConfigs[i].name,
          status: "failed" as const,
          model_used: "none",
          elapsed_ms: 0,
          error_message: r.reason instanceof Error ? r.reason.message : "Unknown",
          source_mode: "full_document_fallback" as SectionSourceMode,
        },
      };
    });

    const sectionStatuses = sectionResults.map((r) => r.status);
    log("parallel_extraction_done", sectionStatuses.map((s) => `${s.section}:${s.status}`).join(", "));

    // Step 3: Check critical section (bd_signals)
    const bdSignalsResult = sectionResults.find((r) => r.status.section === "bd_signals");
    if (!bdSignalsResult?.data || bdSignalsResult.status.status === "failed") {
      const errorMsg = `Critical section bd_signals failed: ${bdSignalsResult?.status.error_message ?? "unknown"}`;
      log("extraction_failed", errorMsg);

      if (body.issue_id) {
        await markIssueError(body.issue_id, errorMsg);
      }

      return new Response(
        JSON.stringify({
          error: errorMsg,
          section_status: sectionStatuses,
          partial: true,
          issue_id: body.issue_id,
          logs,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Merge results
    const rawExtraction = mergeExtractionResults(sectionResults);
    const validationErrors = validateMergedExtraction(rawExtraction);

    if (validationErrors.length > 0) {
      log("validation_warnings", validationErrors.join(", "));
    }

    // Step 5: Post-process (entity cleanup, dedup, source-chunk validation)
    log("post_processing_start");
    const { processed, qa_warnings: postWarnings } = postProcessExtraction(rawExtraction, body.text);
    log("post_processing_done", `warnings=${postWarnings.length}`);

    // Step 6: Recursive sanitizer (final pass - removes ALL placeholder text)
    log("sanitizer_start");
    const sanitizerWarnings: PostProcessWarning[] = [];
    const sanitizeStats: SanitizeStats = { cleaned_strings: 0, cleaned_array_items: 0 };
    const sanitized = sanitizeExtractionObject(processed, sanitizerWarnings, sanitizeStats) as Record<string, unknown>;
    log("sanitizer_done", `cleaned_strings=${sanitizeStats.cleaned_strings}, cleaned_array_items=${sanitizeStats.cleaned_array_items}`);

    const allWarnings = [...postWarnings, ...sanitizerWarnings];

    const hasFailedSections = sectionStatuses.some(
      (s) => s.status === "failed" && s.section !== "bd_signals"
    );

    const totalElapsed = sectionStatuses.reduce((sum, s) => Math.max(sum, s.elapsed_ms), 0);

    log("extraction_success", `wall_time=${totalElapsed}ms, partial=${hasFailedSections}, qa_warnings=${allWarnings.length}`);

    return new Response(
      JSON.stringify({
        extraction: sanitized,
        raw_extraction: rawExtraction,
        qa_warnings: allWarnings,
        validation_errors: validationErrors,
        section_status: sectionStatuses,
        partial: hasFailedSections,
        issue_id: body.issue_id,
        model_used: HAIKU,
        fallback_model: SONNET,
        response_duration_ms: totalElapsed,
        logs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("unhandled_error", message);

    return new Response(
      JSON.stringify({ error: message, logs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
