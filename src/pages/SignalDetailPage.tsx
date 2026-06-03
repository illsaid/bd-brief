import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Building2, FlaskConical, ExternalLink, Tag } from 'lucide-react';
import { Badge, priorityVariant, urgencyVariant, confidenceVariant } from '../components/Badge';
import { supabase } from '../lib/supabase';
import { BdSignal, Company, Asset } from '../lib/types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
}

function Prose({ text }: { text: string | null }) {
  if (!text) return <div className="text-slate-600 text-sm italic">Not available</div>;
  return <div className="text-slate-300 text-sm leading-relaxed">{text}</div>;
}

export default function SignalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [signal, setSignal] = useState<BdSignal | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [sigRes, coRes, asRes] = await Promise.all([
        supabase.from('bd_signals').select('*').eq('id', id).maybeSingle(),
        supabase.from('signal_companies').select('companies(*)').eq('signal_id', id),
        supabase.from('signal_assets').select('assets(*)').eq('signal_id', id),
      ]);
      setSignal(sigRes.data as BdSignal);
      setCompanies((coRes.data ?? []).map((r: { companies: Company }) => r.companies).filter(Boolean));
      setAssets((asRes.data ?? []).map((r: { assets: Asset }) => r.assets).filter(Boolean));
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-sky-400" /></div>
  );

  if (!signal) return (
    <div className="p-6 text-red-400 flex items-center gap-2"><AlertCircle size={16} />Signal not found</div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-semibold text-lg leading-tight truncate">{signal.headline}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant={priorityVariant(signal.priority)}>{signal.priority} priority</Badge>
            <Badge variant={urgencyVariant(signal.urgency)}>{signal.urgency} urgency</Badge>
            <Badge variant={confidenceVariant(signal.confidence)}>{signal.confidence} confidence</Badge>
            {signal.signal_type && <Badge variant="signal-type">{signal.signal_type.replace(/_/g, ' ')}</Badge>}
            {signal.strategic_category && <Badge variant="default">{signal.strategic_category.replace(/_/g, ' ')}</Badge>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-7">
          {/* Meta row */}
          <div className="flex items-center gap-6 text-sm">
            {signal.therapeutic_area && (
              <div>
                <span className="text-slate-500 text-xs">Therapeutic Area</span>
                <div className="text-slate-200 mt-0.5">{signal.therapeutic_area}</div>
              </div>
            )}
            {signal.modality && (
              <div>
                <span className="text-slate-500 text-xs">Modality</span>
                <div className="text-slate-200 mt-0.5">{signal.modality}</div>
              </div>
            )}
            {signal.event_date && (
              <div>
                <span className="text-slate-500 text-xs">Event Date</span>
                <div className="text-slate-200 mt-0.5">{signal.event_date}</div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-800" />

          {/* Analysis */}
          <Section title="What Changed">
            <Prose text={signal.what_changed} />
          </Section>

          <Section title="BD Interpretation">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <Prose text={signal.bd_interpretation} />
            </div>
          </Section>

          <Section title="Inference Chain">
            <Prose text={signal.inference_chain} />
          </Section>

          <div className="border-t border-slate-800" />

          {/* Actions */}
          <Section title="Committee Question">
            <div className="bg-amber-900/10 border border-amber-900/30 rounded-xl p-4">
              <Prose text={signal.committee_question} />
            </div>
          </Section>

          <Section title="Recommended Action">
            <div className="bg-emerald-900/10 border border-emerald-900/30 rounded-xl p-4">
              <Prose text={signal.recommended_action} />
            </div>
          </Section>

          <div className="border-t border-slate-800" />

          {/* Related entities */}
          <div className="grid grid-cols-2 gap-6">
            <Section title="Companies">
              {companies.length === 0 ? (
                <div className="text-slate-600 text-sm italic">None linked</div>
              ) : (
                <div className="space-y-1.5">
                  {companies.map(co => (
                    <button
                      key={co.id}
                      onClick={() => navigate(`/companies/${co.id}`)}
                      className="flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm transition-colors"
                    >
                      <Building2 size={13} />
                      {co.name}
                      <ExternalLink size={11} className="text-slate-600" />
                    </button>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Assets">
              {assets.length === 0 ? (
                <div className="text-slate-600 text-sm italic">None linked</div>
              ) : (
                <div className="space-y-1.5">
                  {assets.map(a => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/assets/${a.id}`)}
                      className="flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm transition-colors"
                    >
                      <FlaskConical size={13} />
                      {a.name}
                      <ExternalLink size={11} className="text-slate-600" />
                    </button>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Sources & Tags */}
          {(signal.sources?.length > 0 || signal.tags?.length > 0) && (
            <>
              <div className="border-t border-slate-800" />
              <div className="grid grid-cols-2 gap-6">
                {signal.sources?.length > 0 && (
                  <Section title="Sources">
                    <div className="space-y-1">
                      {signal.sources.map((src, i) => (
                        <div key={i} className="text-slate-400 text-xs">{src}</div>
                      ))}
                    </div>
                  </Section>
                )}
                {signal.tags?.length > 0 && (
                  <Section title="Tags">
                    <div className="flex flex-wrap gap-1.5">
                      {signal.tags.map((tag, i) => (
                        <span key={i} className="flex items-center gap-1 bg-slate-800 text-slate-400 text-xs px-2 py-1 rounded-md">
                          <Tag size={10} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
