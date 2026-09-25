-- Remove the legacy overloaded customer-creation RPC so PostgREST can resolve the named parameters unambiguously.
DROP FUNCTION IF EXISTS public.admin_create_customer_mailbox(text,text,text,text,text,date,text,text,text,text,text);
NOTIFY pgrst, 'reload schema';
