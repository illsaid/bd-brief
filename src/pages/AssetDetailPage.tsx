import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, FlaskConical } from 'lucide-react';
import { Badge, priorityVariant, confidenceVariant } from '../components/Badge';
import { supabase } from '../lib/supabase';
import { Asset, BdSignal, Company } from '../lib/types';

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [signals, setSignals] = useState<BdSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [aRes, saRes] = await Promise.all([
        supabase.from('assets').select('*, companies(*)').eq('id', id).maybeSingle(),
        supabase.from('signal_assets').select('bd_signals(*)').eq('asset_id', id),
      ]);
      const assetData = aRes.data as Asset & { companies?: Company };
      setAsset(assetData);
      setCompany(assetData?.companies ?? null);
      setSignals((saRes.data ?? []).map((r: { bd_signals: BdSignal }) => r.bd_signals).filter(Boolean));
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-sky-400" /></div>;
  if (!asset) return <div className="p-6 text-red-400 flex items-center gap-2"><AlertCircle size={16} />Asset not found</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-200 transition-colors"><ArrowLeft size={18} /></button>
        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
          <FlaskConical size={15} className="text-slate-400" />
        </div>
        <div>
          <h1 className="text-white font-semibold text-lg">{asset.name}</h1>
          <div className="flex items-center gap-3 text-slate-500 text-xs">
            {company && (
              <button onClick={() => navigate(`/companies/${company.id}`)} className="text-sky-400 hover:text-sky-300 transition-colors">{company.name}</button>
            )}
            {asset.therapeutic_area && <span>{asset.therapeutic_area}</span>}
            {asset.modality && <span>{asset.modality}</span>}
            {asset.stage && <span>{asset.stage}</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Info grid */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Asset Type', value: asset.asset_type },
            { label: 'Therapeutic Area', value: asset.therapeutic_area },
            { label: 'Modality', value: asset.modality },
            { label: 'Stage', value: asset.stage },
            { label: 'Indication', value: asset.indication },
          ].filter(x => x.value).map(({ label, value }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-500 text-xs mb-1">{label}</div>
              <div className="text-slate-200 text-sm">{value}</div>
            </div>
          ))}
        </div>

        {asset.notes && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm">{asset.notes}</p>
          </div>
        )}

        {/* Linked signals */}
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
