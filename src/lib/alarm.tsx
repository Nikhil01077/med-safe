import { useState, useEffect, useCallback, useRef } from 'react';
import { initAudioContext, startAlarm, stopAlarm } from '@/lib/audio';
import { Volume2, VolumeX } from 'lucide-react';

const STORAGE_KEY = 'medsafe-audio-enabled';

export function useAudioEnabled() {
  const [audioEnabled, setAudioEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const enableAudio = useCallback(() => {
    initAudioContext();
    localStorage.setItem(STORAGE_KEY, 'true');
    setAudioEnabled(true);
  }, []);

  return { audioEnabled, enableAudio };
}

export function AudioBanner({ audioEnabled, onEnable }: { audioEnabled: boolean; onEnable: () => void }) {
  if (audioEnabled) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-white px-4 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <VolumeX className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium">
          Audio alarms are muted. Click "Enable Audio Alarms" to hear medication reminders.
        </p>
      </div>
      <button
        onClick={onEnable}
        className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white text-amber-700 font-semibold text-sm hover:bg-amber-50 transition-colors shrink-0"
      >
        <Volume2 className="w-4 h-4" />
        Enable Audio Alarms
      </button>
    </div>
  );
}

export function useAlarmMonitor(
  prescriptions: { id: string; scheduled_time: string; active: boolean }[],
  logs: { prescription_id: string; status: string; log_date: string }[],
  audioEnabled: boolean,
) {
  const [alarmedPrescriptions, setAlarmedPrescriptions] = useState<Set<string>>(new Set());
  // Tracks prescriptions the user has dismissed via Take/Skip so the
  // polling loop doesn't re-trigger them before the DB log catches up.
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!audioEnabled) {
      stopAlarm();
      setAlarmedPrescriptions(new Set());
      return;
    }

    initAudioContext();

    const check = () => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = now.toISOString().split('T')[0];

      // Clean up dismissed entries whose logs have updated to a final state
      for (const id of dismissedRef.current) {
        const log = logs.find(l => l.prescription_id === id && l.log_date === today);
        if (log && (log.status === 'taken' || log.status === 'skipped')) {
          dismissedRef.current.delete(id);
        }
      }

      const due = new Set<string>();
      for (const p of prescriptions) {
        if (!p.active) continue;
        if (p.scheduled_time !== currentHHMM) continue;
        if (dismissedRef.current.has(p.id)) continue;
        const log = logs.find(l => l.prescription_id === p.id && l.log_date === today);
        if (!log || log.status === 'pending') {
          due.add(p.id);
        }
      }

      setAlarmedPrescriptions(prev => {
        const sameSize = due.size === prev.size;
        const sameContent = sameSize && Array.from(due).every(id => prev.has(id));
        if (sameContent) return prev;
        return due;
      });

      if (due.size > 0) {
        startAlarm();
      } else {
        stopAlarm();
      }
    };

    check();
    const interval = setInterval(check, 1000);
    return () => {
      clearInterval(interval);
      stopAlarm();
    };
  }, [prescriptions, logs, audioEnabled]);

  const dismissAlarm = useCallback((prescriptionId: string) => {
    dismissedRef.current.add(prescriptionId);
    setAlarmedPrescriptions(prev => {
      const next = new Set(prev);
      next.delete(prescriptionId);
      if (next.size === 0) stopAlarm();
      return next;
    });
  }, []);

  return { alarmedPrescriptions, dismissAlarm };
}
