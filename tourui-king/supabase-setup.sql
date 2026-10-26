-- 盗塁王ランキング用(Supabase の SQL Editor に貼って Run)
create table if not exists public.tourui_scores (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 12),
  steals     int  not null check (steals between 0 and 300),
  score      int  not null check (score between 0 and 300000),
  created_at timestamptz not null default now(),
  -- 1盗塁あたりの最大得点(約500)+牽制回避を考慮した上限。偽造の目安として弾く
  constraint score_sane check (score <= steals * 650 + 300)
);
create index if not exists tourui_scores_score_idx  on public.tourui_scores (score desc, steals desc);
create index if not exists tourui_scores_steals_idx on public.tourui_scores (steals desc, score desc);

alter table public.tourui_scores enable row level security;
-- 誰でも閲覧・追加のみ可(更新・削除は不可)
drop policy if exists "read all"   on public.tourui_scores;
drop policy if exists "insert all" on public.tourui_scores;
create policy "read all"   on public.tourui_scores for select using (true);
create policy "insert all" on public.tourui_scores for insert with check (true);
