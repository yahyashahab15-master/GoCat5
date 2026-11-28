REVOKE SELECT (allow_voice_calls_from) ON public.users FROM authenticated;
CREATE OR REPLACE FUNCTION public.gocat_get_my_voice_call_privacy()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT user_row.allow_voice_calls_from
  FROM public.users AS user_row
  WHERE user_row.id = (SELECT auth.uid())::text
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.gocat_get_my_voice_call_privacy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gocat_get_my_voice_call_privacy() TO authenticated;
