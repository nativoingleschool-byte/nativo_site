import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

const assertAuthenticated = async (req) => {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    throw new Error('Missing bearer token.')
  }

  const supabaseAdmin = getSupabaseAdmin()
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    throw new Error('The session could not be verified.')
  }

  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single()
  if (profileError || !profile) {
    throw new Error('The profile could not be loaded.')
  }

  return { supabaseAdmin, user, profile }
}

const isUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim())

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const resolveStudentId = async (supabaseAdmin, payload) => {
  const rawId = String(payload.student_id || '').trim()
  if (isUuid(rawId)) {
    return rawId
  }

  const name = String(payload.student_name || rawId).trim()
  if (!name) {
    throw new Error('Student name or ID is required.')
  }

  // 1. Try finding existing profile with matching full_name
  const { data: existingProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role')
    .ilike('full_name', name)
    .limit(1)

  if (existingProfiles && existingProfiles.length > 0) {
    return existingProfiles[0].id
  }

  // 2. Create student user in auth & profiles
  const emailSlug = slugify(name) || 'student'
  const email = `${emailSlug}-${Date.now()}@setup.local`
  const password = `Setup!${Math.random().toString(36).slice(-8)}`

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })

  if (authError || !authData?.user) {
    throw new Error(authError?.message || 'Could not create student profile.')
  }

  const studentId = authData.user.id
  await supabaseAdmin.from('profiles').upsert({
    id: studentId,
    email,
    full_name: name,
    role: 'student',
    class_name: payload.class_name || '',
    push_enabled: false,
  })

  return studentId
}

const ensureTeacherPermission = (profile, teacherId) => {
  if (profile.role === 'admin') return
  if (profile.role !== 'teacher') {
    throw new Error('Only admin and teachers can manage classes here.')
  }
  if (teacherId !== profile.id) {
    throw new Error('Teachers can only manage their own classes.')
  }
}

const createGroup = async (supabaseAdmin, profile, payload) => {
  const studentIds = Array.from(new Set((payload.student_ids ?? []).filter(Boolean)))
  const teacherId = payload.teacher_id
  ensureTeacherPermission(profile, teacherId)

  if (!payload.subject?.trim()) {
    throw new Error('Subject is required.')
  }
  if (!payload.starts_at) {
    throw new Error('Start time is required.')
  }
  if (!studentIds.length) {
    throw new Error('At least one student is required.')
  }

  const startsAt = new Date(payload.starts_at)
  const duration = Number(payload.duration_minutes) || 60
  const endsAt = new Date(startsAt.getTime() + duration * 60000).toISOString()
  const teacherLessonStatus = payload.teacher_lesson_status ?? null

  const rows = studentIds.map((studentId) => ({
    subject: payload.subject.trim(),
    class_name: payload.class_name ?? '',
    student_id: studentId,
    teacher_id: teacherId,
    starts_at: startsAt.toISOString(),
    duration_minutes: duration,
    teacher_lesson_status: teacherLessonStatus,
  }))

  const { data, error } = await supabaseAdmin.from('lessons').insert(rows).select('*')
  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

const updateGroup = async (supabaseAdmin, profile, payload) => {
  const lessonIds = Array.from(new Set((payload.lesson_ids ?? []).filter(Boolean)))
  if (!lessonIds.length) {
    throw new Error('No lessons were selected.')
  }

  const { data: existingLessons, error: lessonsError } = await supabaseAdmin.from('lessons').select('*').in('id', lessonIds)
  if (lessonsError) {
    throw new Error(lessonsError.message)
  }
  if (!existingLessons?.length) {
    throw new Error('The selected class could not be found.')
  }

  const currentTeacherId = existingLessons[0].teacher_id
  const nextTeacherId = payload.teacher_id || currentTeacherId
  ensureTeacherPermission(profile, currentTeacherId)
  ensureTeacherPermission(profile, nextTeacherId)

  const duration = Number(payload.duration_minutes) || existingLessons[0].duration_minutes || 60
  const startsAtStr = payload.starts_at ?? existingLessons[0].starts_at
  const startsAt = new Date(startsAtStr)

  const sharedUpdate = {
    subject: String(payload.subject ?? existingLessons[0].subject).trim(),
    class_name: String(payload.class_name ?? existingLessons[0].class_name),
    teacher_id: nextTeacherId,
    starts_at: startsAt.toISOString(),
    duration_minutes: duration,
  }

  if (payload.teacher_lesson_status !== undefined) {
    sharedUpdate.teacher_lesson_status = payload.teacher_lesson_status
  }

  const { error: updateError } = await supabaseAdmin.from('lessons').update(sharedUpdate).in('id', lessonIds)
  if (updateError) {
    throw new Error(updateError.message)
  }

  const existingStudentIds = new Set(existingLessons.map((lesson) => lesson.student_id))
  const newStudentIds = Array.from(new Set((payload.student_ids ?? []).filter(Boolean))).filter((id) => !existingStudentIds.has(id))

  if (newStudentIds.length) {
    const insertedRows = newStudentIds.map((studentId) => ({
      ...sharedUpdate,
      student_id: studentId,
    }))
    const { error: insertError } = await supabaseAdmin.from('lessons').insert(insertedRows)
    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  const finalStudentIds = Array.from(new Set([...existingStudentIds, ...newStudentIds]))
  const { data: refreshedLessons, error: refreshError } = await supabaseAdmin
    .from('lessons')
    .select('*')
    .eq('teacher_id', nextTeacherId)
    .eq('starts_at', sharedUpdate.starts_at)
    .eq('subject', sharedUpdate.subject)
    .eq('duration_minutes', sharedUpdate.duration_minutes)
    .in('student_id', finalStudentIds)

  if (refreshError) {
    throw new Error(refreshError.message)
  }

  return refreshedLessons ?? []
}

const createLesson = async (supabaseAdmin, profile, payload) => {
  const teacherId = payload.teacher_id || profile.id
  ensureTeacherPermission(profile, teacherId)

  const studentId = await resolveStudentId(supabaseAdmin, payload)

  if (!payload.subject?.trim()) {
    throw new Error('Subject is required.')
  }
  if (!payload.starts_at) {
    throw new Error('Start time is required.')
  }

  const startsAt = new Date(payload.starts_at)
  const duration = Number(payload.duration_minutes) || 60
  const endsAt = new Date(startsAt.getTime() + duration * 60000).toISOString()
  const teacherLessonStatus = payload.teacher_lesson_status ?? 'happened'

  const row = {
    subject: payload.subject.trim(),
    class_name: payload.class_name ?? '',
    student_id: studentId,
    teacher_id: teacherId,
    starts_at: startsAt.toISOString(),
    duration_minutes: duration,
    teacher_lesson_status: teacherLessonStatus,
  }

  const { data, error } = await supabaseAdmin.from('lessons').insert([row]).select('*').single()
  if (error) {
    throw new Error(error.message)
  }

  return data
}

const updateLesson = async (supabaseAdmin, profile, payload) => {
  if (!payload.lesson_id) {
    throw new Error('Lesson ID is required.')
  }

  const { data: existingLesson, error: fetchError } = await supabaseAdmin
    .from('lessons')
    .select('*')
    .eq('id', payload.lesson_id)
    .single()

  if (fetchError || !existingLesson) {
    throw new Error('The lesson could not be found.')
  }

  const currentTeacherId = existingLesson.teacher_id
  const nextTeacherId = payload.teacher_id || currentTeacherId
  ensureTeacherPermission(profile, currentTeacherId)
  ensureTeacherPermission(profile, nextTeacherId)

  const duration = Number(payload.duration_minutes) || existingLesson.duration_minutes || 60
  const startsAtStr = payload.starts_at ?? existingLesson.starts_at
  const startsAt = new Date(startsAtStr)

  const updateData = {
    subject: String(payload.subject ?? existingLesson.subject).trim(),
    class_name: String(payload.class_name ?? existingLesson.class_name ?? ''),
    student_id: payload.student_id ?? existingLesson.student_id,
    teacher_id: nextTeacherId,
    starts_at: startsAt.toISOString(),
    duration_minutes: duration,
  }

  if (payload.teacher_lesson_status !== undefined) {
    updateData.teacher_lesson_status = payload.teacher_lesson_status
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('lessons')
    .update(updateData)
    .eq('id', payload.lesson_id)
    .select('*')
    .single()

  if (updateError) {
    throw new Error(updateError.message)
  }

  return updated
}

const deleteLesson = async (supabaseAdmin, profile, payload) => {
  if (!payload.lesson_id) {
    throw new Error('Lesson ID is required.')
  }

  const { data: existingLesson, error: fetchError } = await supabaseAdmin
    .from('lessons')
    .select('*')
    .eq('id', payload.lesson_id)
    .single()

  if (fetchError || !existingLesson) {
    throw new Error('The lesson could not be found.')
  }

  ensureTeacherPermission(profile, existingLesson.teacher_id)

  const { error: deleteError } = await supabaseAdmin
    .from('lessons')
    .delete()
    .eq('id', payload.lesson_id)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  return { success: true, id: payload.lesson_id }
}

const getProfiles = async (supabaseAdmin, profile) => {
  if (profile.role !== 'admin' && profile.role !== 'teacher') {
    throw new Error('Only admin and teachers can access profile lists.')
  }

  // Query all profiles; filter out archived if marked
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).filter((p) => p.archived !== true)
}

const getTeacherNotes = async (supabaseAdmin, profile) => {
  let query = supabaseAdmin
    .from('teacher_notes')
    .select('*')
    .order('created_at', { ascending: false })

  if (profile.role !== 'admin') {
    query = query.eq('teacher_id', profile.id)
  }

  const { data, error } = await query
  if (error) {
    console.warn('getTeacherNotes query error:', error.message)
    return []
  }
  return data ?? []
}

const createTeacherNote = async (supabaseAdmin, profile, payload) => {
  const teacherId = profile.role === 'admin' ? (payload.teacher_id || profile.id) : profile.id
  const note = String(payload.note || '').trim()
  if (!note) {
    throw new Error('Note content is required.')
  }

  const row = {
    teacher_id: teacherId,
    note: note,
    month_key: payload.month_key || null,
  }

  const { data, error } = await supabaseAdmin.from('teacher_notes').insert([row]).select('*').single()
  if (error) {
    throw new Error(error.message)
  }
  return data
}

const deleteTeacherNote = async (supabaseAdmin, profile, payload) => {
  if (!payload.id) {
    throw new Error('Note ID is required.')
  }

  let query = supabaseAdmin.from('teacher_notes').delete().eq('id', payload.id)
  if (profile.role !== 'admin') {
    query = query.eq('teacher_id', profile.id)
  }

  const { error } = await query
  if (error) {
    throw new Error(error.message)
  }
  return { success: true, id: payload.id }
}

const getAvailabilities = async (supabaseAdmin, profile, payload) => {
  let query = supabaseAdmin
    .from('teacher_availability')
    .select('*')
    .order('starts_at', { ascending: true })

  if (payload?.teacher_id) {
    query = query.eq('teacher_id', payload.teacher_id)
  }

  if (payload?.start_date && payload?.end_date) {
    query = query.gte('starts_at', payload.start_date).lte('starts_at', payload.end_date)
  }

  const { data, error } = await query
  if (error) {
    console.warn('getAvailabilities query error:', error.message)
    return []
  }
  return data ?? []
}

const createAvailability = async (supabaseAdmin, profile, payload) => {
  const teacherId = profile.role === 'admin' ? (payload.teacher_id || profile.id) : profile.id
  ensureTeacherPermission(profile, teacherId)

  if (!payload.starts_at) {
    throw new Error('Start time is required.')
  }

  const duration = Number(payload.duration_minutes) || 60
  const repeatWeeks = Math.min(Math.max(Number(payload.repeat_weeks) || 1, 1), 24)
  const seriesId = repeatWeeks > 1 ? (payload.series_id || randomUUID()) : null

  const rows = []
  const baseStart = new Date(payload.starts_at)

  for (let i = 0; i < repeatWeeks; i++) {
    const slotDate = new Date(baseStart.getTime() + i * 7 * 24 * 60 * 60 * 1000)
    rows.push({
      teacher_id: teacherId,
      starts_at: slotDate.toISOString(),
      duration_minutes: duration,
      series_id: seriesId,
    })
  }

  const { data, error } = await supabaseAdmin.from('teacher_availability').insert(rows).select('*')
  if (error) {
    throw new Error(error.message)
  }
  return data ?? []
}

const deleteAvailability = async (supabaseAdmin, profile, payload) => {
  if (!payload.id && !payload.series_id) {
    throw new Error('Availability ID or Series ID is required.')
  }

  let query = supabaseAdmin.from('teacher_availability').delete()

  if (payload.series_scope === 'future' && payload.series_id) {
    query = query.eq('series_id', payload.series_id)
    if (payload.starts_at) {
      query = query.gte('starts_at', payload.starts_at)
    }
  } else {
    query = query.eq('id', payload.id)
  }

  if (profile.role !== 'admin') {
    query = query.eq('teacher_id', profile.id)
  }

  const { error } = await query
  if (error) {
    throw new Error(error.message)
  }
  return { success: true, id: payload.id, series_id: payload.series_id, scope: payload.series_scope }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      body = {}
    }
  }

  try {
    const { supabaseAdmin, profile } = await assertAuthenticated(req)
    const { action, payload } = body || {}

    if (action === 'get_profiles') {
      const profiles = await getProfiles(supabaseAdmin, profile)
      return json(res, 200, { data: profiles })
    }

    if (action === 'get_teacher_notes') {
      const notes = await getTeacherNotes(supabaseAdmin, profile)
      return json(res, 200, { data: notes })
    }

    if (action === 'create_teacher_note') {
      const note = await createTeacherNote(supabaseAdmin, profile, payload)
      return json(res, 200, { data: note })
    }

    if (action === 'delete_teacher_note') {
      const result = await deleteTeacherNote(supabaseAdmin, profile, payload)
      return json(res, 200, { data: result })
    }

    if (action === 'get_availabilities') {
      const availabilities = await getAvailabilities(supabaseAdmin, profile, payload)
      return json(res, 200, { data: availabilities })
    }

    if (action === 'create_availability') {
      const created = await createAvailability(supabaseAdmin, profile, payload)
      return json(res, 200, { data: created })
    }

    if (action === 'delete_availability') {
      const result = await deleteAvailability(supabaseAdmin, profile, payload)
      return json(res, 200, { data: result })
    }

    if (action === 'create_group') {
      const created = await createGroup(supabaseAdmin, profile, payload)
      return json(res, 200, { data: created })
    }

    if (action === 'update_group') {
      const updated = await updateGroup(supabaseAdmin, profile, payload)
      return json(res, 200, { data: updated })
    }

    if (action === 'create_lesson') {
      const created = await createLesson(supabaseAdmin, profile, payload)
      return json(res, 200, { data: created })
    }

    if (action === 'update_lesson') {
      const updated = await updateLesson(supabaseAdmin, profile, payload)
      return json(res, 200, { data: updated })
    }

    if (action === 'delete_lesson') {
      const result = await deleteLesson(supabaseAdmin, profile, payload)
      return json(res, 200, { data: result })
    }

    return json(res, 400, { error: 'Unknown action.' })
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}


