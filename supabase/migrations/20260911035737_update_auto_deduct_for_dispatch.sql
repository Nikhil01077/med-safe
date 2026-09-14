-- Update auto_deduct trigger to also deduct on 'dispatch' action
CREATE OR REPLACE FUNCTION public.auto_deduct_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv_id uuid;
BEGIN
  IF NEW.action_type NOT IN ('dispense', 'refill', 'dispatch') THEN
    RETURN NEW;
  END IF;

  SELECT i.id INTO inv_id
  FROM public.inventory i
  JOIN public.prescriptions p ON p.id = NEW.prescription_id
  WHERE lower(i.med_name) = lower(p.med_name)
  LIMIT 1;

  IF inv_id IS NOT NULL THEN
    UPDATE public.inventory
    SET stock_quantity = GREATEST(stock_quantity - 1, 0),
        updated_at = now()
    WHERE id = inv_id;
  END IF;

  RETURN NEW;
END;
$$;
