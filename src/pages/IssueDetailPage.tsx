import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Zap, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Badge, priorityVariant, urgencyVariant, confidenceVariant, statusVariant } from '../components/Badge';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Issue, BdSignal, LeverageReset, OutreachTarget, RecommendedAction, PrecedentComp, MispricingFlag, BoardSummary, DealStructureWatch } from '../lib/types';

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-900 hover:bg-slate-800 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-slate-200 font-medium text-sm">{title}</span>
          {count !== undefined && <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">{count}</span>}
        </div>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>
      {open && <div className="bg-slate-950">{children}</div>}
    </div>
  );
}

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [signals, setSignals] = useState<BdSignal[]>([]);
  const [leverageResets, setLeverageResets] = useState<LeverageReset[]>([]);
  const [outreach, setOutreach] = useState<OutreachTarget[]>([]);
  const [actions, setActions] = useState<RecommendedAction[]>([]);
  const [comps, setComps] = useState<PrecedentComp[]>([]);
  const [flags, setFlags] = useState<MispricingFlag[]>([]);
  const [summaries, setSummaries] = useState<BoardSummary[]>([]);
  const [dealWatch, setDealWatch] = useState<DealStructureWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!issue || !confirm('Delete this issue and all its extracted data? This cannot be undone.')) return;
    setDeleting(true);
    await supabase.from('issues').delete().eq('id', issue.id);
    navigate('/issues');
  };

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [iRes, sRes, lRes, oRes, aRes, cRes, fRes, bRes, dRes] = await Promise.all([
        supabase.from('issues').select('*').eq('id', id).maybeSingle(),
        supabase.from('bd_signals').select('*').eq('issue_id', id).order('priority'),
        supabase.from('leverage_resets').select('*').eq('issue_id', id),
        supabase.from('outreach_targets').select('*').eq('issue_id', id),
        supabase.from('recommended_actions').select('*').eq('issue_id', id),
        supabase.from('precedent_comps').select('*').eq('issue_id', id),
        supabase.from('mispricing_flags').select('*').eq('issue_id', id),
        supabase.from('board_summaries').select('*').eq('issue_id', id),
        supabase.from('deal_structure_watch').select('*').eq('issue_id', id),
      ]);
      setIssue(iRes.data as Issue);
      setSignals((sRes.data ?? []) as BdSignal[]);
      setLeverageResets((lRes.data ?? []) as LeverageReset[]);
      setOutreach((oRes.data ?? []) as OutreachTarget[]);
      setActions((aRes.data ?? []) as RecommendedAction[]);
      setComps((cRes.data ?? []) as PrecedentComp[]);
      setFlags((fRes.data ?? []) as MispricingFlag[]);
      setSummaries((bRes.data ?? []) as BoardSummary[]);
      setDealWatch((dRes.data ?? []) as DealStructureWatch[]);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-sky-400" /></div>;
  if (!issue) return <div className="p-6 text-red-400 flex items-center gap-2"><AlertCircle size={16} />Issue not found</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start gap-3 px-6 py-4 border-b border-slate-800">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-200 transition-colors mt-0.5"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-white font-semibold text-lg">{issue.title ?? 'Untitled'}</h1>
            <Badge variant={statusVariant(issue.status)}>{issue.status}</Badge>
          </div>
          <div className="flex items-center gap-4 text-slate-500 text-xs mt-1">
            {issue.issue_number && <span>{issue.issue_number}</span>}
            {issue.issue_date && <span>{issue.issue_date}</span>}
            {issue.source && <span>{issue.source}</span>}
            {issue.brief_type && <span className="capitalize">{issue.brief_type}</span>}
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            {issue.status === 'review' && (
              <button onClick={() => navigate(`/review/${issue.id}`)} className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors">
                Review & Import
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-slate-700 hover:border-red-900 rounded-lg text-sm transition-colors disabled:opacity-40"
            >
              <Trash2 size={13} />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Board Summary */}
        {summaries.length > 0 && (
          <Section title="Board Summary">
            <div className="p-5">
              <p className="text-slate-300 text-sm leading-relaxed">{summaries[0].narrative}</p>
              {summaries[0].key_themes?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {summaries[0].key_themes.map((t, i) => (
                    <span key={i} className="bg-slate-800 text-slate-400 text-xs px-2.5 py-1 rounded-md">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* BD Signals */}
        <Section title="BD Signals" count={signals.length}>
          {signals.length === 0 ? (
            <div className="p-5 text-slate-600 text-sm italic">No signals</div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {signals.map(sig => (
                <button
                  key={sig.id}
                  onClick={() => navigate(`/signals/${sig.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-900/50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm font-medium truncate">{sig.headline}</div>
                    {sig.what_changed && <div className="text-slate-500 text-xs mt-0.5 truncate">{sig.what_changed}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={priorityVariant(sig.priority)}>{sig.priority}</Badge>
                    <Badge variant={urgencyVariant(sig.urgency)}>{sig.urgency}</Badge>
                    <Badge variant={confidenceVariant(sig.confidence)}>{sig.confidence}</Badge>
                  </div>
                  <Zap size={14} className="text-slate-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Leverage Resets */}
        {leverageResets.length > 0 && (
          <Section title="Leverage Resets" count={leverageResets.length}>
            <div className="divide-y divide-slate-800/50">
              {leverageResets.map(lr => (
                <div key={lr.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    {lr.company && <span className="text-slate-200 text-sm font-medium">{lr.company}</span>}
                    {lr.asset && <span className="text-slate-500 text-sm">/ {lr.asset}</span>}
                    {lr.reset_type && <Badge variant="default">{lr.reset_type.replace(/_/g, ' ')}</Badge>}
                  </div>
                  <p className="text-slate-400 text-sm">{lr.description}</p>
                  {lr.strategic_implication && <p className="text-slate-500 text-xs mt-1 italic">{lr.strategic_implication}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Recommended Actions */}
        {actions.length > 0 && (
          <Section title="Recommended Internal Actions" count={actions.length}>
            <div className="divide-y divide-slate-800/50">
              {actions.map(a => (
                <div key={a.id} className="px-5 py-4 flex items-start gap-3">
                  <Badge variant={priorityVariant(a.priority)} className="mt-0.5 shrink-0">{a.priority}</Badge>
                  <div>
                    <div className="text-slate-200 text-sm font-medium">{a.action}</div>
                    {a.rationale && <div className="text-slate-500 text-xs mt-1">{a.rationale}</div>}
                    {(a.deadline || a.owner) && (
                      <div className="text-slate-600 text-xs mt-1.5">
                        {a.deadline && <span>Deadline: {a.deadline}</span>}
                        {a.deadline && a.owner && <span> · </span>}
                        {a.owner && <span>Owner: {a.owner}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Outreach Targets */}
        {outreach.length > 0 && (
          <Section title="Outreach Targets" count={outreach.length}>
            <div className="divide-y divide-slate-800/50">
              {outreach.map(ot => (
                <div key={ot.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-200 text-sm font-medium">{ot.company}</span>
                    {ot.contact_role && <span className="text-slate-500 text-xs">({ot.contact_role})</span>}
                    <Badge variant={priorityVariant(ot.priority)} className="ml-auto">{ot.priority}</Badge>
                  </div>
                  {ot.rationale && <p className="text-slate-400 text-sm">{ot.rationale}</p>}
                  {ot.timing && <p className="text-slate-600 text-xs mt-1">Timing: {ot.timing}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Deal Structure Watch */}
        {dealWatch.length > 0 && (
          <Section title="Deal Structure Watch" count={dealWatch.length}>
            <div className="divide-y divide-slate-800/50">
              {dealWatch.map(ds => (
                <div key={ds.id} className="px-5 py-4">
                  {ds.structure_type && <Badge variant="default" className="mb-2">{ds.structure_type.replace(/_/g, ' ')}</Badge>}
                  <p className="text-slate-400 text-sm">{ds.description}</p>
                  {ds.strategic_implications && <p className="text-slate-500 text-xs mt-1.5 italic">{ds.strategic_implications}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Precedent Comps */}
        {comps.length > 0 && (
          <Section title="Precedent Comps" count={comps.length}>
            <div className="divide-y divide-slate-800/50">
              {comps.map(pc => (
                <div key={pc.id} className="px-5 py-4 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-slate-200 text-sm font-medium">{pc.deal_name ?? '—'}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{pc.buyer} → {pc.seller}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs">Asset: {pc.target_asset}</div>
                    <div className="text-slate-400 text-xs">Value: {pc.deal_value}</div>
                    <div className="text-slate-400 text-xs">Stage: {pc.stage_at_deal}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">{pc.relevance_note}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Mispricing Flags */}
        {flags.length > 0 && (
          <Section title="Mispricing Flags" count={flags.length}>
            <div className="divide-y divide-slate-800/50">
              {flags.map(mf => (
                <div key={mf.id} className="px-5 py-4">
                  <div className="text-slate-200 text-sm font-medium mb-1">{mf.flag_headline}</div>
                  <div className="text-slate-500 text-xs">{mf.asset && `Asset: ${mf.asset}`}{mf.company && ` · ${mf.company}`}</div>
                  {mf.rationale && <p className="text-slate-400 text-sm mt-2">{mf.rationale}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
