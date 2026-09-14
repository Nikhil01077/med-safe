/*
# Pharmacist interlinking + notifications

1. Add action_type to dispensations (dispense, refill, check, supply)
2. Create pharmacy_links table: pharmacist <-> patient (with auto-linked doctor)
3. Create pharmacist_notifications table: notifies pharmacists when a linked patient's prescriptions change
4. Add trigger on prescriptions to auto-create notifications for linked pharmacists
5. Enable RLS on both new tables
6. Enable realtime on both new tables
*/

-- 1. Add action_type to dispensations
ALTER TABLE public.dispensations
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'dispense';
ALTER TABLE public.dispensations
  DROP CONSTRAINT IF EXISTS dispensations_action_type_check;
ALTER TABLE public.dispensations
  ADD CONSTRAINT dispensations_action_type_check
  CHECK (action_type IN ('dispense', 'refill', 'check', 'supply'));

-- 2. Create pharmacy_links table
CREATE TABLE IF NOT EXISTS public.pharmacy_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacist_id, patient_id)
);

ALTER TABLE public.pharmacy_links
  DROP CONSTRAINT IF EXISTS pharmacy_links_status_check;
ALTER TABLE public.pharmacy_links
  ADD CONSTRAINT pharmacy_links_status_check
  CHECK (status IN ('active', 'removed'));

-- RLS for pharmacy_links
ALTER TABLE public.pharmacy_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_pharmacy_links" ON public.pharmacy_links
  FOR SELECT TO authenticated
  USING (auth.uid() = pharmacist_id);

CREATE POLICY "insert_own_pharmacy_links" ON public.pharmacy_links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = pharmacist_id);

CREATE POLICY "update_own_pharmacy_links" ON public.pharmacy_links
  FOR UPDATE TO authenticated
  USING (auth.uid() = pharmacist_id)
  WITH CHECK (auth.uid() = pharmacist_id);

CREATE POLICY "delete_own_pharmacy_links" ON public.pharmacy_links
  FOR DELETE TO authenticated
  USING (auth.uid() = pharmacist_id);

-- Patients can see which pharmacists are linked to them
CREATE POLICY "select_patient_pharmacy_links" ON public.pharmacy_links
  FOR SELECT TO authenticated
  USING (auth.uid() = patient_id);

-- 3. Create pharmacist_notifications table
CREATE TABLE IF NOT EXISTS public.pharmacist_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  doctor_name text,
  med_name text,
  action text NOT NULL,
  message text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for pharmacist_notifications
ALTER TABLE public.pharmacist_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_notifications" ON public.pharmacist_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = pharmacist_id);

CREATE POLICY "update_own_notifications" ON public.pharmacist_notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = pharmacist_id)
  WITH CHECK (auth.uid() = pharmacist_id);

-- 4. Trigger function: notify linked pharmacists when a prescription changes
CREATE OR REPLACE FUNCTION public.notify_pharmacists_on_rx_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  link RECORD;
  action_text text;
  msg text;
  doc_id uuid;
  doc_name text;
  med_name text;
BEGIN
  -- Determine action text
  IF TG_OP = 'INSERT' THEN
    action_text := 'created';
    doc_id := NEW.doctor_id;
    doc_name := NEW.doctor_name;
    med_name := NEW.med_name;
    msg := 'New prescription: ' || NEW.med_name || ' ' || NEW.dosage || ' for patient';
  ELSIF TG_OP = 'UPDATE' THEN
    action_text := 'updated';
    doc_id := NEW.doctor_id;
    doc_name := NEW.doctor_name;
    med_name := NEW.med_name;
    msg := 'Prescription updated: ' || NEW.med_name || ' ' || NEW.dosage;
  ELSIF TG_OP = 'DELETE' THEN
    action_text := 'deactivated';
    doc_id := OLD.doctor_id;
    doc_name := OLD.doctor_name;
    med_name := OLD.med_name;
    msg := 'Prescription removed: ' || OLD.med_name || ' ' || OLD.dosage;
    RETURN OLD;
  END IF;

  -- Insert notifications for all pharmacists linked to this patient
  FOR link IN
    SELECT * FROM public.pharmacy_links
    WHERE patient_id = NEW.patient_id AND status = 'active'
  LOOP
    INSERT INTO public.pharmacist_notifications
      (pharmacist_id, patient_id, prescription_id, doctor_id, doctor_name, med_name, action, message)
    VALUES
      (link.pharmacist_id, NEW.patient_id, NEW.id, doc_id, doc_name, med_name, action_text, msg);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Triggers on prescriptions
DROP TRIGGER IF EXISTS rx_notify_pharmacist_insert ON public.prescriptions;
DROP TRIGGER IF EXISTS rx_notify_pharmacist_update ON public.prescriptions;

CREATE TRIGGER rx_notify_pharmacist_insert
  AFTER INSERT ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_pharmacists_on_rx_change();

CREATE TRIGGER rx_notify_pharmacist_update
  AFTER UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_pharmacists_on_rx_change();

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacist_notifications;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_pharmacy_links_pharmacist ON public.pharmacy_links(pharmacist_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_links_patient ON public.pharmacy_links(patient_id);
CREATE INDEX IF NOT EXISTS idx_notif_pharmacist ON public.pharmacist_notifications(pharmacist_id);
CREATE INDEX IF NOT EXISTS idx_notif_read ON public.pharmacist_notifications(read);
