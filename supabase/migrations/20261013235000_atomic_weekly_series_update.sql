-- Atomic recurring-series edits. Runs with caller privileges and existing RLS.
CREATE OR REPLACE FUNCTION public.update_teacher_weekly_series(p jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  ref public.lessons%ROWTYPE;
  actor_role text;
  actor_archived boolean;
  actor_id uuid := auth.uid();
  series_id uuid;
  ids uuid[];
  initial_ids uuid[];
  valid_initial integer;
  start_at timestamptz;
  shift_by interval;
  weeks integer;
  total integer;
BEGIN
  SELECT role, archived INTO actor_role, actor_archived
  FROM public.profiles WHERE id=actor_id;
  IF actor_id IS NULL OR COALESCE(actor_archived,true) OR actor_role NOT IN ('teacher','admin') THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar aulas recorrentes.';
  END IF;

  SELECT * INTO ref FROM public.lessons WHERE id=(p->>'lesson_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aula de referência não encontrada.'; END IF;
  IF actor_role='teacher' AND ref.teacher_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Você só pode editar suas aulas.';
  END IF;

  SELECT array_agg(DISTINCT value::uuid) INTO ids
  FROM jsonb_array_elements_text(COALESCE(p->'student_ids','[]'::jsonb));
  IF COALESCE(array_length(ids,1),0)=0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um aluno.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ids) student_id
    WHERE NOT public.is_active_registered_student(student_id)
  ) THEN RAISE EXCEPTION 'A seleção contém um aluno não cadastrado ou inativo.'; END IF;

  start_at := (p->>'starts_at')::timestamptz;
  IF start_at IS NULL THEN RAISE EXCEPTION 'Data de início obrigatória.'; END IF;
  weeks := COALESCE((p->>'recurrence_weeks')::integer,1);
  IF weeks < 1 OR weeks > 52 THEN RAISE EXCEPTION 'Limite de 1 a 52 semanas.'; END IF;
  shift_by := start_at - ref.starts_at;
  series_id := COALESCE(ref.recurrence_series_id, extensions.gen_random_uuid());

  IF ref.recurrence_series_id IS NULL THEN
    SELECT array_agg(DISTINCT lesson_id) INTO initial_ids FROM (
      SELECT ref.id AS lesson_id
      UNION ALL
      SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p->'lesson_ids','[]'::jsonb))
    ) entries;
    SELECT count(*) INTO valid_initial FROM public.lessons
      WHERE id=ANY(initial_ids) AND teacher_id=ref.teacher_id AND starts_at=ref.starts_at
        AND recurrence_series_id IS NULL;
    IF valid_initial <> array_length(initial_ids,1) THEN
      RAISE EXCEPTION 'A seleção contém aulas de outra turma ou horário.';
    END IF;

    UPDATE public.lessons
    SET recurrence_series_id=series_id,
        starts_at=start_at,
        subject=p->>'subject',
        class_name=COALESCE(p->>'class_name',''),
        duration_minutes=(p->>'duration_minutes')::integer,
        meeting_url=p->>'meeting_url',
        teacher_lesson_status=p->>'teacher_lesson_status'
    WHERE id=ANY(initial_ids);

    IF weeks > 1 THEN
      INSERT INTO public.lessons (
        recurrence_series_id, student_id, teacher_id, starts_at,
        subject, class_name, duration_minutes, meeting_url, teacher_lesson_status
      )
      SELECT series_id, sid, ref.teacher_id,
        start_at + (wk * interval '7 days'),
        p->>'subject',COALESCE(p->>'class_name',''),
        (p->>'duration_minutes')::integer,p->>'meeting_url',p->>'teacher_lesson_status'
      FROM generate_series(1,weeks-1) wk CROSS JOIN unnest(ids) sid;
    END IF;
  ELSE
    UPDATE public.lessons
    SET starts_at=starts_at + shift_by,
        subject=p->>'subject',
        class_name=COALESCE(p->>'class_name',''),
        duration_minutes=(p->>'duration_minutes')::integer,
        meeting_url=p->>'meeting_url',
        teacher_lesson_status=p->>'teacher_lesson_status'
    WHERE recurrence_series_id=series_id AND teacher_id=ref.teacher_id;
  END IF;

  -- Reconcile membership for each existing occurrence, atomically.
  INSERT INTO public.lessons (
    recurrence_series_id,student_id,teacher_id,starts_at,
    subject,class_name,duration_minutes,meeting_url,teacher_lesson_status
  )
  SELECT series_id, sid, ref.teacher_id, dt.starts_at,
    p->>'subject', COALESCE(p->>'class_name',''),
    (p->>'duration_minutes')::integer,p->>'meeting_url',p->>'teacher_lesson_status'
  FROM (SELECT DISTINCT starts_at FROM public.lessons
        WHERE recurrence_series_id=series_id AND teacher_id=ref.teacher_id) dt
  CROSS JOIN unnest(ids) sid
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lessons present
    WHERE present.recurrence_series_id=series_id
      AND present.teacher_id=ref.teacher_id
      AND present.starts_at=dt.starts_at
      AND present.student_id=sid
  );

  DELETE FROM public.lessons
    WHERE recurrence_series_id=series_id AND teacher_id=ref.teacher_id
      AND NOT(student_id=ANY(ids));

  SELECT count(*) INTO total FROM public.lessons
    WHERE recurrence_series_id=series_id AND teacher_id=ref.teacher_id;
  RETURN total;
END;
$fn$;
REVOKE ALL ON FUNCTION public.update_teacher_weekly_series(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_teacher_weekly_series(jsonb) TO authenticated;
