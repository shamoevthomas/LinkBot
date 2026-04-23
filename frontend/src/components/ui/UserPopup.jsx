import { useState, useRef, useEffect } from 'react';
import { LogOut, Camera, Lock, ExternalLink, X, Loader2, Check, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { updateProfile } from '../../api/user';
import toast from 'react-hot-toast';

export default function UserPopup() {
  const { user, logout, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pictureFile, setPictureFile] = useState(null);
  const [picturePreview, setPicturePreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setJobRole(user.job_role || '');
      setLinkedinUrl(user.linkedin_profile_url || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPictureFile(null);
      setPicturePreview(null);
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handlePictureChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPictureFile(file);
    setPicturePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (newPassword && newPassword !== confirmPassword) {
      return toast.error('Les mots de passe ne correspondent pas');
    }
    if (newPassword && !currentPassword) {
      return toast.error('Entrez votre mot de passe actuel');
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('first_name', firstName);
      fd.append('last_name', lastName);
      fd.append('job_role', jobRole);
      fd.append('linkedin_profile_url', linkedinUrl);
      if (pictureFile) fd.append('profile_picture', pictureFile);
      if (newPassword) {
        fd.append('current_password', currentPassword);
        fd.append('new_password', newPassword);
      }

      await updateProfile(fd);
      await refreshUser();
      toast.success('Profil mis à jour');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPictureFile(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const initials = `${user?.first_name?.[0] || 'U'}${user?.last_name?.[0] || ''}`.toUpperCase();
  const displayPic = picturePreview || user?.profile_picture_path;
  const connected = user?.cookies_valid;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: 0, border: 'none', background: 'none', cursor: 'pointer',
          borderRadius: 99, outline: 'none',
          boxShadow: open ? '0 0 0 2px hsl(var(--accent))' : 'none',
          transition: 'box-shadow 0.15s',
        }}
      >
        {user?.profile_picture_path ? (
          <img src={user.profile_picture_path} alt="" style={{ width: 32, height: 32, borderRadius: 99, objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 99,
            background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11.5, fontWeight: 700,
          }}>
            {initials}
          </div>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 380, background: 'hsl(var(--panel))', borderRadius: 18,
          boxShadow: '0 24px 60px -24px hsl(220 40% 20% / .28), 0 6px 18px -8px hsl(220 40% 20% / .08)',
          border: '1px solid hsl(var(--border))',
          zIndex: 100, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px 12px',
            borderBottom: '1px solid hsl(var(--border))',
          }}>
            <div className="flex items-center gap-2">
              <UserIcon size={14} style={{ color: 'hsl(var(--muted))' }} />
              <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'hsl(var(--text))', margin: 0 }}>
                Mon profil
              </h3>
            </div>
            <button onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 6, borderRadius: 8, color: 'hsl(var(--muted))',
                display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(220 22% 96%)'; e.currentTarget.style.color = 'hsl(var(--text))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'hsl(var(--muted))'; }}>
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: '18px 20px 16px' }}>
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <label style={{ position: 'relative', cursor: 'pointer', display: 'block' }}>
                {displayPic ? (
                  <img src={displayPic} alt=""
                    style={{
                      width: 84, height: 84, borderRadius: '50%', objectFit: 'cover',
                      border: '3px solid hsl(var(--panel))',
                      boxShadow: '0 0 0 3px hsl(var(--accent) / .18), 0 6px 18px -6px hsl(var(--accent) / .3)',
                    }} />
                ) : (
                  <div style={{
                    width: 84, height: 84, borderRadius: '50%',
                    background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 26, fontWeight: 700,
                    border: '3px solid hsl(var(--panel))',
                    boxShadow: '0 0 0 3px hsl(var(--accent) / .18), 0 6px 18px -6px hsl(var(--accent) / .3)',
                  }}>
                    {initials}
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'hsl(var(--accent))', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid hsl(var(--panel))',
                  boxShadow: '0 4px 12px -2px hsl(var(--accent) / .5)',
                }}>
                  <Camera size={13} />
                </div>
                <input type="file" accept="image/*" onChange={handlePictureChange} style={{ display: 'none' }} />
              </label>
            </div>

            {/* Names */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="form-label">Prénom</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input-sm" />
              </div>
              <div>
                <label className="form-label">Nom</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-sm" />
              </div>
            </div>

            {/* Job */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Poste</label>
              <input value={jobRole} onChange={(e) => setJobRole(e.target.value)}
                placeholder="Ex: Founder / CEO" className="input-sm" />
            </div>

            {/* LinkedIn */}
            <div style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={11} /> LinkedIn
              </label>
              <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/…" className="input-sm" />
            </div>

            {/* Password section */}
            <div style={{
              padding: 14,
              background: 'hsl(220 22% 98%)',
              border: '1px solid hsl(var(--border))',
              borderRadius: 12,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Lock size={12} style={{ color: 'hsl(var(--muted))' }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--text))', letterSpacing: '-0.005em' }}>
                  Changer le mot de passe
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Mot de passe actuel" className="input-sm" />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nouveau mot de passe" className="input-sm" />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmer" className="input-sm" />
              </div>
            </div>

            {/* Save */}
            <button onClick={handleSave} disabled={saving}
              className="cta-btn" style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px 14px',
            borderTop: '1px solid hsl(var(--border))',
            background: 'hsl(220 22% 98%)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: connected ? 'hsl(var(--emerald))' : 'hsl(var(--rose))',
                boxShadow: connected ? '0 0 0 2px hsl(var(--emerald) / .2)' : '0 0 0 2px hsl(var(--rose) / .2)',
              }} />
              <span className="mono" style={{ fontSize: 10, color: 'hsl(var(--muted))' }}>
                v1.0 · {connected ? 'LinkedIn connecté' : 'LinkedIn déconnecté'}
              </span>
            </div>
            <button onClick={() => { setOpen(false); logout(); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'hsl(var(--rose))', fontSize: 12, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 8,
                transition: 'background .15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'hsl(var(--rose) / .08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
              <LogOut size={12} /> Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
