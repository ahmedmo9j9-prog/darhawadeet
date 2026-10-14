-- DAR HAWADIT: clean, repeatable schema for a NEW Supabase project.
-- No custom PostgreSQL enum types are used, so this script avoids the old user_role already-exists error.
create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'cashier' check (role in ('manager','cashier','warehouse','accountant')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists user_profiles_username_lower_uidx on public.user_profiles (lower(username));
create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  share_percent numeric(7,3) not null default 0 check (share_percent between 0 and 100),
  email text, phone text, notes text, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author_name text,
  isbn text unique,
  barcode text unique,
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  edition text, pages integer, cover_type text,
  publisher text not null default 'دار حواديت', category text,
  min_stock integer not null default 0 check (min_stock >= 0),
  cover_url text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  warehouse_type text not null default 'other' check (warehouse_type in ('main','branch','exhibition','library','other')),
  location text, start_date date, end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.inventory (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  qty integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, book_id)
);
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  book_id uuid not null references public.books(id),
  from_warehouse_id uuid references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  qty integer not null check (qty > 0), movement_type text not null,
  reference_type text, reference_id uuid, user_id uuid references auth.users(id),
  notes text, created_at timestamptz not null default now()
);
create table if not exists public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  warehouse_id uuid not null references public.warehouses(id),
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  counted_cash numeric(12,2),
  expected_cash numeric(12,2),
  cash_difference numeric(12,2),
  status text not null default 'open' check (status in ('open','closed')),
  notes text,
  close_notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists one_open_cashier_shift_per_user on public.cashier_shifts(user_id) where status='open';

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  shift_id uuid references public.cashier_shifts(id),
  warehouse_id uuid references public.warehouses(id),
  cashier_id uuid references auth.users(id),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('نقدي','فيزا','آجل')),
  status text not null default 'completed' check (status in ('completed','cancelled','returned')),
  notes text, created_at timestamptz not null default now()
);
create table if not exists public.invoice_items (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  book_id uuid not null references public.books(id),
  qty integer not null check (qty > 0),
  returned_qty integer not null default 0 check (returned_qty >= 0 and returned_qty <= qty),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  line_total numeric(12,2) generated always as (qty * unit_price) stored
);
create table if not exists public.invoice_returns (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id),
  invoice_item_id bigint not null references public.invoice_items(id), book_id uuid not null references public.books(id),
  shift_id uuid references public.cashier_shifts(id),
  warehouse_id uuid references public.warehouses(id), qty integer not null check (qty > 0),
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  refund_method text not null default 'نقدي' check (refund_method in ('نقدي','فيزا','آجل')),
  reason text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.consignment_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, partner_type text not null default 'مكتبة',
  phone text, email text, address text, notes text, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.consignment_shipments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.consignment_partners(id),
  warehouse_id uuid references public.warehouses(id),
  shipment_date date not null default current_date,
  status text not null default 'open' check (status in ('open','settled','closed')),
  notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.consignment_items (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.consignment_shipments(id) on delete cascade,
  book_id uuid not null references public.books(id),
  sent_qty integer not null default 0 check (sent_qty >= 0),
  sold_qty integer not null default 0 check (sold_qty >= 0),
  returned_qty integer not null default 0 check (returned_qty >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  check (sold_qty + returned_qty <= sent_qty)
);
create table if not exists public.print_orders (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id), qty integer not null check (qty > 0),
  printer text, total_cost numeric(12,2) not null default 0 check (total_cost >= 0),
  warehouse_id uuid references public.warehouses(id),
  status text not null default 'pending' check (status in ('pending','printing','received','cancelled')),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), received_at timestamptz
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null, amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'نقدي' check (payment_method in ('نقدي','فيزا','تحويل بنكي','آجل')),
  shift_id uuid references public.cashier_shifts(id),
  warehouse_id uuid references public.warehouses(id), expense_date date not null default current_date,
  payee text, description text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.custody_transactions (
  id uuid primary key default gen_random_uuid(),
  holder_user_id uuid not null references auth.users(id),
  warehouse_id uuid references public.warehouses(id),
  tx_type text not null check (tx_type in ('صرف عهدة','تسوية عهدة','رد عهدة')),
  amount numeric(12,2) not null check (amount > 0),
  notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);

create index if not exists idx_books_title on public.books using gin(to_tsvector('simple', coalesce(title,'')));
create index if not exists idx_books_isbn on public.books(isbn);
create index if not exists idx_books_barcode on public.books(barcode);
create index if not exists idx_invoice_created_at on public.invoices(created_at desc);
create index if not exists idx_cashier_shifts_opened_at on public.cashier_shifts(opened_at desc);
create index if not exists idx_expenses_date on public.expenses(expense_date desc);
create index if not exists idx_stock_movements_created_at on public.stock_movements(created_at desc);

-- Ensure the default warehouse exists on every run.
insert into public.warehouses(name, warehouse_type, location)
values ('المخزن الرئيسي','main','دار حواديت')
on conflict (name) do nothing;

create or replace function public.touch_book_updated_at() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists books_touch_updated_at on public.books;
create trigger books_touch_updated_at before update on public.books
for each row execute function public.touch_book_updated_at();

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_username text; v_full_name text; v_is_first_setup boolean;
begin
  v_username := coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''), split_part(new.email,'@',1));
  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), v_username);
  -- Only the very first account can be active by default. Later public sign-ups are inactive;
  -- the manager-only Edge Function explicitly activates invited/created employees.
  perform pg_advisory_xact_lock(824770);
  select not exists(select 1 from public.user_profiles) into v_is_first_setup;
  insert into public.user_profiles(id, username, email, full_name, role, active)
  values(new.id, v_username, new.email, v_full_name, 'cashier', v_is_first_setup)
  on conflict (id) do update set email=excluded.email, full_name=excluded.full_name;
  return new;
end $$;
drop trigger if exists on_auth_user_created_dar_hawadit on auth.users;
create trigger on_auth_user_created_dar_hawadit after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.user_profiles where id=auth.uid() and active=true limit 1;
$$;
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.app_role()='manager',false); $$;
create or replace function public.can_manage_stock() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.app_role() in ('manager','warehouse'),false); $$;
create or replace function public.can_manage_finance() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.app_role() in ('manager','accountant'),false); $$;

create or replace function public.bootstrap_manager_available() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists(select 1 from public.user_profiles);
$$;
create or replace function public.bootstrap_first_manager() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user auth.users%rowtype; v_first_profile uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  perform pg_advisory_xact_lock(824771);
  select * into v_user from auth.users where id=auth.uid();
  if not found then raise exception 'حساب الدخول غير موجود'; end if;
  if exists(select 1 from public.user_profiles where role='manager' and active=true) then return false; end if;
  select id into v_first_profile from public.user_profiles order by created_at asc, id asc limit 1;
  if v_first_profile is not null and v_first_profile<>auth.uid() then
    raise exception 'تم بدء إعداد النظام بحساب آخر. لا يمكن لهذا الحساب أن يصبح المدير الأول.';
  end if;
  insert into public.user_profiles(id,username,email,full_name,role,active)
  values(v_user.id,
    lower(coalesce(nullif(trim(v_user.raw_user_meta_data->>'username'),''),split_part(v_user.email,'@',1))),
    v_user.email,
    coalesce(nullif(trim(v_user.raw_user_meta_data->>'full_name'),''),split_part(v_user.email,'@',1)),
    'cashier',true)
  on conflict (id) do nothing;
  if not exists(select 1 from public.user_profiles where id=auth.uid() and active=true) then
    raise exception 'الحساب الأول غير نشط. راجع إدارة المستخدمين.';
  end if;
  update public.user_profiles set role='manager',active=true where id=auth.uid();
  return found;
end $$;

-- Prevent accidentally disabling or demoting the final active manager, including direct API updates.
create or replace function public.keep_one_active_manager() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role='manager' and old.active and (new.role is distinct from 'manager' or new.active=false) then
    if not exists(select 1 from public.user_profiles where id<>old.id and role='manager' and active=true) then
      raise exception 'لا يمكن إيقاف أو تغيير دور آخر مدير نشط. فعّل مديرًا آخر أولًا.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.keep_one_active_manager() from public;
drop trigger if exists protect_active_manager on public.user_profiles;
create trigger protect_active_manager before update of role,active on public.user_profiles
for each row execute function public.keep_one_active_manager();

create sequence if not exists public.invoice_number_seq;
create or replace function public.next_invoice_no() returns text
language sql volatile set search_path=public as $$
  select 'DH-'||to_char(now(),'YYYYMMDD')||'-'||lpad(nextval('public.invoice_number_seq')::text,6,'0');
$$;

create or replace function public.start_cashier_shift(p_warehouse_id uuid,p_opening_cash numeric,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if public.app_role() not in ('manager','cashier') then raise exception 'فتح الوردية متاح للمدير والكاشير فقط'; end if;
  if p_opening_cash is null or p_opening_cash<0 then raise exception 'رصيد بداية الوردية لا يمكن أن يكون سالبًا'; end if;
  if not exists(select 1 from public.warehouses where id=p_warehouse_id and active=true) then raise exception 'المخزن غير موجود أو موقوف'; end if;
  if exists(select 1 from public.cashier_shifts where user_id=auth.uid() and status='open') then raise exception 'لديك وردية مفتوحة بالفعل. أغلقها أولًا.'; end if;
  insert into public.cashier_shifts(user_id,warehouse_id,opening_cash,notes)
  values(auth.uid(),p_warehouse_id,p_opening_cash,nullif(trim(p_notes),'')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.close_cashier_shift(p_shift_id uuid,p_counted_cash numeric,p_close_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_shift public.cashier_shifts%rowtype; v_sales numeric; v_refunds numeric; v_expenses numeric; v_expected numeric;
begin
  if public.app_role() not in ('manager','cashier') then raise exception 'إغلاق الوردية متاح للمدير والكاشير فقط'; end if;
  if p_counted_cash is null or p_counted_cash<0 then raise exception 'قيمة جرد الخزنة غير صحيحة'; end if;
  select * into v_shift from public.cashier_shifts where id=p_shift_id for update;
  if not found then raise exception 'الوردية غير موجودة'; end if;
  if public.app_role()<>'manager' and v_shift.user_id<>auth.uid() then raise exception 'لا يمكنك إغلاق وردية مستخدم آخر'; end if;
  if v_shift.status<>'open' then raise exception 'هذه الوردية مغلقة بالفعل'; end if;
  select coalesce(sum(total),0) into v_sales from public.invoices where shift_id=v_shift.id and payment_method='نقدي' and status in ('completed','returned');
  select coalesce(sum(refund_amount),0) into v_refunds from public.invoice_returns where shift_id=v_shift.id and refund_method='نقدي';
  select coalesce(sum(amount),0) into v_expenses from public.expenses where shift_id=v_shift.id and payment_method='نقدي';
  v_expected:=v_shift.opening_cash+v_sales-v_refunds-v_expenses;
  update public.cashier_shifts set status='closed',closed_at=now(),counted_cash=p_counted_cash,expected_cash=v_expected,cash_difference=p_counted_cash-v_expected,close_notes=nullif(trim(p_close_notes),'') where id=v_shift.id;
  return jsonb_build_object('shift_id',v_shift.id,'expected_cash',v_expected,'counted_cash',p_counted_cash,'cash_difference',p_counted_cash-v_expected,'cash_sales',v_sales,'cash_refunds',v_refunds,'cash_expenses',v_expenses);
end $$;

create or replace function public.cashier_shift_summary(p_limit integer default 100)
returns table(shift_id uuid,user_id uuid,username text,full_name text,warehouse_id uuid,warehouse_name text,opened_at timestamptz,opening_cash numeric,closed_at timestamptz,counted_cash numeric,expected_cash numeric,cash_sales numeric,cash_refunds numeric,cash_expenses numeric,cash_difference numeric,status text,notes text,close_notes text)
language sql stable security definer set search_path=public as $$
 select sh.id,sh.user_id,up.username,up.full_name,sh.warehouse_id,w.name,sh.opened_at,sh.opening_cash,sh.closed_at,sh.counted_cash,
 coalesce(sh.expected_cash,sh.opening_cash+st.cash_sales-rf.cash_refunds-ex.cash_expenses),st.cash_sales,rf.cash_refunds,ex.cash_expenses,sh.cash_difference,sh.status,sh.notes,sh.close_notes
 from public.cashier_shifts sh
 join public.user_profiles up on up.id=sh.user_id
 join public.warehouses w on w.id=sh.warehouse_id
 left join lateral (select coalesce(sum(i.total),0) as cash_sales from public.invoices i where i.shift_id=sh.id and i.payment_method='نقدي' and i.status in ('completed','returned')) st on true
 left join lateral (select coalesce(sum(r.refund_amount),0) as cash_refunds from public.invoice_returns r where r.shift_id=sh.id and r.refund_method='نقدي') rf on true
 left join lateral (select coalesce(sum(e.amount),0) as cash_expenses from public.expenses e where e.shift_id=sh.id and e.payment_method='نقدي') ex on true
 where public.app_role() in ('manager','accountant') or sh.user_id=auth.uid()
 order by sh.opened_at desc limit greatest(1,least(coalesce(p_limit,100),300));
$$;

create or replace function public.set_inventory(p_book_id uuid,p_warehouse_id uuid,p_qty integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_old integer; v_delta integer;
begin
  if not public.can_manage_stock() then raise exception 'ليس لديك صلاحية تعديل المخزون'; end if;
  if p_qty is null or p_qty<0 then raise exception 'الكمية لا يمكن أن تكون أقل من صفر'; end if;
  select qty into v_old from public.inventory where book_id=p_book_id and warehouse_id=p_warehouse_id for update;
  v_old:=coalesce(v_old,0); v_delta:=p_qty-v_old;
  insert into public.inventory(book_id,warehouse_id,qty,updated_at)
  values(p_book_id,p_warehouse_id,p_qty,now())
  on conflict(warehouse_id,book_id) do update set qty=excluded.qty,updated_at=now();
  if v_delta<>0 then
    insert into public.stock_movements(book_id,from_warehouse_id,to_warehouse_id,qty,movement_type,user_id,notes)
    values(p_book_id,case when v_delta<0 then p_warehouse_id else null end,
      case when v_delta>0 then p_warehouse_id else null end,abs(v_delta),
      case when v_delta>0 then 'adjustment_in' else 'adjustment_out' end,auth.uid(),'تعديل الرصيد من شاشة المخزون');
  end if;
end $$;

create or replace function public.transfer_inventory(p_book_id uuid,p_from_warehouse_id uuid,p_to_warehouse_id uuid,p_qty integer,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_qty integer;
begin
  if not public.can_manage_stock() then raise exception 'ليس لديك صلاحية تحويل المخزون'; end if;
  if p_from_warehouse_id=p_to_warehouse_id then raise exception 'اختر مخزنين مختلفين'; end if;
  if p_qty is null or p_qty<=0 then raise exception 'الكمية يجب أن تكون أكبر من صفر'; end if;
  select qty into v_qty from public.inventory where warehouse_id=p_from_warehouse_id and book_id=p_book_id for update;
  v_qty:=coalesce(v_qty,0);
  if v_qty<p_qty then raise exception 'رصيد المخزن المصدر غير كافٍ'; end if;
  update public.inventory set qty=qty-p_qty,updated_at=now() where warehouse_id=p_from_warehouse_id and book_id=p_book_id;
  insert into public.inventory as inv(warehouse_id,book_id,qty,updated_at) values(p_to_warehouse_id,p_book_id,p_qty,now())
  on conflict(warehouse_id,book_id) do update set qty=inv.qty+excluded.qty,updated_at=now();
  insert into public.stock_movements(book_id,from_warehouse_id,to_warehouse_id,qty,movement_type,user_id,notes)
  values(p_book_id,p_from_warehouse_id,p_to_warehouse_id,p_qty,'transfer',auth.uid(),nullif(trim(p_notes),''));
end $$;

create or replace function public.create_sale(p_warehouse_id uuid,p_payment_method text,p_discount numeric,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invoice_id uuid; v_invoice_no text; v_subtotal numeric:=0; v_item jsonb; v_book_id uuid; v_qty integer; v_price numeric; v_cost numeric; v_available integer; v_profile_role text; v_result jsonb; v_shift_id uuid;
begin
  v_profile_role:=public.app_role();
  if v_profile_role not in ('manager','cashier') then raise exception 'ليس لديك صلاحية البيع'; end if;
  select id into v_shift_id from public.cashier_shifts where user_id=auth.uid() and warehouse_id=p_warehouse_id and status='open' for update;
  if v_shift_id is null then raise exception 'افتح وردية للكاشير على هذا المخزن قبل إتمام البيع'; end if;
  if p_payment_method not in ('نقدي','فيزا','آجل') then raise exception 'طريقة الدفع غير صحيحة'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'الفاتورة فارغة'; end if;
  if coalesce(p_discount,0)<0 then raise exception 'الخصم غير صحيح'; end if;
  v_invoice_no:=public.next_invoice_no();
  insert into public.invoices(invoice_no,shift_id,warehouse_id,cashier_id,payment_method,subtotal,discount,total,status)
  values(v_invoice_no,v_shift_id,p_warehouse_id,auth.uid(),p_payment_method,0,0,0,'completed') returning id into v_invoice_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_book_id:=(v_item->>'book_id')::uuid; v_qty:=(v_item->>'qty')::integer;
    if v_qty is null or v_qty<=0 then raise exception 'الكمية غير صحيحة'; end if;
    select sale_price,cost_price into v_price,v_cost from public.books where id=v_book_id and active=true;
    if not found then raise exception 'أحد الكتب غير موجود أو غير نشط'; end if;
    select qty into v_available from public.inventory where warehouse_id=p_warehouse_id and book_id=v_book_id for update;
    v_available:=coalesce(v_available,0);
    if v_available<v_qty then raise exception 'الرصيد غير كافٍ للكتاب: %',v_book_id; end if;
    insert into public.invoice_items(invoice_id,book_id,qty,unit_price,unit_cost) values(v_invoice_id,v_book_id,v_qty,v_price,v_cost);
    update public.inventory set qty=qty-v_qty,updated_at=now() where warehouse_id=p_warehouse_id and book_id=v_book_id;
    insert into public.stock_movements(book_id,from_warehouse_id,qty,movement_type,reference_type,reference_id,user_id)
    values(v_book_id,p_warehouse_id,v_qty,'sale','invoice',v_invoice_id,auth.uid());
    v_subtotal:=v_subtotal+(v_qty*v_price);
  end loop;
  if coalesce(p_discount,0)>v_subtotal then raise exception 'الخصم أكبر من إجمالي الفاتورة'; end if;
  update public.invoices set subtotal=v_subtotal,discount=coalesce(p_discount,0),total=v_subtotal-coalesce(p_discount,0) where id=v_invoice_id;
  select jsonb_build_object(
    'id',i.id,'invoice_no',i.invoice_no,'created_at',i.created_at,'subtotal',i.subtotal,
    'discount',i.discount,'total',i.total,'payment_method',i.payment_method,
    'cashier_id',i.cashier_id,
    'items',coalesce((select jsonb_agg(jsonb_build_object('book_id',ii.book_id,'title',b.title,'qty',ii.qty,'unit_price',ii.unit_price,'line_total',ii.line_total) order by ii.id)
       from public.invoice_items ii join public.books b on b.id=ii.book_id where ii.invoice_id=i.id),'[]'::jsonb)
  ) into v_result from public.invoices i where i.id=v_invoice_id;
  return v_result;
end $$;
create or replace function public.get_invoice_for_print(p_invoice_id uuid) returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object('id',i.id,'invoice_no',i.invoice_no,'created_at',i.created_at,'subtotal',i.subtotal,
   'discount',i.discount,'total',i.total,'payment_method',i.payment_method,'cashier_id',i.cashier_id,
   'items',coalesce((select jsonb_agg(jsonb_build_object('book_id',ii.book_id,'title',b.title,'qty',ii.qty,'unit_price',ii.unit_price,'line_total',ii.line_total) order by ii.id)
   from public.invoice_items ii join public.books b on b.id=ii.book_id where ii.invoice_id=i.id),'[]'::jsonb))
  from public.invoices i where i.id=p_invoice_id
  and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid());
$$;

create or replace function public.create_consignment_shipment(p_partner_id uuid,p_warehouse_id uuid,p_book_id uuid,p_qty integer,p_unit_price numeric,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_stock integer; v_shipment uuid; v_item bigint;
begin
  if public.app_role() not in ('manager','accountant','warehouse') then raise exception 'ليس لديك صلاحية تسجيل الأمانة'; end if;
  if p_qty is null or p_qty<=0 then raise exception 'الكمية يجب أن تكون أكبر من صفر'; end if;
  select qty into v_stock from public.inventory where warehouse_id=p_warehouse_id and book_id=p_book_id for update;
  v_stock:=coalesce(v_stock,0);
  if v_stock<p_qty then raise exception 'الرصيد في المخزن لا يكفي للتسليم'; end if;
  insert into public.consignment_shipments(partner_id,warehouse_id,shipment_date,status,notes,created_by)
  values(p_partner_id,p_warehouse_id,current_date,'open',nullif(trim(p_notes),''),auth.uid()) returning id into v_shipment;
  insert into public.consignment_items(shipment_id,book_id,sent_qty,sold_qty,returned_qty,unit_price)
  values(v_shipment,p_book_id,p_qty,0,0,greatest(0,coalesce(p_unit_price,0))) returning id into v_item;
  update public.inventory set qty=qty-p_qty,updated_at=now() where warehouse_id=p_warehouse_id and book_id=p_book_id;
  insert into public.stock_movements(book_id,from_warehouse_id,qty,movement_type,reference_type,reference_id,user_id,notes)
  values(p_book_id,p_warehouse_id,p_qty,'consignment_out','consignment',v_shipment,auth.uid(),'تسليم أمانة');
  return v_shipment;
end $$;
create or replace function public.settle_consignment_item(p_item_id bigint,p_sold_qty integer,p_returned_qty integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_item public.consignment_items%rowtype; v_ship public.consignment_shipments%rowtype; v_return_delta integer;
begin
  if public.app_role() not in ('manager','accountant','warehouse') then raise exception 'ليس لديك صلاحية تسوية الأمانة'; end if;
  select * into v_item from public.consignment_items where id=p_item_id for update;
  if not found then raise exception 'حركة الأمانة غير موجودة'; end if;
  select * into v_ship from public.consignment_shipments where id=v_item.shipment_id for update;
  if p_sold_qty < v_item.sold_qty or p_returned_qty < v_item.returned_qty then raise exception 'لا يمكن تقليل كميات تسوية سابقة'; end if;
  if p_sold_qty<0 or p_returned_qty<0 or p_sold_qty+p_returned_qty>v_item.sent_qty then raise exception 'المباع والمرتجع أكبر من المسلّم'; end if;
  v_return_delta:=p_returned_qty-v_item.returned_qty;
  update public.consignment_items set sold_qty=p_sold_qty,returned_qty=p_returned_qty where id=p_item_id;
  if v_return_delta>0 then
    insert into public.inventory as inv(warehouse_id,book_id,qty,updated_at) values(v_ship.warehouse_id,v_item.book_id,v_return_delta,now())
    on conflict(warehouse_id,book_id) do update set qty=inv.qty+excluded.qty,updated_at=now();
    insert into public.stock_movements(book_id,to_warehouse_id,qty,movement_type,reference_type,reference_id,user_id,notes)
    values(v_item.book_id,v_ship.warehouse_id,v_return_delta,'consignment_return','consignment',v_ship.id,auth.uid(),'مرتجع أمانة');
  end if;
  if p_sold_qty+p_returned_qty=v_item.sent_qty then update public.consignment_shipments set status='settled' where id=v_ship.id; end if;
end $$;
create or replace function public.receive_print_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_order public.print_orders%rowtype;
begin
  if public.app_role() not in ('manager','accountant','warehouse') then raise exception 'ليس لديك صلاحية استلام الطبعة'; end if;
  select * into v_order from public.print_orders where id=p_order_id for update;
  if not found then raise exception 'أمر الطباعة غير موجود'; end if;
  if v_order.status='received' then raise exception 'تم استلام هذا الأمر سابقًا'; end if;
  if v_order.status='cancelled' then raise exception 'لا يمكن استلام أمر ملغي'; end if;
  if v_order.warehouse_id is null then raise exception 'حدد مخزن الاستلام أولًا'; end if;
  insert into public.inventory as inv(warehouse_id,book_id,qty,updated_at) values(v_order.warehouse_id,v_order.book_id,v_order.qty,now())
  on conflict(warehouse_id,book_id) do update set qty=inv.qty+excluded.qty,updated_at=now();
  insert into public.stock_movements(book_id,to_warehouse_id,qty,movement_type,reference_type,reference_id,user_id,notes)
  values(v_order.book_id,v_order.warehouse_id,v_order.qty,'print_received','print_order',v_order.id,auth.uid(),'استلام طبعة من المطبعة');
  update public.print_orders set status='received',received_at=now() where id=p_order_id;
end $$;
create or replace function public.process_return(p_invoice_id uuid,p_items jsonb,p_refund_method text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invoice public.invoices%rowtype; v_line public.invoice_items%rowtype; v_item jsonb; v_qty integer; v_remaining integer; v_refund numeric:=0; v_net_unit numeric; v_return_id uuid; v_shift_id uuid;
begin
  if public.app_role() not in ('manager','cashier') then raise exception 'ليس لديك صلاحية تسجيل المرتجعات'; end if;
  if p_refund_method not in ('نقدي','فيزا','آجل') then raise exception 'طريقة رد المبلغ غير صحيحة'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'الفاتورة غير موجودة'; end if;
  if public.app_role()<>'manager' and v_invoice.cashier_id<>auth.uid() then raise exception 'لا يمكنك إرجاع فاتورة ليست من ورديتك'; end if;
  if v_invoice.status not in ('completed','returned') then raise exception 'الفاتورة غير مكتملة أو ملغاة'; end if;
  select id into v_shift_id from public.cashier_shifts where user_id=auth.uid() and warehouse_id=v_invoice.warehouse_id and status='open' for update;
  if v_shift_id is null then raise exception 'افتح وردية على مخزن الفاتورة قبل تسجيل المرتجع'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'حدد كمية مرتجعة واحدة على الأقل'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'qty')::integer;
    if v_qty is null or v_qty<=0 then raise exception 'كمية المرتجع غير صحيحة'; end if;
    select * into v_line from public.invoice_items where id=(v_item->>'invoice_item_id')::bigint and invoice_id=p_invoice_id for update;
    if not found then raise exception 'أحد أصناف الفاتورة غير موجود'; end if;
    v_remaining:=v_line.qty-v_line.returned_qty;
    if v_qty>v_remaining then raise exception 'كمية المرتجع أكبر من المتبقي للكتاب'; end if;
    v_net_unit:=case when v_invoice.subtotal>0 then v_line.unit_price*(v_invoice.total/v_invoice.subtotal) else v_line.unit_price end;
    insert into public.invoice_returns(invoice_id,invoice_item_id,book_id,shift_id,warehouse_id,qty,refund_amount,refund_method,reason,created_by)
    values(p_invoice_id,v_line.id,v_line.book_id,v_shift_id,v_invoice.warehouse_id,v_qty,round(v_net_unit*v_qty,2),p_refund_method,nullif(trim(p_reason),''),auth.uid()) returning id into v_return_id;
    update public.invoice_items set returned_qty=returned_qty+v_qty where id=v_line.id;
    insert into public.inventory as inv(warehouse_id,book_id,qty,updated_at) values(v_invoice.warehouse_id,v_line.book_id,v_qty,now())
    on conflict(warehouse_id,book_id) do update set qty=inv.qty+excluded.qty,updated_at=now();
    insert into public.stock_movements(book_id,to_warehouse_id,qty,movement_type,reference_type,reference_id,user_id,notes)
    values(v_line.book_id,v_invoice.warehouse_id,v_qty,'sales_return','invoice_return',v_return_id,auth.uid(),'مرتجع فاتورة');
    v_refund:=v_refund+round(v_net_unit*v_qty,2);
  end loop;
  if not exists(select 1 from public.invoice_items where invoice_id=p_invoice_id and returned_qty<qty) then
    update public.invoices set status='returned' where id=p_invoice_id;
  end if;
  return jsonb_build_object('invoice_no',v_invoice.invoice_no,'refund_total',v_refund,'refund_method',p_refund_method);
end $$;

drop function if exists public.record_expense(text,numeric,text,uuid,date,text,text);
create or replace function public.record_expense(p_category text,p_amount numeric,p_payment_method text,p_warehouse_id uuid,p_expense_date date,p_payee text,p_description text,p_shift_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_shift_id uuid:=p_shift_id; v_shift_warehouse uuid;
begin
  if not public.can_manage_finance() then raise exception 'ليس لديك صلاحية تسجيل المصروفات'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف يجب أن تكون أكبر من صفر'; end if;
  if p_payment_method not in ('نقدي','فيزا','تحويل بنكي','آجل') then raise exception 'طريقة الدفع غير صحيحة'; end if;
  if v_shift_id is not null then
    if p_payment_method<>'نقدي' then raise exception 'ربط الوردية متاح للمصروفات النقدية فقط'; end if;
    select warehouse_id into v_shift_warehouse from public.cashier_shifts where id=v_shift_id and status='open';
    if not found then raise exception 'الوردية المختارة غير موجودة أو مغلقة'; end if;
    if p_warehouse_id is not null and p_warehouse_id<>v_shift_warehouse then raise exception 'المخزن المحدد لا يطابق مخزن الوردية'; end if;
    p_warehouse_id:=coalesce(p_warehouse_id,v_shift_warehouse);
  elsif p_payment_method='نقدي' and p_warehouse_id is not null then
    select id into v_shift_id from public.cashier_shifts where user_id=auth.uid() and warehouse_id=p_warehouse_id and status='open' order by opened_at desc limit 1;
  end if;
  insert into public.expenses(category,amount,payment_method,shift_id,warehouse_id,expense_date,payee,description,created_by)
  values(nullif(trim(p_category),''),p_amount,p_payment_method,v_shift_id,p_warehouse_id,coalesce(p_expense_date,current_date),nullif(trim(p_payee),''),nullif(trim(p_description),''),auth.uid())
  returning id into v_id;
  return v_id;
end $$;
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_shift_id uuid;
begin
  if not public.can_manage_finance() then raise exception 'ليس لديك صلاحية تسجيل المصروفات'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة المصروف يجب أن تكون أكبر من صفر'; end if;
  if p_payment_method not in ('نقدي','فيزا','تحويل بنكي','آجل') then raise exception 'طريقة الدفع غير صحيحة'; end if;
  if p_payment_method='نقدي' and p_warehouse_id is not null then
    select id into v_shift_id from public.cashier_shifts where user_id=auth.uid() and warehouse_id=p_warehouse_id and status='open' limit 1;
  end if;
  insert into public.expenses(category,amount,payment_method,shift_id,warehouse_id,expense_date,payee,description,created_by)
  values(nullif(trim(p_category),''),p_amount,p_payment_method,v_shift_id,p_warehouse_id,coalesce(p_expense_date,current_date),nullif(trim(p_payee),''),nullif(trim(p_description),''),auth.uid())
  returning id into v_id;
  return v_id;
end $$;
create or replace function public.record_custody_issue(p_holder_user_id uuid,p_warehouse_id uuid,p_amount numeric,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.can_manage_finance() then raise exception 'ليس لديك صلاحية صرف العهدة'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'قيمة العهدة يجب أن تكون أكبر من صفر'; end if;
  insert into public.custody_transactions(holder_user_id,warehouse_id,tx_type,amount,notes,created_by)
  values(p_holder_user_id,p_warehouse_id,'صرف عهدة',p_amount,nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  return v_id;
end $$;
create or replace function public.record_custody_settlement(p_holder_user_id uuid,p_warehouse_id uuid,p_amount numeric,p_tx_type text,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_balance numeric;
begin
  if not public.can_manage_finance() then raise exception 'ليس لديك صلاحية تسوية العهدة'; end if;
  if p_tx_type not in ('تسوية عهدة','رد عهدة') then raise exception 'نوع الحركة غير صحيح'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'القيمة يجب أن تكون أكبر من صفر'; end if;
  select coalesce(sum(case when tx_type='صرف عهدة' then amount else -amount end),0) into v_balance
  from public.custody_transactions where holder_user_id=p_holder_user_id;
  if p_amount>v_balance then raise exception 'المبلغ أكبر من رصيد العهدة الحالي'; end if;
  insert into public.custody_transactions(holder_user_id,warehouse_id,tx_type,amount,notes,created_by)
  values(p_holder_user_id,p_warehouse_id,p_tx_type,p_amount,nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  return v_id;
end $$;
create or replace function public.custody_balances()
returns table(user_id uuid,username text,full_name text,issued numeric,settled numeric,balance numeric)
language sql security definer set search_path=public as $$
 select u.id,u.username,u.full_name,
 coalesce(sum(case when c.tx_type='صرف عهدة' then c.amount else 0 end),0),
 coalesce(sum(case when c.tx_type<>'صرف عهدة' then c.amount else 0 end),0),
 coalesce(sum(case when c.tx_type='صرف عهدة' then c.amount else -c.amount end),0)
 from public.user_profiles u left join public.custody_transactions c on c.holder_user_id=u.id
 where public.can_manage_finance() and u.active=true group by u.id,u.username,u.full_name order by u.full_name;
$$;
create or replace function public.dashboard_summary()
returns table(sales_today numeric,invoices_today bigint,books_sold_today bigint,stock_value numeric,expenses_today numeric,custody_outstanding numeric)
language sql security definer set search_path=public as $$
 select
  (coalesce((select sum(i.total) from public.invoices i where i.created_at::date=current_date and i.status in ('completed','returned') and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())),0)
   - case when public.app_role() in ('manager','accountant') then coalesce((select sum(r.refund_amount) from public.invoice_returns r where r.created_at::date=current_date),0) else coalesce((select sum(r.refund_amount) from public.invoice_returns r where r.created_by=auth.uid() and r.created_at::date=current_date),0) end),
  coalesce((select count(*) from public.invoices i where i.created_at::date=current_date and i.status in ('completed','returned') and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())),0),
  coalesce((select sum(ii.qty-ii.returned_qty) from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id where i.created_at::date=current_date and i.status in ('completed','returned') and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())),0),
  case when public.app_role() in ('manager','accountant','warehouse') then coalesce((select sum(inv.qty*b.cost_price) from public.inventory inv join public.books b on b.id=inv.book_id),0) else 0 end,
  case when public.can_manage_finance() then coalesce((select sum(amount) from public.expenses where expense_date=current_date),0) else 0 end,
  case when public.can_manage_finance() then coalesce((select sum(case when tx_type='صرف عهدة' then amount else -amount end) from public.custody_transactions),0) else 0 end;
$$;
create or replace function public.top_books(p_limit integer default 8)
returns table(title text,qty bigint,sales numeric) language sql security definer set search_path=public as $$
 select b.title,sum(ii.qty-ii.returned_qty)::bigint,sum(ii.line_total * (ii.qty-ii.returned_qty)::numeric / greatest(ii.qty,1)) from public.invoice_items ii join public.books b on b.id=ii.book_id join public.invoices i on i.id=ii.invoice_id
 where i.status in ('completed','returned') and ii.qty>ii.returned_qty and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())
 group by b.title order by sum(ii.qty) desc limit greatest(1,p_limit);
$$;
create or replace function public.low_stock(p_warehouse_id uuid default null,p_limit integer default 20)
returns table(book_id uuid,title text,qty bigint,min_stock integer) language sql security definer set search_path=public as $$
 select b.id,b.title,coalesce(sum(inv.qty),0)::bigint,b.min_stock from public.books b
 left join public.inventory inv on inv.book_id=b.id and (p_warehouse_id is null or inv.warehouse_id=p_warehouse_id)
 where b.active=true and public.app_role() is not null group by b.id,b.title,b.min_stock having coalesce(sum(inv.qty),0)<=b.min_stock
 order by coalesce(sum(inv.qty),0) asc limit greatest(1,p_limit);
$$;
drop function if exists public.report_summary();
create function public.report_summary()
returns table(total_sales numeric,invoice_count bigint,returns_total numeric,gross_profit numeric,expenses_total numeric,net_cash numeric,custody_outstanding numeric)
language sql security definer set search_path=public as $$
 select
  coalesce((select sum(i.total) from public.invoices i where i.status in ('completed','returned') and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())),0),
  coalesce((select count(*) from public.invoices i where i.status in ('completed','returned') and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())),0),
  case when public.app_role() in ('manager','accountant') then coalesce((select sum(r.refund_amount) from public.invoice_returns r),0) else coalesce((select sum(r.refund_amount) from public.invoice_returns r where r.created_by=auth.uid()),0) end,
  coalesce((select sum(((ii.qty-ii.returned_qty)*ii.unit_price*case when i.subtotal>0 then i.total/i.subtotal else 1 end)-((ii.qty-ii.returned_qty)*ii.unit_cost))
    from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id
    where i.status in ('completed','returned') and ii.qty>ii.returned_qty and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())),0),
  case when public.can_manage_finance() then coalesce((select sum(e.amount) from public.expenses e),0) else 0 end,
  coalesce((select sum(i.total) from public.invoices i where i.status in ('completed','returned') and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())),0)
   - case when public.app_role() in ('manager','accountant') then coalesce((select sum(r.refund_amount) from public.invoice_returns r),0) else coalesce((select sum(r.refund_amount) from public.invoice_returns r where r.created_by=auth.uid()),0) end
   - case when public.can_manage_finance() then coalesce((select sum(e.amount) from public.expenses e where e.payment_method='نقدي'),0) else 0 end,
  case when public.can_manage_finance() then coalesce((select sum(case when c.tx_type='صرف عهدة' then c.amount else -c.amount end) from public.custody_transactions c),0) else 0 end;
$$;

-- RLS: explicitly drop named policies first, so a re-run will not stop at "policy already exists".
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN
  ('user_profiles','authors','books','warehouses','inventory','stock_movements','cashier_shifts','invoices','invoice_items','invoice_returns','consignment_partners','consignment_shipments','consignment_items','print_orders','expenses','custody_transactions')
  LOOP EXECUTE format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); END LOOP;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['user_profiles','authors','books','warehouses','inventory','stock_movements','cashier_shifts','invoices','invoice_items','invoice_returns','consignment_partners','consignment_shipments','consignment_items','print_orders','expenses','custody_transactions'] LOOP
    EXECUTE format('alter table public.%I enable row level security',t);
  END LOOP;
END $$;

create policy profile_read on public.user_profiles for select to authenticated using (id=auth.uid() or public.is_manager() or public.can_manage_finance());
create policy profile_manager_update on public.user_profiles for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy authors_read on public.authors for select to authenticated using (true);
create policy authors_write on public.authors for all to authenticated using (public.app_role() in ('manager','accountant')) with check (public.app_role() in ('manager','accountant'));
create policy books_read on public.books for select to authenticated using (true);
create policy books_write on public.books for all to authenticated using (public.can_manage_stock()) with check (public.can_manage_stock());
create policy warehouses_read on public.warehouses for select to authenticated using (true);
create policy warehouses_write on public.warehouses for all to authenticated using (public.app_role() in ('manager','warehouse')) with check (public.app_role() in ('manager','warehouse'));
create policy inventory_read on public.inventory for select to authenticated using (true);
create policy stock_movements_read on public.stock_movements for select to authenticated using (public.app_role() in ('manager','accountant','warehouse'));
create policy cashier_shifts_read on public.cashier_shifts for select to authenticated using (user_id=auth.uid() or public.app_role() in ('manager','accountant'));
create policy invoices_read on public.invoices for select to authenticated using (public.app_role() in ('manager','accountant') or cashier_id=auth.uid());
create policy invoice_items_read on public.invoice_items for select to authenticated using (exists(select 1 from public.invoices i where i.id=invoice_id and (public.app_role() in ('manager','accountant') or i.cashier_id=auth.uid())));
create policy invoice_returns_read on public.invoice_returns for select to authenticated using (public.app_role() in ('manager','accountant') or created_by=auth.uid());
create policy consignment_partners_read on public.consignment_partners for select to authenticated using (public.app_role() in ('manager','accountant','warehouse'));
create policy consignment_partners_write on public.consignment_partners for all to authenticated using (public.app_role() in ('manager','accountant','warehouse')) with check (public.app_role() in ('manager','accountant','warehouse'));
create policy consignment_shipments_read on public.consignment_shipments for select to authenticated using (public.app_role() in ('manager','accountant','warehouse'));
create policy consignment_shipments_write on public.consignment_shipments for insert to authenticated with check (public.app_role() in ('manager','accountant','warehouse'));
create policy consignment_shipments_update on public.consignment_shipments for update to authenticated using (public.app_role() in ('manager','accountant','warehouse')) with check (public.app_role() in ('manager','accountant','warehouse'));
create policy consignment_items_read on public.consignment_items for select to authenticated using (public.app_role() in ('manager','accountant','warehouse'));
create policy consignment_items_write on public.consignment_items for all to authenticated using (public.app_role() in ('manager','accountant','warehouse')) with check (public.app_role() in ('manager','accountant','warehouse'));
create policy print_orders_read on public.print_orders for select to authenticated using (public.app_role() in ('manager','accountant','warehouse'));
create policy print_orders_write on public.print_orders for all to authenticated using (public.app_role() in ('manager','accountant','warehouse')) with check (public.app_role() in ('manager','accountant','warehouse'));
create policy expenses_read on public.expenses for select to authenticated using (public.can_manage_finance());
create policy expenses_update_delete on public.expenses for update to authenticated using (public.is_manager() or public.app_role()='accountant') with check (public.is_manager() or public.app_role()='accountant');
create policy expenses_delete on public.expenses for delete to authenticated using (public.is_manager() or public.app_role()='accountant');
create policy custody_read on public.custody_transactions for select to authenticated using (public.can_manage_finance() or holder_user_id=auth.uid());

-- Functions default to EXECUTE for PUBLIC in PostgreSQL; revoke that default for all data/management RPCs.
-- The bootstrap availability check alone intentionally remains callable before sign-in.
revoke all on function public.handle_new_auth_user() from public, anon;
revoke all on function public.app_role() from public, anon;
revoke all on function public.is_manager() from public, anon;
revoke all on function public.can_manage_stock() from public, anon;
revoke all on function public.can_manage_finance() from public, anon;
revoke all on function public.bootstrap_first_manager() from public, anon;
revoke all on function public.keep_one_active_manager() from public, anon;
revoke all on function public.next_invoice_no() from public, anon;
revoke all on function public.start_cashier_shift(uuid,numeric,text) from public, anon;
revoke all on function public.close_cashier_shift(uuid,numeric,text) from public, anon;
revoke all on function public.cashier_shift_summary(integer) from public, anon;
revoke all on function public.set_inventory(uuid,uuid,integer) from public, anon;
revoke all on function public.transfer_inventory(uuid,uuid,uuid,integer,text) from public, anon;
revoke all on function public.create_sale(uuid,text,numeric,jsonb) from public, anon;
revoke all on function public.get_invoice_for_print(uuid) from public, anon;
revoke all on function public.create_consignment_shipment(uuid,uuid,uuid,integer,numeric,text) from public, anon;
revoke all on function public.settle_consignment_item(bigint,integer,integer) from public, anon;
revoke all on function public.receive_print_order(uuid) from public, anon;
revoke all on function public.process_return(uuid,jsonb,text,text) from public, anon;
revoke all on function public.record_expense(text,numeric,text,uuid,date,text,text,uuid) from public, anon;
revoke all on function public.record_custody_issue(uuid,uuid,numeric,text) from public, anon;
revoke all on function public.record_custody_settlement(uuid,uuid,numeric,text,text) from public, anon;
revoke all on function public.custody_balances() from public, anon;
revoke all on function public.dashboard_summary() from public, anon;
revoke all on function public.top_books(integer) from public, anon;
revoke all on function public.low_stock(uuid,integer) from public, anon;
revoke all on function public.report_summary() from public, anon;

-- API grants plus RLS policy enforcement. No service/secret key is required in the browser.
grant usage on schema public to anon, authenticated;
grant select on public.user_profiles,public.authors,public.books,public.warehouses,public.inventory,public.stock_movements,public.cashier_shifts,public.invoices,public.invoice_items,public.invoice_returns,public.consignment_partners,public.consignment_shipments,public.consignment_items,public.print_orders,public.expenses,public.custody_transactions to authenticated;
grant insert,update,delete on public.books,public.warehouses,public.authors,public.consignment_partners,public.consignment_shipments,public.consignment_items,public.print_orders,public.expenses to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke all on function public.handle_new_auth_user() from public;
grant execute on function public.app_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.can_manage_stock() to authenticated;
grant execute on function public.can_manage_finance() to authenticated;
grant execute on function public.bootstrap_manager_available() to anon,authenticated;
grant execute on function public.bootstrap_first_manager() to authenticated;
grant execute on function public.start_cashier_shift(uuid,numeric,text) to authenticated;
grant execute on function public.close_cashier_shift(uuid,numeric,text) to authenticated;
grant execute on function public.cashier_shift_summary(integer) to authenticated;
grant execute on function public.set_inventory(uuid,uuid,integer) to authenticated;
grant execute on function public.create_consignment_shipment(uuid,uuid,uuid,integer,numeric,text) to authenticated;
grant execute on function public.settle_consignment_item(bigint,integer,integer) to authenticated;
grant execute on function public.receive_print_order(uuid) to authenticated;
grant execute on function public.process_return(uuid,jsonb,text,text) to authenticated;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,integer,text) to authenticated;
grant execute on function public.create_sale(uuid,text,numeric,jsonb) to authenticated;
grant execute on function public.get_invoice_for_print(uuid) to authenticated;
grant execute on function public.record_expense(text,numeric,text,uuid,date,text,text,uuid) to authenticated;
grant execute on function public.record_custody_issue(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.record_custody_settlement(uuid,uuid,numeric,text,text) to authenticated;
grant execute on function public.custody_balances() to authenticated;
grant execute on function public.dashboard_summary() to authenticated;
grant execute on function public.top_books(integer) to authenticated;
grant execute on function public.low_stock(uuid,integer) to authenticated;
grant execute on function public.report_summary() to authenticated;

-- Try enabling realtime for shared cross-device updates. Ignore if publication/table already exists.
DO $$ DECLARE t text; BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['books','inventory','cashier_shifts','invoices','invoice_returns','expenses','custody_transactions','warehouses','authors','consignment_shipments','consignment_items','print_orders'] LOOP
      BEGIN EXECUTE format('alter publication supabase_realtime add table public.%I',t);
      EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
    END LOOP;
  END IF;
END $$;

-- After successful setup, create first manager via the site's sign-up screen. No default username/password exists.
