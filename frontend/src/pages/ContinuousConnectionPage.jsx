import { useEffect, useState } from 'react';
import { Repeat, UserPlus, AlertTriangle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import PageWrapper from '../components/layout/PageWrapper';
import { getContinuousConnection, updateContinuousConnection } from '../api/continuousConnection';
import { formatServerDate } from '../utils/date';

const LOCATION_SUGGESTIONS = [
  'France', 'Paris', 'Île-de-France', 'Lyon', 'Marseille', 'Bordeaux',
  'Toulouse', 'Nantes', 'Belgique', 'Bruxelles', 'Suisse', 'Genève',
  'Maroc', 'Casablanca', 'Royaume-Uni', 'Londres',
];

export default function ContinuousConnectionPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState(null);

  const [keywords, setKeywords] = useState([]);
  const [regions, setRegions] = useState([]);
  const [kwInput, setKwInput] = useState('');
  const [locInput, setLocInput] = useState('');

  useEffect(() => {
    getContinuousConnection()
      .then((data) => {
        setCfg(data);
        setKeywords(data.keywords || []);
        setRegions(data.search_regions || []);
      })
      .catch(() => toast.error('Erreur au chargement'))
      .finally(() => setLoading(false));
  }, []);

  const flushKeyword = () => {
    const v = kwInput.trim();
    if (!v) return keywords;
    if (keywords.includes(v)) { setKwInput(''); return keywords; }
    const next = [...keywords, v];
    setKeywords(next);
    setKwInput('');
    return next;
  };

  const flushRegion = () => {
    const v = locInput.trim();
    if (!v) return regions;
    if (regions.includes(v)) { setLocInput(''); return regions; }
    const next = [...regions, v];
    setRegions(next);
    setLocInput('');
    return next;
  };

  const persist = async (patch) => {
    // Always flush pending inputs before saving so the user doesn't lose
    // something they typed but didn't press Enter on.
    const kws = flushKeyword();
    const regs = flushRegion();
    setSaving(true);
    try {
      const updated = await updateContinuousConnection({
        keywords: kws,
        search_regions: regs,
        ...patch,
      });
      setCfg(updated);
      setKeywords(updated.keywords || []);
      setRegions(updated.search_regions || []);
      return updated;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
      throw err;
    } finally { setSaving(false); }
  };

  const handleToggle = async () => {
    if (!cfg) return;
    try {
      const next = !cfg.enabled;
      const updated = await persist({ enabled: next });
      toast.success(updated.enabled ? 'Connexion Continue activée' : 'Mise en pause');
    } catch { /* toast already shown */ }
  };

  const handleSave = async () => {
    try {
      await persist({});
      toast.success('Sauvegardé');
    } catch { /* toast already shown */ }
  };

  if (loading) return (
    <PageWrapper>
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 rounded-full animate-spin"
          style={{ borderColor: 'hsl(var(--accent) / .25)', borderTopColor: 'hsl(var(--accent))' }} />
      </div>
    </PageWrapper>
  );

  return (
    <PageWrapper>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            Connexion Continue
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
            Envoie des demandes de connexion en continu quand tes campagnes n'utilisent pas tout ton quota quotidien.
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          className={cfg?.enabled ? 'ghost-btn' : 'cta-btn'}
          style={{ minWidth: 140 }}>
          {cfg?.enabled ? '⏸ Mettre en pause' : '▶ Activer'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted))' }}>Statut</div>
          <div className="flex items-center gap-2 mt-2">
            <span style={{
              width: 8, height: 8, borderRadius: 999,
              background: cfg?.enabled ? 'hsl(var(--emerald))' : 'hsl(var(--muted))',
              boxShadow: cfg?.enabled ? '0 0 0 4px hsl(var(--emerald) / .18)' : 'none',
            }} />
            <span className="text-[15px] font-semibold">
              {cfg?.enabled ? 'Actif' : 'En pause'}
            </span>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted))' }}>Envoyées aujourd'hui</div>
          <div className="mono text-[22px] font-semibold mt-2">{cfg?.sent_today ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted))' }}>Total cumulé</div>
          <div className="mono text-[22px] font-semibold mt-2">{cfg?.total_sent ?? 0}</div>
        </div>
      </div>

      {cfg?.last_error && (
        <div className="mb-4 p-3 rounded-lg flex items-start gap-2"
          style={{ background: 'hsl(var(--amber) / .12)', border: '1px solid hsl(var(--amber) / .3)' }}>
          <AlertTriangle size={15} style={{ color: 'hsl(var(--amber))', marginTop: 1, flexShrink: 0 }} />
          <div>
            <div className="text-[13px] font-medium" style={{ color: 'hsl(var(--amber))' }}>Dernière erreur</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>{cfg.last_error}</div>
          </div>
        </div>
      )}

      {/* Config form */}
      <div className="card p-5">
        <div className="mb-5">
          <label className="form-label">Mots-clés de recherche</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input-sm"
              style={{ flex: 1 }}
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              placeholder="Ex: Directeur Marketing, Fondateur startup, CTO SaaS…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); flushKeyword(); }
              }}
              onBlur={() => flushKeyword()}
            />
            <button type="button" onClick={flushKeyword}
              disabled={!kwInput.trim()}
              className="ghost-btn" style={{ padding: '0 14px', fontSize: 13 }}>
              + Ajouter
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {keywords.map((k) => (
                <span key={k} className="chip blue" style={{ cursor: 'default' }}>
                  {k}
                  <button type="button"
                    onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                    style={{ marginLeft: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] mt-1.5" style={{ color: 'hsl(var(--muted))' }}>
            À chaque envoi, un mot-clé est choisi au hasard parmi cette liste.
          </p>
        </div>

        <div className="mb-5">
          <label className="form-label">Localisation(s) (optionnel)</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input-sm"
              style={{ flex: 1 }}
              value={locInput}
              onChange={(e) => setLocInput(e.target.value)}
              placeholder="Tapez une ville, région ou pays"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); flushRegion(); }
              }}
              onBlur={() => flushRegion()}
            />
            <button type="button" onClick={flushRegion}
              disabled={!locInput.trim()}
              className="ghost-btn" style={{ padding: '0 14px', fontSize: 13 }}>
              + Ajouter
            </button>
          </div>
          {regions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {regions.map((r) => (
                <span key={r} className="chip blue" style={{ cursor: 'default' }}>
                  {r}
                  <button type="button"
                    onClick={() => setRegions(regions.filter((x) => x !== r))}
                    style={{ marginLeft: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[11px] mr-1" style={{ color: 'hsl(var(--muted))' }}>Suggestions :</span>
            {LOCATION_SUGGESTIONS.filter((s) => !regions.includes(s)).map((s) => (
              <button key={s} type="button"
                onClick={() => setRegions([...regions, s])}
                className="chip slate"
                style={{ cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>
                + {s}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-lg flex items-start gap-2 mb-5"
          style={{ background: 'hsl(var(--accent-soft))', border: '1px solid hsl(var(--accent) / .2)' }}>
          <Info size={14} style={{ color: 'hsl(var(--accent))', marginTop: 2, flexShrink: 0 }} />
          <div className="text-[12px]" style={{ color: 'hsl(var(--accent))' }}>
            Les contacts capturés sont ajoutés au CRM <strong>{cfg?.crm_name || '« Connexion Continue »'}</strong> (créé automatiquement à l'activation).
            Le module ne se déclenche que quand tes campagnes de connexion n'ont plus de travail en attente et que ton quota du jour n'est pas atteint.
            Les demandes sont envoyées <strong>sans note</strong>.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={handleSave} disabled={saving} className="cta-btn">
            <UserPlus size={14} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>

        {cfg?.last_run_at && (
          <div className="mt-4 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
            Dernière exécution : {formatServerDate(cfg.last_run_at)}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
