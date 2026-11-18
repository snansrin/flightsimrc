create table if not exists public.pilot_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  callsign text not null check (char_length(callsign) between 2 and 32),
  created_at timestamptz not null default now()
);
create table if not exists public.training_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  airfield text not null,
  vehicle text not null default 'trainer' check (vehicle in ('trainer', 'drone', 'helicopter', 'jet')),
  duration_seconds integer not null check (duration_seconds between 0 and 86400),
  completed_at timestamptz not null default now()
);
create index if not exists training_flights_user_time on public.training_flights(user_id, completed_at desc);
alter table public.pilot_profiles enable row level security;
alter table public.training_flights enable row level security;
revoke all on public.pilot_profiles, public.training_flights from anon, authenticated;
grant select, insert, update on public.pilot_profiles to authenticated;
grant select, insert on public.training_flights to authenticated;
create policy "own profile read" on public.pilot_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "own profile insert" on public.pilot_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own profile update" on public.pilot_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own flights read" on public.training_flights for select to authenticated using ((select auth.uid()) = user_id);
create policy "own flights insert" on public.training_flights for insert to authenticated with check ((select auth.uid()) = user_id);
