import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { usePrescriptions, useMedLogs, useCaretakerLinks, useRefillAlerts } from '@/lib/hooks';
import { useAudioEnabled, useAlarmMonitor } from '@/lib/alarm';
import { AudioBanner } from '@/lib/alarm';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import type { Prescription, MedLog } from '@/types';
import {
  Copy, Check, Clock, Pill, CheckCircle2, XCircle, Bell, Calendar,
  ChevronDown, ChevronRight, UserCog, Activity, HeartPulse, BellRing,
  AlertTriangle, RefreshCw, X,
} from 'lucide-react';

export default function PatientPortal() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { audioEnabled, enableAudio } = useAudioEnabled();
  const { prescriptions, loading: rxLoading } = usePrescriptions(profile?.id);
  const { logs, loading: logsLoading } = useMedLogs(profile?.id);
  const { links, loading: linksLoading, refetch: refetchLinks } = useCaretakerLinks(profile?.id, 'patient');
  const { alerts: refillAlerts, refetch: refetchRefillAlerts } = useRefillAlerts(profile?.id);
  const { alarmedPrescriptions, dismissAlarm } = useAlarmMonitor(prescriptions, logs, audioEnabled);

  const [copied, setCopied] = useState(false);
  const [vaultTab, setVaultTab] = useState<'active' | 'past'>('active');
  const [expandedDiseases, setExpandedDiseases] = useState<Set<string>>(new Set());
  const [expandedDoctors, setExpandedDoctors] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter(l => l.log_date === today);

  // Timeline: combine prescriptions with their logs for today
  const timelineItems = useMemo(() => {
    return prescriptions
      .filter(p => p.active)
      .map(p => {
        const log = todayLogs.find(l => l.prescription_id === p.id);
        return { prescription: p, log };
      })
      .sort((a, b) => a.prescription.scheduled_time.localeCompare(b.prescription.scheduled_time));
  }, [prescriptions, todayLogs]);

  // Medication Vault grouping
  const vaultItems = useMemo(() => {
    const filtered = prescriptions.filter(p => vaultTab === 'active' ? p.active : !p.active);
    const grouped: Record<string, Record<string, Prescription[]>> = {};
    for (const p of filtered) {
      if (!grouped[p.disease]) grouped[p.disease] = {};
      if (!grouped[p.disease][p.doctor_name]) grouped[p.disease][p.doctor_name] = [];
      grouped[p.disease][p.doctor_name].push(p);
    }
    return grouped;
  }, [prescriptions, vaultTab]);

  const pendingLinks = links.filter(l => l.status === 'pending');
  const acceptedLinks = links.filter(l => l.status === 'accepted');

  const copyId = () => {
    if (!profile?.patient_id_code) return;
    navigator.clipboard.writeText(profile.patient_id_code);
    setCopied(true);
    showToast('Patient ID copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLinkAction = async (linkId: string, status: 'accepted' | 'rejected') => {
    const { error } = await supabase
      .from('caretaker_links')
      .update({ status })
      .eq('id', linkId);
    if (error) {
      showToast('Failed to update link', 'error');
    } else {
      showToast(status === 'accepted' ? 'Caretaker connected!' : 'Request rejected', 'success');
      refetchLinks();
    }
  };

  const handleMedAction = async (prescriptionId: string, action: 'taken' | 'skipped') => {
    if (!profile) return;
    const existingLog = todayLogs.find(l => l.prescription_id === prescriptionId);
    if (existingLog) {
      const { error } = await supabase
        .from('med_logs')
        .update({ status: action, logged_at: new Date().toISOString() })
        .eq('id', existingLog.id);
      if (error) { showToast('Failed to update', 'error'); return; }
    } else {
      const rx = prescriptions.find(p => p.id === prescriptionId);
      if (!rx) return;
      const { error } = await supabase
        .from('med_logs')
        .insert({
          prescription_id: prescriptionId,
          patient_id: profile.id,
          scheduled_time: rx.scheduled_time,
          status: action,
          logged_at: new Date().toISOString(),
          log_date: today,
        });
      if (error) { showToast('Failed to log', 'error'); return; }
    }
    dismissAlarm(prescriptionId);
    showToast(action === 'taken' ? 'Medication marked as taken' : 'Dose skipped', action === 'taken' ? 'success' : 'error');
  };

  const toggleDisease = (disease: string) => {
    setExpandedDiseases(prev => {
      const next = new Set(prev);
      next.has(disease) ? next.delete(disease) : next.add(disease);
      return next;
    });
  };

  const toggleDoctor = (key: string) => {
    setExpandedDoctors(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (rxLoading || logsLoading || linksLoading) {
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
          {/* Profile Header */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-900 flex items-center justify-center">
                  <HeartPulse className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{profile?.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {profile?.age && <span className="text-sm text-slate-500">{profile.age} years old</span>}
                    {profile?.primary_condition && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-sm text-slate-500">{profile.primary_condition}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {profile?.patient_id_code && (
                <div className="flex flex-col items-start sm:items-end gap-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Patient ID</span>
                  <button
                    onClick={copyId}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors group"
                  >
                    <span className="text-sm font-mono font-bold text-slate-800 tracking-wider">{profile.patient_id_code}</span>
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />}
                  </button>
                  {copied && <span className="text-xs text-emerald-600 font-medium">Copied!</span>}
                </div>
              )}
            </div>
          </div>

          {/* Caretaker Connection Inbox */}
          {pendingLinks.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-900">Caretaker Requests</h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                  {pendingLinks.length}
                </span>
              </div>
              <div className="space-y-3">
                {pendingLinks.map(link => (
                  <div key={link.id} className="flex items-center justify-between p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                        <UserCog className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{link.caretaker?.name}</p>
                        <p className="text-sm text-slate-500">{link.caretaker?.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLinkAction(link.id, 'accepted')}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleLinkAction(link.id, 'rejected')}
                        className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Caretakers */}
          {acceptedLinks.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Connected Caretakers</h2>
              <div className="flex flex-wrap gap-3">
                {acceptedLinks.map(link => (
                  <div key={link.id} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <UserCog className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="font-medium text-slate-800">{link.caretaker?.name}</span>
                    <span className="text-xs text-emerald-600 font-semibold">Active</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pharmacy Refill / Renewal Alerts */}
          {refillAlerts.filter(a => !a.read_by_patient).length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-6 h-6 text-amber-600" />
                <h3 className="text-lg font-bold text-amber-900">Pharmacy Alerts</h3>
              </div>
              <div className="space-y-2">
                {refillAlerts.filter(a => !a.read_by_patient).map(alert => {
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
                          await supabase.from('refill_alerts').update({ read_by_patient: true }).eq('id', alert.id);
                          refetchRefillAlerts();
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
            <div className="bg-rose-500 text-white rounded-2xl p-6 shadow-lg animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <BellRing className="w-7 h-7 animate-bounce" />
                <h2 className="text-xl font-bold">Medication Due Now!</h2>
              </div>
              <div className="space-y-3">
                {Array.from(alarmedPrescriptions).map(id => {
                  const rx = prescriptions.find(p => p.id === id);
                  if (!rx) return null;
                  return (
                    <div key={id} className="flex items-center justify-between bg-white/15 rounded-xl p-4 backdrop-blur-sm">
                      <div>
                        <p className="font-bold text-lg">{rx.med_name} {rx.dosage}</p>
                        <p className="text-sm text-white/80">{rx.disease} — Scheduled at {rx.scheduled_time}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleMedAction(id, 'taken')}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors shadow-md"
                        >
                          Take Pill
                        </button>
                        <button
                          onClick={() => handleMedAction(id, 'skipped')}
                          className="px-5 py-2.5 rounded-xl bg-rose-700 text-white font-bold hover:bg-rose-800 transition-colors shadow-md"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 24-Hour Timeline */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Today's Schedule</h2>
            </div>
            <div className="space-y-3">
              {timelineItems.length === 0 && (
                <p className="text-slate-400 text-center py-8">No active medications scheduled for today.</p>
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
                        ? 'border-rose-400 bg-rose-50 animate-pulse shadow-md'
                        : isTaken
                        ? 'border-emerald-200 bg-emerald-50'
                        : isSkipped
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Time */}
                    <div className="flex flex-col items-center justify-center w-16 shrink-0">
                      <span className="text-lg font-bold text-slate-700">{rx.scheduled_time}</span>
                      <span className="text-xs text-slate-400">
                        {parseInt(rx.scheduled_time) < 12 ? 'AM' : 'PM'}
                      </span>
                    </div>
                    {/* Vertical line */}
                    <div className={`w-1 h-12 rounded-full ${isTaken ? 'bg-emerald-400' : isSkipped ? 'bg-rose-400' : 'bg-slate-200'}`} />
                    {/* Med info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Pill className={`w-4 h-4 ${isTaken ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <p className="font-semibold text-slate-900 truncate">{rx.med_name} {rx.dosage}</p>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{rx.disease} • {rx.doctor_name}</p>
                      {log?.status === 'taken' && log.logged_at && (
                        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Taken at {new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {log?.status === 'skipped' && (
                        <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Skipped
                        </p>
                      )}
                    </div>
                    {/* Action buttons */}
                    {log?.status === 'pending' || !log ? (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleMedAction(rx.id, 'taken')}
                          className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"
                        >
                          Taken
                        </button>
                        <button
                          onClick={() => handleMedAction(rx.id, 'skipped')}
                          className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 active:scale-95 transition-all shadow-sm"
                        >
                          Skip
                        </button>
                      </div>
                    ) : (
                      <div className="shrink-0">
                        {isTaken && <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-semibold">Completed</span>}
                        {isSkipped && <span className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-sm font-semibold">Skipped</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Medication Vault */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Activity className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Medication Vault</h2>
            </div>
            {/* Tabs */}
            <div className="flex gap-2 mb-5 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                onClick={() => setVaultTab('active')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  vaultTab === 'active' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                Active Medications
              </button>
              <button
                onClick={() => setVaultTab('past')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  vaultTab === 'past' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                Past History
              </button>
            </div>

            {/* Hierarchical accordion */}
            <div className="space-y-2">
              {Object.entries(vaultItems).length === 0 && (
                <p className="text-slate-400 text-center py-8">
                  {vaultTab === 'active' ? 'No active medications.' : 'No past medications.'}
                </p>
              )}
              {Object.entries(vaultItems).map(([disease, doctors]) => (
                <div key={disease} className="rounded-xl border border-slate-200 overflow-hidden">
                  {/* Disease header */}
                  <button
                    onClick={() => toggleDisease(disease)}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedDiseases.has(disease) ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <span className="font-semibold text-slate-800">{disease}</span>
                      <span className="text-xs text-slate-400">
                        ({Object.values(doctors).reduce((acc, meds) => acc + meds.length, 0)} meds)
                      </span>
                    </div>
                  </button>
                  {/* Doctors under disease */}
                  {expandedDiseases.has(disease) && (
                    <div className="border-t border-slate-100">
                      {Object.entries(doctors).map(([doctor, meds]) => {
                        const docKey = `${disease}:${doctor}`;
                        return (
                          <div key={docKey}>
                            <button
                              onClick={() => toggleDoctor(docKey)}
                              className="w-full flex items-center justify-between px-4 py-3 pl-8 hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {expandedDoctors.has(docKey) ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                <span className="text-sm font-medium text-slate-700">{doctor}</span>
                                <span className="text-xs text-slate-400">({meds.length})</span>
                              </div>
                            </button>
                            {expandedDoctors.has(docKey) && (
                              <div className="pl-12 pr-4 pb-3 space-y-2">
                                {meds.map(med => (
                                  <div key={med.id} className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <Pill className="w-4 h-4 text-blue-500" />
                                      <span className="text-sm font-medium text-slate-800">{med.med_name} {med.dosage}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                      <span>{med.scheduled_time}</span>
                                      <Calendar className="w-3 h-3" />
                                      <span>{med.start_date} → {med.end_date}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
