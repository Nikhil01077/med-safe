import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  usePrescriptions, useAllProfiles, useDispensations, useMedLogs,
  usePharmacyLinks, usePharmacistNotifications, useInventory,
} from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import type { Prescription, Dispensation, PharmacyLink, PharmacistNotification, Inventory } from '@/types';
import {
  Search, Pill, Loader2, FlaskConical, Clock, Calendar,
  CheckCircle2, Activity, FileText, Bell, BellRing, Link2,
  Stethoscope, User, RefreshCw, ClipboardCheck, Package,
  Trash2, X, AlertTriangle, TrendingUp, Boxes, Edit2, Save, Send,
} from 'lucide-react';

type ActionType = 'dispense' | 'refill' | 'check' | 'supply' | 'dispatch';
type Tab = 'patients' | 'inventory';

const ACTION_META: Record<ActionType, { label: string; icon: typeof Package; color: string }> = {
  dispense: { label: 'Dispense', icon: CheckCircle2, color: 'bg-teal-600 hover:bg-teal-700' },
  refill: { label: 'Refill', icon: RefreshCw, color: 'bg-blue-600 hover:bg-blue-700' },
  check: { label: 'Check', icon: ClipboardCheck, color: 'bg-amber-500 hover:bg-amber-600' },
  supply: { label: 'Supply', icon: Package, color: 'bg-indigo-600 hover:bg-indigo-700' },
  dispatch: { label: 'Dispatch', icon: Send, color: 'bg-purple-600 hover:bg-purple-700' },
};

export default function PharmacistPortal() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { profiles } = useAllProfiles();
  const { links, loading: linksLoading, refetch: refetchLinks } = usePharmacyLinks(profile?.id);
  const { notifications, refetch: refetchNotifs } = usePharmacistNotifications(profile?.id);
  const { inventory, refetch: refetchInventory } = useInventory();

  const [tab, setTab] = useState<Tab>('patients');
  const [linkInput, setLinkInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [actionRxId, setActionRxId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const [invSearch, setInvSearch] = useState('');
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  const [savingInv, setSavingInv] = useState(false);

  const { prescriptions, loading: rxLoading } = usePrescriptions(selectedPatientId || undefined);
  const { dispensations, loading: dispLoading, refetch: refetchDisp } = useDispensations(selectedPatientId || undefined);
  const { logs } = useMedLogs(selectedPatientId || undefined);

  const selectedPatient = profiles.find(p => p.id === selectedPatientId);
  const activeRx = prescriptions.filter(p => p.active);
  const unreadCount = notifications.filter(n => !n.read).length;

  // Notification lookup: which prescriptions have recent changes
  const changedRxIds = useMemo(() => {
    const ids = new Set<string>();
    const now = Date.now();
    for (const n of notifications) {
      if (!n.read && n.prescription_id && (now - new Date(n.created_at).getTime()) < 24 * 3600 * 1000) {
        ids.add(n.prescription_id);
      }
    }
    return ids;
  }, [notifications]);

  const linkedPatients = useMemo(() => {
    return links.map((link: PharmacyLink) => ({
      link,
      patient: link.patient || profiles.find(p => p.id === link.patient_id),
      doctor: link.doctor || profiles.find(p => p.id === link.doctor_id),
    }));
  }, [links, profiles]);

  // Adherence metrics per prescription
  const rxMetrics = useMemo(() => {
    return activeRx.map(rx => {
      const rxLogs = logs.filter(l => l.prescription_id === rx.id);
      const taken = rxLogs.filter(l => l.status === 'taken').length;
      const total = rxLogs.length;
      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;
      const dispCount = dispensations.filter(d => d.prescription_id === rx.id && (d.action_type === 'dispense' || d.action_type === 'refill')).length;
      const refillsRemaining = Math.max(0, 11 - dispCount); // assume ~11 refills per Rx period
      const renewalNeeded = new Date(rx.end_date) < new Date(Date.now() + 7 * 86400000);
      return { rx, taken, total, adherenceRate, dispCount, refillsRemaining, renewalNeeded };
    });
  }, [activeRx, logs, dispensations]);

  // Inventory
  const filteredInventory = useMemo(() => {
    if (!invSearch.trim()) return inventory;
    const q = invSearch.toLowerCase();
    return inventory.filter(i =>
      i.med_name.toLowerCase().includes(q) ||
      i.dosage.toLowerCase().includes(q)
    );
  }, [inventory, invSearch]);

  const lowStockCount = inventory.filter(i => i.stock_quantity <= i.threshold).length;

  const handleLink = async () => {
    if (!profile || !linkInput.trim()) return;
    setLinking(true);
    try {
      const { data: patient, error: patientError } = await supabase
        .from('profiles')
        .select('*')
        .eq('patient_id_code', linkInput.trim().toUpperCase())
        .eq('role', 'patient')
        .maybeSingle();

      if (patientError || !patient) {
        showToast('Patient ID not found', 'error');
        return;
      }

      const existing = links.find(l => l.patient_id === patient.id);
      if (existing) {
        showToast('Already linked to this patient', 'error');
        return;
      }

      // Use SECURITY DEFINER function to link patient + auto-detect doctor in one call
      const { error: linkError } = await supabase
        .rpc('link_pharmacist_to_patient', {
          p_pharmacist_id: profile.id,
          p_patient_id: patient.id,
        });

      if (linkError) throw linkError;
      showToast(`Linked to ${patient.name} and their care network`, 'success');
      setLinkInput('');
      refetchLinks();
    } catch {
      showToast('Failed to link patient', 'error');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (linkId: string) => {
    const { error } = await supabase
      .from('pharmacy_links')
      .update({ status: 'removed' })
      .eq('id', linkId);
    if (error) {
      showToast('Failed to unlink', 'error');
    } else {
      showToast('Patient unlinked', 'success');
      refetchLinks();
    }
  };

  const handleSelectPatient = (id: string) => {
    setSelectedPatientId(id);
    setNotes('');
    setActionRxId(null);
  };

  const handleAction = async (rx: Prescription, type: ActionType) => {
    if (!profile || !selectedPatientId) return;
    setActionRxId(rx.id);
    try {
      const { error } = await supabase
        .from('dispensations')
        .insert({
          prescription_id: rx.id,
          pharmacist_id: profile.id,
          patient_id: selectedPatientId,
          notes: notes.trim() || null,
          action_type: type,
        });
      if (error) throw error;
      const meta = ACTION_META[type];
      showToast(`${meta.label}: ${rx.med_name} ${rx.dosage} recorded`, 'success');
      setNotes('');
      refetchDisp();
      refetchInventory();
    } catch {
      showToast(`Failed to record ${ACTION_META[type].label.toLowerCase()}`, 'error');
    } finally {
      setActionRxId(null);
    }
  };

  const handleRefillAlert = async (rx: Prescription, alertType: 'refill_due' | 'renewal_needed') => {
    if (!profile || !selectedPatientId) return;
    try {
      const { error } = await supabase
        .from('refill_alerts')
        .insert({
          pharmacist_id: profile.id,
          patient_id: selectedPatientId,
          prescription_id: rx.id,
          alert_type: alertType,
          message: alertType === 'refill_due'
            ? `Refill due for ${rx.med_name} ${rx.dosage}. Please contact your pharmacy.`
            : `Prescription renewal needed for ${rx.med_name} ${rx.dosage}. Please consult your doctor.`,
        });
      if (error) throw error;
      showToast(alertType === 'refill_due' ? 'Refill alert sent to patient & caretaker' : 'Renewal request sent to patient & caretaker', 'success');
    } catch {
      showToast('Failed to send alert', 'error');
    }
  };

  const handleMarkNotifRead = async (notifId: string) => {
    await supabase.from('pharmacist_notifications').update({ read: true }).eq('id', notifId);
    refetchNotifs();
  };

  const handleMarkAllRead = async () => {
    if (!profile) return;
    await supabase.from('pharmacist_notifications').update({ read: true }).eq('pharmacist_id', profile.id).eq('read', false);
    refetchNotifs();
  };

  const startEditInv = (item: Inventory) => {
    setEditingInvId(item.id);
    setEditStock(String(item.stock_quantity));
    setEditThreshold(String(item.threshold));
  };

  const handleSaveInv = async (itemId: string) => {
    setSavingInv(true);
    const stock = parseInt(editStock) || 0;
    const threshold = parseInt(editThreshold) || 0;
    const { error } = await supabase
      .from('inventory')
      .update({ stock_quantity: stock, threshold, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) {
      showToast('Failed to update inventory', 'error');
    } else {
      showToast('Inventory updated', 'success');
      refetchInventory();
      setEditingInvId(null);
    }
    setSavingInv(false);
  };

  const dispensedRxMap = useMemo(() => {
    const map = new Map<string, Dispensation[]>();
    for (const d of dispensations) {
      const arr = map.get(d.prescription_id) || [];
      arr.push(d);
      map.set(d.prescription_id, arr);
    }
    return map;
  }, [dispensations]);

  return (
    <>
      <Navbar />
      <div className="min-h-[calc(100vh-4rem)] bg-slate-100 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header with Notifications + Tabs */}
          <div className="bg-teal-700 text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Pharmacist Dashboard</h1>
                <p className="text-sm text-white/70">{links.length} linked patients • {lowStockCount} low stock items</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Tab toggle */}
              <div className="flex bg-white/15 rounded-xl p-1">
                <button
                  onClick={() => setTab('patients')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === 'patients' ? 'bg-white text-teal-700' : 'text-white/80'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Patients
                </button>
                <button
                  onClick={() => setTab('inventory')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === 'inventory' ? 'bg-white text-teal-700' : 'text-white/80'
                  }`}
                >
                  <Boxes className="w-4 h-4" />
                  Inventory
                  {lowStockCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">
                      {lowStockCount}
                    </span>
                  )}
                </button>
              </div>
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors"
              >
                {unreadCount > 0 ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Notifications Panel */}
          {showNotifs && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Prescription Change Notifications</h2>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-sm text-teal-600 font-medium hover:text-teal-700">
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setShowNotifs(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="text-slate-400 text-center py-6 text-sm">No notifications yet.</p>
                )}
                {notifications.map((n: PharmacistNotification) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      n.read ? 'bg-slate-50 border-slate-100' : 'bg-teal-50 border-teal-200'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      n.action === 'created' ? 'bg-emerald-100' :
                      n.action === 'updated' ? 'bg-blue-100' : 'bg-rose-100'
                    }`}>
                      {n.action === 'created' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
                       n.action === 'updated' ? <RefreshCw className="w-5 h-5 text-blue-600" /> :
                       <X className="w-5 h-5 text-rose-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {n.message || `${n.action}: ${n.med_name || 'prescription'}`}
                      </p>
                      {n.doctor_name && <p className="text-xs text-slate-500 mt-0.5">By {n.doctor_name}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    {!n.read && (
                      <button onClick={() => handleMarkNotifRead(n.id)} className="text-xs text-teal-600 font-medium hover:text-teal-700 shrink-0">
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========= INVENTORY TAB ========= */}
          {tab === 'inventory' && (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Boxes className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Medication Inventory</h2>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">{inventory.length}</span>
                  {lowStockCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {lowStockCount} low stock
                    </span>
                  )}
                </div>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={invSearch}
                    onChange={e => setInvSearch(e.target.value)}
                    placeholder="Search by medication name or dosage..."
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all text-slate-900"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-200">
                        <th className="pb-3 font-medium">Medication</th>
                        <th className="pb-3 font-medium">Dosage</th>
                        <th className="pb-3 font-medium text-center">Stock</th>
                        <th className="pb-3 font-medium text-center">Threshold</th>
                        <th className="pb-3 font-medium text-center">Status</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map(item => {
                        const isLow = item.stock_quantity <= item.threshold;
                        return (
                          <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 font-medium text-slate-800">{item.med_name}</td>
                            <td className="py-3 text-slate-600">{item.dosage}</td>
                            <td className="py-3 text-center">
                              {editingInvId === item.id ? (
                                <input
                                  type="number"
                                  value={editStock}
                                  onChange={e => setEditStock(e.target.value)}
                                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-center text-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-100 outline-none"
                                />
                              ) : (
                                <span className={isLow ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                                  {item.stock_quantity}
                                </span>
                              )}
                              <span className="text-slate-400 text-xs ml-1">{item.unit}</span>
                            </td>
                            <td className="py-3 text-center">
                              {editingInvId === item.id ? (
                                <input
                                  type="number"
                                  value={editThreshold}
                                  onChange={e => setEditThreshold(e.target.value)}
                                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-center text-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-100 outline-none"
                                />
                              ) : (
                                <span className="text-slate-500">{item.threshold}</span>
                              )}
                            </td>
                            <td className="py-3 text-center">
                              {isLow ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">
                                  <AlertTriangle className="w-3 h-3" />
                                  Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  In Stock
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              {editingInvId === item.id ? (
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => handleSaveInv(item.id)}
                                    disabled={savingInv}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50"
                                  >
                                    {savingInv ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingInvId(null)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditInv(item)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ========= PATIENTS TAB ========= */}
          {tab === 'patients' && (
            <>
              {/* Link Patient by ID */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Link2 className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Link Patient & Doctor</h2>
                </div>
                <p className="text-sm text-slate-500 mb-3">
                  Enter a patient's ID code to link them. Their prescribing doctor is auto-detected and linked too.
                </p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={linkInput}
                      onChange={e => setLinkInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLink()}
                      placeholder="Enter Patient ID (e.g. MED-9082)..."
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all text-slate-900"
                    />
                  </div>
                  <button
                    onClick={handleLink}
                    disabled={linking || !linkInput.trim()}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {linking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
                    Link
                  </button>
                </div>
              </div>

              {/* Linked Patients */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <User className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Linked Patients</h2>
                  <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">{links.length}</span>
                </div>
                {linksLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                )}
                {!linksLoading && linkedPatients.length === 0 && (
                  <p className="text-slate-400 text-center py-6 text-sm">No linked patients yet. Use the form above to link by patient ID.</p>
                )}
                <div className="space-y-3">
                  {linkedPatients.map(({ link, patient, doctor }) => (
                    <div
                      key={link.id}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        selectedPatientId === patient?.id
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                      onClick={() => patient && handleSelectPatient(patient.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center">
                          <User className="w-5 h-5 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{patient?.name || 'Unknown'}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            {patient?.patient_id_code && <span className="font-mono">{patient.patient_id_code}</span>}
                            {patient?.primary_condition && <span>• {patient.primary_condition}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {doctor && (
                          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
                            <Stethoscope className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-700">{doctor.name}</span>
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUnlink(link.id); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selected Patient Detail */}
              {selectedPatient ? (
                <>
                  <div className="bg-teal-700 text-white rounded-2xl p-6 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">{selectedPatient.name}</h2>
                      <p className="text-sm text-white/70 mt-0.5">
                        {selectedPatient.patient_id_code} • {selectedPatient.age ? `${selectedPatient.age}y` : ''} {selectedPatient.primary_condition ? `• ${selectedPatient.primary_condition}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15">
                      <FlaskConical className="w-5 h-5" />
                      <span className="font-semibold text-sm">Pharmacy View</span>
                    </div>
                  </div>

                  {/* Active Prescriptions with Adherence + Refill Actions */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Pill className="w-5 h-5 text-teal-600" />
                      <h2 className="text-lg font-bold text-slate-900">Active Prescriptions</h2>
                      <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">{activeRx.length}</span>
                    </div>
                    <div className="space-y-3">
                      {rxLoading && (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                      )}
                      {!rxLoading && activeRx.length === 0 && (
                        <p className="text-slate-400 text-center py-8">No active prescriptions for this patient.</p>
                      )}
                      {rxMetrics.map(({ rx, taken, total, adherenceRate, dispCount, refillsRemaining, renewalNeeded }) => {
                        const dispRecords = dispensedRxMap.get(rx.id) || [];
                        const lastDispensed = dispRecords.length > 0 ? dispRecords[0].dispensed_at : null;
                        const hasChangeFlag = changedRxIds.has(rx.id);
                        const changeNotif = notifications.find(n => n.prescription_id === rx.id && !n.read);
                        return (
                          <div key={rx.id} className={`rounded-xl border-2 transition-colors overflow-hidden ${
                            hasChangeFlag ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300'
                          }`}>
                            {/* Change flag banner */}
                            {hasChangeFlag && changeNotif && (
                              <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 border-b border-blue-200">
                                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                                <span className="text-xs font-semibold text-blue-700">
                                  {changeNotif.action === 'created' ? 'New Rx' : changeNotif.action === 'updated' ? 'Rx Modified by Doctor' : 'Rx Stopped'}
                                  {changeNotif.doctor_name ? ` — ${changeNotif.doctor_name}` : ''}
                                </span>
                              </div>
                            )}
                            {/* Prescription header */}
                            <div className="flex items-center justify-between p-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
                                  <Pill className="w-6 h-6 text-teal-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900">{rx.med_name} {rx.dosage}</p>
                                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                    <span>{rx.disease}</span>
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {rx.scheduled_time}</span>
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {rx.start_date} → {rx.end_date}</span>
                                  </div>
                                  <p className="text-xs text-slate-400 mt-0.5">Prescribed by {rx.doctor_name}</p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {lastDispensed && (
                                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Last: {new Date(lastDispensed).toLocaleDateString()}
                                  </span>
                                )}
                                {dispRecords.length > 1 && (
                                  <span className="text-xs text-slate-400">{dispRecords.length} actions total</span>
                                )}
                              </div>
                            </div>

                            {/* Adherence metrics row */}
                            <div className="grid grid-cols-3 gap-3 px-4 py-3 bg-slate-50 border-t border-slate-100">
                              {/* Dosage completed progress bar */}
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
                                  <span className="text-xs font-semibold text-slate-600">Dosage Completed</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        adherenceRate >= 80 ? 'bg-emerald-500' :
                                        adherenceRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${adherenceRate}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-slate-700">{adherenceRate}%</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">{taken}/{total} doses</p>
                              </div>
                              {/* Refills remaining */}
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                                  <span className="text-xs font-semibold text-slate-600">Refills Remaining</span>
                                </div>
                                <p className={`text-lg font-bold ${refillsRemaining <= 2 ? 'text-rose-600' : 'text-slate-700'}`}>
                                  {refillsRemaining}
                                </p>
                                <p className="text-xs text-slate-400">{dispCount} dispensed</p>
                              </div>
                              {/* Renewal needed */}
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-xs font-semibold text-slate-600">Renewal Status</span>
                                </div>
                                {renewalNeeded ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">
                                    <AlertTriangle className="w-3 h-3" />
                                    Renewal Needed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Active
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Action row */}
                            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-t border-slate-100 flex-wrap">
                              <input
                                type="text"
                                value={actionRxId === rx.id ? notes : ''}
                                onChange={e => { setActionRxId(rx.id); setNotes(e.target.value); }}
                                placeholder="Notes (optional)..."
                                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-100 outline-none transition-all"
                              />
                              {(Object.keys(ACTION_META) as ActionType[]).map(type => {
                                const meta = ACTION_META[type];
                                const Icon = meta.icon;
                                return (
                                  <button
                                    key={type}
                                    onClick={() => handleAction(rx, type)}
                                    disabled={actionRxId === rx.id}
                                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-white text-xs font-semibold transition-colors shrink-0 ${meta.color} disabled:opacity-50`}
                                  >
                                    {actionRxId === rx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                                    {meta.label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Refill alert actions */}
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-t border-slate-100 flex-wrap">
                              <button
                                onClick={() => handleRefillAlert(rx, 'refill_due')}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-700 text-xs font-semibold hover:bg-amber-200 transition-colors"
                              >
                                <Bell className="w-3.5 h-3.5" />
                                Notify Refill Due
                              </button>
                              {renewalNeeded && (
                                <button
                                  onClick={() => handleRefillAlert(rx, 'renewal_needed')}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-100 text-rose-700 text-xs font-semibold hover:bg-rose-200 transition-colors"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Request Rx Renewal
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dispensation History */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <FileText className="w-5 h-5 text-teal-600" />
                      <h2 className="text-lg font-bold text-slate-900">Dispensation History</h2>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">{dispensations.length}</span>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {dispLoading && (
                        <div className="flex justify-center py-6">
                          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        </div>
                      )}
                      {!dispLoading && dispensations.length === 0 && (
                        <p className="text-slate-400 text-center py-6 text-sm">No actions recorded yet.</p>
                      )}
                      {dispensations.map(d => {
                        const rx = prescriptions.find(p => p.id === d.prescription_id);
                        const meta = ACTION_META[d.action_type] || ACTION_META.dispense;
                        const Icon = meta.icon;
                        return (
                          <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                              <Icon className="w-5 h-5 text-teal-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-800">
                                  {rx ? `${rx.med_name} ${rx.dosage}` : 'Unknown prescription'}
                                </p>
                                <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded">{meta.label}</span>
                              </div>
                              {d.notes && <p className="text-xs text-slate-500 mt-0.5">{d.notes}</p>}
                              <p className="text-xs text-slate-400 mt-0.5">{new Date(d.dispensed_at).toLocaleString()}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                  <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg font-medium">Select a linked patient to manage medications</p>
                  <p className="text-slate-400 text-sm mt-1">Link a patient by their ID above, then click on them to get started</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
