-- Wayfare Supabase schema
-- Classroom MVP: shared trip links with ?trip=<trip_id>, no Supabase Auth yet.
-- Do not use a service role key in the website. Use only the publishable/anon key.

create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  destination text not null check (char_length(trim(destination)) > 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint trips_dates_in_order check (end_date >= start_date)
);

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  constraint trip_members_unique_name_per_trip unique (trip_id, name)
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.proposal_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint proposal_votes_one_vote_per_member unique (proposal_id, member_id)
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  proposal_id uuid references public.proposals(id) on delete set null,
  scheduled_date date not null,
  scheduled_time time,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  payer_member_id uuid not null references public.trip_members(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint expense_splits_one_split_per_member unique (expense_id, member_id)
);

create index if not exists trip_members_trip_id_idx on public.trip_members(trip_id);
create index if not exists proposals_trip_id_idx on public.proposals(trip_id);
create index if not exists proposal_votes_proposal_id_idx on public.proposal_votes(proposal_id);
create index if not exists proposal_votes_member_id_idx on public.proposal_votes(member_id);
create index if not exists itinerary_items_trip_id_scheduled_date_idx on public.itinerary_items(trip_id, scheduled_date);
create index if not exists itinerary_items_proposal_id_idx on public.itinerary_items(proposal_id);
create index if not exists expenses_trip_id_idx on public.expenses(trip_id);
create index if not exists expenses_payer_member_id_idx on public.expenses(payer_member_id);
create index if not exists expense_splits_expense_id_idx on public.expense_splits(expense_id);
create index if not exists expense_splits_member_id_idx on public.expense_splits(member_id);

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_votes enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

-- Classroom MVP policies:
-- These policies allow anyone with the publishable/anon key and a shared trip link
-- to create, read, update, and delete trip data. This keeps the static website simple
-- before adding authentication. Tighten these policies before using Wayfare publicly.

create policy "Classroom MVP public read trips" on public.trips for select using (true);
create policy "Classroom MVP public insert trips" on public.trips for insert with check (true);
create policy "Classroom MVP public update trips" on public.trips for update using (true) with check (true);
create policy "Classroom MVP public delete trips" on public.trips for delete using (true);

create policy "Classroom MVP public read trip members" on public.trip_members for select using (true);
create policy "Classroom MVP public insert trip members" on public.trip_members for insert with check (true);
create policy "Classroom MVP public update trip members" on public.trip_members for update using (true) with check (true);
create policy "Classroom MVP public delete trip members" on public.trip_members for delete using (true);

create policy "Classroom MVP public read proposals" on public.proposals for select using (true);
create policy "Classroom MVP public insert proposals" on public.proposals for insert with check (true);
create policy "Classroom MVP public update proposals" on public.proposals for update using (true) with check (true);
create policy "Classroom MVP public delete proposals" on public.proposals for delete using (true);

create policy "Classroom MVP public read proposal votes" on public.proposal_votes for select using (true);
create policy "Classroom MVP public insert proposal votes" on public.proposal_votes for insert with check (true);
create policy "Classroom MVP public delete proposal votes" on public.proposal_votes for delete using (true);

create policy "Classroom MVP public read itinerary items" on public.itinerary_items for select using (true);
create policy "Classroom MVP public insert itinerary items" on public.itinerary_items for insert with check (true);
create policy "Classroom MVP public update itinerary items" on public.itinerary_items for update using (true) with check (true);
create policy "Classroom MVP public delete itinerary items" on public.itinerary_items for delete using (true);

create policy "Classroom MVP public read expenses" on public.expenses for select using (true);
create policy "Classroom MVP public insert expenses" on public.expenses for insert with check (true);
create policy "Classroom MVP public update expenses" on public.expenses for update using (true) with check (true);
create policy "Classroom MVP public delete expenses" on public.expenses for delete using (true);

create policy "Classroom MVP public read expense splits" on public.expense_splits for select using (true);
create policy "Classroom MVP public insert expense splits" on public.expense_splits for insert with check (true);
create policy "Classroom MVP public delete expense splits" on public.expense_splits for delete using (true);
