import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, Clock, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Badge, statusVariant } from '../components/Badge';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { Issue } from '../lib/types';

export default function IssuesPage() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this issue and all its extracted data? This cannot be undone.')) return;
    setDeletingId(id);
    await supabase.from('issues').delete().eq('id', id);
    setIssues(prev => prev.filter(i => i.id !== id));
    setDeletingId(null);
  };

  useEffect(() => {
    supabase.from('issues').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setIssues((data ?? []) as Issue[]); setLoading(false); });
  }, []);

  const filtered = issues.filter(i =>
    !search || (i.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.issue_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.source ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Issues"
        subtitle="Archive of all ingested BD briefs"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search issues..."
                className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600 w-44"
              />
            </div>
            <button onClick={() => navigate('/upload')} className="flex items-center gap-2 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors">
              <Upload size={13} /> Upload
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No issues yet" description="Upload a brief to get started" action={{ label: 'Upload Brief', onClick: () => navigate('/upload') }} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 sticky top-0 z-10">
              <tr className="text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-5 py-3 text-left font-medium">Title</th>
                <th className="px-3 py-3 text-left font-medium">Issue #</th>
                <th className="px-3 py-3 text-left font-medium">Source</th>
                <th className="px-3 py-3 text-left font-medium">Date</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-left font-medium">Created</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(issue => (
                <tr
                  key={issue.id}
                  onClick={() => navigate(`/issues/${issue.id}`)}
                  className="hover:bg-slate-900/50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="text-slate-200 font-medium">{issue.title ?? 'Untitled'}</div>
                    {issue.brief_type && <div className="text-slate-600 text-xs mt-0.5">{issue.brief_type}</div>}
                  </td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{issue.issue_number ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{issue.source ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{issue.issue_date ?? '—'}</td>
                  <td className="px-3 py-3"><Badge variant={statusVariant(issue.status)}>{issue.status}</Badge></td>
                  <td className="px-3 py-3 text-slate-500 text-xs">
                    <div className="flex items-center gap-1"><Clock size={11} />{new Date(issue.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={e => handleDelete(e, issue.id)}
                      disabled={deletingId === issue.id}
                      className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-40"
                      title="Delete issue"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
