/*
# Auto-generate user codes for all roles

1. Updates the handle_new_user trigger to auto-generate a unique patient_id_code for ALL users (not just patients):
   - Patient: MED-XXXX
   - Caretaker: CAR-XXXX
   - Doctor: DOC-XXXX
   Where XXXX is a random 4-digit number.

2. Backfills existing seed users who don't have a code.

3. The column patient_id_code is reused for all roles (renaming columns is destructive, so we keep the name).
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  prefix text;
  code text;
  attempts int := 0;
BEGIN
  prefix := CASE WHEN NEW.raw_user_meta_data->>'role' = 'doctor' THEN 'DOC'
             WHEN NEW.raw_user_meta_data->>'role' = 'caretaker' THEN 'CAR'
             ELSE 'MED' END;

  LOOP
    code := prefix || '-' || lpad(floor(random() * 10000)::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE patient_id_code = code);
    attempts := attempts + 1;
    EXIT WHEN attempts > 10;
  END LOOP;

  INSERT INTO public.profiles (id, name, email, role, patient_id_code)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'name',
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'patient'),
    COALESCE(NEW.raw_user_meta_data->>'patient_id_code', code)
  );
  RETURN NEW;
END;
$$;

-- Backfill codes for existing users who don't have one
UPDATE profiles SET patient_id_code = 'DOC-' || lpad(floor(random() * 10000)::text, 4, '0')
WHERE role = 'doctor' AND patient_id_code IS NULL;

UPDATE profiles SET patient_id_code = 'CAR-' || lpad(floor(random() * 10000)::text, 4, '0')
WHERE role = 'caretaker' AND patient_id_code IS NULL;

UPDATE profiles SET patient_id_code = 'MED-' || lpad(floor(random() * 10000)::text, 4, '0')
WHERE role = 'patient' AND patient_id_code IS NULL;
