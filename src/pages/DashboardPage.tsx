import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Zap, FileText, AlertCircle, TrendingUp, Clock } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Badge, priorityVariant, confidenceVariant, statusVariant } from '../components/Badge';
import { supabase } from '../lib/supabase';
import { Issue, BdSignal } from '../lib/types';

interface Stats {
  totalIssues: number;
  totalSignals: number;
  needsReview: number;
  thisWeek: number;
}

interface CountGroup {
  label: string;
  count: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ totalIssues: 0, totalSignals: 0, needsReview: 0, thisWeek: 0 });
  const [recentIssues, setRecentIssues] = useState<Issue[]>([]);
  const [recentSignals, setRecentSignals] = useState<BdSignal[]>([]);
  const [byType, setByType] = useState<CountGroup[]>([]);
  const [byTA, setByTA] = useState<CountGroup[]>([]);
  const [byPriority, setByPriority] = useState<CountGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [issuesRes, signalsRes] = await Promise.all([
        supabase.from('issues').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('bd_signals').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      const issues = (issuesRes.data ?? []) as Issue[];
      const signals = (signalsRes.data ?? []) as BdSignal[];

      setRecentIssues(issues);
      setRecentSignals(signals);

      // Count stats
      const { count: totalIssues } = await supabase.from('issues').select('*', { count: 'exact', head: true });
      const { count: totalSignals } = await supabase.from('bd_signals').select('*', { count: 'exact', head: true });
      const { count: needsReview } = await supabase.from('bd_signals').select('*', { count: 'exact', head: true }).eq('needs_review', true);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: thisWeek } = await supabase.from('bd_signals').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo);

      setStats({ totalIssues: totalIssues ?? 0, totalSignals: totalSignals ?? 0, needsReview: needsReview ?? 0, thisWeek: thisWeek ?? 0 });

      // Group by signal type, TA, priority from all signals
      const { data: allSignals } = await supabase.from('bd_signals').select('signal_type, therapeutic_area, priority');

      const typeCounts: Record<string, number> = {};
      const taCounts: Record<string, number> = {};
      const priCounts: Record<string, number> = { high: 0, medium: 0, low: 0 };

      for (const s of allSignals ?? []) {
        if (s.signal_type) typeCounts[s.signal_type] = (typeCounts[s.signal_type] ?? 0) + 1;
        if (s.therapeutic_area) taCounts[s.therapeutic_area] = (taCounts[s.therapeutic_area] ?? 0) + 1;
        if (s.priority) priCounts[s.priority] = (priCounts[s.priority] ?? 0) + 1;
      }

      setByType(Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count })));
      setByTA(Object.entries(taCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count })));
      setByPriority(Object.entries(priCounts).map(([label, count]) => ({ label, count })));
      setLoading(false);
    };
    load();
  }, []);

  const maxType = Math.max(...byType.map(x => x.count), 1);
  const maxTA = Math.max(...byTA.map(x => x.count), 1);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        subtitle="BD intelligence overview"
        actions={
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-2 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Upload size={14} /> Upload Brief
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Issues', value: stats.totalIssues, icon: FileText, color: 'sky' },
            { label: 'BD Signals', value: stats.totalSignals, icon: Zap, color: 'emerald' },
            { label: 'Needs Review', value: stats.needsReview, icon: AlertCircle, color: 'amber' },
            { label: 'This Week', value: stats.thisWeek, icon: TrendingUp, color: 'slate' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  color === 'sky' ? 'bg-sky-900/50' : color === 'emerald' ? 'bg-emerald-900/50' : color === 'amber' ? 'bg-amber-900/50' : 'bg-slate-800'
                }`}>
                  <Icon size={13} className={
                    color === 'sky' ? 'text-sky-400' : color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-slate-400'
                  } />
                </div>
              </div>
              <div className="text-white text-2xl font-bold">{loading ? '—' : value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Recent Issues */}
          <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="text-slate-200 font-medium text-sm">Recent Issues</h2>
              <button onClick={() => navigate('/issues')} className="text-sky-400 hover:text-sky-300 text-xs transition-colors">View all</button>
            </div>
            <div className="divide-y divide-slate-800">
              {loading ? (
                <div className="py-8 text-center text-slate-500 text-sm">Loading...</div>
              ) : recentIssues.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">No issues yet. <button onClick={() => navigate('/upload')} className="text-sky-400 hover:text-sky-300">Upload your first brief</button></div>
              ) : recentIssues.map(issue => (
                <button
                  key={issue.id}
                  onClick={() => navigate(`/issues/${issue.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-800/50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm font-medium truncate">{issue.title ?? 'Untitled'}</div>
                    <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-2">
                      <Clock size={11} />
                      {new Date(issue.created_at).toLocaleDateString()}
                      {issue.issue_number && <span>· {issue.issue_number}</span>}
                    </div>
                  </div>
                  <Badge variant={statusVariant(issue.status)}>{issue.status}</Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Charts column */}
          <div className="space-y-4">
            {/* By Priority */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-4">Signals by Priority</h3>
              <div className="space-y-2">
                {byPriority.map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-3">
                    <Badge variant={priorityVariant(label)} className="w-16 justify-center shrink-0">{label}</Badge>
                    <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                      <div className="bg-sky-500 h-1.5 rounded-full transition-all" style={{ width: `${(count / Math.max(stats.totalSignals, 1)) * 100}%` }} />
                    </div>
                    <span className="text-slate-400 text-xs w-5 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By Signal Type */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-4">Signals by Type</h3>
              <div className="space-y-2">
                {byType.slice(0, 5).map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-slate-400 text-xs w-24 truncate shrink-0">{label}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                      <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${(count / maxType) * 100}%` }} />
                    </div>
                    <span className="text-slate-400 text-xs w-5 text-right">{count}</span>
                  </div>
                ))}
                {byType.length === 0 && <div className="text-slate-600 text-xs">No data yet</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Recent BD Signals */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="text-slate-200 font-medium text-sm">Recent BD Signals</h2>
            <button onClick={() => navigate('/signals')} className="text-sky-400 hover:text-sky-300 text-xs transition-colors">View all</button>
          </div>
          <div className="divide-y divide-slate-800">
            {loading ? (
              <div className="py-8 text-center text-slate-500 text-sm">Loading...</div>
            ) : recentSignals.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No signals yet</div>
            ) : recentSignals.map(sig => (
              <button
                key={sig.id}
                onClick={() => navigate(`/signals/${sig.id}`)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-slate-200 text-sm font-medium truncate">{sig.headline}</div>
                  <div className="text-slate-500 text-xs mt-1 flex items-center gap-2">
                    {sig.therapeutic_area && <span>{sig.therapeutic_area}</span>}
                    {sig.event_date && <><span>·</span><span>{sig.event_date}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={priorityVariant(sig.priority)}>{sig.priority}</Badge>
                  <Badge variant={confidenceVariant(sig.confidence)}>{sig.confidence}</Badge>
                  {sig.signal_type && <Badge variant="signal-type">{sig.signal_type.replace('_', ' ')}</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Therapeutic area distribution */}
        {byTA.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-4">Signals by Therapeutic Area</h3>
            <div className="grid grid-cols-2 gap-3">
              {byTA.map(({ label, count }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-slate-300 text-sm w-40 truncate shrink-0">{label}</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                    <div className="bg-sky-500 h-1.5 rounded-full transition-all" style={{ width: `${(count / maxTA) * 100}%` }} />
                  </div>
                  <span className="text-slate-400 text-xs w-5 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
