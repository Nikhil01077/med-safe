/*
# Fix: Allow pharmacists linked via pharmacy_links to read prescriptions for their linked patients.
# Also add 'dispatch' action type to dispensations.
*/

-- 1. Add SELECT policy on prescriptions for linked pharmacists
CREATE POLICY "select_pharmacist_prescriptions"
  ON public.prescriptions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pharmacy_links pl
      WHERE pl.pharmacist_id = auth.uid()
        AND pl.patient_id = prescriptions.patient_id
        AND pl.status = 'active'
    )
  );

-- 2. Add 'dispatch' to action_type CHECK constraint
ALTER TABLE public.dispensations
  DROP CONSTRAINT IF EXISTS dispensations_action_type_check;
ALTER TABLE public.dispensations
  ADD CONSTRAINT dispensations_action_type_check
  CHECK (action_type IN ('dispense', 'refill', 'check', 'supply', 'dispatch'));
