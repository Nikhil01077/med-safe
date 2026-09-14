/*
# Add age, primary_condition to profiles; add log_date to med_logs; enable realtime

1. profiles table changes:
   - Add `age` (integer, nullable) - patient's age
   - Add `primary_condition` (text, nullable) - patient's primary medical condition

2. med_logs table changes:
   - Add `log_date` (date, NOT NULL, default CURRENT_DATE) - the date this log entry is for
   - Add index on (patient_id, log_date) for efficient daily queries

3. Realtime:
   - Add profiles, caretaker_links, prescriptions, med_logs, prescription_history to supabase_realtime publication

4. Trigger:
   - Add updated_at trigger for prescriptions
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_condition text;

ALTER TABLE med_logs ADD COLUMN IF NOT EXISTS log_date date NOT NULL DEFAULT CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_med_logs_log_date ON med_logs(patient_id, log_date);

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE caretaker_links; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE prescriptions; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE med_logs; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE prescription_history; EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prescriptions_updated_at ON prescriptions;
CREATE TRIGGER prescriptions_updated_at
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
