import { useEffect, useState, useMemo } from 'react';
import { Search, AlertTriangle, SlidersHorizontal, X } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Badge, urgencyVariant } from '../components/Badge';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MispricingFlag } from '../lib/types';

export default function FlagsPage() {
  const { user } = useAuth();
  const [flags, setFlags] = useState<MispricingFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [taFilter, setTaFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('mispricing_flags').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setFlags((data ?? []) as MispricingFlag[]); setLoading(false); });
  }, [user]);

  const filtered = useMemo(() => flags.filter(f => {
    if (urgencyFilter && f.urgency !== urgencyFilter) return false;
    if (taFilter && f.therapeutic_area !== taFilter) return false;
    if (search && !f.flag_headline.toLowerCase().includes(search.toLowerCase()) &&
      !(f.asset ?? '').toLowerCase().includes(search.toLowerCase()) &&
      !(f.company ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [flags, search, urgencyFilter, taFilter]);

  const taOptions = [...new Set(flags.map(f => f.therapeutic_area).filter(Boolean))].sort() as string[];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Mispricing Flags"
        subtitle={`${filtered.length} pricing red flags`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search flags..." className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600 w-44" />
            </div>
            <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:border-sky-600">
              <option value="">All urgency</option>
              {['immediate','high','medium','low'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            {taOptions.length > 0 && (
              <select value={taFilter} onChange={e => setTaFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:border-sky-600">
                <option value="">All areas</option>
                {taOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {(urgencyFilter || taFilter) && (
              <button onClick={() => { setUrgencyFilter(''); setTaFilter(''); }} className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-sm">
                <X size={13} /> Clear
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="No mispricing flags" description="Mispricing flags are extracted from imported briefs" />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map(flag => (
              <div key={flag.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-slate-200 font-medium text-sm leading-snug">{flag.flag_headline}</h3>
                  <Badge variant={urgencyVariant(flag.urgency)} className="shrink-0">{flag.urgency}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                  {flag.asset && (
                    <div>
                      <span className="text-slate-500">Asset</span>
                      <div className="text-slate-300 mt-0.5">{flag.asset}</div>
                    </div>
                  )}
                  {flag.company && (
                    <div>
                      <span className="text-slate-500">Company</span>
                      <div className="text-slate-300 mt-0.5">{flag.company}</div>
                    </div>
                  )}
                  {flag.current_valuation && (
                    <div>
                      <span className="text-slate-500">Current Val.</span>
                      <div className="text-slate-300 mt-0.5">{flag.current_valuation}</div>
                    </div>
                  )}
                  {flag.implied_value && (
                    <div>
                      <span className="text-slate-500">Implied Value</span>
                      <div className="text-emerald-400 mt-0.5 font-medium">{flag.implied_value}</div>
                    </div>
                  )}
                </div>

                {flag.valuation_gap && (
                  <div className="bg-amber-900/10 border border-amber-900/20 rounded-lg px-3 py-2 mb-3">
                    <span className="text-amber-400 text-xs font-medium">Gap: </span>
                    <span className="text-amber-300 text-xs">{flag.valuation_gap}</span>
                  </div>
                )}

                {flag.rationale && (
                  <div className="mb-2">
                    <div className="text-slate-500 text-xs mb-1">Rationale</div>
                    <p className="text-slate-400 text-xs leading-relaxed">{flag.rationale}</p>
                  </div>
                )}

                {flag.strategic_implication && (
                  <div>
                    <div className="text-slate-500 text-xs mb-1">Strategic Implication</div>
                    <p className="text-slate-400 text-xs leading-relaxed">{flag.strategic_implication}</p>
                  </div>
                )}

                {flag.therapeutic_area && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <span className="text-slate-600 text-xs">{flag.therapeutic_area}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
