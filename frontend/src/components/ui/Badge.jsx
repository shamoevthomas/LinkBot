import { Chip } from './atoms';

const TONES = {
  connected: 'emerald',
  request_sent: 'amber',
  not_connected: 'slate',
  unknown: 'slate',
  running: 'emerald',
  completed: 'blue',
  paused: 'slate',
  failed: 'rose',
  cancelled: 'rose',
  pending: 'amber',
  scheduled: 'amber',
  search: 'blue',
  dm: 'emerald',
  connection: 'blue',
  connection_dm: 'violet',
  search_connection_dm: 'amber',
  export: 'slate',
  success: 'emerald',
  skipped: 'slate',
  en_attente: 'amber',
  envoye: 'blue',
  demande_envoyee: 'blue',
  reussi: 'emerald',
  perdu: 'slate',
};

const LABELS = {
  connected: 'Connecté',
  request_sent: 'Demande envoyée',
  not_connected: 'Non connecté',
  unknown: 'Inconnu',
  running: 'En cours',
  completed: 'Terminée',
  paused: 'En pause',
  failed: 'Échouée',
  cancelled: 'Annulée',
  pending: 'En attente',
  scheduled: 'Planifiée',
  search: 'Recherche',
  dm: 'Message',
  connection: 'Connexion',
  connection_dm: 'Connexion + DM',
  search_connection_dm: 'Recherche + Connexion + DM',
  export: 'Export',
  success: 'Succès',
  skipped: 'Ignoré',
  en_attente: 'En attente',
  envoye: 'Envoyé',
  demande_envoyee: 'Demande envoyée',
  reussi: 'Répondu',
  perdu: 'Perdu',
};

export default function Badge({ status, label }) {
  const key = String(status || 'unknown');
  let tone = TONES[key];
  if (!tone && key.startsWith('relance_')) tone = 'amber';
  if (!tone) tone = 'slate';
  const text = label || LABELS[key] || key;
  const dot = key === 'running' || key === 'reussi';
  return <Chip tone={tone} dot={dot}>{text}</Chip>;
}
