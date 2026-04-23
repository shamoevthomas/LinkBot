import { useState, useEffect } from 'react';
import {
  CheckCircle, XCircle, Upload, Loader2, Key, Download, Settings, Activity,
  Copy, Check, ShieldOff, Trash2, Plus, Search, AlertTriangle, ChevronDown,
  Sparkles, Clock, TrendingUp,
} from 'lucide-react';
import { updateCookies, getCookiesStatus, updateGeminiKey } from '../api/user';
import { getSettings, updateSettings, importConnections, importCSV, getLogs, getImportStatus } from '../api/config';
import { getCRMs } from '../api/crm';
import { getBlacklist, addToBlacklist, removeFromBlacklist } from '../api/blacklist';
import { useAuth } from '../context/AuthContext';
import PageWrapper from '../components/layout/PageWrapper';
import { formatServerDate, formatServerDateTime } from '../utils/date';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'credentials', icon: Key,       label: 'Identifiants' },
  { key: 'import',      icon: Download,  label: 'Import' },
  { key: 'settings',    icon: Settings,  label: 'Paramètres' },
  { key: 'blacklist',   icon: ShieldOff, label: 'Blacklist' },
  { key: 'logs',        icon: Activity,  label: 'Activité' },
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

function SectionHeader({ eyebrow, title, desc, right }) {
  return (
    <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h3 className="text-[16px] font-semibold tracking-tight" style={{ letterSpacing: '-0.01em', color: 'hsl(var(--text))' }}>{title}</h3>
        {desc && <p className="text-[12.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>{desc}</p>}
      </div>
      {right}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 40, height: 22, borderRadius: 999, position: 'relative',
        background: on ? 'hsl(var(--accent))' : 'hsl(220 20% 88%)',
        border: '1px solid transparent',
        transition: 'background .2s',
        cursor: 'pointer',
      }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 2px hsl(220 40% 20% / .2)',
        transition: 'left .2s',
      }} />
    </button>
  );
}

function CsvImportSection({ csvCrmId, setCsvCrmId, csvFile, setCsvFile, crms, loading, handleImportCSV }) {
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CSV_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <SectionHeader
        eyebrow="CSV"
        title="Importer un fichier CSV"
        desc="Chargez vos contacts depuis un fichier existant. Mapping de colonnes flexible." />

      <details className="mb-4">
        <summary className="text-[12px] cursor-pointer font-medium inline-flex items-center gap-1"
          style={{ color: 'hsl(var(--accent))' }}>
          <Sparkles size={12} /> Prompt IA pour formater votre CSV
        </summary>
        <div className="mt-3 relative">
          <pre className="p-4 pr-12 text-[11.5px] whitespace-pre-wrap leading-relaxed overflow-x-auto"
            style={{
              background: 'hsl(220 22% 98%)',
              border: '1px solid hsl(var(--border))',
              borderRadius: 12,
              color: 'hsl(var(--muted))',
            }}>{CSV_PROMPT}</pre>
          <button onClick={handleCopy}
            className="absolute top-3 right-3 p-1.5 rounded-md transition-colors"
            style={{
              background: 'hsl(var(--panel))',
              border: '1px solid hsl(var(--border))',
            }}>
            {copied ? <Check size={13} style={{ color: 'hsl(var(--emerald))' }} /> : <Copy size={13} style={{ color: 'hsl(var(--muted))' }} />}
          </button>
          <p className="text-[11px] mt-2" style={{ color: 'hsl(var(--muted))' }}>
            Copiez ce prompt et collez-le dans ChatGPT, Claude ou Gemini avec votre fichier CSV.
          </p>
        </div>
      </details>

      <div className="space-y-3">
        <div>
          <label className="form-label">CRM destination</label>
          <select value={csvCrmId} onChange={(e) => setCsvCrmId(e.target.value)} className="input-sm">
            <option value="">Sélectionner un CRM…</option>
            {crms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f && f.name.endsWith('.csv')) setCsvFile(f);
          }}
          className="flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
          style={{
            padding: '28px 16px',
            border: `1.5px dashed ${dragOver ? 'hsl(var(--accent))' : 'hsl(var(--border-strong))'}`,
            borderRadius: 14,
            background: dragOver ? 'hsl(var(--accent-soft))' : 'hsl(220 22% 98%)',
          }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
            <Upload size={16} />
          </div>
          <div className="text-[13px] font-medium" style={{ color: 'hsl(var(--text))' }}>
            {csvFile ? csvFile.name : 'Glissez votre CSV ou cliquez pour choisir'}
          </div>
          <div className="text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>
            Format .csv uniquement
          </div>
          <input type="file" accept=".csv" className="hidden" onChange={(e) => setCsvFile(e.target.files?.[0])} />
        </label>
        <div className="flex justify-end">
          <button onClick={handleImportCSV} disabled={loading || !csvFile || !csvCrmId} className="cta-btn">
            {loading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
            {loading ? 'Import…' : 'Importer le CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('credentials');
  const [loading, setLoading] = useState(false);

  const [liAt, setLiAt] = useState('');
  const [jsessionid, setJsessionid] = useState('');
  const [cookieStatus, setCookieStatus] = useState(null);

  const [settings, setSettings] = useState({});

  const [geminiKey, setGeminiKey] = useState('');
  const [geminiSaving, setGeminiSaving] = useState(false);

  const [crms, setCrms] = useState([]);
  const [importCrmId, setImportCrmId] = useState('');
  const [importStatus, setImportStatus] = useState(null);
  const [csvCrmId, setCsvCrmId] = useState('');
  const [csvFile, setCsvFile] = useState(null);

  const [blacklistItems, setBlacklistItems] = useState([]);
  const [blacklistTotal, setBlacklistTotal] = useState(0);
  const [blacklistPage, setBlacklistPage] = useState(1);
  const [blacklistSearch, setBlacklistSearch] = useState('');
  const [newBlacklist, setNewBlacklist] = useState({ urn_id: '', name: '', reason: '' });

  const [showSkipped, setShowSkipped] = useState(false);

  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (tab === 'credentials') getCookiesStatus().then(setCookieStatus).catch(() => toast.error('Erreur chargement cookies'));
    if (tab === 'settings') getSettings().then(setSettings).catch(() => toast.error('Erreur chargement paramètres'));
    if (tab === 'import') {
      getCRMs().then(setCrms).catch(() => toast.error('Erreur chargement CRMs'));
      getImportStatus().then(setImportStatus).catch(() => {});
    }
    if (tab === 'blacklist') loadBlacklist();
    if (tab === 'logs') getLogs({ page: 1, per_page: 100 }).then((d) => setLogs(d.logs || d || [])).catch(() => toast.error('Erreur chargement logs'));
  }, [tab]);

  const loadBlacklist = () => {
    getBlacklist({ page: blacklistPage, per_page: 20, search: blacklistSearch })
      .then((d) => { setBlacklistItems(d.items || []); setBlacklistTotal(d.total || 0); })
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'blacklist') loadBlacklist();
  }, [blacklistPage, blacklistSearch]);

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
      toast.success('Contact ajouté à la blacklist');
      setNewBlacklist({ urn_id: '', name: '', reason: '' });
      loadBlacklist();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
    finally { setLoading(false); }
  };

  const handleRemoveBlacklist = async (blId) => {
    try {
      await removeFromBlacklist(blId);
      toast.success('Retiré de la blacklist');
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

  const scheduleOn = String(settings.schedule_enabled).toLowerCase() === 'true';
  const warmupOn = String(settings.warmup_enabled).toLowerCase() === 'true';

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Configuration</h1>
          <p className="text-[13.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
            Cookies LinkedIn, import, limites et plages horaires, blacklist, journal d'activité.
          </p>
        </div>
      </div>

      {/* Tab pills */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg mb-6 w-fit"
        style={{ background: 'hsl(220 20% 95%)' }}>
        {TABS.map(({ key, icon: Icon, label }) => {
          const active = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-2 transition-all"
              style={{
                padding: '7px 14px', borderRadius: 8,
                fontSize: 12.5, fontWeight: 500,
                background: active ? 'hsl(var(--panel))' : 'transparent',
                color: active ? 'hsl(var(--text))' : 'hsl(var(--muted))',
                border: active ? '1px solid hsl(var(--border))' : '1px solid transparent',
                boxShadow: active ? '0 1px 2px hsl(220 40% 20% / .04)' : 'none',
                cursor: 'pointer',
              }}>
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>

      {/* ── IDENTIFIANTS ── */}
      {tab === 'credentials' && (
        <div className="g-card" style={{ padding: 24 }}>
          <SectionHeader
            eyebrow="LinkedIn"
            title="Cookies de session"
            desc="Collez vos cookies li_at et JSESSIONID. Stockés localement, jamais envoyés à un tiers."
            right={
              cookieStatus?.valid ? (
                <span className="chip emerald" style={{ fontSize: 11 }}>
                  <CheckCircle size={11} /> Valide
                </span>
              ) : (
                <span className="chip rose" style={{ fontSize: 11 }}>
                  <XCircle size={11} /> Non configuré
                </span>
              )
            } />

          <div className="space-y-4 max-w-xl">
            <div>
              <label className="form-label">Cookie li_at</label>
              <textarea value={liAt} onChange={(e) => setLiAt(e.target.value)} rows={2}
                placeholder="Collez votre cookie li_at…"
                className="input-sm mono" style={{ fontSize: 12 }} />
            </div>
            <div>
              <label className="form-label">JSESSIONID</label>
              <textarea value={jsessionid} onChange={(e) => setJsessionid(e.target.value)} rows={2}
                placeholder="Collez votre JSESSIONID…"
                className="input-sm mono" style={{ fontSize: 12 }} />
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveCookies} disabled={loading || !liAt || !jsessionid} className="cta-btn">
                {loading ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                {loading ? 'Vérification…' : 'Tester et sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT ── */}
      {tab === 'import' && (
        <div className="space-y-4">
          {/* LinkedIn network import */}
          <div className="g-card" style={{ padding: 24 }}>
            <SectionHeader
              eyebrow="Réseau LinkedIn"
              title="Importer toutes vos connexions"
              desc="Récupère l'intégralité de votre réseau LinkedIn et l'ajoute à un CRM. Le sync auto (toutes les 6h) prendra ensuite le relai." />

            {importStatus && importStatus.status !== 'none' && (
              <div className="g-card-soft mb-4" style={{ padding: 16, background: 'hsl(220 22% 98%)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {importStatus.status === 'running' && (
                      <Loader2 size={14} className="spin" style={{ color: 'hsl(var(--accent))' }} />
                    )}
                    {importStatus.status === 'completed' && (
                      <CheckCircle size={14} style={{ color: 'hsl(var(--emerald))' }} />
                    )}
                    {importStatus.status === 'failed' && (
                      <XCircle size={14} style={{ color: 'hsl(var(--rose))' }} />
                    )}
                    <span className="text-[12.5px] font-medium" style={{ color: 'hsl(var(--text))' }}>
                      {importStatus.status === 'running' ? 'Import en cours…' :
                       importStatus.status === 'completed' ? 'Import terminé' :
                       importStatus.status === 'failed' ? 'Import échoué' : ''}
                    </span>
                  </div>
                  <span className="mono text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
                    {importStatus.total_found} trouvés
                  </span>
                </div>

                <div className="pbar mb-3" style={{ height: 4 }}>
                  <div
                    className={importStatus.status === 'running' ? 'animate-pulse' : ''}
                    style={{
                      height: '100%',
                      width: '100%',
                      background: importStatus.status === 'failed'
                        ? 'hsl(var(--rose))'
                        : importStatus.status === 'completed'
                          ? 'hsl(var(--emerald))'
                          : 'hsl(var(--accent))',
                      borderRadius: 999,
                    }} />
                </div>

                <div className="flex gap-4 text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>
                  <span>Ajoutés : <b style={{ color: 'hsl(var(--emerald))', fontWeight: 600 }}>{importStatus.total_created}</b></span>
                  <span>Ignorés : <b style={{ color: 'hsl(var(--amber))', fontWeight: 600 }}>{importStatus.total_skipped}</b></span>
                </div>

                {importStatus.error_message && (
                  <p className="text-[11.5px] mt-2" style={{ color: 'hsl(var(--rose))' }}>{importStatus.error_message}</p>
                )}

                {importStatus.total_skipped > 0 && (
                  <div className="mt-3">
                    <button onClick={() => setShowSkipped(!showSkipped)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                      style={{
                        color: 'hsl(var(--amber))',
                        background: showSkipped ? 'hsl(var(--amber) / .12)' : 'transparent',
                        border: '1px solid hsl(var(--amber) / .3)',
                      }}>
                      <AlertTriangle size={11} />
                      {importStatus.total_skipped} contact(s) ignoré(s)
                      <ChevronDown size={11} style={{ transform: showSkipped ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                    </button>
                    {showSkipped && importStatus.skipped_details?.length > 0 && (
                      <div className="mt-2 max-h-60 overflow-y-auto rounded-lg"
                        style={{ border: '1px solid hsl(var(--amber) / .3)', background: 'hsl(var(--amber) / .06)' }}>
                        {importStatus.skipped_details.map((s, i) => (
                          <div key={i}
                            className="flex items-center justify-between px-3 py-2 text-[11.5px]"
                            style={{ borderBottom: i < importStatus.skipped_details.length - 1 ? '1px solid hsl(var(--amber) / .15)' : 'none' }}>
                            <span className="font-medium" style={{ color: 'hsl(var(--text))' }}>{s.name || 'Contact inconnu'}</span>
                            <span className="chip amber" style={{ fontSize: 10 }}>{s.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {showSkipped && (!importStatus.skipped_details || importStatus.skipped_details.length === 0) && (
                      <p className="mt-2 text-[11px] italic px-2" style={{ color: 'hsl(var(--muted))' }}>
                        Détails non disponibles pour cet import.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="max-w-xl">
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <label className="form-label">CRM destination</label>
                  <select value={importCrmId} onChange={(e) => setImportCrmId(e.target.value)}
                    disabled={importStatus?.status === 'running'} className="input-sm">
                    <option value="">Sélectionner un CRM…</option>
                    {crms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <button onClick={handleImportConnections}
                  disabled={loading || importStatus?.status === 'running'} className="cta-btn">
                  {importStatus?.status === 'running' ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  {importStatus?.status === 'running' ? 'En cours…' : loading ? 'Import…' : 'Importer'}
                </button>
              </div>
            </div>
          </div>

          {/* CSV import */}
          <div className="g-card" style={{ padding: 24 }}>
            <CsvImportSection
              csvCrmId={csvCrmId} setCsvCrmId={setCsvCrmId}
              csvFile={csvFile} setCsvFile={setCsvFile}
              crms={crms} loading={loading} handleImportCSV={handleImportCSV}
            />
          </div>
        </div>
      )}

      {/* ── PARAMÈTRES ── */}
      {tab === 'settings' && (
        <div className="space-y-4">
          {/* Limites quotidiennes */}
          <div className="g-card" style={{ padding: 24 }}>
            <SectionHeader
              eyebrow="Limites"
              title="Quotas quotidiens"
              desc="S'applique au total de toutes les campagnes actives combinées." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="form-label">Max connexions par jour</label>
                <input type="number" value={settings.max_connections_per_day || ''}
                  onChange={(e) => setSettings({ ...settings, max_connections_per_day: e.target.value })}
                  className="input-sm" />
              </div>
              <div>
                <label className="form-label">Max messages par jour</label>
                <input type="number" value={settings.max_dms_per_day || ''}
                  onChange={(e) => setSettings({ ...settings, max_dms_per_day: e.target.value })}
                  className="input-sm" />
              </div>
            </div>
          </div>

          {/* Plage horaire */}
          <div className="g-card" style={{ padding: 24 }}>
            <SectionHeader
              eyebrow="Planning"
              title="Plage horaire"
              desc={scheduleOn
                ? "Les campagnes ne s'exécutent que pendant cette plage, avec un espacement aléatoire humain."
                : "Les campagnes tournent en continu avec un délai aléatoire entre les actions."}
              right={<Toggle on={scheduleOn} onChange={(v) => {
                const updates = { ...settings, schedule_enabled: v ? 'true' : 'false' };
                if (v) {
                  if (!settings.schedule_start_hour) updates.schedule_start_hour = '08:00';
                  if (!settings.schedule_end_hour) updates.schedule_end_hour = '20:00';
                  if (!settings.schedule_timezone) updates.schedule_timezone = 'Europe/Paris';
                }
                setSettings(updates);
              }} />}
            />

            {scheduleOn ? (
              <div className="space-y-3 max-w-xl">
                <div>
                  <label className="form-label">Fuseau horaire</label>
                  <select value={settings.schedule_timezone || 'Europe/Paris'}
                    onChange={(e) => setSettings({ ...settings, schedule_timezone: e.target.value })}
                    className="input-sm">
                    <option value="Europe/Paris">Europe/Paris</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Europe/Berlin">Europe/Berlin</option>
                    <option value="Europe/Brussels">Europe/Brussels</option>
                    <option value="Europe/Zurich">Europe/Zurich</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Chicago">America/Chicago</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="America/Toronto">America/Toronto</option>
                    <option value="America/Montreal">America/Montreal</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="Africa/Casablanca">Africa/Casablanca</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                  <div>
                    <label className="form-label">Début</label>
                    <input type="time" value={settings.schedule_start_hour || '08:00'}
                      onChange={(e) => setSettings({ ...settings, schedule_start_hour: e.target.value })}
                      className="input-sm" />
                  </div>
                  <span className="pb-3" style={{ color: 'hsl(var(--muted))' }}>—</span>
                  <div>
                    <label className="form-label">Fin</label>
                    <input type="time" value={settings.schedule_end_hour || '20:00'}
                      onChange={(e) => setSettings({ ...settings, schedule_end_hour: e.target.value })}
                      className="input-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-w-xl">
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                  <div>
                    <label className="form-label">Min (minutes)</label>
                    <input type="number" min="1" value={settings.action_interval_min || ''}
                      onChange={(e) => setSettings({ ...settings, action_interval_min: e.target.value })}
                      placeholder="2" className="input-sm" />
                  </div>
                  <span className="pb-3" style={{ color: 'hsl(var(--muted))' }}>—</span>
                  <div>
                    <label className="form-label">Max (minutes)</label>
                    <input type="number" min="1" value={settings.action_interval_max || ''}
                      onChange={(e) => setSettings({ ...settings, action_interval_max: e.target.value })}
                      placeholder="5" className="input-sm" />
                  </div>
                </div>
                <div className="info-pill inline-flex items-center gap-1.5">
                  <Clock size={11} />
                  Une action toutes les {settings.action_interval_min || 2} à {settings.action_interval_max || 5} minutes
                </div>
              </div>
            )}
          </div>

          {/* Warm-up */}
          <div className="g-card" style={{ padding: 24 }}>
            <SectionHeader
              eyebrow="Sécurité"
              title="Warm-up progressif"
              desc="Augmente progressivement la limite quotidienne pour éviter la détection."
              right={<Toggle on={warmupOn} onChange={(v) => setSettings({ ...settings, warmup_enabled: v ? 'true' : 'false' })} />}
            />
            {warmupOn && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl">
                <div>
                  <label className="form-label">Limite de départ</label>
                  <input type="number" min="1" value={settings.warmup_start_limit || ''}
                    onChange={(e) => setSettings({ ...settings, warmup_start_limit: e.target.value })}
                    placeholder="5" className="input-sm" />
                </div>
                <div>
                  <label className="form-label">Limite cible</label>
                  <input type="number" min="1" value={settings.warmup_target_limit || ''}
                    onChange={(e) => setSettings({ ...settings, warmup_target_limit: e.target.value })}
                    placeholder="25" className="input-sm" />
                </div>
                <div>
                  <label className="form-label">Durée (jours)</label>
                  <input type="number" min="1" value={settings.warmup_days || ''}
                    onChange={(e) => setSettings({ ...settings, warmup_days: e.target.value })}
                    placeholder="7" className="input-sm" />
                </div>
                <div className="md:col-span-3">
                  <div className="info-pill inline-flex items-center gap-1.5">
                    <TrendingUp size={11} />
                    De {settings.warmup_start_limit || 5} à {settings.warmup_target_limit || 25} actions/jour sur {settings.warmup_days || 7} jours
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Save button for settings sections */}
          <div className="flex justify-end">
            <button onClick={handleSaveSettings} disabled={loading} className="cta-btn">
              {loading ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              {loading ? 'Sauvegarde…' : 'Sauvegarder les paramètres'}
            </button>
          </div>

          {/* Gemini key */}
          <div className="g-card" style={{ padding: 24 }}>
            <SectionHeader
              eyebrow="IA"
              title="Clé API Gemini"
              desc={<>Votre clé personnelle pour les messages générés par IA. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'hsl(var(--accent))', textDecoration: 'underline' }}>Obtenir une clé</a></>}
              right={user?.has_gemini_key ? (
                <span className="chip emerald" style={{ fontSize: 11 }}><CheckCircle size={11} /> Configurée</span>
              ) : (
                <span className="chip slate" style={{ fontSize: 11 }}><XCircle size={11} /> Aucune</span>
              )} />

            <div className="max-w-xl space-y-3">
              <div>
                <label className="form-label">Clé API</label>
                <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder={user?.has_gemini_key ? 'Entrez une nouvelle clé pour remplacer…' : 'AIzaSy…'}
                  className="input-sm mono" style={{ fontSize: 12 }} />
              </div>
              {user?.has_gemini_key && (
                <div className="flex items-start gap-2 p-3 rounded-lg"
                  style={{ background: 'hsl(var(--amber) / .1)', border: '1px solid hsl(var(--amber) / .3)' }}>
                  <AlertTriangle size={13} style={{ color: 'hsl(var(--amber))', marginTop: 1, flexShrink: 0 }} />
                  <span className="text-[12px]" style={{ color: 'hsl(28 70% 30%)' }}>
                    Changer la clé mettra en pause toutes vos campagnes IA en cours.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                {user?.has_gemini_key && (
                  <button onClick={async () => {
                    setGeminiSaving(true);
                    try {
                      await updateGeminiKey('');
                      toast.success('Clé API supprimée');
                      refreshUser();
                    } catch { toast.error('Erreur'); }
                    finally { setGeminiSaving(false); }
                  }} disabled={geminiSaving} className="ghost-btn"
                    style={{ color: 'hsl(var(--rose))', borderColor: 'hsl(var(--rose) / .3)' }}>
                    <Trash2 size={13} /> Supprimer
                  </button>
                )}
                <button onClick={async () => {
                  if (!geminiKey.trim()) return;
                  setGeminiSaving(true);
                  try {
                    await updateGeminiKey(geminiKey.trim());
                    toast.success('Clé API Gemini mise à jour');
                    setGeminiKey('');
                    refreshUser();
                  } catch { toast.error('Erreur'); }
                  finally { setGeminiSaving(false); }
                }} disabled={geminiSaving || !geminiKey.trim()} className="cta-btn">
                  {geminiSaving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                  Sauvegarder la clé
                </button>
              </div>
              <p className="text-[11.5px] mt-2" style={{ color: 'hsl(var(--muted))' }}>
                Besoin d'aide ?{' '}
                <a href="https://www.linkedin.com/in/thomas-shamoev/" target="_blank" rel="noopener noreferrer"
                  style={{ color: 'hsl(var(--violet))', textDecoration: 'underline' }}>
                  Contactez Thomas Shamoev sur LinkedIn
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── BLACKLIST ── */}
      {tab === 'blacklist' && (
        <div className="space-y-4">
          <div className="g-card" style={{ padding: 24 }}>
            <SectionHeader
              eyebrow="Blacklist"
              title="Ajouter un contact"
              desc="Ces contacts seront exclus de toutes les campagnes futures." />
            <form onSubmit={handleAddBlacklist} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 max-w-4xl">
              <div>
                <label className="form-label">URN ID</label>
                <input value={newBlacklist.urn_id}
                  onChange={(e) => setNewBlacklist({ ...newBlacklist, urn_id: e.target.value })}
                  placeholder="ACoAAB…" required className="input-sm mono" style={{ fontSize: 12 }} />
              </div>
              <div>
                <label className="form-label">Nom (optionnel)</label>
                <input value={newBlacklist.name}
                  onChange={(e) => setNewBlacklist({ ...newBlacklist, name: e.target.value })}
                  placeholder="Jean Dupont" className="input-sm" />
              </div>
              <div>
                <label className="form-label">Raison (optionnel)</label>
                <input value={newBlacklist.reason}
                  onChange={(e) => setNewBlacklist({ ...newBlacklist, reason: e.target.value })}
                  placeholder="Déjà client…" className="input-sm" />
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={loading} className="cta-btn">
                  <Plus size={13} /> Ajouter
                </button>
              </div>
            </form>
          </div>

          <div className="g-card" style={{ padding: 24 }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <SectionHeader title="Contacts blacklistés" desc={`${blacklistTotal} au total`} />
              <div className="relative max-w-xs">
                <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }} />
                <input value={blacklistSearch}
                  onChange={(e) => { setBlacklistSearch(e.target.value); setBlacklistPage(1); }}
                  placeholder="Rechercher…" className="input-sm" style={{ paddingLeft: 32 }} />
              </div>
            </div>

            {blacklistItems.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'hsl(var(--muted))' }}>
                <ShieldOff size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p className="text-[13px]">Aucun contact dans la blacklist</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl" style={{ border: '1px solid hsl(var(--border))' }}>
                <table className="w-full text-[12.5px]">
                  <thead style={{ background: 'hsl(220 22% 98%)', borderBottom: '1px solid hsl(var(--border))' }}>
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>Nom</th>
                      <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>URN ID</th>
                      <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>Raison</th>
                      <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>Date</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {blacklistItems.map((b, i) => (
                      <tr key={b.id} className="row-hover"
                        style={{ borderTop: i > 0 ? '1px solid hsl(var(--border))' : 'none' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'hsl(var(--text))' }}>{b.name || '—'}</td>
                        <td className="px-4 py-3 mono text-[11px]" style={{ color: 'hsl(var(--muted))' }}>{b.urn_id}</td>
                        <td className="px-4 py-3" style={{ color: 'hsl(var(--muted))' }}>{b.reason || '—'}</td>
                        <td className="px-4 py-3 mono text-[11px]" style={{ color: 'hsl(var(--muted))' }}>{formatServerDate(b.created_at)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleRemoveBlacklist(b.id)}
                            style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--rose))'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--muted))'}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {blacklistTotal > 20 && (
              <div className="flex justify-center gap-1 mt-4">
                {Array.from({ length: Math.min(Math.ceil(blacklistTotal / 20), 10) }, (_, i) => i + 1).map((p) => {
                  const active = p === blacklistPage;
                  return (
                    <button key={p} onClick={() => setBlacklistPage(p)}
                      className="mono text-[11.5px]"
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontWeight: 500,
                        background: active ? 'hsl(var(--accent))' : 'transparent',
                        color: active ? 'white' : 'hsl(var(--muted))',
                        border: '1px solid ' + (active ? 'hsl(var(--accent))' : 'hsl(var(--border))'),
                        cursor: 'pointer',
                      }}>
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LOGS ── */}
      {tab === 'logs' && (
        <div className="g-card" style={{ padding: 24 }}>
          <SectionHeader
            eyebrow="Journal"
            title="Activité récente"
            desc={`${logs.length} dernières actions exécutées`} />

          {logs.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'hsl(var(--muted))' }}>
              <Activity size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <p className="text-[13px]">Aucune activité enregistrée</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid hsl(var(--border))' }}>
              <table className="w-full text-[12.5px]">
                <thead style={{ background: 'hsl(220 22% 98%)', borderBottom: '1px solid hsl(var(--border))' }}>
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>Date</th>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>Action</th>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>Statut</th>
                    <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'hsl(var(--muted))', fontSize: 11.5 }}>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const tone = log.status === 'success' ? 'emerald'
                      : log.status === 'failed' || log.status === 'error' ? 'rose'
                      : log.status === 'skipped' ? 'amber'
                      : 'slate';
                    return (
                      <tr key={i} className="row-hover"
                        style={{ borderTop: i > 0 ? '1px solid hsl(var(--border))' : 'none' }}>
                        <td className="px-4 py-3 mono text-[11px]" style={{ color: 'hsl(var(--muted))' }}>{formatServerDateTime(log.created_at)}</td>
                        <td className="px-4 py-3" style={{ color: 'hsl(var(--text))' }}>{log.action_type}</td>
                        <td className="px-4 py-3">
                          {log.status ? <span className={`chip ${tone}`} style={{ fontSize: 10.5 }}>{log.status}</span> : <span style={{ color: 'hsl(var(--muted))' }}>—</span>}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate" style={{ color: 'hsl(var(--muted))' }}>{log.error_message || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
