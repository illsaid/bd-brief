import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Building2 } from 'lucide-react';
import { Badge, priorityVariant, confidenceVariant } from '../components/Badge';
import { supabase } from '../lib/supabase';
import { Company, BdSignal, Asset } from '../lib/types';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [signals, setSignals] = useState<BdSignal[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [coRes, scRes, asRes] = await Promise.all([
        supabase.from('companies').select('*').eq('id', id).maybeSingle(),
        supabase.from('signal_companies').select('bd_signals(*)').eq('company_id', id),
        supabase.from('assets').select('*').eq('company_id', id),
      ]);
      setCompany(coRes.data as Company);
      setSignals((scRes.data ?? []).map((r: { bd_signals: BdSignal }) => r.bd_signals).filter(Boolean));
      setAssets((asRes.data ?? []) as Asset[]);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-sky-400" /></div>;
  if (!company) return <div className="p-6 text-red-400 flex items-center gap-2"><AlertCircle size={16} />Company not found</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-200 transition-colors"><ArrowLeft size={18} /></button>
        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
          <Building2 size={15} className="text-slate-400" />
        </div>
        <div>
          <h1 className="text-white font-semibold text-lg">{company.name}</h1>
          <div className="flex items-center gap-3 text-slate-500 text-xs">
            {company.ticker && <span className="font-mono">{company.ticker}</span>}
            {company.company_type && <span>{company.company_type}</span>}
            {company.therapeutic_focus && <span>{company.therapeutic_focus}</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {company.notes && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">{company.notes}</p>
          </div>
        )}

        {/* Assets */}
        <div>
          <h2 className="text-slate-300 font-medium text-sm mb-3">Assets ({assets.length})</h2>
          {assets.length === 0 ? (
            <div className="text-slate-600 text-sm italic">No assets linked</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {assets.map(a => (
                <button key={a.id} onClick={() => navigate(`/assets/${a.id}`)} className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors">
                  <div className="text-slate-200 font-medium text-sm">{a.name}</div>
                  {a.therapeutic_area && <div className="text-slate-500 text-xs mt-1">{a.therapeutic_area}</div>}
                  {a.stage && <div className="text-slate-600 text-xs">{a.stage}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Signals */}
        <div>
          <h2 className="text-slate-300 font-medium text-sm mb-3">BD Signals ({signals.length})</h2>
          {signals.length === 0 ? (
            <div className="text-slate-600 text-sm italic">No signals linked</div>
          ) : (
            <div className="border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden">
              {signals.map(sig => (
                <button key={sig.id} onClick={() => navigate(`/signals/${sig.id}`)} className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-900/50 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm font-medium truncate">{sig.headline}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{sig.therapeutic_area}{sig.event_date ? ` · ${sig.event_date}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={priorityVariant(sig.priority)}>{sig.priority}</Badge>
                    <Badge variant={confidenceVariant(sig.confidence)}>{sig.confidence}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
