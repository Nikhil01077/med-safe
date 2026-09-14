/*
# Create prescriptions table

1. New Tables
- `prescriptions`: Doctor-created medication prescriptions
  - `id` (uuid PK)
  - `patient_id` (uuid, references profiles)
  - `doctor_id` (uuid, references profiles)
  - `doctor_name` (text)
  - `disease` (text)
  - `med_name` (text)
  - `dosage` (text)
  - `scheduled_time` (text, HH:MM format)
  - `start_date` (date)
  - `end_date` (date)
  - `active` (boolean, default true)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- RLS enabled
- Patient, their caretakers, and the prescribing doctor can read
- Doctors can insert/update/delete prescriptions
*/

CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_name text NOT NULL,
  disease text NOT NULL,
  med_name text NOT NULL,
  dosage text NOT NULL,
  scheduled_time text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_prescriptions" ON prescriptions;
CREATE POLICY "read_prescriptions" ON prescriptions FOR SELECT
  TO authenticated USING (
    auth.uid() = patient_id
    OR auth.uid() = doctor_id
    OR EXISTS (
      SELECT 1 FROM caretaker_links cl
      WHERE cl.patient_id = prescriptions.patient_id
        AND cl.caretaker_id = auth.uid()
        AND cl.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "insert_prescriptions" ON prescriptions;
CREATE POLICY "insert_prescriptions" ON prescriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "update_prescriptions" ON prescriptions;
CREATE POLICY "update_prescriptions" ON prescriptions FOR UPDATE
  TO authenticated USING (auth.uid() = doctor_id)
  WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "delete_prescriptions" ON prescriptions;
CREATE POLICY "delete_prescriptions" ON prescriptions FOR DELETE
  TO authenticated USING (auth.uid() = doctor_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_active ON prescriptions(active);
