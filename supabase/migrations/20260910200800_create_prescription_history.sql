/*
# Create prescription_history table

1. New Tables
- `prescription_history`: Audit log of prescription edits
  - `id` (uuid PK)
  - `prescription_id` (uuid, references prescriptions)
  - `doctor_id` (uuid, references profiles)
  - `action` (text: 'created' | 'updated' | 'deactivated')
  - `changes` (jsonb, stores what changed)
  - `created_at` (timestamptz)

2. Security
- RLS enabled
- Doctors can read history of prescriptions they created
- Patients and caretakers can read history for their prescriptions
*/

CREATE TABLE IF NOT EXISTS prescription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deactivated')),
  changes jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prescription_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_prescription_history" ON prescription_history;
CREATE POLICY "read_prescription_history" ON prescription_history FOR SELECT
  TO authenticated USING (
    auth.uid() = doctor_id
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = prescription_history.prescription_id
        AND p.patient_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      JOIN caretaker_links cl ON cl.patient_id = p.patient_id
      WHERE p.id = prescription_history.prescription_id
        AND cl.caretaker_id = auth.uid()
        AND cl.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "insert_prescription_history" ON prescription_history;
CREATE POLICY "insert_prescription_history" ON prescription_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = doctor_id);

CREATE INDEX IF NOT EXISTS idx_presc_history_presc ON prescription_history(prescription_id);
