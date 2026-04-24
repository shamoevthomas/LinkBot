import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Trash2, ArrowRightLeft, Copy, Plus, Loader2, Send, ExternalLink, MapPin, Briefcase, X, Link, Sparkles, Tag, ChevronDown, Download, ShieldOff, Filter, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { getCRM, getContacts, deleteContacts, moveContacts, copyContacts, updateContactsStatus, getCRMs, addContact, sendMessageToContact, searchLinkedInPeople, generateAIMessage, exportContacts, updateContactNotes, undoDeleteContacts } from '../api/crm';
import { getTags, createTag, deleteTag, assignTag, removeTag } from '../api/tags';
import { addToBlacklist } from '../api/blacklist';
import { syncConnections } from '../api/config';
import client from '../api/client';
import PageWrapper from '../components/layout/PageWrapper';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ContactCardModal from '../components/ContactCardModal';
import { formatServerDate } from '../utils/date';
import toast from 'react-hot-toast';

export default function CRMDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [crm, setCrm] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [targetCopyCrm, setTargetCopyCrm] = useState('');
  const [crms, setCrms] = useState([]);
  const [targetCrm, setTargetCrm] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [headlineSearch, setHeadlineSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [addedAfter, setAddedAfter] = useState('');
  const [addedBefore, setAddedBefore] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [tags, setTags] = useState([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [exporting, setExporting] = useState(false);
  const [allSelected, setAllSelected] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Add contact state
  const [addMode, setAddMode] = useState('search'); // 'search' | 'url'
  const [addUrl, setAddUrl] = useState('');
  const [addQuery, setAddQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(null); // urn_id being added or 'url'

  const [perPage, setPerPage] = useState(() => parseInt(localStorage.getItem('linkbot_perPage')) || 25);

  useEffect(() => { localStorage.setItem('linkbot_perPage', perPage); }, [perPage]);

  useEffect(() => { getTags().then(setTags).catch(() => {}); }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage, search: debouncedSearch, connection_status: statusFilter };
      if (headlineSearch) params.headline_search = headlineSearch;
      if (locationSearch) params.location_search = locationSearch;
      if (addedAfter) params.added_after = addedAfter;
      if (addedBefore) params.added_before = addedBefore;
      if (tagFilter) params.tag_id = tagFilter;
      const [crmData, contactsData] = await Promise.all([
        getCRM(id),
        getContacts(id, params),
      ]);
      setCrm(crmData);
      setContacts(contactsData.contacts || []);
      setTotal(contactsData.total || 0);
    } finally { setLoading(false); }
  }, [id, page, perPage, debouncedSearch, statusFilter, headlineSearch, locationSearch, addedAfter, addedBefore, tagFilter]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (cid) => {
    const s = new Set(selected);
    s.has(cid) ? s.delete(cid) : s.add(cid);
    setSelected(s);
    setAllSelected(false);
  };

  const toggleAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set());
      setAllSelected(false);
    } else {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  };

  const selectAllContacts = async () => {
    try {
      const allIds = [];
      let p = 1;
      const baseParams = { per_page: 200, search, connection_status: statusFilter };
      if (headlineSearch) baseParams.headline_search = headlineSearch;
      if (locationSearch) baseParams.location_search = locationSearch;
      if (addedAfter) baseParams.added_after = addedAfter;
      if (addedBefore) baseParams.added_before = addedBefore;
      if (tagFilter) baseParams.tag_id = tagFilter;
      while (true) {
        const data = await getContacts(id, { ...baseParams, page: p });
        const batch = data.contacts || [];
        allIds.push(...batch.map((c) => c.id));
        if (allIds.length >= (data.total || 0) || batch.length === 0) break;
        p++;
      }
      setSelected(new Set(allIds));
      setAllSelected(true);
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    const count = selected.size;
    const ids = [...selected];
    try {
      const res = await deleteContacts(id, ids);
      const deletedIds = res.deleted_ids || ids;
      setSelected(new Set());
      load();
      toast((t) => (
        <div className="flex items-center gap-3">
          <span>{count} contact(s) supprime(s)</span>
          <button
            onClick={() => {
              undoDeleteContacts(id, deletedIds).then(() => { load(); toast.dismiss(t.id); toast.success('Suppression annulee'); }).catch(() => toast.error('Erreur'));
            }}
            className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
          >Annuler</button>
        </div>
      ), { duration: 10000 });
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  const handleMove = async () => {
    try {
      await moveContacts(id, [...selected], parseInt(targetCrm));
      toast.success(`${selected.size} contact(s) deplace(s)`);
      setSelected(new Set());
      setShowMove(false);
      load();
    } catch { toast.error('Erreur lors du deplacement'); }
  };

  const handleCopy = async () => {
    try {
      const res = await copyContacts(id, [...selected], parseInt(targetCopyCrm));
      toast.success(`${res.copied} contact(s) duplique(s)${res.skipped ? `, ${res.skipped} deja present(s)` : ''}`);
      setSelected(new Set());
      setShowCopy(false);
    } catch { toast.error('Erreur lors de la duplication'); }
  };

  const openCopyModal = async () => {
    setCrms(await getCRMs());
    setShowCopy(true);
  };

  const handleChangeStatus = async (newStatus) => {
    setShowStatusMenu(false);
    try {
      const res = await updateContactsStatus(id, [...selected], newStatus);
      toast.success(`${res.updated} contact(s) mis a jour`);
      setSelected(new Set());
      load();
    } catch { toast.error('Erreur lors de la mise a jour'); }
  };

  const handleAddByUrl = async (e) => {
    e.preventDefault();
    setAdding('url');
    try {
      await addContact(id, { linkedin_url: addUrl });
      toast.success('Contact ajoute et enrichi depuis LinkedIn');
      setAddUrl('');
      closeAddModal();
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setAdding(null); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!addQuery.trim()) return;
    setSearching(true);
    try {
      const data = await searchLinkedInPeople(addQuery.trim());
      setSearchResults(data.results || []);
      if ((data.results || []).length === 0) toast('Aucun resultat', { icon: '🔍' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de recherche');
    } finally { setSearching(false); }
  };

  const handleAddFromSearch = async (person) => {
    const urnId = person.urn_id;
    setAdding(urnId);
    try {
      await addContact(id, { urn_id: urnId });
      toast.success(`${person.name || 'Contact'} ajoute`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setAdding(null); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { search, connection_status: statusFilter };
      if (headlineSearch) params.headline_search = headlineSearch;
      if (locationSearch) params.location_search = locationSearch;
      if (addedAfter) params.added_after = addedAfter;
      if (addedBefore) params.added_before = addedBefore;
      if (tagFilter) params.tag_id = tagFilter;
      const blob = await exportContacts(id, params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${crm?.name || 'contacts'}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export telecharge');
    } catch { toast.error("Erreur lors de l'export"); }
    finally { setExporting(false); }
  };

  const handleAssignTag = async (tagId) => {
    setShowTagMenu(false);
    try {
      await assignTag(id, [...selected], tagId);
      toast.success('Tag assigne');
      setSelected(new Set());
      load();
    } catch { toast.error("Erreur lors de l'assignation du tag"); }
  };

  const handleBlacklist = async () => {
    if (!confirm('Blacklister les contacts selectionnes ?')) return;
    try {
      const selectedContacts = contacts.filter((c) => selected.has(c.id));
      for (const c of selectedContacts) {
        if (c.urn_id) {
          await addToBlacklist({ urn_id: c.urn_id, name: `${c.first_name} ${c.last_name}`.trim(), reason: 'Manual blacklist' });
        }
      }
      toast.success(`${selectedContacts.length} contact(s) blackliste(s)`);
      setSelected(new Set());
    } catch { toast.error('Erreur lors du blacklistage'); }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      const tag = await createTag({ name: newTagName.trim(), color: newTagColor });
      setTags([...tags, tag]);
      setNewTagName('');
      toast.success('Tag cree');
    } catch { toast.error('Erreur'); }
  };

  const handleDeleteTag = async (tagId) => {
    try {
      await deleteTag(tagId);
      setTags(tags.filter((t) => t.id !== tagId));
      toast.success('Tag supprime');
    } catch { toast.error('Erreur'); }
  };

  const resetFilters = () => {
    setHeadlineSearch('');
    setLocationSearch('');
    setAddedAfter('');
    setAddedBefore('');
    setTagFilter('');
    setPage(1);
  };

  const closeAddModal = () => {
    setShowAdd(false);
    setAddQuery('');
    setAddUrl('');
    setSearchResults([]);
    setAdding(null);
  };

  const openMoveModal = async () => {
    setCrms(await getCRMs());
    setShowMove(true);
  };

  // Close dropdown menus on outside click
  useEffect(() => {
    if (!showStatusMenu && !showTagMenu) return;
    const close = () => { setShowStatusMenu(false); setShowTagMenu(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showStatusMenu, showTagMenu]);

  const totalPages = Math.ceil(total / perPage);
  const initials = (c) => `${(c.first_name?.[0] || '').toUpperCase()}${(c.last_name?.[0] || '').toUpperCase()}` || '?';

  return (
    <PageWrapper>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/dashboard/crms')} className="p-2 hover:bg-gray-200 rounded-lg shrink-0">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="f text-xl sm:text-2xl font-bold text-gray-900 truncate">{crm?.name || '...'}</h1>
            {crm?.description && <p className="text-sm text-gray-500 truncate">{crm.description}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={async () => {
              setSyncing(true);
              try {
                await syncConnections();
                toast.success('Synchronisation lancée — les statuts seront mis à jour');
                setTimeout(load, 5000);
              } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
              finally { setSyncing(false); }
            }}
            disabled={syncing}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Actualiser</span>
          </button>
          <button onClick={handleExport} disabled={exporting}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} <span className="hidden sm:inline">Exporter</span>
          </button>
          <button onClick={() => setShowTagModal(true)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
            <Tag size={14} /> <span className="hidden sm:inline">Tags</span>
          </button>
          <button onClick={() => setShowAdd(true)}
            className="cta-btn flex items-center gap-1.5 ml-auto" style={{ padding: '6px 14px', fontSize: '13px' }}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-2 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher un contact..."
            className="input-glass w-full pr-3 py-2 text-sm" style={{ paddingLeft: 36 }} />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-glass px-2 py-2 text-sm max-w-[140px]">
          <option value="">Tous les statuts</option>
          <option value="connected">Connecte</option>
          <option value="request_sent">Demande envoyee</option>
          <option value="not_connected">Non connecte</option>
        </select>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`px-2 py-2 border rounded-lg text-sm font-medium flex items-center gap-1 shrink-0 ${showFilters ? 'border-blue-300' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          style={showFilters ? { color: 'var(--blue)', background: 'rgba(0,132,255,0.08)' } : {}}>
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Titre / Poste</label>
              <input value={headlineSearch} onChange={(e) => { setHeadlineSearch(e.target.value); setPage(1); }}
                placeholder="Marketing, CEO..."
                className="input-glass w-full px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Localisation</label>
              <input value={locationSearch} onChange={(e) => { setLocationSearch(e.target.value); setPage(1); }}
                placeholder="Paris, France..."
                className="input-glass w-full px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ajoute apres</label>
              <input type="date" value={addedAfter} onChange={(e) => { setAddedAfter(e.target.value); setPage(1); }}
                className="input-glass w-full px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ajoute avant</label>
              <input type="date" value={addedBefore} onChange={(e) => { setAddedBefore(e.target.value); setPage(1); }}
                className="input-glass w-full px-3 py-2" />
            </div>
          </div>
          <button onClick={resetFilters} className="mt-3 text-xs hover:underline" style={{ color: 'var(--blue)' }}>Reinitialiser les filtres</button>
        </div>
      )}

      {!showFilters && <div className="mb-4" />}

      {/* Select all banner */}
      {selected.size === contacts.length && contacts.length > 0 && total > perPage && !allSelected && (
        <div className="text-center py-2 mb-2 rounded-lg text-sm" style={{ background: 'rgba(0,132,255,0.06)', color: 'var(--blue)' }}>
          Les {contacts.length} contacts de cette page sont sélectionnés.{' '}
          <button onClick={selectAllContacts} className="font-semibold underline cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--blue)' }}>
            Sélectionner les {total} contacts
          </button>
        </div>
      )}
      {allSelected && (
        <div className="text-center py-2 mb-2 rounded-lg text-sm font-medium" style={{ background: 'rgba(0,132,255,0.06)', color: 'var(--blue)' }}>
          Les {selected.size} contacts sont sélectionnés.{' '}
          <button onClick={() => { setSelected(new Set()); setAllSelected(false); }} className="font-semibold underline cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--blue)' }}>
            Annuler
          </button>
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-2 flex-wrap" style={{ background: 'rgba(0,132,255,0.08)', border: '1px solid rgba(0,132,255,0.2)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--blue)' }}>{selected.size} selectionne(s)</span>
          <button onClick={handleDelete} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 flex items-center gap-1">
            <Trash2 size={14} /> Supprimer
          </button>
          <button onClick={openMoveModal} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 flex items-center gap-1">
            <ArrowRightLeft size={14} /> Deplacer
          </button>
          <button onClick={openCopyModal} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 flex items-center gap-1">
            <Copy size={14} /> Dupliquer
          </button>
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); }}
              className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 flex items-center gap-1">
              Statut <ChevronDown size={12} />
            </button>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
                {[
                  { value: 'connected', label: 'Connecte', color: 'bg-emerald-500' },
                  { value: 'request_sent', label: 'Demande envoyee', color: 'bg-amber-500' },
                  { value: 'not_connected', label: 'Non connecte', color: 'bg-gray-400' },
                  { value: 'unknown', label: 'Inconnu', color: 'bg-gray-300' },
                ].map((s) => (
                  <button key={s.value} onClick={() => handleChangeStatus(s.value)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tags.length > 0 && (
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowTagMenu(!showTagMenu); }}
                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200 flex items-center gap-1">
                <Tag size={14} /> Taguer <ChevronDown size={12} />
              </button>
              {showTagMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                  {tags.map((t) => (
                    <button key={t.id} onClick={() => handleAssignTag(t.id)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={handleBlacklist}
            className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-200 flex items-center gap-1">
            <ShieldOff size={14} /> Blacklister
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white overflow-hidden" style={{ border: '1px solid var(--card-bdr)', borderRadius: '16px' }}>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--blue)' }} /></div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="font-medium">Aucun contact</p>
            <p className="text-sm mt-1">Ajoutez des contacts ou lancez une campagne de recherche</p>
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8 px-2 py-3"><input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleAll} className="rounded" /></th>
                <th className="text-left px-2 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-2 py-3 font-medium text-gray-600">Titre</th>
                <th className="text-left px-2 py-3 font-medium text-gray-600 hidden md:table-cell">Statut</th>
                <th className="text-left px-2 py-3 font-medium text-gray-600 hidden lg:table-cell">Derniere interaction</th>
                <th className="text-left px-2 py-3 font-medium text-gray-600 hidden lg:table-cell">Ajoute le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedContact(c)}>
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.profile_picture_url ? (
                        <img src={c.profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                          {initials(c)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <p className="font-medium text-gray-900 truncate">{c.first_name} {c.last_name}</p>
                          {(c.tags || []).map((t) => (
                            <span key={t.id} className="px-1 py-0.5 rounded text-[9px] font-medium text-white shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                        {c.location && <p className="text-xs text-gray-400 truncate">{c.location}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-gray-600 truncate text-xs">{c.headline || '-'}</td>
                  <td className="px-2 py-3 hidden md:table-cell"><Badge status={c.connection_status} /></td>
                  <td className="px-2 py-3 text-gray-500 text-xs hidden lg:table-cell">
                    {c.last_interaction_at ? formatServerDate(c.last_interaction_at) : '-'}
                  </td>
                  <td className="px-2 py-3 text-gray-500 text-xs hidden lg:table-cell">
                    {formatServerDate(c.added_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages >= 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{total} contact(s) au total</span>
              <select value={perPage} onChange={(e) => { setPerPage(parseInt(e.target.value)); setPage(1); }}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white">
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded text-xs font-medium ${p === page ? 'text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                    style={p === page ? { background: 'var(--blue)' } : {}}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add contact modal */}
      <Modal open={showAdd} onClose={closeAddModal} title="Ajouter un contact" wide>
        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setAddMode('search')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              addMode === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Search size={14} /> Rechercher par nom
          </button>
          <button onClick={() => setAddMode('url')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              addMode === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Link size={14} /> URL LinkedIn
          </button>
        </div>

        {addMode === 'search' ? (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Ex: Edmond Lomy, Marketing Manager..."
                className="input-glass flex-1 px-3 py-2" />
              <button type="submit" disabled={searching || !addQuery.trim()}
                className="cta-btn disabled:opacity-50 flex items-center gap-2" style={{ padding: '8px 16px', fontSize: '14px' }}>
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Chercher
              </button>
            </form>

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {searchResults.map((p) => (
                  <div key={p.urn_id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="w-10 h-10 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                      {(p.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{p.name || 'Inconnu'}</p>
                      <p className="text-xs text-gray-500 truncate">{p.jobtitle || '-'}</p>
                      {p.location && <p className="text-xs text-gray-400">{p.location}</p>}
                    </div>
                    <button onClick={() => handleAddFromSearch(p)} disabled={adding === p.urn_id}
                      className="cta-btn disabled:opacity-50 shrink-0 flex items-center gap-1" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      {adding === p.urn_id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleAddByUrl} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL du profil LinkedIn</label>
              <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/nom-prenom" required
                className="input-glass w-full px-3 py-2" />
              <p className="text-xs text-gray-400 mt-1">Les informations du profil seront extraites automatiquement</p>
            </div>
            <button type="submit" disabled={adding === 'url'}
              className="cta-btn w-full disabled:opacity-50 flex items-center justify-center gap-2" style={{ padding: '10px 16px', fontSize: '14px' }}>
              {adding === 'url' ? <><Loader2 size={16} className="animate-spin" /> Extraction en cours...</> : 'Ajouter et enrichir'}
            </button>
          </form>
        )}
      </Modal>

      {/* Move modal */}
      <Modal open={showMove} onClose={() => setShowMove(false)} title="Deplacer vers un CRM">
        <div className="space-y-4">
          <select value={targetCrm} onChange={(e) => setTargetCrm(e.target.value)}
            className="input-glass w-full px-3 py-2">
            <option value="">Selectionner un CRM...</option>
            {crms.filter((c) => c.id !== parseInt(id)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={handleMove} disabled={!targetCrm}
            className="cta-btn w-full disabled:opacity-40" style={{ padding: '10px 16px', fontSize: '14px' }}>
            Deplacer {selected.size} contact(s)
          </button>
        </div>
      </Modal>

      {/* Copy modal */}
      <Modal open={showCopy} onClose={() => setShowCopy(false)} title="Dupliquer vers un CRM">
        <div className="space-y-4">
          <select value={targetCopyCrm} onChange={(e) => setTargetCopyCrm(e.target.value)}
            className="input-glass w-full px-3 py-2">
            <option value="">Selectionner un CRM...</option>
            {crms.filter((c) => c.id !== parseInt(id)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={handleCopy} disabled={!targetCopyCrm}
            className="cta-btn w-full disabled:opacity-40" style={{ padding: '10px 16px', fontSize: '14px' }}>
            Dupliquer {selected.size} contact(s)
          </button>
        </div>
      </Modal>

      {/* Tag management modal */}
      <Modal open={showTagModal} onClose={() => setShowTagModal(false)} title="Gestion des tags">
        <form onSubmit={handleCreateTag} className="flex gap-2 mb-4">
          <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Nom du tag..." className="input-glass flex-1 px-3 py-2" />
          <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)}
            className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
          <button type="submit" disabled={!newTagName.trim()}
            className="cta-btn disabled:opacity-50" style={{ padding: '8px 16px', fontSize: '14px' }}>
            Creer
          </button>
        </form>
        {tags.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun tag</p>
        ) : (
          <div className="space-y-2">
            {tags.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color || '#3b82f6' }} />
                  <span className="text-sm font-medium text-gray-900">{t.name}</span>
                </div>
                <button onClick={() => handleDeleteTag(t.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {selectedContact && (
        <ContactCardModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdate={(c) => { setSelectedContact(c); load(); }}
        />
      )}
    </PageWrapper>
  );
}
