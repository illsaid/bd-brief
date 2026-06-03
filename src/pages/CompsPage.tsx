import { useEffect, useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PrecedentComp } from '../lib/types';

export default function CompsPage() {
  const { user } = useAuth();
  const [comps, setComps] = useState<PrecedentComp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('precedent_comps').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setComps((data ?? []) as PrecedentComp[]); setLoading(false); });
  }, [user]);

  const filtered = useMemo(() => comps.filter(c =>
    !search ||
    (c.deal_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.buyer ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.seller ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.target_asset ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.therapeutic_area ?? '').toLowerCase().includes(search.toLowerCase())
  ), [comps, search]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Precedent Comps"
        subtitle={`${filtered.length} deal comparables`}
        actions={
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search comps..." className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600 w-52" />
          </div>
        }
      />
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={BarChart3} title="No comps yet" description="Precedent comps are extracted from imported briefs" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 sticky top-0 z-10">
              <tr className="text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-5 py-3 text-left font-medium w-8"></th>
                <th className="px-3 py-3 text-left font-medium">Deal</th>
                <th className="px-3 py-3 text-left font-medium">Buyer</th>
                <th className="px-3 py-3 text-left font-medium">Seller</th>
                <th className="px-3 py-3 text-left font-medium">Asset</th>
                <th className="px-3 py-3 text-left font-medium">Value</th>
                <th className="px-3 py-3 text-left font-medium">Area</th>
                <th className="px-3 py-3 text-left font-medium">Stage</th>
                <th className="px-3 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(comp => (
                <>
                  <tr
                    key={comp.id}
                    onClick={() => setExpandedId(expandedId === comp.id ? null : comp.id)}
                    className="border-b border-slate-800/50 hover:bg-slate-900/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 text-slate-500">
                      {expandedId === comp.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </td>
                    <td className="px-3 py-3 text-slate-200 font-medium">{comp.deal_name ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{comp.buyer ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{comp.seller ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{comp.target_asset ?? '—'}</td>
                    <td className="px-3 py-3 text-emerald-400 text-xs font-medium">{comp.deal_value ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{comp.therapeutic_area ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{comp.stage_at_deal ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{comp.deal_date ?? '—'}</td>
                  </tr>
                  {expandedId === comp.id && (
                    <tr key={`${comp.id}-detail`} className="border-b border-slate-800">
                      <td colSpan={9} className="px-8 py-4 bg-slate-900/30">
                        <div className="grid grid-cols-3 gap-6">
                          {comp.key_terms && (
                            <div>
                              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1.5">Key Terms</div>
                              <div className="text-slate-300 text-sm">{comp.key_terms}</div>
                            </div>
                          )}
                          {comp.strategic_rationale && (
                            <div>
                              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1.5">Strategic Rationale</div>
                              <div className="text-slate-300 text-sm">{comp.strategic_rationale}</div>
                            </div>
                          )}
                          {comp.relevance_note && (
                            <div>
                              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1.5">Relevance</div>
                              <div className="text-slate-300 text-sm">{comp.relevance_note}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
