CREATE OR REPLACE FUNCTION private.gocat_voice_pair_allowed(p_user_a text, p_user_b text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_user_a IS NOT NULL AND p_user_b IS NOT NULL AND p_user_a < p_user_b
    AND (SELECT auth.uid())::text IN (p_user_a, p_user_b)
    AND NOT public.is_gocat_banned()
    AND EXISTS (
      SELECT 1 FROM public.users user_a JOIN public.users user_b ON user_b.id = p_user_b
      WHERE user_a.id = p_user_a
        AND COALESCE(user_a.is_banned, false) = false
        AND COALESCE(user_b.is_banned, false) = false
        AND (
          user_a.allow_messages_from = 'everyone'
          OR (user_a.allow_messages_from = 'followers' AND EXISTS (
            SELECT 1 FROM public.follows relation WHERE relation.follower_id = user_b.id AND relation.following_id = user_a.id
          ))
          OR (user_a.allow_messages_from = 'mutuals' AND public.are_mutual_followers(user_b.id, user_a.id))
        )
        AND (
          user_b.allow_messages_from = 'everyone'
          OR (user_b.allow_messages_from = 'followers' AND EXISTS (
            SELECT 1 FROM public.follows relation WHERE relation.follower_id = user_a.id AND relation.following_id = user_b.id
          ))
          OR (user_b.allow_messages_from = 'mutuals' AND public.are_mutual_followers(user_a.id, user_b.id))
        )
        AND EXISTS (
          SELECT 1 FROM public.messages existing_message
          WHERE existing_message.conversation_id IS NULL
            AND (
              (existing_message.sender_id = user_a.id AND existing_message.recipient_id = user_b.id)
              OR (existing_message.sender_id = user_b.id AND existing_message.recipient_id = user_a.id)
            )
        )
    );
$function$;
REVOKE ALL ON FUNCTION private.gocat_voice_pair_allowed(text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.gocat_voice_pair_allowed(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.gocat_voice_realtime_allowed(p_topic text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_parts text[];
  v_user_id text := (SELECT auth.uid())::text;
  v_peer_id text;
  v_user_a text;
  v_user_b text;
BEGIN
  IF v_user_id IS NULL OR public.is_gocat_banned() OR p_action NOT IN ('select', 'insert') THEN
    RETURN false;
  END IF;
  v_parts := string_to_array(COALESCE(p_topic, ''), ':');
  IF cardinality(v_parts) = 2 AND v_parts[1] = 'gocat-voice-inbox' THEN
    v_peer_id := v_parts[2];
    IF p_action = 'select' THEN RETURN v_peer_id = v_user_id; END IF;
    IF v_peer_id = v_user_id THEN RETURN false; END IF;
    v_user_a := LEAST(v_user_id, v_peer_id);
    v_user_b := GREATEST(v_user_id, v_peer_id);
    RETURN private.gocat_voice_pair_allowed(v_user_a, v_user_b);
  END IF;
  IF cardinality(v_parts) = 3 AND v_parts[1] = 'gocat-voice-pair' THEN
    v_user_a := v_parts[2];
    v_user_b := v_parts[3];
    RETURN private.gocat_voice_pair_allowed(v_user_a, v_user_b);
  END IF;
  RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION private.gocat_voice_realtime_allowed(text, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.gocat_voice_realtime_allowed(text, text) TO authenticated;

DROP POLICY IF EXISTS "GoCat voice participants receive private call broadcasts" ON realtime.messages;
CREATE POLICY "GoCat voice participants receive private call broadcasts"
ON realtime.messages FOR SELECT TO authenticated
USING (extension = 'broadcast' AND private.gocat_voice_realtime_allowed((SELECT realtime.topic()), 'select'));

DROP POLICY IF EXISTS "GoCat voice participants send private call broadcasts" ON realtime.messages;
CREATE POLICY "GoCat voice participants send private call broadcasts"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (extension = 'broadcast' AND private.gocat_voice_realtime_allowed((SELECT realtime.topic()), 'insert'));
