-- SHOPATUT / MangaBEART: HARDENING READ-ONLY (NOT APPLIED)
-- Review against current database grants and test in a non-production project before running.
-- This script is deliberately kept outside supabase/migrations so it cannot be applied
-- automatically by the normal migration flow.
--
-- Desired invariant: the application may read business data only from
-- public.excel_sync_runs / public.excel_sync_sheets; authenticated users must not mutate
-- business tables or call their SECURITY DEFINER mutation RPCs. Keep authentication,
-- profile edits, `update_my_shipping_address`, and `push_subscriptions` unaffected.

begin;

-- Remove direct DML rights from clients for business tables. The `service_role` server-side
-- staging reader is not part of this role list and retains its administrative access.
revoke insert, update, delete, truncate, references, trigger on table
  public.articles,
  public.article_assignments,
  public.movements,
  public.payments,
  public.payment_allocations,
  public.credits,
  public.mailboxes,
  public.customers,
  public.shipments,
  public.shipment_items
from public, anon, authenticated;

-- Disable business mutation RPCs by function name, regardless of overload signature.
-- The shipping-address/profile-edit RPC is intentionally excluded.
do $readonly$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'admin_cancel_credit',
        'admin_cancel_payment',
        'admin_create_article',
        'admin_create_customer_credit',
        'admin_create_customer_mailbox',
        'admin_create_mailbox_for_auth_user',
        'admin_delete_article',
        'admin_delete_articles',
        'admin_delete_customer',
        'admin_delete_customer_payment',
        'admin_delete_customer_sale',
        'admin_mark_customer_articles_in_box',
        'admin_restore_article',
        'admin_restore_cancelled_movement',
        'admin_restore_shipment',
        'admin_update_customer_code',
        'admin_update_customer_credit',
        'admin_update_customer_payment',
        'admin_update_customer_payment_v2',
        'admin_update_customer_sale',
        'cancel_article_sale',
        'cancel_customer_shipment',
        'recalculate_article_costs',
        'register_article_arrival',
        'register_article_sales',
        'register_customer_payment'
      ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
  end loop;
end
$readonly$;

commit;
