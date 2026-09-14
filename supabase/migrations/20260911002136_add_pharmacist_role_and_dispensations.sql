/*
# Add pharmacist role + dispensations table

1. Updates the profiles role CHECK constraint to allow 'pharmacist'
2. Creates the dispensations table
3. Enables RLS with policies for pharmacist insert + read by patient's care team
*/

-- Update role CHECK constraint to include 'pharmacist'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('patient', 'caretaker', 'doctor', 'pharmacist'));

-- Create dispensations table
CREATE TABLE IF NOT EXISTS public.dispensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  pharmacist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dispensed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dispensations ENABLE ROW LEVEL SECURITY;

-- Pharmacists can insert their own dispensation rows
CREATE POLICY "insert_own_dispensations" ON public.dispensations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = pharmacist_id);

-- Pharmacists can read their own dispensations
CREATE POLICY "select_own_dispensations" ON public.dispensations
  FOR SELECT TO authenticated
  USING (auth.uid() = pharmacist_id);

-- Patients can read dispensations for themselves
CREATE POLICY "select_patient_dispensations" ON public.dispensations
  FOR SELECT TO authenticated
  USING (auth.uid() = patient_id);

-- Caretakers can read dispensations for patients they care for
CREATE POLICY "select_caretaker_dispensations" ON public.dispensations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.caretaker_links cl
      WHERE cl.caretaker_id = auth.uid()
        AND cl.patient_id = dispensations.patient_id
        AND cl.status = 'accepted'
    )
  );

-- Doctors can read dispensations for their patients (via prescriptions they created)
CREATE POLICY "select_doctor_dispensations" ON public.dispensations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = dispensations.prescription_id
        AND p.doctor_id = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispensations;

-- Create indexes
CREATE INDEX idx_dispensations_patient_id ON public.dispensations(patient_id);
CREATE INDEX idx_dispensations_pharmacist_id ON public.dispensations(pharmacist_id);
CREATE INDEX idx_dispensations_prescription_id ON public.dispensations(prescription_id);
