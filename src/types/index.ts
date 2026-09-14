export type Role = 'patient' | 'caretaker' | 'doctor' | 'pharmacist';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  patient_id_code: string | null;
  age: number | null;
  primary_condition: string | null;
  created_at: string;
}

export interface CaretakerLink {
  id: string;
  patient_id: string;
  caretaker_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  patient?: Profile;
  caretaker?: Profile;
}

export interface Prescription {
  id: string;
  patient_id: string;
  doctor_id: string;
  doctor_name: string;
  disease: string;
  med_name: string;
  dosage: string;
  scheduled_time: string;
  start_date: string;
  end_date: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedLog {
  id: string;
  prescription_id: string;
  patient_id: string;
  scheduled_time: string;
  status: 'pending' | 'taken' | 'skipped';
  caretaker_verified: boolean;
  logged_at: string | null;
  log_date: string;
  created_at: string;
}

export interface PrescriptionHistory {
  id: string;
  prescription_id: string;
  doctor_id: string;
  action: 'created' | 'updated' | 'deactivated';
  changes: Record<string, unknown> | null;
  created_at: string;
}

export interface Dispensation {
  id: string;
  prescription_id: string;
  pharmacist_id: string;
  patient_id: string;
  dispensed_at: string;
  notes: string | null;
  action_type: 'dispense' | 'refill' | 'check' | 'supply' | 'dispatch';
  created_at: string;
}

export interface PharmacyLink {
  id: string;
  pharmacist_id: string;
  patient_id: string;
  doctor_id: string | null;
  status: 'active' | 'removed';
  created_at: string;
  patient?: Profile;
  doctor?: Profile;
}

export interface PharmacistNotification {
  id: string;
  pharmacist_id: string;
  patient_id: string;
  prescription_id: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  med_name: string | null;
  action: string;
  message: string | null;
  read: boolean;
  created_at: string;
}

export interface Inventory {
  id: string;
  med_name: string;
  dosage: string;
  stock_quantity: number;
  threshold: number;
  unit: string;
  updated_at: string;
  created_at: string;
}

export interface RefillAlert {
  id: string;
  pharmacist_id: string;
  patient_id: string;
  prescription_id: string | null;
  alert_type: 'refill_due' | 'renewal_needed';
  message: string | null;
  read_by_patient: boolean;
  read_by_caretaker: boolean;
  created_at: string;
}
