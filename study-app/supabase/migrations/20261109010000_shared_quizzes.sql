-- Public read of a quiz by its share code, for links dropped in group chats.
--
-- Only quizzes the owner explicitly shared (visibility 'link' or 'group')
-- are returned, and only what's needed to take the quiz: no note text, no
-- source quotes, no owner email. Works without signing in (anon role).

create or replace function public.get_shared_quiz(code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'share_code', s.share_code,
    'class_name', c.name,
    'topic_name', t.name,
    'owner_name', nullif(split_part(coalesce(p.display_name, ''), ' ', 1), ''),
    'question_count', (select count(*) from public.questions q where q.quiz_set_id = s.id),
    'types', (select coalesce(jsonb_agg(distinct q.type), '[]'::jsonb) from public.questions q where q.quiz_set_id = s.id),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id,
        'quiz_set_id', q.quiz_set_id,
        'concept_id', null,
        'position', q.position,
        'type', q.type,
        'data', q.data,
        'explanation', q.explanation,
        'difficulty', q.difficulty,
        'source_page', null,
        'source_quote', null,
        'is_focus', q.is_focus,
        'edited', q.edited
      ) order by q.position), '[]'::jsonb)
      from public.questions q where q.quiz_set_id = s.id
    )
  )
  from public.quiz_sets s
  left join public.classes c on c.id = s.class_id
  left join public.topics t on t.id = s.topic_id
  left join public.profiles p on p.id = s.owner_id
  where s.share_code = upper(code)
    and s.visibility in ('link', 'group')
    and s.status = 'ready';
$$;

revoke all on function public.get_shared_quiz(text) from public;
grant execute on function public.get_shared_quiz(text) to anon, authenticated;
