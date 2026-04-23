import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { getImportStatus } from '../api/config';
import { parseServerDate } from '../utils/date';

export default function ImportBanner() {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check once immediately
    getImportStatus().then(setStatus).catch(() => {});
  }, []);

  // Poll while running
  useEffect(() => {
    if (!status || status.status !== 'running') return;
    const interval = setInterval(() => {
      getImportStatus().then(setStatus).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [status?.status]);

  // Auto-dismiss after 10s when completed
  useEffect(() => {
    if (status?.status === 'completed') {
      const t = setTimeout(() => setDismissed(true), 15000);
      return () => clearTimeout(t);
    }
  }, [status?.status]);

  if (dismissed || !status || status.status === 'none') return null;
  // Only show for recent imports (within last 5 minutes)
  if (status.status !== 'running') {
    const created = parseServerDate(status.created_at);
    if (created && Date.now() - created.getTime() > 5 * 60 * 1000) return null;
  }

  const total = status.total_found || 0;
  const created = status.total_created || 0;
  const skipped = status.total_skipped || 0;
  const processed = created + skipped;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isRunning = status.status === 'running';
  const isDone = status.status === 'completed';
  const isFailed = status.status === 'failed';

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{
      background: isRunning ? 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' :
                  isDone ? 'linear-gradient(135deg, #F0FDF4, #DCFCE7)' :
                  'linear-gradient(135deg, #FEF2F2, #FECACA)',
      border: `1px solid ${isRunning ? '#93C5FD' : isDone ? '#86EFAC' : '#FCA5A5'}`,
    }}>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 size={16} className="animate-spin text-blue-600" />}
            {isDone && <CheckCircle size={16} className="text-green-600" />}
            {isFailed && <AlertTriangle size={16} className="text-red-600" />}
            <span className="text-sm font-semibold" style={{
              color: isRunning ? '#1D4ED8' : isDone ? '#15803D' : '#DC2626'
            }}>
              {isRunning ? 'Import de vos connexions en cours...' :
               isDone ? 'Import terminé !' :
               'Erreur lors de l\'import'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {total > 0 && (
              <span className="text-xs font-medium" style={{
                color: isRunning ? '#3B82F6' : isDone ? '#16A34A' : '#EF4444'
              }}>
                {created} importé{created !== 1 ? 's' : ''}
                {skipped > 0 && <span className="text-gray-400 ml-1">({skipped} ignoré{skipped !== 1 ? 's' : ''})</span>}
              </span>
            )}
            {!isRunning && (
              <button onClick={() => setDismissed(true)} className="p-0.5 rounded hover:bg-black/5">
                <X size={14} className="text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full rounded-full h-2" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div className="h-2 rounded-full transition-all duration-500" style={{
            width: isRunning ? (total > 0 ? `${pct}%` : '100%') : '100%',
            background: isRunning ? '#3B82F6' : isDone ? '#16A34A' : '#EF4444',
            animation: isRunning && total === 0 ? 'pulse 2s ease-in-out infinite' : undefined,
          }} />
        </div>

        {isRunning && total > 0 && (
          <p className="text-xs mt-1.5" style={{ color: '#6B7280' }}>
            {pct}% — {processed} / {total} contacts traités
          </p>
        )}

        {status.error_message && (
          <p className="text-xs mt-1.5 text-red-600">{status.error_message}</p>
        )}
      </div>
    </div>
  );
}
