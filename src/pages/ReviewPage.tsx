import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Loader2,
  Plus, Trash2, Save, AlertTriangle, ShieldCheck, Eye, HelpCircle
} from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Badge, priorityVariant, urgencyVariant, confidenceVariant } from '../components/Badge';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Issue, ExtractionJson, ExtractionSignal, QaMode } from '../lib/types';
import { computeQaWarnings, computeSignalBadge, computeCompBadge, computeOutreachBadge, computeGenericBadge, scanForPlaceholders, finalReviewSanitizer, normalizeExtraction, QaBadge, QaWarning, PlaceholderHit } from '../lib/extraction-qa';

function QualityBadge({ badge }: { badge: QaBadge }) {
  switch (badge) {
    case 'clean':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-800/50">
          <ShieldCheck size={10} /> Clean
        </span>
      );
    case 'needs_review':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-900/40 text-amber-400 border border-amber-800/50">
          <Eye size={10} /> Needs review
        </span>
      );
    case 'possible_inference':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-900/40 text-orange-400 border border-orange-800/50">
          <HelpCircle size={10} /> Possible inference
        </span>
      );
    case 'missing_source':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/40 text-red-400 border border-red-800/50">
          <AlertTriangle size={10} /> Missing source
        </span>
      );
    case 'entity_confusion':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-900/40 text-rose-400 border border-rose-800/50">
          <AlertCircle size={10} /> Entity confusion
        </span>
      );
  }
}

function SectionPanel({ title, count, children, defaultOpen = false, warningCount }: {
  title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean; warningCount?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-900 hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-200 font-medium text-sm">{title}</span>
          {count !== undefined && (
            <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">{count}</span>
          )}
          {(warningCount ?? 0) > 0 && (
            <span className="bg-amber-900/50 text-amber-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle size={10} /> {warningCount}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && <div className="p-5 bg-slate-950">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, multiline = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const cls = "w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600";
  return multiline ? (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${cls} resize-none`} />
  ) : (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
    >
      <option value="">-- select --</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function ReviewPage() {
  const { issueId } = useParams<{ issueId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [data, setData] = useState<ExtractionJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [error, setError] = useState('');
  const [qaOpen, setQaOpen] = useState(true);
  const [diagScanResults, setDiagScanResults] = useState<PlaceholderHit[] | null>(null);

  const qaMode: QaMode = data?._qa_mode ?? 'production';
  const qaWarnings = useMemo(() => data ? computeQaWarnings(data, qaMode) : [], [data, qaMode]);
  const placeholderHits = useMemo(() => data ? scanForPlaceholders(data) : [], [data]);
  const hasBlockingWarnings = useMemo(() =>
    qaWarnings.some(w => w.severity === 'blocking') || placeholderHits.length > 0,
    [qaWarnings, placeholderHits]
  );

  useEffect(() => {
    if (!issueId) return;
    supabase
      .from('issues')
      .select('*')
      .eq('id', issueId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setError('Issue not found'); setLoading(false); return; }
        setIssue(data as Issue);
        const raw = data.extraction_json as ExtractionJson;
        const sanitized = finalReviewSanitizer(raw) as ExtractionJson;
        const normalized = normalizeExtraction(sanitized);
        setData(normalized);
        setLoading(false);
      });
  }, [issueId]);

  const updateSignal = (idx: number, field: keyof ExtractionSignal, value: unknown) => {
    if (!data) return;
    const signals = [...data.bd_signals];
    signals[idx] = { ...signals[idx], [field]: value };
    setData({ ...data, bd_signals: signals });
  };

  const removeSignal = (idx: number) => {
    if (!data) return;
    setData({ ...data, bd_signals: data.bd_signals.filter((_, i) => i !== idx) });
  };

  const handleImport = async () => {
    if (!data || !issue || !user) return;
    // Final sanitize pass before import
    const importData = finalReviewSanitizer(data) as ExtractionJson;
    const residual = scanForPlaceholders(importData);
    if (residual.length > 0) {
      setError(`Cannot import: ${residual.length} placeholder(s) still present`);
      return;
    }
    setImporting(true);
    setError('');

    try {
      const meta = importData.issue_metadata;

      await supabase.from('issues').update({
        extraction_json: importData,
        status: 'imported',
        issue_number: meta.issue_number || null,
        issue_date: meta.issue_date || null,
        title: meta.title || issue.title,
        source: meta.source || null,
        brief_type: meta.brief_type || 'weekly',
      }).eq('id', issue.id);

      if (importData.board_summary?.narrative) {
        await supabase.from('board_summaries').insert({
          issue_id: issue.id, user_id: user.id,
          narrative: importData.board_summary.narrative,
          key_themes: importData.board_summary.key_themes ?? [],
          needs_review: false,
        });
      }

      for (const lr of importData.leverage_resets ?? []) {
        await supabase.from('leverage_resets').insert({
          issue_id: issue.id, user_id: user.id, ...lr, needs_review: false,
        });
      }

      for (const ra of importData.recommended_internal_actions ?? []) {
        await supabase.from('recommended_actions').insert({
          issue_id: issue.id, user_id: user.id,
          action: ra.action, rationale: ra.rationale, deadline: ra.deadline,
          owner: ra.owner, priority: ra.priority || 'medium', needs_review: false,
        });
      }

      for (const ds of importData.deal_structure_watch ?? []) {
        await supabase.from('deal_structure_watch').insert({
          issue_id: issue.id, user_id: user.id,
          structure_type: ds.structure_type, description: ds.description,
          companies_involved: ds.companies_involved ?? [], strategic_implications: ds.strategic_implications,
          needs_review: false,
        });
      }

      for (const ot of importData.outreach_targets ?? []) {
        await supabase.from('outreach_targets').insert({
          issue_id: issue.id, user_id: user.id,
          target_category: ot.target_category || null,
          why_now: ot.why_now || null,
          allowed_internal_action: ot.allowed_internal_action || null,
          priority: ot.priority || 'medium',
          notes: ot.notes || null,
          needs_review: false,
        });
      }

      for (const pc of importData.precedent_comps ?? []) {
        await supabase.from('precedent_comps').insert({
          issue_id: issue.id, user_id: user.id,
          deal_name: pc.deal_name, buyer: pc.buyer, seller: pc.seller, target_asset: pc.target_asset,
          deal_value: pc.deal_value, deal_type: pc.deal_type, therapeutic_area: pc.therapeutic_area,
          modality: pc.modality, stage_at_deal: pc.stage_at_deal,
          deal_date: pc.deal_date || null, key_terms: pc.key_terms,
          strategic_rationale: pc.strategic_rationale, relevance_note: pc.relevance_note,
          needs_review: false,
        });
      }

      for (const mf of importData.mispricing_flags ?? []) {
        await supabase.from('mispricing_flags').insert({
          issue_id: issue.id, user_id: user.id,
          flag_headline: mf.flag_headline, asset: mf.asset, company: mf.company,
          current_valuation: mf.current_valuation, implied_value: mf.implied_value,
          valuation_gap: mf.valuation_gap, rationale: mf.rationale,
          strategic_implication: mf.strategic_implication, urgency: mf.urgency || 'medium',
          therapeutic_area: mf.therapeutic_area, needs_review: false,
        });
      }

      for (const sig of importData.bd_signals ?? []) {
        const companies = sig.companies_normalized ?? sig.company_names_raw ?? sig.companies ?? [];
        const { data: signalRow } = await supabase.from('bd_signals').insert({
          issue_id: issue.id, user_id: user.id,
          headline: sig.headline, signal_type: sig.signal_type, strategic_category: sig.strategic_category,
          priority: sig.priority || 'medium', urgency: sig.urgency || 'medium',
          confidence: sig.confidence || 'medium',
          therapeutic_area: sig.therapeutic_area_normalized ?? sig.therapeutic_area_raw ?? sig.therapeutic_area ?? '',
          modality: sig.modality_raw || sig.modality || '', event_date: sig.event_date || null,
          what_changed: sig.what_changed, bd_interpretation: sig.bd_interpretation,
          inference_chain: sig.inference_chain, committee_question: sig.committee_question,
          recommended_action: sig.recommended_action,
          sources: sig.sources ?? [], tags: sig.tags ?? [],
          needs_review: false,
        }).select().single();

        if (!signalRow) continue;

        for (const cName of companies) {
          if (!cName) continue;
          const { data: co } = await supabase.from('companies')
            .upsert({ user_id: user.id, name: cName }, { onConflict: 'user_id,name' })
            .select().single();
          if (co) {
            await supabase.from('signal_companies').insert({ signal_id: signalRow.id, company_id: co.id }).throwOnError();
          }
        }

        for (const aName of sig.assets ?? []) {
          if (!aName) continue;
          const { data: asset } = await supabase.from('assets')
            .upsert({ user_id: user.id, name: aName }, { onConflict: 'user_id,name' })
            .select().single();
          if (asset) {
            await supabase.from('signal_assets').insert({ signal_id: signalRow.id, asset_id: asset.id }).throwOnError();
          }
        }
      }

      setImportDone(true);
      setTimeout(() => navigate(`/issues/${issue.id}`), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-sky-400" />
      </div>
    );
  }

  if (!data || !issue) {
    return (
      <div className="p-6 text-red-400 flex items-center gap-2">
        <AlertCircle size={16} /> {error || 'No extraction data found.'}
      </div>
    );
  }

  const meta = data.issue_metadata ?? {} as ExtractionJson['issue_metadata'];
  const summary = data.board_summary ?? { narrative: '', key_themes: [] };
  const signalWarnings = qaWarnings.filter(w => w.section === 'bd_signals');
  const compWarnings = qaWarnings.filter(w => w.section === 'precedent_comps');

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Extraction Review"
        subtitle={`Review and edit extracted data before importing to the database`}
        actions={
          <button
            onClick={handleImport}
            disabled={importing || importDone || hasBlockingWarnings}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            title={hasBlockingWarnings ? 'Resolve blocking QA warnings before importing' : undefined}
          >
            {importing && <Loader2 size={14} className="animate-spin" />}
            {importDone && <CheckCircle2 size={14} />}
            {importDone ? 'Imported!' : importing ? 'Importing...' : hasBlockingWarnings ? 'Blocked by QA' : 'Approve & Import'}
          </button>
        }
      />

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {/* QA Warnings Panel */}
        {qaWarnings.length > 0 && (
          <div className="mb-6 border border-amber-800/50 rounded-xl overflow-hidden bg-amber-950/20">
            <button
              onClick={() => setQaOpen(!qaOpen)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-amber-900/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-400" />
                <span className="text-amber-300 font-medium text-sm">Extraction QA Warnings</span>
                <span className="bg-amber-900/50 text-amber-400 text-xs px-2 py-0.5 rounded-full">{qaWarnings.length}</span>
              </div>
              {qaOpen ? <ChevronUp size={16} className="text-amber-400" /> : <ChevronDown size={16} className="text-amber-400" />}
            </button>
            {qaOpen && (
              <div className="px-5 pb-4 space-y-2">
                {placeholderHits.length > 0 && (
                  <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 mb-3">
                    <p className="text-red-400 text-xs font-semibold mb-2">Placeholder/schema text remains in output ({placeholderHits.length} hit{placeholderHits.length > 1 ? 's' : ''})</p>
                    {placeholderHits.map((hit, i) => (
                      <p key={i} className="text-red-300/80 text-[11px] font-mono truncate">
                        {hit.path}: "{hit.value}"
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 pb-2 border-b border-slate-700/50 mb-2">
                  <button
                    onClick={() => setDiagScanResults(data ? scanForPlaceholders(data) : [])}
                    className="text-[11px] px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                  >
                    Scan displayed review data for placeholders
                  </button>
                  {diagScanResults !== null && (
                    <span className={`text-[10px] ${diagScanResults.length === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {diagScanResults.length === 0 ? 'Clean' : `${diagScanResults.length} hit(s) found`}
                    </span>
                  )}
                </div>
                {diagScanResults && diagScanResults.length > 0 && (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 mb-3">
                    {diagScanResults.map((hit, i) => (
                      <p key={i} className="text-amber-300/80 text-[11px] font-mono truncate">
                        {hit.path}: "{hit.value}"
                      </p>
                    ))}
                  </div>
                )}
                {qaWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-t border-amber-900/30 first:border-0">
                    <QualityBadge badge={w.badge} />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-300 text-xs">{w.message}</p>
                      <p className="text-slate-600 text-[10px] mt-0.5">
                        {w.section}{w.index !== undefined ? `[${w.index}]` : ''}{w.field ? `.${w.field}` : ''}
                      </p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${w.severity === 'blocking' ? 'bg-red-900/40 text-red-400' : w.severity === 'info' ? 'bg-sky-900/40 text-sky-400' : 'bg-amber-900/40 text-amber-400'}`}>
                      {w.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {qaWarnings.length === 0 && data.bd_signals?.length > 0 && (
          <div className="mb-6 flex items-center gap-3 px-5 py-3 bg-emerald-950/20 border border-emerald-800/50 rounded-xl">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span className="text-emerald-300 text-sm font-medium">All extracted items pass QA checks</span>
          </div>
        )}

        {/* Issue Metadata */}
        <SectionPanel title="Issue Metadata" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Issue Number">
              <TextInput value={meta.issue_number ?? ''} onChange={v => setData({ ...data, issue_metadata: { ...meta, issue_number: v } })} placeholder="(empty)" />
            </Field>
            <Field label="Issue Date">
              <TextInput value={meta.issue_date ?? ''} onChange={v => setData({ ...data, issue_metadata: { ...meta, issue_date: v } })} placeholder="(empty)" />
            </Field>
            <Field label="Title">
              <TextInput value={meta.title ?? ''} onChange={v => setData({ ...data, issue_metadata: { ...meta, title: v } })} placeholder="(empty)" />
            </Field>
            <Field label="Source">
              <TextInput value={meta.source ?? ''} onChange={v => setData({ ...data, issue_metadata: { ...meta, source: v } })} placeholder="(empty)" />
            </Field>
            <Field label="Brief Type">
              <SelectInput value={meta.brief_type ?? 'weekly'} onChange={v => setData({ ...data, issue_metadata: { ...meta, brief_type: v } })} options={['weekly', 'monthly', 'special']} />
            </Field>
          </div>
        </SectionPanel>

        {/* Board Summary */}
        <SectionPanel title="Board Summary" defaultOpen>
          <div className="space-y-4">
            <Field label="Narrative">
              <TextInput value={summary.narrative ?? ''} onChange={v => setData({ ...data, board_summary: { ...summary, narrative: v } })} multiline placeholder="(empty)" />
            </Field>
            <Field label="Key Themes (comma-separated)">
              <TextInput
                value={(summary.key_themes ?? []).join(', ')}
                onChange={v => setData({ ...data, board_summary: { ...summary, key_themes: v.split(',').map(s => s.trim()).filter(Boolean) } })}
                placeholder="(none)"
              />
            </Field>
          </div>
        </SectionPanel>

        {/* BD Signals */}
        <SectionPanel title="BD Signals" count={data.bd_signals?.length ?? 0} defaultOpen warningCount={signalWarnings.length}>
          <div className="space-y-4">
            {(data.bd_signals ?? []).map((sig, idx) => {
              const badge = computeSignalBadge(sig);
              return (
                <div key={idx} className="border border-slate-800 rounded-xl p-4 bg-slate-900/50">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <QualityBadge badge={badge} />
                      {sig.priority && <Badge variant={priorityVariant(sig.priority)}>{sig.priority} priority</Badge>}
                      {sig.urgency && <Badge variant={urgencyVariant(sig.urgency)}>{sig.urgency}</Badge>}
                      {sig.fact_confidence && <Badge variant={confidenceVariant(sig.fact_confidence)}>fact: {sig.fact_confidence}</Badge>}
                      {sig.bd_posture && <Badge variant="default">{sig.bd_posture}</Badge>}
                      {sig.signal_type && <Badge variant="signal-type">{sig.signal_type}</Badge>}
                    </div>
                    <button onClick={() => removeSignal(idx)} className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Field label="Headline">
                        <TextInput value={sig.headline} onChange={v => updateSignal(idx, 'headline', v)} placeholder="(empty)" />
                      </Field>
                    </div>
                    <Field label="Signal Type">
                      <SelectInput value={sig.signal_type ?? ''} onChange={v => updateSignal(idx, 'signal_type', v)} options={['deal_announced','partnership','licensing','acquisition','collaboration','clinical_data','regulatory','financing','management','competitive','strategic_review','other']} />
                    </Field>
                    <Field label="Strategic Category">
                      <SelectInput value={sig.strategic_category ?? ''} onChange={v => updateSignal(idx, 'strategic_category', v)} options={['comp_reset','leverage_reset','pricing_implication','screening_change','precedent','watchlist','mispricing','other']} />
                    </Field>
                    <Field label="BD Posture">
                      <SelectInput value={sig.bd_posture ?? ''} onChange={v => updateSignal(idx, 'bd_posture', v)} options={['offensive','defensive','intelligence','neutral']} />
                    </Field>
                    <Field label="Priority">
                      <SelectInput value={sig.priority ?? 'medium'} onChange={v => updateSignal(idx, 'priority', v)} options={['high','medium','low']} />
                    </Field>
                    <Field label="Urgency">
                      <SelectInput value={sig.urgency ?? 'medium'} onChange={v => updateSignal(idx, 'urgency', v)} options={['immediate','high','medium','low']} />
                    </Field>
                    <Field label="Fact Confidence">
                      <SelectInput value={sig.fact_confidence ?? sig.confidence ?? 'medium'} onChange={v => updateSignal(idx, 'fact_confidence', v)} options={['high','medium','low','speculative']} />
                    </Field>
                    <Field label="Implication Confidence">
                      <SelectInput value={sig.implication_confidence ?? 'medium'} onChange={v => updateSignal(idx, 'implication_confidence', v)} options={['high','medium','low','speculative']} />
                    </Field>
                    <Field label="Extraction Confidence">
                      <SelectInput value={sig.extraction_confidence ?? 'medium'} onChange={v => updateSignal(idx, 'extraction_confidence', v)} options={['high','medium','low','speculative']} />
                    </Field>
                    <Field label="Review Status">
                      <SelectInput value={sig.review_status ?? 'pending'} onChange={v => updateSignal(idx, 'review_status', v)} options={['pending','approved','flagged','rejected']} />
                    </Field>
                    <Field label="Therapeutic Area (raw)">
                      <TextInput value={sig.therapeutic_area_raw ?? sig.therapeutic_area ?? ''} onChange={v => updateSignal(idx, 'therapeutic_area_raw', v)} placeholder="(empty)" />
                    </Field>
                    <Field label="Therapeutic Area (normalized)">
                      <TextInput value={sig.therapeutic_area_normalized ?? ''} onChange={v => updateSignal(idx, 'therapeutic_area_normalized', v)} placeholder="(empty)" />
                    </Field>
                    <Field label="Modality (raw)">
                      <TextInput value={sig.modality_raw ?? sig.modality ?? ''} onChange={v => updateSignal(idx, 'modality_raw', v)} placeholder="(empty)" />
                    </Field>
                    <Field label="Modality (normalized)">
                      <TextInput value={sig.modality_normalized ?? ''} onChange={v => updateSignal(idx, 'modality_normalized', v)} placeholder="(empty)" />
                    </Field>
                    <Field label="Event Date">
                      <TextInput value={sig.event_date ?? ''} onChange={v => updateSignal(idx, 'event_date', v)} placeholder="(empty)" />
                    </Field>
                    <div className="col-span-2">
                      <Field label="What Changed">
                        <TextInput value={sig.what_changed ?? ''} onChange={v => updateSignal(idx, 'what_changed', v)} multiline placeholder="(empty)" />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="BD Interpretation">
                        <TextInput value={sig.bd_interpretation ?? ''} onChange={v => updateSignal(idx, 'bd_interpretation', v)} multiline placeholder="(empty)" />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Inference Chain">
                        <TextInput value={sig.inference_chain ?? ''} onChange={v => updateSignal(idx, 'inference_chain', v)} multiline placeholder="(empty)" />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Committee Question">
                        <TextInput value={sig.committee_question ?? ''} onChange={v => updateSignal(idx, 'committee_question', v)} placeholder="(empty)" />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Recommended Action">
                        <TextInput value={sig.recommended_action ?? ''} onChange={v => updateSignal(idx, 'recommended_action', v)} placeholder="(empty)" />
                      </Field>
                    </div>
                    <Field label="Companies - Raw (comma-separated)">
                      <TextInput value={(sig.company_names_raw ?? sig.companies ?? []).join(', ')} onChange={v => updateSignal(idx, 'company_names_raw', v.split(',').map(s => s.trim()).filter(Boolean))} placeholder="(none)" />
                    </Field>
                    <Field label="Companies - Normalized (comma-separated)">
                      <TextInput value={(sig.companies_normalized ?? []).join(', ')} onChange={v => updateSignal(idx, 'companies_normalized', v.split(',').map(s => s.trim()).filter(Boolean))} placeholder="(none)" />
                    </Field>
                    <Field label="Assets (comma-separated)">
                      <TextInput value={(sig.assets ?? []).join(', ')} onChange={v => updateSignal(idx, 'assets', v.split(',').map(s => s.trim()).filter(Boolean))} placeholder="(none)" />
                    </Field>
                    <Field label="Regulators (comma-separated)">
                      <TextInput value={(sig.regulators ?? []).join(', ')} onChange={v => updateSignal(idx, 'regulators', v.split(',').map(s => s.trim()).filter(Boolean))} placeholder="(none)" />
                    </Field>
                    <Field label="Sources (comma-separated)">
                      <TextInput value={(sig.sources ?? []).join(', ')} onChange={v => updateSignal(idx, 'sources', v.split(',').map(s => s.trim()).filter(Boolean))} placeholder="(none)" />
                    </Field>
                    <Field label="Tags (comma-separated)">
                      <TextInput value={(sig.tags ?? []).join(', ')} onChange={v => updateSignal(idx, 'tags', v.split(',').map(s => s.trim()).filter(Boolean))} placeholder="(none)" />
                    </Field>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setData({ ...data, bd_signals: [...(data.bd_signals ?? []), { headline: '', signal_type: '', strategic_category: 'other', bd_posture: 'neutral', priority: 'medium', urgency: 'medium', fact_confidence: 'medium', implication_confidence: 'medium', extraction_confidence: 'medium', review_status: 'pending', therapeutic_area_raw: '', therapeutic_area_normalized: null, modality: '', event_date: '', what_changed: '', bd_interpretation: '', inference_chain: '', committee_question: '', recommended_action: '', company_names_raw: [], companies_normalized: [], assets: [], sources: [], tags: [] }] })}
              className="flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm transition-colors"
            >
              <Plus size={14} /> Add signal
            </button>
          </div>
        </SectionPanel>

        {/* Leverage Resets */}
        <SectionPanel title="Leverage Resets" count={data.leverage_resets?.length ?? 0}>
          <div className="space-y-3">
            {(data.leverage_resets ?? []).map((lr, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-3 border border-slate-800 rounded-lg p-4">
                <Field label="Company"><TextInput value={lr.company ?? ''} onChange={v => { const a = [...data.leverage_resets]; a[idx] = { ...a[idx], company: v }; setData({ ...data, leverage_resets: a }); }} /></Field>
                <Field label="Asset"><TextInput value={lr.asset ?? ''} onChange={v => { const a = [...data.leverage_resets]; a[idx] = { ...a[idx], asset: v }; setData({ ...data, leverage_resets: a }); }} /></Field>
                <Field label="Reset Type"><TextInput value={lr.reset_type ?? ''} onChange={v => { const a = [...data.leverage_resets]; a[idx] = { ...a[idx], reset_type: v }; setData({ ...data, leverage_resets: a }); }} /></Field>
                <div className="col-span-2"><Field label="Description"><TextInput value={lr.description ?? ''} onChange={v => { const a = [...data.leverage_resets]; a[idx] = { ...a[idx], description: v }; setData({ ...data, leverage_resets: a }); }} multiline /></Field></div>
                <div className="col-span-2"><Field label="Strategic Implication"><TextInput value={lr.strategic_implication ?? ''} onChange={v => { const a = [...data.leverage_resets]; a[idx] = { ...a[idx], strategic_implication: v }; setData({ ...data, leverage_resets: a }); }} multiline /></Field></div>
              </div>
            ))}
          </div>
        </SectionPanel>

        {/* Recommended Actions */}
        <SectionPanel title="Recommended Internal Actions" count={data.recommended_internal_actions?.length ?? 0}>
          <div className="space-y-3">
            {(data.recommended_internal_actions ?? []).map((ra, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-3 border border-slate-800 rounded-lg p-4">
                <div className="col-span-2"><Field label="Action"><TextInput value={ra.action ?? ''} onChange={v => { const a = [...data.recommended_internal_actions]; a[idx] = { ...a[idx], action: v }; setData({ ...data, recommended_internal_actions: a }); }} /></Field></div>
                <div className="col-span-2"><Field label="Rationale"><TextInput value={ra.rationale ?? ''} onChange={v => { const a = [...data.recommended_internal_actions]; a[idx] = { ...a[idx], rationale: v }; setData({ ...data, recommended_internal_actions: a }); }} multiline /></Field></div>
                <Field label="Deadline"><TextInput value={ra.deadline ?? ''} onChange={v => { const a = [...data.recommended_internal_actions]; a[idx] = { ...a[idx], deadline: v }; setData({ ...data, recommended_internal_actions: a }); }} /></Field>
                <Field label="Owner"><TextInput value={ra.owner ?? ''} onChange={v => { const a = [...data.recommended_internal_actions]; a[idx] = { ...a[idx], owner: v }; setData({ ...data, recommended_internal_actions: a }); }} /></Field>
                <Field label="Priority"><SelectInput value={ra.priority ?? 'medium'} onChange={v => { const a = [...data.recommended_internal_actions]; a[idx] = { ...a[idx], priority: v as 'high'|'medium'|'low' }; setData({ ...data, recommended_internal_actions: a }); }} options={['high','medium','low']} /></Field>
              </div>
            ))}
          </div>
        </SectionPanel>

        {/* Deal Structure Watch */}
        <SectionPanel title="Deal Structure Watch" count={data.deal_structure_watch?.length ?? 0}>
          <div className="space-y-3">
            {(data.deal_structure_watch ?? []).map((ds, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-3 border border-slate-800 rounded-lg p-4">
                <Field label="Structure Type"><TextInput value={ds.structure_type ?? ''} onChange={v => { const a = [...data.deal_structure_watch]; a[idx] = { ...a[idx], structure_type: v }; setData({ ...data, deal_structure_watch: a }); }} /></Field>
                <Field label="Companies Involved (comma-separated)"><TextInput value={(ds.companies_involved ?? []).join(', ')} onChange={v => { const a = [...data.deal_structure_watch]; a[idx] = { ...a[idx], companies_involved: v.split(',').map(s => s.trim()).filter(Boolean) }; setData({ ...data, deal_structure_watch: a }); }} /></Field>
                <div className="col-span-2"><Field label="Description"><TextInput value={ds.description ?? ''} onChange={v => { const a = [...data.deal_structure_watch]; a[idx] = { ...a[idx], description: v }; setData({ ...data, deal_structure_watch: a }); }} multiline /></Field></div>
                <div className="col-span-2"><Field label="Strategic Implications"><TextInput value={ds.strategic_implications ?? ''} onChange={v => { const a = [...data.deal_structure_watch]; a[idx] = { ...a[idx], strategic_implications: v }; setData({ ...data, deal_structure_watch: a }); }} multiline /></Field></div>
              </div>
            ))}
          </div>
        </SectionPanel>

        {/* Outreach Targets */}
        <SectionPanel title="Outreach Targets" count={data.outreach_targets?.length ?? 0}>
          <div className="space-y-3">
            {(data.outreach_targets ?? []).map((ot, idx) => {
              const badge = computeOutreachBadge(ot);
              return (
                <div key={idx} className="border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <QualityBadge badge={badge} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Target Category"><TextInput value={ot.target_category ?? ''} onChange={v => { const a = [...data.outreach_targets]; a[idx] = { ...a[idx], target_category: v }; setData({ ...data, outreach_targets: a }); }} /></Field>
                    <Field label="Priority"><SelectInput value={ot.priority ?? 'medium'} onChange={v => { const a = [...data.outreach_targets]; a[idx] = { ...a[idx], priority: v as 'high'|'medium'|'low' }; setData({ ...data, outreach_targets: a }); }} options={['high','medium','low']} /></Field>
                    <div className="col-span-2"><Field label="Why Now"><TextInput value={ot.why_now ?? ''} onChange={v => { const a = [...data.outreach_targets]; a[idx] = { ...a[idx], why_now: v }; setData({ ...data, outreach_targets: a }); }} multiline /></Field></div>
                    <div className="col-span-2"><Field label="Allowed Internal Action"><TextInput value={ot.allowed_internal_action ?? ''} onChange={v => { const a = [...data.outreach_targets]; a[idx] = { ...a[idx], allowed_internal_action: v }; setData({ ...data, outreach_targets: a }); }} multiline /></Field></div>
                    <div className="col-span-2"><Field label="Notes"><TextInput value={ot.notes ?? ''} onChange={v => { const a = [...data.outreach_targets]; a[idx] = { ...a[idx], notes: v }; setData({ ...data, outreach_targets: a }); }} /></Field></div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionPanel>

        {/* Precedent Comps */}
        <SectionPanel title="Precedent Comps" count={data.precedent_comps?.length ?? 0} warningCount={compWarnings.length}>
          <div className="space-y-3">
            {(data.precedent_comps ?? []).map((pc, idx) => {
              const badge = computeCompBadge(pc);
              return (
                <div key={idx} className="border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <QualityBadge badge={badge} />
                    {pc.explicitly_in_source === false && (
                      <span className="text-[10px] text-orange-400">Not explicitly found in source</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Deal Name"><TextInput value={pc.deal_name ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], deal_name: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <Field label="Deal Type"><TextInput value={pc.deal_type ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], deal_type: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <Field label="Buyer"><TextInput value={pc.buyer ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], buyer: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <Field label="Seller"><TextInput value={pc.seller ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], seller: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <Field label="Target Asset"><TextInput value={pc.target_asset ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], target_asset: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <Field label="Deal Value"><TextInput value={pc.deal_value ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], deal_value: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <Field label="Therapeutic Area"><TextInput value={pc.therapeutic_area ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], therapeutic_area: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <Field label="Stage at Deal"><TextInput value={pc.stage_at_deal ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], stage_at_deal: v }; setData({ ...data, precedent_comps: a }); }} /></Field>
                    <div className="col-span-2"><Field label="Key Terms"><TextInput value={pc.key_terms ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], key_terms: v }; setData({ ...data, precedent_comps: a }); }} multiline /></Field></div>
                    <div className="col-span-2"><Field label="Relevance Note"><TextInput value={pc.relevance_note ?? ''} onChange={v => { const a = [...data.precedent_comps]; a[idx] = { ...a[idx], relevance_note: v }; setData({ ...data, precedent_comps: a }); }} multiline /></Field></div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionPanel>

        {/* Mispricing Flags */}
        <SectionPanel title="Mispricing Flags" count={data.mispricing_flags?.length ?? 0}>
          <div className="space-y-3">
            {(data.mispricing_flags ?? []).map((mf, idx) => {
              const badge = computeGenericBadge(mf);
              return (
                <div key={idx} className="border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <QualityBadge badge={badge} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Field label="Flag Headline"><TextInput value={mf.flag_headline ?? ''} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], flag_headline: v }; setData({ ...data, mispricing_flags: a }); }} /></Field></div>
                    <Field label="Asset"><TextInput value={mf.asset ?? ''} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], asset: v }; setData({ ...data, mispricing_flags: a }); }} /></Field>
                    <Field label="Company"><TextInput value={mf.company ?? ''} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], company: v }; setData({ ...data, mispricing_flags: a }); }} /></Field>
                    <Field label="Current Valuation"><TextInput value={mf.current_valuation ?? ''} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], current_valuation: v }; setData({ ...data, mispricing_flags: a }); }} /></Field>
                    <Field label="Implied Value"><TextInput value={mf.implied_value ?? ''} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], implied_value: v }; setData({ ...data, mispricing_flags: a }); }} /></Field>
                    <div className="col-span-2"><Field label="Rationale"><TextInput value={mf.rationale ?? ''} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], rationale: v }; setData({ ...data, mispricing_flags: a }); }} multiline /></Field></div>
                    <Field label="Urgency"><SelectInput value={mf.urgency ?? 'medium'} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], urgency: v as 'immediate'|'high'|'medium'|'low' }; setData({ ...data, mispricing_flags: a }); }} options={['immediate','high','medium','low']} /></Field>
                    <Field label="Therapeutic Area"><TextInput value={mf.therapeutic_area ?? ''} onChange={v => { const a = [...data.mispricing_flags]; a[idx] = { ...a[idx], therapeutic_area: v }; setData({ ...data, mispricing_flags: a }); }} /></Field>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionPanel>

        {/* Raw Model Output (diagnostics) */}
        {issue.raw_extraction_json && (
          <SectionPanel title="Raw Model Output (pre-processing)">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-64 overflow-auto">
              <pre className="text-[10px] text-slate-500 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(issue.raw_extraction_json, null, 2)}
              </pre>
            </div>
          </SectionPanel>
        )}

        {/* Bottom import button */}
        <div className="flex justify-end mt-4 mb-8">
          <button
            onClick={handleImport}
            disabled={importing || importDone || hasBlockingWarnings}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            title={hasBlockingWarnings ? 'Resolve blocking QA warnings before importing' : undefined}
          >
            {importing && <Loader2 size={14} className="animate-spin" />}
            {importDone ? <><CheckCircle2 size={14} /> Imported!</> : importing ? 'Importing...' : hasBlockingWarnings ? 'Blocked by QA' : <><Save size={14} /> Approve & Import</>}
          </button>
        </div>
      </div>
    </div>
  );
}
