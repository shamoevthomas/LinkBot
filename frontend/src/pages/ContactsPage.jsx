import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink, MapPin, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAllContacts, getCRMs } from '../api/crm';
import PageWrapper from '../components/layout/PageWrapper';
import Badge from '../components/ui/Badge';

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [crmFilter, setCrmFilter] = useState('');
  const [crms, setCrms] = useState([]);
  const [loading, setLoading] = useState(true);
  const perPage = 25;

  useEffect(() => { getCRMs().then(setCrms).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage, search: search || undefined, connection_status: statusFilter || undefined, crm_id: crmFilter || undefined };
      const data = await getAllContacts(params);
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } finally { setLoading(false); }
  }, [page, search, statusFilter, crmFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / perPage);
  const initials = (c) => `${(c.first_name?.[0] || '').toUpperCase()}${(c.last_name?.[0] || '').toUpperCase()}` || '?';

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="f text-2xl font-bold text-gray-900">Contacts</h1>
        <p className="text-gray-500 text-sm mt-1">Tous vos contacts importes, tous CRMs confondus</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher un contact..."
            className="input-glass w-full pl-9 pr-3 py-2 text-sm" style={{ paddingLeft: 36 }} />
        </div>
        <select value={crmFilter} onChange={(e) => { setCrmFilter(e.target.value); setPage(1); }}
          className="input-glass px-2 py-2 text-sm max-w-[180px]">
          <option value="">Tous les CRMs</option>
          {crms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-glass px-2 py-2 text-sm max-w-[160px]">
          <option value="">Tous les statuts</option>
          <option value="connected">Connecte</option>
          <option value="request_sent">Demande envoyee</option>
          <option value="not_connected">Non connecte</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white overflow-hidden" style={{ border: '1px solid var(--card-bdr)', borderRadius: '16px' }}>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--blue)' }} /></div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="font-medium">Aucun contact</p>
            <p className="text-sm mt-1">Importez des contacts via vos CRMs ou lancez une campagne</p>
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 hidden md:table-cell">Titre</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 hidden lg:table-cell">CRM</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 hidden md:table-cell">Statut</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 hidden lg:table-cell">Ajoute le</th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.profile_picture_url ? (
                        <img src={c.profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(0,132,255,0.1)', color: 'var(--blue)' }}>
                          {initials(c)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{c.first_name} {c.last_name}</div>
                        {c.location && <div className="text-xs text-gray-400 truncate flex items-center gap-1"><MapPin size={10} />{c.location}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="text-gray-600 truncate block">{c.headline || '—'}</span>
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell">
                    <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                      {c.crm_name}
                    </span>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <Badge status={c.connection_status} />
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell text-gray-500 text-xs">
                    {c.added_at ? new Date(c.added_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-2 py-3">
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 hover:bg-gray-100 rounded-lg inline-flex">
                        <ExternalLink size={14} className="text-gray-400" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">{total} contact{total > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-700">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
