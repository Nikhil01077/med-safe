/*
# Seed demo users for MedSafe

1. Creates 3 auth.users with known emails and password 'password123':
   - doctor@medsafe.com (Dr. Smith, role: doctor)
   - patient@medsafe.com (John Doe, role: patient, ID: MED-9082, age 45, condition: Hypertension)
   - caretaker@medsafe.com (Jane Doe, role: caretaker)

2. Creates profiles for each user (via trigger or manual insert).

3. Creates 3 prescriptions for the patient (Hypertension -> Amlodipine, Diabetes -> Metformin, Cholesterol -> Atorvastatin) with times near current time for alarm testing.

4. Creates a caretaker link between patient and caretaker (accepted).

5. Creates med_logs entries for today for each prescription (pending status).

Note: Uses fixed UUIDs for reproducibility.
*/

-- Generate a bcrypt hash for 'password123'
-- $2b$10$pb3/Tn/OWDmrootdygj6g.clCTlAAG1wr0Ba2EIVYedEcN45wen3O

DO $$
DECLARE
  doc_id uuid := 'a0000000-0000-0000-0000-000000000001';
  pat_id uuid := 'a0000000-0000-0000-0000-000000000002';
  car_id uuid := 'a0000000-0000-0000-0000-000000000003';
  presc1 uuid := 'b0000000-0000-0000-0000-000000000001';
  presc2 uuid := 'b0000000-0000-0000-0000-000000000002';
  presc3 uuid := 'b0000000-0000-0000-0000-000000000003';
BEGIN
  -- Insert auth.users (if not exists)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = doc_id) THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (doc_id, 'doctor@medsafe.com', '$2b$10$pb3/Tn/OWDmrootdygj6g.clCTlAAG1wr0Ba2EIVYedEcN45wen3O', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"name":"Dr. Smith","role":"doctor"}', 'authenticated', 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = pat_id) THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (pat_id, 'patient@medsafe.com', '$2b$10$pb3/Tn/OWDmrootdygj6g.clCTlAAG1wr0Ba2EIVYedEcN45wen3O', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"name":"John Doe","role":"patient","patient_id_code":"MED-9082"}', 'authenticated', 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = car_id) THEN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (car_id, 'caretaker@medsafe.com', '$2b$10$pb3/Tn/OWDmrootdygj6g.clCTlAAG1wr0Ba2EIVYedEcN45wen3O', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"name":"Jane Doe","role":"caretaker"}', 'authenticated', 'authenticated');
  END IF;

  -- Insert profiles (if trigger didn't create them)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = doc_id) THEN
    INSERT INTO profiles (id, name, email, role) VALUES (doc_id, 'Dr. Smith', 'doctor@medsafe.com', 'doctor');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = pat_id) THEN
    INSERT INTO profiles (id, name, email, role, patient_id_code, age, primary_condition)
    VALUES (pat_id, 'John Doe', 'patient@medsafe.com', 'patient', 'MED-9082', 45, 'Hypertension');
  ELSE
    UPDATE profiles SET age = 45, primary_condition = 'Hypertension' WHERE id = pat_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = car_id) THEN
    INSERT INTO profiles (id, name, email, role) VALUES (car_id, 'Jane Doe', 'caretaker@medsafe.com', 'caretaker');
  END IF;

  -- Create caretaker link (accepted)
  IF NOT EXISTS (SELECT 1 FROM caretaker_links WHERE patient_id = pat_id AND caretaker_id = car_id) THEN
    INSERT INTO caretaker_links (patient_id, caretaker_id, status)
    VALUES (pat_id, car_id, 'accepted');
  END IF;

  -- Create prescriptions
  IF NOT EXISTS (SELECT 1 FROM prescriptions WHERE id = presc1) THEN
    INSERT INTO prescriptions (id, patient_id, doctor_id, doctor_name, disease, med_name, dosage, scheduled_time, start_date, end_date, active)
    VALUES (presc1, pat_id, doc_id, 'Dr. Smith', 'Hypertension', 'Amlodipine', '5mg', to_char(now(), 'HH24:MI'), CURRENT_DATE - 30, CURRENT_DATE + 90, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM prescriptions WHERE id = presc2) THEN
    INSERT INTO prescriptions (id, patient_id, doctor_id, doctor_name, disease, med_name, dosage, scheduled_time, start_date, end_date, active)
    VALUES (presc2, pat_id, doc_id, 'Dr. Smith', 'Diabetes', 'Metformin', '500mg', '08:00', CURRENT_DATE - 60, CURRENT_DATE + 120, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM prescriptions WHERE id = presc3) THEN
    INSERT INTO prescriptions (id, patient_id, doctor_id, doctor_name, disease, med_name, dosage, scheduled_time, start_date, end_date, active)
    VALUES (presc3, pat_id, doc_id, 'Dr. Smith', 'High Cholesterol', 'Atorvastatin', '20mg', '20:00', CURRENT_DATE - 45, CURRENT_DATE + 75, true);
  END IF;

  -- Create med_logs for today
  IF NOT EXISTS (SELECT 1 FROM med_logs WHERE prescription_id = presc1 AND log_date = CURRENT_DATE) THEN
    INSERT INTO med_logs (prescription_id, patient_id, scheduled_time, status, log_date)
    VALUES (presc1, pat_id, to_char(now(), 'HH24:MI'), 'pending', CURRENT_DATE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM med_logs WHERE prescription_id = presc2 AND log_date = CURRENT_DATE) THEN
    INSERT INTO med_logs (prescription_id, patient_id, scheduled_time, status, log_date)
    VALUES (presc2, pat_id, '08:00', 'pending', CURRENT_DATE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM med_logs WHERE prescription_id = presc3 AND log_date = CURRENT_DATE) THEN
    INSERT INTO med_logs (prescription_id, patient_id, scheduled_time, status, log_date)
    VALUES (presc3, pat_id, '20:00', 'pending', CURRENT_DATE);
  END IF;

  -- Create prescription history entries
  IF NOT EXISTS (SELECT 1 FROM prescription_history WHERE prescription_id = presc1) THEN
    INSERT INTO prescription_history (prescription_id, doctor_id, action, changes)
    VALUES (presc1, doc_id, 'created', '{"disease":"Hypertension","med_name":"Amlodipine","dosage":"5mg"}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM prescription_history WHERE prescription_id = presc2) THEN
    INSERT INTO prescription_history (prescription_id, doctor_id, action, changes)
    VALUES (presc2, doc_id, 'created', '{"disease":"Diabetes","med_name":"Metformin","dosage":"500mg"}');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM prescription_history WHERE prescription_id = presc3) THEN
    INSERT INTO prescription_history (prescription_id, doctor_id, action, changes)
    VALUES (presc3, doc_id, 'created', '{"disease":"High Cholesterol","med_name":"Atorvastatin","dosage":"20mg"}');
  END IF;
END $$;
