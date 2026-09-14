-- Seed pharmacist demo user for MedSafe
-- pharmacist@medsafe.com / password123

DO $$
DECLARE
  pha_id uuid := 'a0000000-0000-0000-0000-000000000004';
BEGIN
  -- Insert auth.users (if not exists)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = pha_id) THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (pha_id, 'pharmacist@medsafe.com', '$2b$10$pb3/Tn/OWDmrootdygj6g.clCTlAAG1wr0Ba2EIVYedEcN45wen3O', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"name":"Pharmacist Lee","role":"pharmacist"}', 'authenticated', 'authenticated');
  END IF;

  -- Insert profile (if trigger didn't create it)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = pha_id) THEN
    INSERT INTO profiles (id, name, email, role, patient_id_code)
    VALUES (pha_id, 'Pharmacist Lee', 'pharmacist@medsafe.com', 'pharmacist', 'PHA-0001');
  END IF;
END $$;
