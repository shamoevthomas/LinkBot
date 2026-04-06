import { useState, useRef, useEffect } from 'react';
import { LogOut, Camera, Lock, ExternalLink, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { updateProfile } from '../../api/user';
import toast from 'react-hot-toast';

export default function UserPopup() {
  const { user, logout, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Form state
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

  // Sync form with user data when opening
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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Close on Escape
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

  const initials = `${user?.first_name?.[0] || 'U'}${user?.last_name?.[0] || ''}`;
  const displayPic = picturePreview || user?.profile_picture_path;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: 0, border: 'none', background: 'none', cursor: 'pointer',
          borderRadius: 99, outline: 'none',
          boxShadow: open ? '0 0 0 2px var(--blue)' : 'none',
          transition: 'box-shadow 0.2s',
        }}
      >
        {user?.profile_picture_path ? (
          <img src={user.profile_picture_path} alt="" style={{ width: 32, height: 32, borderRadius: 99, objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 99,
            background: 'rgba(0,132,255,0.1)', color: 'var(--blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>
            {initials}
          </div>
        )}
      </button>

      {/* Settings panel */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 360, background: '#fff', borderRadius: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
          zIndex: 100, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Mon profil</h3>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8 }}>
              <X size={18} color="var(--text3)" />
            </button>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            {/* Profile picture */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <label style={{ position: 'relative', cursor: 'pointer' }}>
                {displayPic ? (
                  <img src={displayPic} alt="" style={{ width: 80, height: 80, borderRadius: 99, objectFit: 'cover', border: '3px solid rgba(0,132,255,0.15)' }} />
                ) : (
                  <div style={{
                    width: 80, height: 80, borderRadius: 99,
                    background: 'rgba(0,132,255,0.1)', color: 'var(--blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 700, border: '3px solid rgba(0,132,255,0.15)',
                  }}>
                    {initials}
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 28, height: 28, borderRadius: 99,
                  background: 'var(--blue)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #fff',
                }}>
                  <Camera size={14} />
                </div>
                <input type="file" accept="image/*" onChange={handlePictureChange} style={{ display: 'none' }} />
              </label>
            </div>

            {/* Name fields */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text3)', marginBottom: 4 }}>Prenom</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  className="input-glass" style={{ width: '100%', fontSize: 13 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text3)', marginBottom: 4 }}>Nom</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="input-glass" style={{ width: '100%', fontSize: 13 }} />
              </div>
            </div>

            {/* Job role */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text3)', marginBottom: 4 }}>Poste</label>
              <input value={jobRole} onChange={(e) => setJobRole(e.target.value)}
                placeholder="Ex: Founder / CEO"
                className="input-glass" style={{ width: '100%', fontSize: 13 }} />
            </div>

            {/* LinkedIn URL */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--text3)', marginBottom: 4 }}>
                <ExternalLink size={12} /> LinkedIn
              </label>
              <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="input-glass" style={{ width: '100%', fontSize: 13 }} />
            </div>

            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 0 16px' }} />

            {/* Password section */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
                <Lock size={14} /> Changer le mot de passe
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Mot de passe actuel"
                  className="input-glass" style={{ width: '100%', fontSize: 13 }} />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nouveau mot de passe"
                  className="input-glass" style={{ width: '100%', fontSize: 13 }} />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmer"
                  className="input-glass" style={{ width: '100%', fontSize: 13 }} />
              </div>
            </div>

            {/* Save button */}
            <button onClick={handleSave} disabled={saving}
              className="cta-btn" style={{ width: '100%', padding: '10px 0', fontSize: 13, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>

            <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '16px 0 8px' }} />

            {/* App info + logout */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                LinkBot v1.0 — {user?.cookies_valid ? 'LinkedIn connecte' : 'LinkedIn deconnecte'}
              </span>
              <button onClick={() => { setOpen(false); logout(); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#ef4444', fontSize: 12, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <LogOut size={14} /> Deconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
