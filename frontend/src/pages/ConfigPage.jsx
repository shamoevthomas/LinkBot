import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Upload, Loader2, Key, Download, Settings, Activity, Copy, Check, ShieldOff, Trash2, Plus, Search } from 'lucide-react';
import { updateCookies, getCookiesStatus } from '../api/user';
import { getSettings, updateSettings, importConnections, importCSV, getLogs, getImportStatus } from '../api/config';
import { getCRMs } from '../api/crm';
import { getBlacklist, addToBlacklist, removeFromBlacklist } from '../api/blacklist';
import { useAuth } from '../context/AuthContext';
import PageWrapper from '../components/layout/PageWrapper';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'credentials', icon: Key, label: 'Identifiants' },
  { key: 'import', icon: Download, label: 'Import' },
  { key: 'settings', icon: Settings, label: 'Parametres' },
  { key: 'blacklist', icon: ShieldOff, label: 'Blacklist' },
  { key: 'logs', icon: Activity, label: 'Activite' },
];

const CSV_PROMPT = `J'ai un fichier CSV avec des contacts LinkedIn. Transforme-le en un CSV compatible avec les colonnes suivantes (garde exactement ces noms de colonnes) :

- first_name : prénom du contact
- last_name : nom de famille
- linkedin_url : URL complète du profil LinkedIn (ex: https://www.linkedin.com/in/jean-dupont)
- headline : titre / poste du contact (optionnel)
- location : localisation (optionnel)

Règles :
- La première ligne doit être l'en-tête avec les noms de colonnes ci-dessus
- Sépare par des virgules, encadre les valeurs contenant des virgules avec des guillemets
- Si une colonne n'existe pas dans mon fichier source, laisse-la vide
- La colonne linkedin_url est obligatoire pour chaque contact
- Retourne uniquement le CSV brut, sans explication`;

function CsvImportSection({ csvCrmId, setCsvCrmId, csvFile, setCsvFile, crms, loading, handleImportCSV }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CSV_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-3">Importer un fichier CSV</h3>
      <p className="text-sm text-gray-500 mb-3">Importez des contacts depuis un fichier CSV</p>

      <details className="mb-4 group">
        <summary className="text-xs cursor-pointer hover:underline font-medium flex items-center gap-1" style={{ color: 'var(--blue)' }}>
          Prompt IA pour formater votre CSV
        </summary>
        <div className="mt-2 relative">
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 pr-12 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed overflow-x-auto">{CSV_PROMPT}</pre>
          <button onClick={handleCopy}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-100 transition-colors">
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-gray-400" />}
          </button>
          <p className="text-[11px] text-gray-400 mt-2">Copiez ce prompt et collez-le dans ChatGPT, Claude ou Gemini avec votre fichier CSV.</p>
        </div>
      </details>

      <div className="space-y-3">
        <select value={csvCrmId} onChange={(e) => setCsvCrmId(e.target.value)}
          className="input-glass w-full">
          <option value="">Sélectionner un CRM...</option>
          {crms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-300 transition-colors">
          <Upload size={20} className="text-gray-400" />
          <span className="text-sm text-gray-500">{csvFile ? csvFile.name : 'Cliquez pour sélectionner un fichier CSV'}</span>
          <input type="file" accept=".csv" className="hidden" onChange={(e) => setCsvFile(e.target.files?.[0])} />
        </label>
        <button onClick={handleImportCSV} disabled={loading || !csvFile || !csvCrmId}
          className="cta-btn px-6 py-2.5 rounded-lg text-sm disabled:opacity-40">
          {loading ? 'Import...' : 'Importer le CSV'}
        </button>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const { refreshUser } = useAuth();
  const [tab, setTab] = useState('credentials');
  const [loading, setLoading] = useState(false);

  // Credentials
  const [liAt, setLiAt] = useState('');
  const [jsessionid, setJsessionid] = useState('');
  const [cookieStatus, setCookieStatus] = useState(null);

  // Settings
  const [settings, setSettings] = useState({});

  // Import
  const [crms, setCrms] = useState([]);
  const [importCrmId, setImportCrmId] = useState('');
  const [importStatus, setImportStatus] = useState(null);
  const [csvCrmId, setCsvCrmId] = useState('');
  const [csvFile, setCsvFile] = useState(null);

  // Blacklist
  const [blacklistItems, setBlacklistItems] = useState([]);
  const [blacklistTotal, setBlacklistTotal] = useState(0);
  const [blacklistPage, setBlacklistPage] = useState(1);
  const [blacklistSearch, setBlacklistSearch] = useState('');
  const [newBlacklist, setNewBlacklist] = useState({ urn_id: '', name: '', reason: '' });

  // Logs
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (tab === 'credentials') getCookiesStatus().then(setCookieStatus).catch(() => {});
    if (tab === 'settings') getSettings().then(setSettings).catch(() => {});
    if (tab === 'import') {
      getCRMs().then(setCrms).catch(() => {});
      getImportStatus().then(setImportStatus).catch(() => {});
    }
    if (tab === 'blacklist') loadBlacklist();
    if (tab === 'logs') getLogs({ page: 1, per_page: 100 }).then((d) => setLogs(d.logs || d || [])).catch(() => {});
  }, [tab]);

  const loadBlacklist = () => {
    getBlacklist({ page: blacklistPage, per_page: 20, search: blacklistSearch })
      .then((d) => { setBlacklistItems(d.items || []); setBlacklistTotal(d.total || 0); })
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'blacklist') loadBlacklist();
  }, [blacklistPage, blacklistSearch]);

  // Poll import progress when running
  useEffect(() => {
    if (tab !== 'import' || importStatus?.status !== 'running') return;
    const interval = setInterval(() => {
      getImportStatus().then(setImportStatus).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [tab, importStatus?.status]);

  const handleSaveCookies = async () => {
    setLoading(true);
    try {
      const res = await updateCookies(liAt, jsessionid);
      setCookieStatus({ valid: res.valid });
      if (res.valid) {
        toast.success('Cookies mis à jour et validés');
        refreshUser();
      } else {
        toast.error('Cookies invalides — vérifiez les valeurs');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setLoading(false); }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await updateSettings(settings);
      toast.success('Paramètres sauvegardés');
    } catch { toast.error('Erreur'); }
    finally { setLoading(false); }
  };

  const handleImportConnections = async () => {
    if (!importCrmId) return toast.error('Sélectionnez un CRM');
    setLoading(true);
    try {
      await importConnections(parseInt(importCrmId));
      toast.success('Import lancé');
      // Start polling
      const status = await getImportStatus();
      setImportStatus(status);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleAddBlacklist = async (e) => {
    e.preventDefault();
    if (!newBlacklist.urn_id.trim()) return toast.error('URN ID requis');
    setLoading(true);
    try {
      await addToBlacklist(newBlacklist);
      toast.success('Contact ajoute a la blacklist');
      setNewBlacklist({ urn_id: '', name: '', reason: '' });
      loadBlacklist();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleRemoveBlacklist = async (blId) => {
    try {
      await removeFromBlacklist(blId);
      toast.success('Retire de la blacklist');
      loadBlacklist();
    } catch { toast.error('Erreur'); }
  };

  const handleImportCSV = async () => {
    if (!csvFile || !csvCrmId) return toast.error('Sélectionnez un fichier et un CRM');
    setLoading(true);
    const fd = new FormData();
    fd.append('file', csvFile);
    fd.append('crm_id', csvCrmId);
    try {
      const res = await importCSV(fd);
      toast.success(`${res.created || 0} contacts importés, ${res.skipped || 0} ignorés`);
      setCsvFile(null);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <PageWrapper>
      <h1 className="text-2xl font-bold text-gray-900 mb-6 f">Configuration</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="g-card">
        {/* Credentials tab */}
        {tab === 'credentials' && (
          <div className="max-w-lg space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium text-gray-700">Statut actuel :</span>
              {cookieStatus?.valid ? (
                <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle size={16} /> Valide</span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-red-600"><XCircle size={16} /> Expiré / Non configuré</span>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cookie li_at</label>
              <textarea value={liAt} onChange={(e) => setLiAt(e.target.value)} rows={2}
                placeholder="Collez votre cookie li_at..."
                className="input-glass w-full font-mono text-xs" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">JSESSIONID</label>
              <textarea value={jsessionid} onChange={(e) => setJsessionid(e.target.value)} rows={2}
                placeholder="Collez votre JSESSIONID..."
                className="input-glass w-full font-mono text-xs" />
            </div>
            <button onClick={handleSaveCookies} disabled={loading || !liAt || !jsessionid}
              className="cta-btn px-6 py-2.5 rounded-lg text-sm disabled:opacity-40 flex items-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Tester et sauvegarder
            </button>
          </div>
        )}

        {/* Import tab */}
        {tab === 'import' && (
          <div className="space-y-8 max-w-lg">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Importer vos connexions LinkedIn</h3>
              <p className="text-sm text-gray-500 mb-3">Importez automatiquement toutes vos connexions dans un CRM</p>

              {/* Progress bar when import is running or just finished */}
              {importStatus && importStatus.status !== 'none' && (
                <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {importStatus.status === 'running' && (
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--blue)' }} />
                      )}
                      {importStatus.status === 'completed' && (
                        <CheckCircle size={16} className="text-emerald-500" />
                      )}
                      {importStatus.status === 'failed' && (
                        <XCircle size={16} className="text-red-500" />
                      )}
                      <span className="text-sm font-medium text-gray-700">
                        {importStatus.status === 'running' ? 'Import en cours...' :
                         importStatus.status === 'completed' ? 'Import terminé' :
                         importStatus.status === 'failed' ? 'Import échoué' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {importStatus.total_found} trouvés
                    </span>
                  </div>

                  {importStatus.status === 'running' && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div className="h-2 rounded-full transition-all animate-pulse" style={{ width: '100%', background: 'var(--blue)' }} />
                    </div>
                  )}
                  {importStatus.status === 'completed' && (
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: '100%' }} />
                    </div>
                  )}

                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Ajoutés : <strong className="text-gray-700">{importStatus.total_created}</strong></span>
                    <span>Ignorés : <strong className="text-gray-700">{importStatus.total_skipped}</strong></span>
                  </div>

                  {importStatus.error_message && (
                    <p className="text-xs text-red-600 mt-2">{importStatus.error_message}</p>
                  )}

                  {importStatus.skipped_details?.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-xs text-amber-600 cursor-pointer hover:underline font-medium">
                        Voir les {importStatus.skipped_details.length} contact(s) ignoré(s)
                      </summary>
                      <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                        {importStatus.skipped_details.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-3 py-1.5 border border-gray-100">
                            <span className="font-medium text-gray-700">{s.name}</span>
                            <span className="text-gray-400">{s.reason}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <select value={importCrmId} onChange={(e) => setImportCrmId(e.target.value)}
                  disabled={importStatus?.status === 'running'}
                  className="input-glass flex-1 disabled:opacity-50">
                  <option value="">Sélectionner un CRM...</option>
                  {crms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={handleImportConnections} disabled={loading || importStatus?.status === 'running'}
                  className="cta-btn px-4 py-2 rounded-lg text-sm disabled:opacity-40">
                  {importStatus?.status === 'running' ? 'En cours...' : loading ? 'Import...' : 'Importer'}
                </button>
              </div>
            </div>

            <hr className="border-gray-200" />

            <CsvImportSection
              csvCrmId={csvCrmId} setCsvCrmId={setCsvCrmId}
              csvFile={csvFile} setCsvFile={setCsvFile}
              crms={crms} loading={loading} handleImportCSV={handleImportCSV}
            />
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="max-w-lg space-y-6">
            {/* Limites */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Limites quotidiennes</h3>
              <p className="text-xs text-gray-500 mb-3">Ces limites s'appliquent au total de toutes les campagnes actives combinées.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max connexions par jour</label>
                  <input type="number" value={settings.max_connections_per_day || ''}
                    onChange={(e) => setSettings({ ...settings, max_connections_per_day: e.target.value })}
                    className="input-glass w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max messages par jour</label>
                  <input type="number" value={settings.max_dms_per_day || ''}
                    onChange={(e) => setSettings({ ...settings, max_dms_per_day: e.target.value })}
                    className="input-glass w-full" />
                </div>
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Plage horaire */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Plage horaire</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.schedule_enabled === 'true' || settings.schedule_enabled === true}
                    onChange={(e) => setSettings({ ...settings, schedule_enabled: e.target.checked ? 'true' : 'false' })}
                    className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{ backgroundColor: (settings.schedule_enabled === 'true' || settings.schedule_enabled === true) ? 'var(--blue)' : undefined }}></div>
                </label>
              </div>

              {(settings.schedule_enabled === 'true' || settings.schedule_enabled === true) ? (
                <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Les campagnes ne s'exécutent que pendant cette plage. Les actions sont espacées aléatoirement pour simuler un comportement humain.</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Début</label>
                      <input type="time" value={settings.schedule_start_hour || '08:00'}
                        onChange={(e) => setSettings({ ...settings, schedule_start_hour: e.target.value })}
                        className="input-glass w-full" />
                    </div>
                    <span className="text-gray-400 mt-5">—</span>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Fin</label>
                      <input type="time" value={settings.schedule_end_hour || '20:00'}
                        onChange={(e) => setSettings({ ...settings, schedule_end_hour: e.target.value })}
                        className="input-glass w-full" />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-3">Désactivé — les campagnes tournent en continu. Vous pouvez définir un délai fixe entre chaque action.</p>
                  <div className="flex items-center gap-3">
                    <input type="number" min="1" max="60" value={settings.delay_between_actions || ''}
                      onChange={(e) => setSettings({ ...settings, delay_between_actions: e.target.value })}
                      placeholder="2"
                      className="input-glass w-24" />
                    <span className="text-sm text-gray-500">minutes entre chaque action</span>
                  </div>
                </div>
              )}
            </div>

            <hr className="border-gray-200" />

            {/* Warmup progressif */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Warm-up progressif</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.warmup_enabled === 'true' || settings.warmup_enabled === true}
                    onChange={(e) => setSettings({ ...settings, warmup_enabled: e.target.checked ? 'true' : 'false' })}
                    className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{ backgroundColor: (settings.warmup_enabled === 'true' || settings.warmup_enabled === true) ? 'var(--blue)' : undefined }}></div>
                </label>
              </div>
              <p className="text-xs text-gray-500 mb-3">Augmente progressivement le nombre d'actions par jour pour eviter la detection. La limite quotidienne monte lineairement de la limite de depart vers la limite cible sur la duree configuree.</p>
              {(settings.warmup_enabled === 'true' || settings.warmup_enabled === true) && (
                <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Limite de depart (actions/jour)</label>
                    <input type="number" min="1" value={settings.warmup_start_limit || ''}
                      onChange={(e) => setSettings({ ...settings, warmup_start_limit: e.target.value })}
                      placeholder="5"
                      className="input-glass w-full" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Limite cible (actions/jour)</label>
                    <input type="number" min="1" value={settings.warmup_target_limit || ''}
                      onChange={(e) => setSettings({ ...settings, warmup_target_limit: e.target.value })}
                      placeholder="25"
                      className="input-glass w-full" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Duree (jours)</label>
                    <input type="number" min="1" value={settings.warmup_days || ''}
                      onChange={(e) => setSettings({ ...settings, warmup_days: e.target.value })}
                      placeholder="7"
                      className="input-glass w-full" />
                  </div>
                  <p className="text-xs text-gray-400">
                    Augmente de {settings.warmup_start_limit || 5} a {settings.warmup_target_limit || 25} actions/jour sur {settings.warmup_days || 7} jours
                  </p>
                </div>
              )}
            </div>

            <button onClick={handleSaveSettings} disabled={loading}
              className="cta-btn px-6 py-2.5 rounded-lg text-sm disabled:opacity-40 flex items-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Sauvegarder
            </button>
          </div>
        )}

        {/* Blacklist tab */}
        {tab === 'blacklist' && (
          <div className="space-y-6">
            <form onSubmit={handleAddBlacklist} className="flex gap-2 flex-wrap">
              <input value={newBlacklist.urn_id} onChange={(e) => setNewBlacklist({ ...newBlacklist, urn_id: e.target.value })}
                placeholder="URN ID (ex: ACoAAB...)" required
                className="input-glass flex-1 min-w-[200px]" />
              <input value={newBlacklist.name} onChange={(e) => setNewBlacklist({ ...newBlacklist, name: e.target.value })}
                placeholder="Nom (optionnel)"
                className="input-glass" />
              <input value={newBlacklist.reason} onChange={(e) => setNewBlacklist({ ...newBlacklist, reason: e.target.value })}
                placeholder="Raison (optionnel)"
                className="input-glass" />
              <button type="submit" disabled={loading}
                className="cta-btn px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1">
                <Plus size={14} /> Ajouter
              </button>
            </form>

            <div className="relative max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={blacklistSearch} onChange={(e) => { setBlacklistSearch(e.target.value); setBlacklistPage(1); }}
                placeholder="Rechercher..."
                className="input-glass w-full" style={{ paddingLeft: 36 }} />
            </div>

            {blacklistItems.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Aucun contact dans la blacklist</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">URN ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Raison</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {blacklistItems.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-medium">{b.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{b.urn_id}</td>
                      <td className="px-4 py-3 text-gray-500">{b.reason || '-'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(b.created_at).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleRemoveBlacklist(b.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {blacklistTotal > 20 && (
              <div className="flex justify-center gap-1">
                {Array.from({ length: Math.min(Math.ceil(blacklistTotal / 20), 10) }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setBlacklistPage(p)}
                    className={`px-3 py-1 rounded text-xs font-medium ${p === blacklistPage ? 'text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                    style={p === blacklistPage ? { background: 'var(--blue)' } : undefined}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Logs tab */}
        {tab === 'logs' && (
          <div>
            {logs.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucune activité enregistrée</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.created_at).toLocaleString('fr-FR')}</td>
                      <td className="px-4 py-3 text-gray-700">{log.action_type}</td>
                      <td className="px-4 py-3 text-gray-600">{log.status || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{log.error_message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
