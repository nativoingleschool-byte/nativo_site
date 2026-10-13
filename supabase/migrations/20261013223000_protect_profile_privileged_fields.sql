-- Prevent ordinary users from escalating roles or changing school-controlled billing fields.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_is_admin boolean;
BEGIN
  IF caller_id IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=caller_id AND p.role='admin' AND COALESCE(p.archived,false)=false
  ) INTO caller_is_admin;
  IF caller_is_admin THEN RETURN NEW; END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.archived IS DISTINCT FROM OLD.archived
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.taxa_hora_aula IS DISTINCT FROM OLD.taxa_hora_aula
    OR NEW.moeda_taxa IS DISTINCT FROM OLD.moeda_taxa
    OR NEW.tuition_fee IS DISTINCT FROM OLD.tuition_fee
    OR NEW.status_pagamento IS DISTINCT FROM OLD.status_pagamento
    OR NEW.status_pagamento_professor IS DISTINCT FROM OLD.status_pagamento_professor
    OR NEW.data_pagamento_preferencial IS DISTINCT FROM OLD.data_pagamento_preferencial
  THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar dados administrativos do perfil.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_privileged_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_privileged_fields_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();