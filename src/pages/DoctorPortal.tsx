import { useState, useMemo, FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { usePrescriptions, useMedLogs, useAllProfiles, usePrescriptionHistory } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import type { Prescription } from '@/types';
import {
  Search, Pill, Plus, Edit2, Ban, Activity, BarChart3, AlertTriangle,
  Loader2, Stethoscope, Clock, Calendar, X, ShieldAlert, History,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, RadialBarChart, RadialBar,
} from 'recharts';

interface RxFormData {
  disease: string;
  med_name: string;
  dosage: string;
  scheduled_time: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FORM: RxFormData = {
  disease: '', med_name: '', dosage: '', scheduled_time: '08:00',
  start_date: new Date().toISOString().split('T')[0],
  end_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
};

export default function DoctorPortal() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { profiles } = useAllProfiles();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRx, setEditingRx] = useState<Prescription | null>(null);
  const [formData, setFormData] = useState<RxFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<RxFormData | null>(null);

  const patients = useMemo(() => profiles.filter(p => p.role === 'patient'), [profiles]);
  const filteredPatients = useMemo(() => {
    if (!searchQuery.trim()) return patients;
    const q = searchQuery.toLowerCase();
    return patients.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.patient_id_code?.toLowerCase().includes(q) ?? false)
    );
  }, [patients, searchQuery]);

  const { prescriptions, loading: rxLoading, refetch: refetchRx } = usePrescriptions(selectedPatientId || undefined);
  const { logs } = useMedLogs(selectedPatientId || undefined);
  const { history } = usePrescriptionHistory();

  const selectedPatient = profiles.find(p => p.id === selectedPatientId);
  const activeRx = prescriptions.filter(p => p.active);
  const pastRx = prescriptions.filter(p => !p.active);

  // Analytics
  const analytics = useMemo(() => {
    const total = logs.length;
    const taken = logs.filter(l => l.status === 'taken').length;
    const skipped = logs.filter(l => l.status === 'skipped').length;
    const pending = logs.filter(l => l.status === 'pending').length;
    const verified = logs.filter(l => l.caretaker_verified).length;
    const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;
    const skippedRate = total > 0 ? Math.round((skipped / total) * 100) : 0;
    const verifiedRate = taken > 0 ? Math.round((verified / taken) * 100) : 0;
    return { total, taken, skipped, pending, verified, adherenceRate, skippedRate, verifiedRate };
  }, [logs]);

  const pieData = [
    { name: 'Taken', value: analytics.taken, color: '#059669' },
    { name: 'Skipped', value: analytics.skipped, color: '#E11D48' },
    { name: 'Pending', value: analytics.pending, color: '#F59E0B' },
  ];

  const radialData = [
    { name: 'Adherence', value: analytics.adherenceRate, fill: '#059669' },
  ];

  const handleSelectPatient = (id: string) => {
    setSelectedPatientId(id);
    setShowForm(false);
    setEditingRx(null);
  };

  const openCreateForm = () => {
    setEditingRx(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const openEditForm = (rx: Prescription) => {
    setEditingRx(rx);
    setFormData({
      disease: rx.disease,
      med_name: rx.med_name,
      dosage: rx.dosage,
      scheduled_time: rx.scheduled_time,
      start_date: rx.start_date,
      end_date: rx.end_date,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !profile) return;
    setPendingFormData(formData);
    setShowAIModal(true);
  };

  const confirmPrescription = async () => {
    if (!pendingFormData || !selectedPatientId || !profile) return;
    setSubmitting(true);
    setShowAIModal(false);

    try {
      if (editingRx) {
        const { error } = await supabase
          .from('prescriptions')
          .update({
            disease: pendingFormData.disease,
            med_name: pendingFormData.med_name,
            dosage: pendingFormData.dosage,
            scheduled_time: pendingFormData.scheduled_time,
            start_date: pendingFormData.start_date,
            end_date: pendingFormData.end_date,
          })
          .eq('id', editingRx.id);

        if (error) throw error;

        await supabase.from('prescription_history').insert({
          prescription_id: editingRx.id,
          doctor_id: profile.id,
          action: 'updated',
          changes: pendingFormData as unknown as Record<string, unknown>,
        });

        showToast('Prescription updated — patient notified', 'success');
      } else {
        const { data, error } = await supabase
          .from('prescriptions')
          .insert({
            patient_id: selectedPatientId,
            doctor_id: profile.id,
            doctor_name: profile.name,
            disease: pendingFormData.disease,
            med_name: pendingFormData.med_name,
            dosage: pendingFormData.dosage,
            scheduled_time: pendingFormData.scheduled_time,
            start_date: pendingFormData.start_date,
            end_date: pendingFormData.end_date,
            active: true,
          })
          .select()
          .single();

        if (error) throw error;

        await supabase.from('prescription_history').insert({
          prescription_id: data.id,
          doctor_id: profile.id,
          action: 'created',
          changes: pendingFormData as unknown as Record<string, unknown>,
        });

        showToast('Prescription created — patient notified', 'success');
      }
      setShowForm(false);
      setEditingRx(null);
      setFormData(EMPTY_FORM);
      refetchRx();
    } catch (err) {
      showToast('Failed to save prescription', 'error');
    } finally {
      setSubmitting(false);
      setPendingFormData(null);
    }
  };

  const handleDeactivate = async (rx: Prescription) => {
    const { error } = await supabase
      .from('prescriptions')
      .update({ active: false })
      .eq('id', rx.id);

    if (error) {
      showToast('Failed to deactivate', 'error');
    } else {
      await supabase.from('prescription_history').insert({
        prescription_id: rx.id,
        doctor_id: profile!.id,
        action: 'deactivated',
        changes: { med_name: rx.med_name, dosage: rx.dosage },
      });
      showToast('Prescription deactivated', 'success');
      refetchRx();
    }
  };

  // Filter history for selected patient
  const patientHistory = useMemo(() => {
    if (!selectedPatientId) return [];
    const patientRxIds = new Set(prescriptions.map(p => p.id));
    return history.filter(h => patientRxIds.has(h.prescription_id));
  }, [history, prescriptions, selectedPatientId]);

  return (
    <>
      <Navbar />
      <div className="min-h-[calc(100vh-4rem)] bg-slate-100 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Patient Search & Selector */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Stethoscope className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Patient Lookup</h2>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or Patient ID..."
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-900"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredPatients.length === 0 && (
                <p className="text-slate-400 text-sm py-2">No patients found.</p>
              )}
              {filteredPatients.map(patient => (
                <button
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                    selectedPatientId === patient.id
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold text-sm">{patient.name}</span>
                  {patient.patient_id_code && <span className="text-xs font-mono text-slate-400">{patient.patient_id_code}</span>}
                </button>
              ))}
            </div>
          </div>

          {selectedPatient ? (
            <>
              {/* Patient Info Bar */}
              <div className="bg-blue-900 text-white rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedPatient.name}</h2>
                  <p className="text-sm text-white/70 mt-0.5">
                    {selectedPatient.patient_id_code} • {selectedPatient.age ? `${selectedPatient.age}y` : ''} {selectedPatient.primary_condition ? `• ${selectedPatient.primary_condition}` : ''}
                  </p>
                </div>
                <button
                  onClick={openCreateForm}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-blue-900 font-semibold hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Prescription
                </button>
              </div>

              {/* Prescription Form Modal */}
              {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
                  <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-xl font-bold text-slate-900">
                        {editingRx ? 'Edit Prescription' : 'New Prescription'}
                      </h3>
                      <button onClick={() => { setShowForm(false); setEditingRx(null); }} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Disease / Condition</label>
                        <input
                          type="text"
                          value={formData.disease}
                          onChange={e => setFormData({ ...formData, disease: e.target.value })}
                          required
                          placeholder="Hypertension"
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Medication Name</label>
                          <input
                            type="text"
                            value={formData.med_name}
                            onChange={e => setFormData({ ...formData, med_name: e.target.value })}
                            required
                            placeholder="Amlodipine"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Dosage</label>
                          <input
                            type="text"
                            value={formData.dosage}
                            onChange={e => setFormData({ ...formData, dosage: e.target.value })}
                            required
                            placeholder="5mg"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Scheduled Time</label>
                        <input
                          type="time"
                          value={formData.scheduled_time}
                          onChange={e => setFormData({ ...formData, scheduled_time: e.target.value })}
                          required
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Start Date</label>
                          <input
                            type="date"
                            value={formData.start_date}
                            onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-700 mb-1.5 block">End Date</label>
                          <input
                            type="date"
                            value={formData.end_date}
                            onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
                        {editingRx ? 'Submit for Review' : 'Submit for Review'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* AI Decision Support Modal */}
              {showAIModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
                  <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                        <AlertTriangle className="w-7 h-7 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">AI Decision Support</h3>
                        <p className="text-xs text-slate-400">Drug Safety Analysis</p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-4">
                      <p className="text-sm text-amber-900 font-medium">
                        <span className="font-bold">Decision Support Warning:</span> Potential moderate drug interaction detected between newly prescribed medication and existing active prescriptions. Clinical review recommended.
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1 mb-5">
                      <p>• Cross-referencing {activeRx.length} active prescription(s)</p>
                      <p>• Checking contraindication database...</p>
                      <p>• Severity level: <span className="font-semibold text-amber-600">Moderate</span></p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowAIModal(false); setPendingFormData(null); }}
                        className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmPrescription}
                        className="flex-1 py-3 rounded-xl bg-blue-900 text-white font-semibold hover:bg-blue-800 transition-colors"
                      >
                        Acknowledge & Confirm
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Active Prescriptions */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Pill className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-900">Active Prescriptions</h2>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">{activeRx.length}</span>
                </div>
                <div className="space-y-3">
                  {activeRx.length === 0 && (
                    <p className="text-slate-400 text-center py-8">No active prescriptions. Click "New Prescription" to add one.</p>
                  )}
                  {activeRx.map(rx => (
                    <div key={rx.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                          <Pill className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{rx.med_name} {rx.dosage}</p>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span>{rx.disease}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {rx.scheduled_time}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {rx.start_date} → {rx.end_date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditForm(rx)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeactivate(rx)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition-colors"
                        >
                          <Ban className="w-4 h-4" />
                          Deactivate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Past prescriptions */}
                {pastRx.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-500 mb-3">Past Prescriptions</h3>
                    <div className="space-y-2">
                      {pastRx.map(rx => (
                        <div key={rx.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 opacity-70">
                          <Pill className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-600">{rx.med_name} {rx.dosage}</span>
                          <span className="text-xs text-slate-400">{rx.disease}</span>
                          <span className="text-xs text-rose-500 font-medium">Inactive</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Adherence Analytics */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-900">Adherence Analytics</h2>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                    <p className="text-3xl font-bold text-emerald-700">{analytics.adherenceRate}%</p>
                    <p className="text-sm text-emerald-600 mt-1">Overall Adherence</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                    <p className="text-3xl font-bold text-blue-700">{analytics.taken}</p>
                    <p className="text-sm text-blue-600 mt-1">Doses Taken</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
                    <p className="text-3xl font-bold text-rose-700">{analytics.skipped}</p>
                    <p className="text-sm text-rose-600 mt-1">Doses Skipped</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <p className="text-3xl font-bold text-amber-700">{analytics.verifiedRate}%</p>
                    <p className="text-sm text-amber-600 mt-1">Caretaker Verified</p>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Dose Status Distribution</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Adherence Rate</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadialBarChart innerRadius="60%" outerRadius="100%" data={radialData} startAngle={90} endAngle={-270}>
                        <RadialBar background dataKey="value" cornerRadius={10} />
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-3xl font-bold fill-emerald-600">
                          {analytics.adherenceRate}%
                        </text>
                      </RadialBarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Prescription Edit History */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <History className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-900">Prescription Audit History</h2>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {patientHistory.length === 0 && (
                    <p className="text-slate-400 text-center py-6 text-sm">No history entries.</p>
                  )}
                  {patientHistory.map(h => {
                    const rx = prescriptions.find(p => p.id === h.prescription_id);
                    const actionColor = h.action === 'created' ? 'text-emerald-600 bg-emerald-50' :
                      h.action === 'updated' ? 'text-blue-600 bg-blue-50' : 'text-rose-600 bg-rose-50';
                    return (
                      <div key={h.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${actionColor}`}>
                          {h.action}
                        </span>
                        <span className="text-sm text-slate-700 font-medium">{rx?.med_name} {rx?.dosage}</span>
                        <span className="text-xs text-slate-400 ml-auto">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
              <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg font-medium">Select a patient to manage prescriptions</p>
              <p className="text-slate-400 text-sm mt-1">Search and select a patient above to get started</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
