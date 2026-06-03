import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Badge, priorityVariant, urgencyVariant, confidenceVariant } from '../components/Badge';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BdSignal } from '../lib/types';
import { Zap } from 'lucide-react';

interface Filters {
  priority: string;
  signal_type: string;
  strategic_category: string;
  therapeutic_area: string;
  modality: string;
  urgency: string;
  confidence: string;
  search: string;
}

const INIT_FILTERS: Filters = {
  priority: '', signal_type: '', strategic_category: '',
  therapeutic_area: '', modality: '', urgency: '', confidence: '', search: '',
};

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-slate-500 text-xs mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:border-sky-600"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function SignalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [signals, setSignals] = useState<BdSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INIT_FILTERS);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('bd_signals').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setSignals((data ?? []) as BdSignal[]); setLoading(false); });
  }, [user]);

  const filtered = useMemo(() => signals.filter(s => {
    if (filters.priority && s.priority !== filters.priority) return false;
    if (filters.signal_type && s.signal_type !== filters.signal_type) return false;
    if (filters.strategic_category && s.strategic_category !== filters.strategic_category) return false;
    if (filters.therapeutic_area && s.therapeutic_area !== filters.therapeutic_area) return false;
    if (filters.modality && s.modality !== filters.modality) return false;
    if (filters.urgency && s.urgency !== filters.urgency) return false;
    if (filters.confidence && s.confidence !== filters.confidence) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!s.headline.toLowerCase().includes(q) && !(s.therapeutic_area ?? '').toLowerCase().includes(q) && !(s.signal_type ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [signals, filters]);

  const uniqueValues = (key: keyof BdSignal) =>
    [...new Set(signals.map(s => s[key] as string).filter(Boolean))].sort();

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'search' && v).length;
  const clearFilters = () => setFilters(INIT_FILTERS);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="BD Signals"
        subtitle={`${filtered.length} of ${signals.length} signals`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Search signals..."
                className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600 w-52"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${showFilters ? 'bg-sky-600/20 border-sky-600 text-sky-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && <span className="bg-sky-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>}
            </button>
            <div className="flex border border-slate-700 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode('table')} className={`px-2.5 py-2 transition-colors ${viewMode === 'table' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><List size={14} /></button>
              <button onClick={() => setViewMode('card')} className={`px-2.5 py-2 transition-colors ${viewMode === 'card' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}><LayoutGrid size={14} /></button>
            </div>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Filter sidebar */}
        {showFilters && (
          <div className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-300 text-xs font-medium uppercase tracking-wide">Filters</span>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs">
                  <X size={11} /> Clear
                </button>
              )}
            </div>
            <div className="space-y-3">
              <FilterSelect label="Priority" value={filters.priority} options={['high','medium','low']} onChange={v => setFilters(f => ({ ...f, priority: v }))} />
              <FilterSelect label="Urgency" value={filters.urgency} options={['immediate','high','medium','low']} onChange={v => setFilters(f => ({ ...f, urgency: v }))} />
              <FilterSelect label="Confidence" value={filters.confidence} options={['high','medium','low','speculative']} onChange={v => setFilters(f => ({ ...f, confidence: v }))} />
              <FilterSelect label="Signal Type" value={filters.signal_type} options={uniqueValues('signal_type')} onChange={v => setFilters(f => ({ ...f, signal_type: v }))} />
              <FilterSelect label="Strategic Category" value={filters.strategic_category} options={uniqueValues('strategic_category')} onChange={v => setFilters(f => ({ ...f, strategic_category: v }))} />
              <FilterSelect label="Therapeutic Area" value={filters.therapeutic_area} options={uniqueValues('therapeutic_area')} onChange={v => setFilters(f => ({ ...f, therapeutic_area: v }))} />
              <FilterSelect label="Modality" value={filters.modality} options={uniqueValues('modality')} onChange={v => setFilters(f => ({ ...f, modality: v }))} />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Zap} title="No signals found" description={signals.length === 0 ? 'Import a brief to start seeing BD signals' : 'Try adjusting your filters'} />
          ) : viewMode === 'table' ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-900 sticky top-0 z-10">
                <tr className="text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Headline</th>
                  <th className="px-3 py-3 text-left font-medium">Type</th>
                  <th className="px-3 py-3 text-left font-medium">Area</th>
                  <th className="px-3 py-3 text-left font-medium">Priority</th>
                  <th className="px-3 py-3 text-left font-medium">Confidence</th>
                  <th className="px-3 py-3 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map(sig => (
                  <tr
                    key={sig.id}
                    onClick={() => navigate(`/signals/${sig.id}`)}
                    className="hover:bg-slate-900/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="text-slate-200 font-medium truncate max-w-xs">{sig.headline}</div>
                      {sig.modality && <div className="text-slate-500 text-xs mt-0.5">{sig.modality}</div>}
                    </td>
                    <td className="px-3 py-3">{sig.signal_type && <Badge variant="signal-type">{sig.signal_type.replace('_', ' ')}</Badge>}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs max-w-24 truncate">{sig.therapeutic_area}</td>
                    <td className="px-3 py-3">{sig.priority && <Badge variant={priorityVariant(sig.priority)}>{sig.priority}</Badge>}</td>
                    <td className="px-3 py-3">{sig.confidence && <Badge variant={confidenceVariant(sig.confidence)}>{sig.confidence}</Badge>}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">{sig.event_date || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-5 grid grid-cols-2 gap-4">
              {filtered.map(sig => (
                <button
                  key={sig.id}
                  onClick={() => navigate(`/signals/${sig.id}`)}
                  className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors"
                >
                  <div className="flex items-start gap-2 mb-3 flex-wrap">
                    <Badge variant={priorityVariant(sig.priority)}>{sig.priority}</Badge>
                    <Badge variant={urgencyVariant(sig.urgency)}>{sig.urgency}</Badge>
                    <Badge variant={confidenceVariant(sig.confidence)}>{sig.confidence}</Badge>
                    {sig.signal_type && <Badge variant="signal-type">{sig.signal_type.replace('_', ' ')}</Badge>}
                  </div>
                  <div className="text-slate-200 font-medium text-sm mb-2 line-clamp-2">{sig.headline}</div>
                  <div className="text-slate-500 text-xs line-clamp-2">{sig.what_changed}</div>
                  {sig.therapeutic_area && (
                    <div className="mt-3 text-slate-600 text-xs">{sig.therapeutic_area}{sig.modality ? ` · ${sig.modality}` : ''}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
