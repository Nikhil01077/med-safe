/*
# Create med_logs table

1. New Tables
- `med_logs`: Tracks each medication dose event
  - `id` (uuid PK)
  - `prescription_id` (uuid, references prescriptions)
  - `patient_id` (uuid, references profiles)
  - `scheduled_time` (text, HH:MM)
  - `status` (text: 'pending' | 'taken' | 'skipped')
  - `caretaker_verified` (boolean, default false)
  - `logged_at` (timestamptz)
  - `created_at` (timestamptz)

2. Security
- RLS enabled
- Patient, caretakers, and doctor (via prescription) can read
- Patient can insert/update their own logs
- Caretakers can update verification flag
*/

CREATE TABLE IF NOT EXISTS med_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_time text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'taken', 'skipped')),
  caretaker_verified boolean NOT NULL DEFAULT false,
  logged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE med_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_med_logs" ON med_logs;
CREATE POLICY "read_med_logs" ON med_logs FOR SELECT
  TO authenticated USING (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = med_logs.prescription_id AND p.doctor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM caretaker_links cl
      WHERE cl.patient_id = med_logs.patient_id
        AND cl.caretaker_id = auth.uid()
        AND cl.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "insert_med_logs" ON med_logs;
CREATE POLICY "insert_med_logs" ON med_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "update_med_logs" ON med_logs;
CREATE POLICY "update_med_logs" ON med_logs FOR UPDATE
  TO authenticated USING (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM caretaker_links cl
      WHERE cl.patient_id = med_logs.patient_id
        AND cl.caretaker_id = auth.uid()
        AND cl.status = 'accepted'
    )
  ) WITH CHECK (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM caretaker_links cl
      WHERE cl.patient_id = med_logs.patient_id
        AND cl.caretaker_id = auth.uid()
        AND cl.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "delete_med_logs" ON med_logs;
CREATE POLICY "delete_med_logs" ON med_logs FOR DELETE
  TO authenticated USING (auth.uid() = patient_id);

CREATE INDEX IF NOT EXISTS idx_med_logs_patient ON med_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_logs_prescription ON med_logs(prescription_id);
CREATE INDEX IF NOT EXISTS idx_med_logs_status ON med_logs(status);
