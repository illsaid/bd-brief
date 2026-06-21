import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2 } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { Company } from '../lib/types';

export default function CompaniesPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('companies').select('*').order('name')
      .then(({ data }) => { setCompanies((data ?? []) as Company[]); setLoading(false); });
  }, []);

  const filtered = companies.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.ticker ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.therapeutic_focus ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} companies`}
        actions={
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-600 w-52" />
          </div>
        }
      />
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Building2} title="No companies yet" description="Companies are automatically created when you import a brief" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900 sticky top-0 z-10">
              <tr className="text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-5 py-3 text-left font-medium">Company</th>
                <th className="px-3 py-3 text-left font-medium">Ticker</th>
                <th className="px-3 py-3 text-left font-medium">Type</th>
                <th className="px-3 py-3 text-left font-medium">Therapeutic Focus</th>
                <th className="px-3 py-3 text-left font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(co => (
                <tr key={co.id} onClick={() => navigate(`/companies/${co.id}`)} className="hover:bg-slate-900/50 cursor-pointer transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-800 rounded flex items-center justify-center shrink-0">
                        <Building2 size={12} className="text-slate-500" />
                      </div>
                      <span className="text-slate-200 font-medium">{co.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-400 text-xs font-mono">{co.ticker ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{co.company_type ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-400 text-xs">{co.therapeutic_focus ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-500 text-xs">{new Date(co.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
