import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FlaskConical } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { Asset } from '../lib/types';

export default function AssetsPage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('assets').select('*, companies(name)').order('name')
      .then(({ data }) => { setAssets((data ?? []) as Asset[]); setLoading(false); });
  }, []);

  const filtered = assets.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.therapeutic_area ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.modality ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Assets"
        subtitle={`${assets.length} assets/programs`}
        actions={
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..." className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600 w-52" />
          </div>
        }
      />
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FlaskConical} title="No assets yet" description="Assets are automatically created when you import a brief" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 sticky top-0 z-10">
              <tr className="text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-5 py-3 text-left font-medium">Asset</th>
                <th className="px-3 py-3 text-left font-medium">Company</th>
                <th className="px-3 py-3 text-left font-medium">Therapeutic Area</th>
                <th className="px-3 py-3 text-left font-medium">Modality</th>
                <th className="px-3 py-3 text-left font-medium">Stage</th>
                <th className="px-3 py-3 text-left font-medium">Indication</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(a => (
                <tr key={a.id} onClick={() => navigate(`/assets/${a.id}`)} className="hover:bg-slate-900/50 cursor-pointer transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-800 rounded flex items-center justify-center shrink-0">
                        <FlaskConical size={12} className="text-slate-500" />
                      </div>
                      <span className="text-slate-200 font-medium">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{(a as Asset & { companies?: { name: string } }).companies?.name ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{a.therapeutic_area ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{a.modality ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{a.stage ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-500 text-xs truncate max-w-32">{a.indication ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
