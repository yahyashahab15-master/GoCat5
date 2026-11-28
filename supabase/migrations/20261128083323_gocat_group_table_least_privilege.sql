-- Keep group rows readable to signed-in members only. Membership changes
-- and group creation are performed only by the checked SECURITY DEFINER RPC.
REVOKE ALL ON TABLE public.conversations, public.conversation_members
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.conversations, public.conversation_members
TO authenticated;
