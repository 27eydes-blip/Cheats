-- Stage 1 schema: profiles, classes/topics, notes + pages, handwriting
-- corrections, quiz sets + questions, concepts, usage metering.
--
-- Security model: every table has row-level security on. A student can only
-- see and change rows they own. Later stages (sharing, study groups, live
-- games) add narrowly-scoped read policies on top of this.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). `plan` is the hook for a future paid tier.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Classes and topics
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  subject text check (char_length(subject) <= 120),
  color text not null default 'violet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index classes_owner_idx on public.classes (owner_id);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index topics_class_idx on public.topics (class_id);

-- ---------------------------------------------------------------------------
-- Notes. A note is one capture session (one or more pages).
-- status: draft -> reading -> review -> ready
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  class_id uuid references public.classes (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  title text not null default 'Untitled notes' check (char_length(title) <= 200),
  source text not null default 'camera' check (source in ('camera', 'upload', 'pdf', 'slides', 'ink', 'text')),
  status text not null default 'draft' check (status in ('draft', 'reading', 'review', 'ready', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_owner_idx on public.notes (owner_id, updated_at desc);
create index notes_topic_idx on public.notes (topic_id);

create table public.note_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  page_index int not null check (page_index >= 0),
  -- Path inside the private `note-pages` storage bucket (null for text-only slides).
  image_path text,
  -- Text that came with the file (PDF text layer, slide text). Used as a hint.
  source_text text,
  -- Text read by the AI, with uncertain words marked as [[guess|alt1|alt2]].
  raw_text text,
  -- Text after the student's fixes (markers resolved). This is what quizzes use.
  text text,
  -- Sections the student flagged to be quizzed harder: [{ "quote": "..." }]
  focus jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reading', 'done', 'error')),
  error text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (note_id, page_index)
);
create index note_pages_note_idx on public.note_pages (note_id, page_index);

-- Every fix a student makes to the AI's reading. Used to learn their handwriting.
create table public.handwriting_corrections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_page_id uuid references public.note_pages (id) on delete set null,
  class_id uuid references public.classes (id) on delete set null,
  original text not null check (char_length(original) <= 200),
  corrected text not null check (char_length(corrected) <= 200),
  context text check (char_length(context) <= 400),
  created_at timestamptz not null default now()
);
create index handwriting_corrections_owner_idx on public.handwriting_corrections (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Quizzes
-- ---------------------------------------------------------------------------
create table public.quiz_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid references public.notes (id) on delete set null,
  class_id uuid references public.classes (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  -- Short public code for sharing (stage 2). Generated now so links are stable.
  share_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  visibility text not null default 'private' check (visibility in ('private', 'link', 'group')),
  status text not null default 'generating' check (status in ('generating', 'ready', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quiz_sets_owner_idx on public.quiz_sets (owner_id, updated_at desc);

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_set_id uuid not null references public.quiz_sets (id) on delete cascade,
  kind text not null check (kind in ('concept', 'definition', 'date', 'formula', 'vocabulary', 'person', 'process', 'fact')),
  term text not null,
  detail text not null,
  page_index int,
  quote text,
  created_at timestamptz not null default now()
);
create index concepts_set_idx on public.concepts (quiz_set_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_set_id uuid not null references public.quiz_sets (id) on delete cascade,
  concept_id uuid references public.concepts (id) on delete set null,
  position int not null default 0,
  type text not null check (type in ('multiple_choice', 'flashcard', 'fill_blank', 'true_false', 'short_answer', 'matching')),
  -- Type-specific payload, validated in the app (see src/lib/quiz/schema.ts).
  data jsonb not null,
  explanation text,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  -- Link back to the notes: which page and the exact quote it came from.
  source_page int,
  source_quote text,
  is_focus boolean not null default false,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_set_idx on public.questions (quiz_set_id, position);

-- ---------------------------------------------------------------------------
-- Usage metering: one row per AI call. Powers rate limits now and plan
-- limits later (see src/config/plans.ts).
-- ---------------------------------------------------------------------------
create table public.usage_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  units int not null default 1,
  created_at timestamptz not null default now()
);
create index usage_events_owner_idx on public.usage_events (owner_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_classes before update on public.classes for each row execute function public.touch_updated_at();
create trigger touch_topics before update on public.topics for each row execute function public.touch_updated_at();
create trigger touch_notes before update on public.notes for each row execute function public.touch_updated_at();
create trigger touch_note_pages before update on public.note_pages for each row execute function public.touch_updated_at();
create trigger touch_quiz_sets before update on public.quiz_sets for each row execute function public.touch_updated_at();
create trigger touch_questions before update on public.questions for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.topics enable row level security;
alter table public.notes enable row level security;
alter table public.note_pages enable row level security;
alter table public.handwriting_corrections enable row level security;
alter table public.quiz_sets enable row level security;
alter table public.concepts enable row level security;
alter table public.questions enable row level security;
alter table public.usage_events enable row level security;

create policy "own profile: read" on public.profiles for select using (id = auth.uid());
-- Students may edit their name/avatar but never their plan.
create policy "own profile: update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Generic owner policies for the content tables.
do $$
declare t text;
begin
  foreach t in array array['classes', 'topics', 'notes', 'note_pages', 'handwriting_corrections', 'quiz_sets', 'concepts', 'questions']
  loop
    execute format('create policy "owner: select" on public.%I for select using (owner_id = auth.uid())', t);
    execute format('create policy "owner: insert" on public.%I for insert with check (owner_id = auth.uid())', t);
    execute format('create policy "owner: update" on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('create policy "owner: delete" on public.%I for delete using (owner_id = auth.uid())', t);
  end loop;
end $$;

-- Children must point at parents the same student owns (stops linking your
-- row into someone else's class/note/quiz).
create or replace function public.assert_same_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_owner uuid;
begin
  if tg_table_name = 'topics' then
    select owner_id into parent_owner from public.classes where id = new.class_id;
  elsif tg_table_name = 'note_pages' then
    select owner_id into parent_owner from public.notes where id = new.note_id;
  elsif tg_table_name in ('questions', 'concepts') then
    select owner_id into parent_owner from public.quiz_sets where id = new.quiz_set_id;
  end if;
  if parent_owner is null or parent_owner <> new.owner_id then
    raise exception 'parent row not found' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger same_owner_topics before insert or update on public.topics for each row execute function public.assert_same_owner();
create trigger same_owner_note_pages before insert or update on public.note_pages for each row execute function public.assert_same_owner();
create trigger same_owner_questions before insert or update on public.questions for each row execute function public.assert_same_owner();
create trigger same_owner_concepts before insert or update on public.concepts for each row execute function public.assert_same_owner();

-- Usage events are written by the server on the student's behalf and are
-- readable by the student; they can't be edited or deleted from the client.
create policy "usage: read own" on public.usage_events for select using (owner_id = auth.uid());
create policy "usage: insert own" on public.usage_events for insert with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: stream changes so phone, iPad and laptop stay in sync.
-- RLS applies to realtime too, so students only receive their own rows.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.classes, public.topics, public.notes, public.note_pages, public.quiz_sets, public.questions;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for page images, one folder per student.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-pages', 'note-pages', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "note pages: read own" on storage.objects for select
  using (bucket_id = 'note-pages' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "note pages: upload own" on storage.objects for insert
  with check (bucket_id = 'note-pages' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "note pages: update own" on storage.objects for update
  using (bucket_id = 'note-pages' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "note pages: delete own" on storage.objects for delete
  using (bucket_id = 'note-pages' and (storage.foldername(name))[1] = auth.uid()::text);
