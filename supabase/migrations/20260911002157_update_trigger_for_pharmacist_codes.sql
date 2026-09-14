-- Update handle_new_user to generate PHA-XXXX codes for pharmacists
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
             WHEN NEW.raw_user_meta_data->>'role' = 'pharmacist' THEN 'PHA'
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
