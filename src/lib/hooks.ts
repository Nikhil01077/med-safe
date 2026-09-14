import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Prescription, MedLog, CaretakerLink, PrescriptionHistory, Dispensation, PharmacyLink, PharmacistNotification, Inventory, RefillAlert } from '@/types';

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setProfile(null); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!cancelled) { setProfile(data as Profile | null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return { profile, loading };
}

export function usePrescriptions(patientId: string | undefined) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!patientId) { setPrescriptions([]); setLoading(false); return; }
    const { data } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', patientId)
      .order('scheduled_time', { ascending: true });
    setPrescriptions((data as Prescription[]) || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    refetch();
    if (!patientId) return;
    const channel = supabase
      .channel(`prescriptions:${patientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions', filter: `patient_id=eq.${patientId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, patientId]);

  return { prescriptions, loading, refetch };
}

export function useMedLogs(patientId: string | undefined, logDate?: string) {
  const [logs, setLogs] = useState<MedLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!patientId) { setLogs([]); setLoading(false); return; }
    let query = supabase.from('med_logs').select('*').eq('patient_id', patientId);
    if (logDate) query = query.eq('log_date', logDate);
    const { data } = await query.order('scheduled_time', { ascending: true });
    setLogs((data as MedLog[]) || []);
    setLoading(false);
  }, [patientId, logDate]);

  useEffect(() => {
    setLoading(true);
    refetch();
    if (!patientId) return;
    const channel = supabase
      .channel(`med_logs:${patientId}:${logDate || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'med_logs', filter: `patient_id=eq.${patientId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, patientId, logDate]);

  return { logs, loading, refetch };
}

export function useCaretakerLinks(userId: string | undefined, role: 'patient' | 'caretaker') {
  const [links, setLinks] = useState<CaretakerLink[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) { setLinks([]); setLoading(false); return; }
    const col = role === 'patient' ? 'patient_id' : 'caretaker_id';
    const { data } = await supabase
      .from('caretaker_links')
      .select('*, patient:profiles!caretaker_links_patient_id_fkey(*), caretaker:profiles!caretaker_links_caretaker_id_fkey(*)')
      .eq(col, userId)
      .order('created_at', { ascending: false });
    setLinks((data as CaretakerLink[]) || []);
    setLoading(false);
  }, [userId, role]);

  useEffect(() => {
    refetch();
    if (!userId) return;
    const channel = supabase
      .channel(`caretaker_links:${userId}:${role}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caretaker_links' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, userId, role]);

  return { links, loading, refetch };
}

export function usePrescriptionHistory(prescriptionId?: string) {
  const [history, setHistory] = useState<PrescriptionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    let query = supabase.from('prescription_history').select('*').order('created_at', { ascending: false });
    if (prescriptionId) query = query.eq('prescription_id', prescriptionId);
    const { data } = await query.limit(50);
    setHistory((data as PrescriptionHistory[]) || []);
    setLoading(false);
  }, [prescriptionId]);

  useEffect(() => {
    refetch();
    const channel = supabase
      .channel('prescription_history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prescription_history' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  return { history, loading, refetch };
}

export function useAllProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('name');
    setProfiles((data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
    const channel = supabase
      .channel('all_profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  return { profiles, loading, refetch };
}

export function useDispensations(patientId: string | undefined) {
  const [dispensations, setDispensations] = useState<Dispensation[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!patientId) { setDispensations([]); setLoading(false); return; }
    const { data } = await supabase
      .from('dispensations')
      .select('*')
      .eq('patient_id', patientId)
      .order('dispensed_at', { ascending: false });
    setDispensations((data as Dispensation[]) || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    refetch();
    if (!patientId) return;
    const channel = supabase
      .channel(`dispensations:${patientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispensations', filter: `patient_id=eq.${patientId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, patientId]);

  return { dispensations, loading, refetch };
}

export function usePharmacyLinks(pharmacistId: string | undefined) {
  const [links, setLinks] = useState<PharmacyLink[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!pharmacistId) { setLinks([]); setLoading(false); return; }
    const { data } = await supabase
      .from('pharmacy_links')
      .select('*, patient:profiles!pharmacy_links_patient_id_fkey(*), doctor:profiles!pharmacy_links_doctor_id_fkey(*)')
      .eq('pharmacist_id', pharmacistId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    setLinks((data as PharmacyLink[]) || []);
    setLoading(false);
  }, [pharmacistId]);

  useEffect(() => {
    refetch();
    if (!pharmacistId) return;
    const channel = supabase
      .channel(`pharmacy_links:${pharmacistId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pharmacy_links', filter: `pharmacist_id=eq.${pharmacistId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, pharmacistId]);

  return { links, loading, refetch };
}

export function usePharmacistNotifications(pharmacistId: string | undefined) {
  const [notifications, setNotifications] = useState<PharmacistNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!pharmacistId) { setNotifications([]); setLoading(false); return; }
    const { data } = await supabase
      .from('pharmacist_notifications')
      .select('*')
      .eq('pharmacist_id', pharmacistId)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data as PharmacistNotification[]) || []);
    setLoading(false);
  }, [pharmacistId]);

  useEffect(() => {
    refetch();
    if (!pharmacistId) return;
    const channel = supabase
      .channel(`pharmacist_notifications:${pharmacistId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pharmacist_notifications', filter: `pharmacist_id=eq.${pharmacistId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, pharmacistId]);

  return { notifications, loading, refetch };
}

export function useInventory() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .order('med_name', { ascending: true });
    setInventory((data as Inventory[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
    const channel = supabase
      .channel('inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  return { inventory, loading, refetch };
}

export function useRefillAlerts(patientId: string | undefined) {
  const [alerts, setAlerts] = useState<RefillAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!patientId) { setAlerts([]); setLoading(false); return; }
    const { data } = await supabase
      .from('refill_alerts')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    setAlerts((data as RefillAlert[]) || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    refetch();
    if (!patientId) return;
    const channel = supabase
      .channel(`refill_alerts:${patientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refill_alerts', filter: `patient_id=eq.${patientId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, patientId]);

  return { alerts, loading, refetch };
}

export function useRefillAlertsForCaretaker(caretakerId: string | undefined, patientIds: string[]) {
  const [alerts, setAlerts] = useState<RefillAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!caretakerId || patientIds.length === 0) { setAlerts([]); setLoading(false); return; }
    const { data } = await supabase
      .from('refill_alerts')
      .select('*')
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false });
    setAlerts((data as RefillAlert[]) || []);
    setLoading(false);
  }, [caretakerId, patientIds.join(',')]);

  useEffect(() => {
    refetch();
    if (!caretakerId || patientIds.length === 0) return;
    const channel = supabase
      .channel(`refill_alerts_caretaker:${caretakerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refill_alerts' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch, caretakerId, patientIds.join(',')]);

  return { alerts, loading, refetch };
}
