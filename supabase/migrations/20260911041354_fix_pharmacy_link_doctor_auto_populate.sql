/*
# Fix: Auto-populate doctor_id in pharmacy_links from patient's active prescriptions.
# 1. SECURITY DEFINER function to look up doctor for a patient (bypasses RLS for the lookup)
# 2. Trigger on prescriptions INSERT to auto-update pharmacy_links.doctor_id
# 3. Backfill existing NULL doctor_id values
*/

-- 1. Function to get the doctor_id from a patient's active prescriptions
CREATE OR REPLACE FUNCTION public.get_patient_doctor_id(p_patient_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT doctor_id FROM public.prescriptions
  WHERE patient_id = p_patient_id AND active = true AND doctor_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- 2. Trigger: when a new prescription is created, update pharmacy_links.doctor_id
CREATE OR REPLACE FUNCTION public.update_pharmacy_link_doctor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.doctor_id IS NOT NULL THEN
    UPDATE public.pharmacy_links
    SET doctor_id = NEW.doctor_id
    WHERE patient_id = NEW.patient_id
      AND status = 'active'
      AND (doctor_id IS NULL OR doctor_id != NEW.doctor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pharmacy_link_doctor_on_rx_insert ON public.prescriptions;
CREATE TRIGGER pharmacy_link_doctor_on_rx_insert
  AFTER INSERT OR UPDATE OF doctor_id, active ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_pharmacy_link_doctor();

-- 3. Backfill existing NULL doctor_id values
UPDATE public.pharmacy_links pl
SET doctor_id = sub.doctor_id
FROM (
  SELECT DISTINCT ON (patient_id) patient_id, doctor_id
  FROM public.prescriptions
  WHERE active = true AND doctor_id IS NOT NULL
  ORDER BY patient_id, created_at DESC
) sub
WHERE pl.patient_id = sub.patient_id
  AND pl.doctor_id IS NULL
  AND pl.status = 'active';
