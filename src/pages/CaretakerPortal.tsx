import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { usePrescriptions, useMedLogs, useCaretakerLinks, useAllProfiles, useRefillAlertsForCaretaker } from '@/lib/hooks';
import { useAudioEnabled, useAlarmMonitor } from '@/lib/alarm';
import { AudioBanner } from '@/lib/alarm';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import type { Profile, MedLog, Prescription } from '@/types';
import {
  Link2, Search, Clock, Pill, CheckCircle2, XCircle, BellRing,
  ShieldAlert, Activity, UserCheck, Send, Loader2, AlertTriangle,
  Stethoscope, Bell, RefreshCw, X,
} from 'lucide-react';

export default function CaretakerPortal() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { audioEnabled, enableAudio } = useAudioEnabled();
  const { links, loading: linksLoading, refetch: refetchLinks } = useCaretakerLinks(profile?.id, 'caretaker');
  const { profiles } = useAllProfiles();

  const acceptedLinks = links.filter(l => l.status === 'accepted');
  const acceptedPatientIds = acceptedLinks.map(l => l.patient_id);
  const { alerts: refillAlerts } = useRefillAlertsForCaretaker(profile?.id, acceptedPatientIds);

  const [linkInput, setLinkInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // Auto-select first accepted patient
  useEffect(() => {
    if (acceptedLinks.length > 0 && !selectedPatientId) {
      setSelectedPatientId(acceptedLinks[0].patient_id);
    }
  }, [acceptedLinks, selectedPatientId]);

  const { prescriptions, loading: rxLoading } = usePrescriptions(selectedPatientId || undefined);
  const { logs, loading: logsLoading } = useMedLogs(selectedPatientId || undefined);
  const { alarmedPrescriptions } = useAlarmMonitor(prescriptions, logs, audioEnabled);

  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter(l => l.log_date === today);

  // Timeline for selected patient
  const timelineItems = useMemo(() => {
    return prescriptions
      .filter(p => p.active)
      .map(p => {
        const log = todayLogs.find(l => l.prescription_id === p.id);
        return { prescription: p, log };
      })
      .sort((a, b) => a.prescription.scheduled_time.localeCompare(b.prescription.scheduled_time));
  }, [prescriptions, todayLogs]);

  // Activity feed: all logs sorted by most recent
  const activityFeed = useMemo(() => {
    return [...logs]
      .filter(l => l.status !== 'pending' && l.logged_at)
      .sort((a, b) => new Date(b.logged_at!).getTime() - new Date(a.logged_at!).getTime())
      .slice(0, 20);
  }, [logs]);

  // Safety alerts: skipped doses + prescription changes
  const skippedDoses = useMemo(() => {
    return todayLogs.filter(l => l.status === 'skipped');
  }, [todayLogs]);

  const handleLinkRequest = async () => {
    if (!linkInput.trim() || !profile) return;
    setLinking(true);
    const patient = profiles.find(p => p.patient_id_code?.toLowerCase() === linkInput.trim().toLowerCase());
    if (!patient) {
      showToast('No patient found with that ID', 'error');
      setLinking(false);
      return;
    }
    // Check if already linked
    const existing = links.find(l => l.patient_id === patient.id);
    if (existing) {
      showToast(existing.status === 'accepted' ? 'Already connected to this patient' : 'Request already sent', 'info');
      setLinking(false);
      return;
    }
    const { error } = await supabase
      .from('caretaker_links')
      .insert({ patient_id: patient.id, caretaker_id: profile.id, status: 'pending' });
    if (error) {
      showToast('Failed to send request', 'error');
    } else {
      showToast('Connection request sent!', 'success');
      setLinkInput('');
      refetchLinks();
    }
    setLinking(false);
  };

  const handleVerify = async (logId: string) => {
    const { error } = await supabase
      .from('med_logs')
      .update({ caretaker_verified: true })
      .eq('id', logId);
    if (error) {
      showToast('Failed to verify', 'error');
    } else {
      showToast('Dose verified!', 'success');
    }
  };

  const selectedPatient = profiles.find(p => p.id === selectedPatientId);
  const pendingLinks = links.filter(l => l.status === 'pending');

  if (linksLoading) {
    return (
      <>
        <Navbar />
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-100">
          <div className="animate-spin w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <AudioBanner audioEnabled={audioEnabled} onEnable={enableAudio} />
      <div className={audioEnabled ? 'pt-12' : ''}>
        <Navbar />
      </div>
      <div className="min-h-[calc(100vh-4rem)] bg-slate-100 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Patient Linking Center */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Patient Linking Center</h2>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={linkInput}
                  onChange={e => setLinkInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLinkRequest()}
                  placeholder="Enter Patient ID (e.g., MED-9082)"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-900"
                />
              </div>
              <button
                onClick={handleLinkRequest}
                disabled={linking || !linkInput.trim()}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800 disabled:opacity-50 transition-all"
              >
                {linking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Request
              </button>
            </div>

            {/* Linked patients */}
            <div className="mt-5 space-y-3">
              {links.length === 0 && (
                <p className="text-slate-400 text-center py-6 text-sm">No patient connections yet. Enter a Patient ID above to get started.</p>
              )}
              {links.map(link => {
                const patient = profiles.find(p => p.id === link.patient_id);
                return (
                  <div
                    key={link.id}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      selectedPatientId === link.patient_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                    onClick={() => link.status === 'accepted' && setSelectedPatientId(link.patient_id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        link.status === 'accepted' ? 'bg-emerald-100' : 'bg-amber-100'
                      }`}>
                        <UserCheck className={`w-5 h-5 ${link.status === 'accepted' ? 'text-emerald-600' : 'text-amber-600'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{patient?.name || 'Unknown Patient'}</p>
                        {patient?.patient_id_code && <p className="text-xs text-slate-400 font-mono">{patient.patient_id_code}</p>}
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                      link.status === 'accepted'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {link.status === 'accepted' ? 'Active' : 'Pending Acceptance'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedPatient ? (
            <>
              {/* Pharmacy Refill / Renewal Alerts */}
              {refillAlerts.filter(a => a.patient_id === selectedPatientId && !a.read_by_caretaker).length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell className="w-6 h-6 text-amber-600" />
                    <h3 className="text-lg font-bold text-amber-900">Pharmacy Alerts for {selectedPatient.name}</h3>
                  </div>
                  <div className="space-y-2">
                    {refillAlerts.filter(a => a.patient_id === selectedPatientId && !a.read_by_caretaker).map(alert => {
                      const rx = prescriptions.find(p => p.id === alert.prescription_id);
                      return (
                        <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg bg-white border ${
                          alert.alert_type === 'renewal_needed' ? 'border-rose-200' : 'border-amber-200'
                        }`}>
                          {alert.alert_type === 'renewal_needed'
                            ? <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                            : <RefreshCw className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800">
                              {alert.alert_type === 'refill_due' ? 'Refill Due' : 'Renewal Needed'}
                              {rx && ` — ${rx.med_name} ${rx.dosage}`}
                            </p>
                            {alert.message && <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>}
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(alert.created_at).toLocaleString()}</p>
                          </div>
                          <button
                            onClick={async () => {
                              await supabase.from('refill_alerts').update({ read_by_caretaker: true }).eq('id', alert.id);
                            }}
                            className="text-slate-400 hover:text-slate-600 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Alarm Banner */}
              {alarmedPrescriptions.size > 0 && (
                <div className="bg-rose-500 text-white rounded-2xl p-5 shadow-lg flex items-center gap-4">
                  <BellRing className="w-8 h-8 animate-bounce shrink-0" />
                  <div>
                    <p className="font-bold text-lg">Patient Medication Due!</p>
                    <p className="text-sm text-white/90">{selectedPatient.name} has a medication scheduled right now.</p>
                  </div>
                </div>
              )}

              {/* Safety Alert Panel */}
              {skippedDoses.length > 0 && (
                <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert className="w-6 h-6 text-rose-600" />
                    <h3 className="text-lg font-bold text-rose-900">Safety Alerts</h3>
                  </div>
                  <div className="space-y-2">
                    {skippedDoses.map(skip => {
                      const rx = prescriptions.find(p => p.id === skip.prescription_id);
                      return (
                        <div key={skip.id} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-rose-200">
                          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                          <p className="text-sm text-rose-800">
                            <span className="font-semibold">{selectedPatient.name}</span> skipped <span className="font-semibold">{rx?.med_name} {rx?.dosage}</span> at {skip.scheduled_time}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live Patient Schedule Monitor */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-900">{selectedPatient.name}'s Live Schedule</h2>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>
                <div className="space-y-3">
                  {timelineItems.length === 0 && (
                    <p className="text-slate-400 text-center py-8">No active medications for this patient.</p>
                  )}
                  {timelineItems.map(({ prescription: rx, log }) => {
                    const isAlarmed = alarmedPrescriptions.has(rx.id);
                    const isTaken = log?.status === 'taken';
                    const isSkipped = log?.status === 'skipped';
                    return (
                      <div
                        key={rx.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                          isAlarmed
                            ? 'border-rose-400 bg-rose-50 animate-pulse'
                            : isTaken
                            ? 'border-emerald-200 bg-emerald-50'
                            : isSkipped
                            ? 'border-rose-200 bg-rose-50/50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-col items-center w-16 shrink-0">
                          <span className="text-lg font-bold text-slate-700">{rx.scheduled_time}</span>
                        </div>
                        <div className={`w-1 h-12 rounded-full ${isTaken ? 'bg-emerald-400' : isSkipped ? 'bg-rose-400' : 'bg-slate-200'}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Pill className={`w-4 h-4 ${isTaken ? 'text-emerald-600' : 'text-slate-400'}`} />
                            <p className="font-semibold text-slate-900">{rx.med_name} {rx.dosage}</p>
                          </div>
                          <p className="text-sm text-slate-500">{rx.disease} • {rx.doctor_name}</p>
                        </div>
                        <div className="shrink-0">
                          {isTaken && (
                            <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Taken
                            </span>
                          )}
                          {isSkipped && (
                            <span className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-sm font-semibold flex items-center gap-1">
                              <XCircle className="w-4 h-4" /> Skipped
                            </span>
                          )}
                          {!isTaken && !isSkipped && (
                            <span className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-semibold">Pending</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Verification Activity Feed */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-900">Verification Activity Feed</h2>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {activityFeed.length === 0 && (
                    <p className="text-slate-400 text-center py-8">No activity yet. Actions by the patient will appear here in real time.</p>
                  )}
                  {activityFeed.map(log => {
                    const rx = prescriptions.find(p => p.id === log.prescription_id);
                    return (
                      <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                            log.status === 'taken' ? 'bg-emerald-100' : 'bg-rose-100'
                          }`}>
                            {log.status === 'taken' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-rose-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {selectedPatient.name} marked <span className="font-semibold">{rx?.med_name} {rx?.dosage}</span> as{' '}
                              <span className={log.status === 'taken' ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                                {log.status.toUpperCase()}
                              </span>
                            </p>
                            <p className="text-xs text-slate-400">
                              {log.logged_at ? new Date(log.logged_at).toLocaleString() : ''}
                            </p>
                          </div>
                        </div>
                        {log.status === 'taken' && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={log.caretaker_verified}
                              onChange={() => !log.caretaker_verified && handleVerify(log.id)}
                              disabled={log.caretaker_verified}
                              className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className={`text-sm font-medium ${log.caretaker_verified ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {log.caretaker_verified ? '✓ Verified' : 'Verify Dose'}
                            </span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
              <Stethoscope className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg font-medium">Select a patient to view their live schedule</p>
              <p className="text-slate-400 text-sm mt-1">Click on any active patient card above to start monitoring</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
