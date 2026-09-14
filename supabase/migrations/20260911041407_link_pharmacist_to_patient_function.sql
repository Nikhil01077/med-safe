
-- Function to link pharmacist to patient AND their doctor in one call (bypasses RLS chicken-and-egg)
CREATE OR REPLACE FUNCTION public.link_pharmacist_to_patient(p_pharmacist_id uuid, p_patient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
  v_link_id uuid;
BEGIN
  -- Get the patient's doctor from active prescriptions
  SELECT doctor_id INTO v_doctor_id
  FROM public.prescriptions
  WHERE patient_id = p_patient_id AND active = true AND doctor_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Insert the pharmacy link
  INSERT INTO public.pharmacy_links (pharmacist_id, patient_id, doctor_id, status)
  VALUES (p_pharmacist_id, p_patient_id, v_doctor_id, 'active')
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;
