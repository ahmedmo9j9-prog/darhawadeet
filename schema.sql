create extension if not exists pgcrypto;

create type public.user_role as enum ('manager','cashier','warehouse','accountant');
create type public.warehouse_type as enum ('main','branch','exhibition','other');
create type public.invoice_payment as enum ('نقدي','فيزا','آجل');
create type public.expense_payment as enum ('نقدي','فيزا','تحويل بنكي','آجل');
create type public.custody_tx_type as enum ('صرف عهدة','تسوية عهدة','رد عهدة');

create table if not exists public.user_profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text unique not null,
  full_name text not null,
  role public.user_role not null default 'cashier',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.authors(
  id uuid primary key default gen_random_uuid(), name text not null unique,
  share_percent numeric(7,3) not null default 0, phone text, active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.books(
  id uuid primary key default gen_random_uuid(), title text not null,
  author_id uuid references public.authors(id) on delete set null,
  isbn text unique, barcode text unique, sale_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0, edition text, pages integer,
  cover_type text, publisher text default 'دار حواديت', category text,
  min_stock integer not null default 0, cover_url text, notes text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.warehouses(
  id uuid primary key default gen_random_uuid(), name text not null unique,
  type public.warehouse_type not null default 'other', location text,
  start_date date, end_date date, active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory(
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  qty integer not null default 0 check(qty>=0),
  primary key(warehouse_id,book_id)
);

create table if not exists public.stock_movements(
  id bigint generated always as identity primary key, book_id uuid not null references public.books(id),
  from_warehouse_id uuid references public.warehouses(id), to_warehouse_id uuid references public.warehouses(id),
  qty integer not null, movement_type text not null, reference_type text, reference_id uuid,
  user_id uuid references auth.users(id), notes text, created_at timestamptz not null default now()
);

create table if not exists public.invoices(
  id uuid primary key default gen_random_uuid(), invoice_no text unique not null,
  warehouse_id uuid references public.warehouses(id), cashier_id uuid references auth.users(id),
  subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0, payment_method public.invoice_payment not null,
  status text not null default 'paid', created_at timestamptz not null default now()
);

create table if not exists public.invoice_items(
  id bigint generated always as identity primary key, invoice_id uuid not null references public.invoices(id) on delete cascade,
  book_id uuid not null references public.books(id), qty integer not null, unit_price numeric(12,2) not null,
  line_total numeric(12,2) generated always as (qty*unit_price) stored
);

create table if not exists public.consignment_partners(
  id uuid primary key default gen_random_uuid(), name text not null unique, phone text,
  commission_percent numeric(7,3) not null default 0, notes text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.consignment_shipments(
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.consignment_partners(id),
  warehouse_id uuid references public.warehouses(id), shipment_date date not null default current_date,
  status text not null default 'open', notes text, created_at timestamptz not null default now()
);
create table if not exists public.consignment_items(
  id bigint generated always as identity primary key, shipment_id uuid not null references public.consignment_shipments(id) on delete cascade,
  book_id uuid not null references public.books(id), sent_qty integer not null default 0, sold_qty integer not null default 0,
  returned_qty integer not null default 0, unit_price numeric(12,2) not null default 0
);

create table if not exists public.expenses(
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric(12,2) not null check(amount>0),
  payment_method public.expense_payment not null default 'نقدي',
  warehouse_id uuid references public.warehouses(id),
  expense_date date not null default current_date,
  payee text,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.custody_transactions(
  id uuid primary key default gen_random_uuid(),
  holder_user_id uuid not null references auth.users(id),
  warehouse_id uuid references public.warehouses(id),
  tx_type public.custody_tx_type not null,
  amount numeric(12,2) not null check(amount>0),
  expense_id uuid references public.expenses(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expenses(expense_date desc);
create index if not exists idx_custody_created on public.custody_transactions(created_at desc);

create table if not exists public.print_orders(
  id uuid primary key default gen_random_uuid(), book_id uuid not null references public.books(id),
  qty integer not null, printer text, total_cost numeric(12,2) not null default 0,
  warehouse_id uuid references public.warehouses(id), status text not null default 'pending',
  created_at timestamptz not null default now(), received_at timestamptz
);

create index if not exists idx_books_title on public.books using gin(to_tsvector('simple',title));
create index if not exists idx_books_isbn on public.books(isbn);
create index if not exists idx_books_barcode on public.books(barcode);
create index if not exists idx_invoice_created on public.invoices(created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare uname text;
begin
 uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1));
 insert into public.user_profiles(id,username,email,full_name,role) values(new.id,uname,new.email,coalesce(new.raw_user_meta_data->>'full_name',uname),'cashier')
 on conflict(id) do update set email=excluded.email, username=excluded.username, full_name=excluded.full_name;
 return new;
end$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.get_login_email(p_username text) returns text language sql security definer set search_path=public as $$
 select email from public.user_profiles where lower(username)=lower(p_username) and active=true limit 1;
$$;
grant execute on function public.get_login_email(text) to anon,authenticated;

create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path=public as $$
 select role from public.user_profiles where id=auth.uid() limit 1;
$$;
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path=public as $$select public.current_role()='manager'::public.user_role$$;
create or replace function public.can_manage_stock() returns boolean language sql stable security definer set search_path=public as $$select public.current_role() in ('manager'::public.user_role,'warehouse'::public.user_role)$$;

alter table public.user_profiles enable row level security;
alter table public.authors enable row level security;
alter table public.books enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_movements enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.consignment_partners enable row level security;
alter table public.consignment_shipments enable row level security;
alter table public.consignment_items enable row level security;
alter table public.print_orders enable row level security;
alter table public.expenses enable row level security;
alter table public.custody_transactions enable row level security;

create policy "profiles self or manager" on public.user_profiles for select to authenticated using(id=auth.uid() or public.is_manager());
create policy "profiles manager update" on public.user_profiles for update to authenticated using(public.is_manager()) with check(public.is_manager());
create policy "authors auth read" on public.authors for select to authenticated using(true);
create policy "authors manager accountant write" on public.authors for all to authenticated using(public.current_role() in ('manager','accountant')) with check(public.current_role() in ('manager','accountant'));
create policy "books auth read" on public.books for select to authenticated using(true);
create policy "books manager warehouse write" on public.books for all to authenticated using(public.can_manage_stock() or public.is_manager()) with check(public.can_manage_stock() or public.is_manager());
create policy "warehouse auth read" on public.warehouses for select to authenticated using(true);
create policy "warehouse manager write" on public.warehouses for insert to authenticated with check(public.is_manager() or public.current_role()='warehouse');
create policy "inventory auth read" on public.inventory for select to authenticated using(true);
create policy "movements auth read" on public.stock_movements for select to authenticated using(true);
create policy "invoice auth read" on public.invoices for select to authenticated using(true);
create policy "invoice_items auth read" on public.invoice_items for select to authenticated using(true);
create policy "consignment auth read" on public.consignment_partners for select to authenticated using(true);
create policy "consignment manager accountant write" on public.consignment_partners for all to authenticated using(public.current_role() in ('manager','accountant','warehouse')) with check(public.current_role() in ('manager','accountant','warehouse'));
create policy "consignment shipments auth read" on public.consignment_shipments for select to authenticated using(true);
create policy "consignment items auth read" on public.consignment_items for select to authenticated using(true);
create policy "print orders auth read" on public.print_orders for select to authenticated using(true);
create policy "print orders manager warehouse accountant" on public.print_orders for insert to authenticated with check(public.current_role() in ('manager','warehouse','accountant'));
create policy "expenses auth read" on public.expenses for select to authenticated using(true);
create policy "expenses manager accountant write" on public.expenses for insert to authenticated with check(public.current_role() in ('manager','accountant'));
create policy "custody auth read" on public.custody_transactions for select to authenticated using(true);
create policy "custody manager accountant write" on public.custody_transactions for insert to authenticated with check(public.current_role() in ('manager','accountant'));


create or replace function public.can_manage_finance() returns boolean language sql stable security definer set search_path=public as $$select public.current_role() in ('manager'::public.user_role,'accountant'::public.user_role)$$;

grant execute on function public.can_manage_finance() to authenticated;

create or replace function public.record_expense(p_category text,p_amount numeric,p_payment_method public.expense_payment,p_warehouse_id uuid,p_expense_date date,p_payee text,p_description text)
returns public.expenses language plpgsql security definer set search_path=public as $$
declare e public.expenses;
begin
 if not public.can_manage_finance() then raise exception 'ليس لديك صلاحية تسجيل المصروفات'; end if;
 if p_amount<=0 then raise exception 'قيمة المصروف يجب أن تكون أكبر من صفر'; end if;
 insert into public.expenses(category,amount,payment_method,warehouse_id,expense_date,payee,description,created_by)
 values(nullif(trim(p_category),''),p_amount,p_payment_method,p_warehouse_id,coalesce(p_expense_date,current_date),nullif(trim(p_payee),''),nullif(trim(p_description),''),auth.uid())
 returning * into e;
 return e;
end$$;
grant execute on function public.record_expense(text,numeric,public.expense_payment,uuid,date,text,text) to authenticated;

create or replace function public.record_custody_issue(p_holder_user_id uuid,p_warehouse_id uuid,p_amount numeric,p_notes text)
returns public.custody_transactions language plpgsql security definer set search_path=public as $$
declare r public.custody_transactions;
begin
 if not public.can_manage_finance() then raise exception 'ليس لديك صلاحية إدارة العهدة'; end if;
 if p_amount<=0 then raise exception 'قيمة العهدة يجب أن تكون أكبر من صفر'; end if;
 insert into public.custody_transactions(holder_user_id,warehouse_id,tx_type,amount,notes,created_by)
 values(p_holder_user_id,p_warehouse_id,'صرف عهدة',p_amount,nullif(trim(p_notes),''),auth.uid()) returning * into r;
 return r;
end$$;
grant execute on function public.record_custody_issue(uuid,uuid,numeric,text) to authenticated;

create or replace function public.record_custody_settlement(p_holder_user_id uuid,p_warehouse_id uuid,p_amount numeric,p_notes text,p_expense_id uuid default null)
returns public.custody_transactions language plpgsql security definer set search_path=public as $$
declare r public.custody_transactions; balance numeric;
begin
 if not public.can_manage_finance() then raise exception 'ليس لديك صلاحية إدارة العهدة'; end if;
 if p_amount<=0 then raise exception 'القيمة يجب أن تكون أكبر من صفر'; end if;
 select coalesce(sum(case when tx_type='صرف عهدة' then amount else -amount end),0) into balance from public.custody_transactions where holder_user_id=p_holder_user_id;
 if p_amount>balance then raise exception 'المبلغ أكبر من رصيد العهدة الحالي'; end if;
 insert into public.custody_transactions(holder_user_id,warehouse_id,tx_type,amount,expense_id,notes,created_by)
 values(p_holder_user_id,p_warehouse_id,'تسوية عهدة',p_amount,p_expense_id,nullif(trim(p_notes),''),auth.uid()) returning * into r;
 return r;
end$$;
grant execute on function public.record_custody_settlement(uuid,uuid,numeric,text,uuid) to authenticated;

create or replace function public.custody_balances()
returns table(user_id uuid,username text,full_name text,issued numeric,settled numeric,balance numeric)
language sql security definer set search_path=public as $$
select u.id,u.username,u.full_name,
coalesce(sum(case when c.tx_type='صرف عهدة' then c.amount else 0 end),0),
coalesce(sum(case when c.tx_type<>'صرف عهدة' then c.amount else 0 end),0),
coalesce(sum(case when c.tx_type='صرف عهدة' then c.amount else -c.amount end),0)
from public.user_profiles u left join public.custody_transactions c on c.holder_user_id=u.id
where u.active=true group by u.id,u.username,u.full_name order by u.full_name;
$$;
grant execute on function public.custody_balances() to authenticated;

create or replace function public.search_books_stock(p_search text,p_warehouse_id uuid,p_limit integer default 50)
returns table(id uuid,title text,isbn text,barcode text,sale_price numeric,cost_price numeric,min_stock integer,cover_url text,author_name text,stock_qty integer)
language sql security definer set search_path=public as $$
select b.id,b.title,b.isbn,b.barcode,b.sale_price,b.cost_price,b.min_stock,b.cover_url,a.name,coalesce(i.qty,0)
from public.books b left join public.authors a on a.id=b.author_id
left join public.inventory i on i.book_id=b.id and i.warehouse_id=p_warehouse_id
where b.active=true and (coalesce(p_search,'')='' or b.title ilike '%'||p_search||'%' or coalesce(a.name,'') ilike '%'||p_search||'%' or coalesce(b.isbn,'') ilike '%'||p_search||'%' or coalesce(b.barcode,'') ilike '%'||p_search||'%')
order by b.title limit greatest(1,p_limit); $$;
grant execute on function public.search_books_stock(text,uuid,integer) to authenticated;

create or replace function public.set_inventory(p_book_id uuid,p_warehouse_id uuid,p_qty integer)
returns void language plpgsql security definer set search_path=public as $$
declare old_qty integer:=0; delta integer;
begin
 if not public.can_manage_stock() then raise exception 'ليس لديك صلاحية تعديل المخزون'; end if;
 select qty into old_qty from public.inventory where book_id=p_book_id and warehouse_id=p_warehouse_id for update;
 old_qty:=coalesce(old_qty,0); if p_qty<0 then raise exception 'الرصيد لا يمكن أن يكون سالبًا'; end if;
 insert into public.inventory(book_id,warehouse_id,qty) values(p_book_id,p_warehouse_id,p_qty) on conflict(warehouse_id,book_id) do update set qty=excluded.qty;
 delta:=p_qty-old_qty;
 if delta<>0 then insert into public.stock_movements(book_id,to_warehouse_id,qty,movement_type,user_id,notes) values(p_book_id,p_warehouse_id,abs(delta),case when delta>0 then 'adjustment_in' else 'adjustment_out' end,auth.uid(),'تعديل مباشر للرصيد'); end if;
end$$;
grant execute on function public.set_inventory(uuid,uuid,integer) to authenticated;

create sequence if not exists public.invoice_number_seq;
create or replace function public.next_invoice_no() returns text language sql as $$select 'DH-'||to_char(now(),'YYYYMMDD')||'-'||lpad(nextval('public.invoice_number_seq')::text,5,'0')$$;

create or replace function public.create_sale(p_warehouse_id uuid,p_payment_method public.invoice_payment,p_discount numeric,p_items jsonb)
returns table(invoice_id uuid,invoice_no text,created_at timestamptz,subtotal numeric,discount numeric,total numeric,payment_method public.invoice_payment,items jsonb)
language plpgsql security definer set search_path=public as $$
declare inv_id uuid; inv_no text; sub numeric:=0; row jsonb; bid uuid; q integer; price numeric; available integer;
begin
 if public.current_role() not in ('manager','cashier') then raise exception 'ليس لديك صلاحية البيع'; end if;
 if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'الفاتورة فارغة'; end if;
 if p_discount<0 then raise exception 'الخصم غير صحيح'; end if;
 inv_no:=public.next_invoice_no();
 insert into public.invoices(invoice_no,warehouse_id,cashier_id,payment_method) values(inv_no,p_warehouse_id,auth.uid(),p_payment_method) returning id into inv_id;
 for row in select * from jsonb_array_elements(p_items) loop
  bid:=(row->>'book_id')::uuid; q:=(row->>'qty')::integer; price:=(row->>'unit_price')::numeric;
  if q<=0 then raise exception 'كمية غير صحيحة'; end if;
  select coalesce(qty,0) into available from public.inventory where warehouse_id=p_warehouse_id and book_id=bid for update;
  if available<q then raise exception 'الرصيد غير كافٍ للكتاب %',bid; end if;
  insert into public.invoice_items(invoice_id,book_id,qty,unit_price) values(inv_id,bid,q,price);
  update public.inventory set qty=qty-q where warehouse_id=p_warehouse_id and book_id=bid;
  insert into public.stock_movements(book_id,from_warehouse_id,qty,movement_type,reference_type,reference_id,user_id) values(bid,p_warehouse_id,q,'sale','invoice',inv_id,auth.uid());
  sub:=sub+(q*price);
 end loop;
 if p_discount>sub then raise exception 'الخصم أكبر من الإجمالي'; end if;
 update public.invoices set subtotal=sub,discount=p_discount,total=sub-p_discount where id=inv_id;
 return query
 select i.id,i.invoice_no,i.created_at,i.subtotal,i.discount,i.total,i.payment_method,
 jsonb_agg(jsonb_build_object('title',b.title,'qty',ii.qty,'unit_price',ii.unit_price,'line_total',ii.line_total) order by ii.id)
 from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id join public.books b on b.id=ii.book_id where i.id=inv_id group by i.id;
end$$;
grant execute on function public.create_sale(uuid,public.invoice_payment,numeric,jsonb) to authenticated;

create or replace function public.get_invoice_for_print(p_invoice_id uuid)
returns jsonb language sql security definer set search_path=public as $$
select jsonb_build_object('id',i.id,'invoice_no',i.invoice_no,'created_at',i.created_at,'subtotal',i.subtotal,'discount',i.discount,'total',i.total,'payment_method',i.payment_method,'items',coalesce((select jsonb_agg(jsonb_build_object('title',b.title,'qty',ii.qty,'unit_price',ii.unit_price,'line_total',ii.line_total) order by ii.id) from public.invoice_items ii join public.books b on b.id=ii.book_id where ii.invoice_id=i.id),'[]'::jsonb)) from public.invoices i where i.id=p_invoice_id$$;
grant execute on function public.get_invoice_for_print(uuid) to authenticated;

create or replace function public.dashboard_summary() returns table(sales_today numeric,invoices_today bigint,books_sold_today bigint,stock_value numeric,expenses_today numeric,custody_outstanding numeric) language sql security definer set search_path=public as $$
select coalesce((select sum(total) from public.invoices where created_at::date=current_date and status='paid'),0),
coalesce((select count(*) from public.invoices where created_at::date=current_date),0),
coalesce((select sum(qty) from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id where i.created_at::date=current_date),0),
coalesce((select sum(i.qty*b.cost_price) from public.inventory i join public.books b on b.id=i.book_id),0),
coalesce((select sum(amount) from public.expenses where expense_date=current_date),0),
coalesce((select sum(case when tx_type='صرف عهدة' then amount else -amount end) from public.custody_transactions),0);$$;
grant execute on function public.dashboard_summary() to authenticated;

create or replace function public.top_books(p_limit integer default 8) returns table(title text,qty bigint,sales numeric) language sql security definer set search_path=public as $$select b.title,sum(ii.qty)::bigint,sum(ii.line_total) from public.invoice_items ii join public.books b on b.id=ii.book_id join public.invoices i on i.id=ii.invoice_id where i.status='paid' group by b.title order by sum(ii.qty) desc limit greatest(1,p_limit);$$;
grant execute on function public.top_books(integer) to authenticated;
create or replace function public.low_stock(p_limit integer default 8) returns table(title text,qty bigint,min_stock integer) language sql security definer set search_path=public as $$select b.title,sum(i.qty)::bigint,b.min_stock from public.books b join public.inventory i on i.book_id=b.id group by b.id,b.title,b.min_stock having sum(i.qty)<=b.min_stock order by sum(i.qty) asc limit greatest(1,p_limit);$$;
grant execute on function public.low_stock(integer) to authenticated;
create or replace function public.report_summary() returns table(total_sales numeric,invoice_count bigint,returns_total numeric,royalty_due numeric,expenses_total numeric,net_cash numeric,custody_outstanding numeric) language sql security definer set search_path=public as $$
select coalesce(sum(i.total),0),count(i.id),0::numeric,
coalesce((select sum(ii.line_total*a.share_percent/100) from public.invoice_items ii join public.invoices inv on inv.id=ii.invoice_id join public.books b on b.id=ii.book_id join public.authors a on a.id=b.author_id where inv.status='paid'),0),
coalesce((select sum(e.amount) from public.expenses e),0),
coalesce(sum(i.total),0)-coalesce((select sum(e.amount) from public.expenses e where e.payment_method='نقدي'),0),
coalesce((select sum(case when c.tx_type='صرف عهدة' then c.amount else -c.amount end) from public.custody_transactions c),0)
from public.invoices i where i.status='paid';$$;
grant execute on function public.report_summary() to authenticated;

create or replace function public.author_royalty_summary() returns table(author_id uuid,qty bigint,sales numeric,royalty_due numeric) language sql security definer set search_path=public as $$select a.id,sum(ii.qty)::bigint,sum(ii.line_total),sum(ii.line_total*a.share_percent/100) from public.authors a join public.books b on b.author_id=a.id join public.invoice_items ii on ii.book_id=b.id join public.invoices i on i.id=ii.invoice_id where i.status='paid' group by a.id;$$;
grant execute on function public.author_royalty_summary() to authenticated;

insert into public.warehouses(name,type,location) values('المخزن الرئيسي','main','دار حواديت') on conflict(name) do nothing;
