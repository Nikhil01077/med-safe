/*
# Create caretaker_links table

1. New Tables
- `caretaker_links`: Links caretakers to patients
  - `id` (uuid, PK)
  - `patient_id` (uuid, references profiles)
  - `caretaker_id` (uuid, references profiles)
  - `status` (text: 'pending' | 'accepted' | 'rejected')
  - `created_at` (timestamptz)

2. Security
- RLS enabled
- Authenticated users can read links they are part of
- Patients can update links where they are the patient
- Caretakers can insert links (send requests)
*/

CREATE TABLE IF NOT EXISTS caretaker_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  caretaker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE caretaker_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_links" ON caretaker_links;
CREATE POLICY "read_own_links" ON caretaker_links FOR SELECT
  TO authenticated USING (
    auth.uid() = patient_id OR auth.uid() = caretaker_id
  );

DROP POLICY IF EXISTS "insert_links" ON caretaker_links;
CREATE POLICY "insert_links" ON caretaker_links FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = caretaker_id);

DROP POLICY IF EXISTS "update_own_links" ON caretaker_links;
CREATE POLICY "update_own_links" ON caretaker_links FOR UPDATE
  TO authenticated USING (
    auth.uid() = patient_id OR auth.uid() = caretaker_id
  ) WITH CHECK (
    auth.uid() = patient_id OR auth.uid() = caretaker_id
  );

DROP POLICY IF EXISTS "delete_own_links" ON caretaker_links;
CREATE POLICY "delete_own_links" ON caretaker_links FOR DELETE
  TO authenticated USING (
    auth.uid() = patient_id OR auth.uid() = caretaker_id
  );
