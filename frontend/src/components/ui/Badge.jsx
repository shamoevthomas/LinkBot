const variants = {
  connected: 'bg-emerald-100 text-emerald-700',
  request_sent: 'bg-amber-100 text-amber-700',
  not_connected: 'bg-gray-100 text-gray-600',
  unknown: 'bg-gray-100 text-gray-500',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  pending: 'bg-gray-100 text-gray-500',
  search: 'bg-indigo-100 text-indigo-700',
  dm: 'bg-purple-100 text-purple-700',
  connection: 'bg-sky-100 text-sky-700',
  connection_dm: 'bg-teal-100 text-teal-700',
  search_connection_dm: 'bg-cyan-100 text-cyan-700',
};

const labels = {
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
  search: 'Recherche',
  dm: 'Message',
  connection: 'Connexion',
  connection_dm: 'Connexion + DM',
  search_connection_dm: 'Recherche + Connexion + DM',
};

export default function Badge({ status, label }) {
  const cls = variants[status] || variants.unknown;
  const text = label || labels[status] || status;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {text}
    </span>
  );
}
