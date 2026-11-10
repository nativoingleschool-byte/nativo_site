import { getSupabaseAdmin, isSupabaseServiceKey, verifyUserFromToken } from '../../services/supabase-admin.js';

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const LOOKBACK_48H_MS = 48 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  // Authorize: Vercel Cron header, CRON_SECRET, Service Key, or authenticated Admin user
  const isVercelCron = Boolean(req.headers['x-vercel-cron']);
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  let isAuthorized = isVercelCron;

  if (!isAuthorized && process.env.CRON_SECRET && token === process.env.CRON_SECRET) {
    isAuthorized = true;
  }

  if (!isAuthorized && isSupabaseServiceKey(token)) {
    isAuthorized = true;
  }

  const supabase = getSupabaseAdmin();

  if (!isAuthorized && token) {
    try {
      const user = await verifyUserFromToken(token, supabase);
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role === 'admin') {
          isAuthorized = true;
        }
      }
    } catch {
      // Not authorized
    }
  }

  if (!isAuthorized) {
    return json(res, 401, { error: 'Unauthorized to trigger scheduled reminders.' });
  }

  try {
    const now = new Date();
    const minStart = new Date(now.getTime() - LOOKBACK_48H_MS).toISOString();
    const maxStart = new Date(now.getTime() + FOUR_HOURS_MS).toISOString();

    // 1. Fetch active lessons in window
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, subject, class_name, student_id, teacher_id, starts_at, duration_minutes, student_attendance, student_lesson_status, teacher_lesson_status')
      .gte('starts_at', minStart)
      .lte('starts_at', maxStart)
      .order('starts_at', { ascending: true });

    if (lessonsError) {
      throw new Error(`Failed to query lessons: ${lessonsError.message}`);
    }

    if (!lessons || lessons.length === 0) {
      return json(res, 200, {
        success: true,
        message: 'No lessons within the active reminder window.',
        evaluated_lessons: 0,
        notifications_queued: 0,
        timestamp: now.toISOString(),
      });
    }

    // 2. Fetch profiles for involved students & teachers
    const userIds = Array.from(
      new Set(
        lessons
          .flatMap((l) => [l.teacher_id, l.student_id])
          .filter(Boolean)
      )
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', userIds);

    const profilesById = new Map((profiles || []).map((p) => [p.id, p]));

    // 3. Generate candidate notifications
    const notificationsToUpsert = [];

    for (const lesson of lessons) {
      const lessonTime = new Date(lesson.starts_at).getTime();
      const hasStarted = now.getTime() >= lessonTime;
      const student = profilesById.get(lesson.student_id);

      // --- TEACHER REMINDERS ---
      if (lesson.teacher_id) {
        // A. Overdue / Due Now check (past 48h, status not yet recorded)
        if (hasStarted && lesson.teacher_lesson_status === null) {
          notificationsToUpsert.push({
            user_id: lesson.teacher_id,
            type: 'lesson_reminder',
            title: 'Teacher class check',
            body: `${lesson.subject || 'Class'} is due now. Record what happened.`,
            entity_type: 'lesson',
            entity_id: lesson.id,
            action_url: `/reminder?lessonId=${encodeURIComponent(lesson.id)}&intent=happened`,
            action_intent: 'happened',
            dedupe_key: `${lesson.teacher_id}-${lesson.id}-teacher-start`,
          });
        }

        // B. 4-hour Upcoming check (starts in <= 4 hours)
        if (!hasStarted) {
          notificationsToUpsert.push({
            user_id: lesson.teacher_id,
            type: 'lesson_reminder',
            title: 'Upcoming lesson reminder',
            body: `${student?.full_name || 'Student'} has ${lesson.student_attendance || 'not replied'} for ${lesson.subject || 'class'}.`,
            entity_type: 'lesson',
            entity_id: lesson.id,
            action_url: `/reminder?lessonId=${encodeURIComponent(lesson.id)}`,
            action_intent: null,
            dedupe_key: `${lesson.teacher_id}-${lesson.id}-teacher-4h`,
          });
        }
      }

      // --- STUDENT REMINDERS ---
      if (lesson.student_id) {
        // C. Overdue / Due Now check for student (status not yet recorded)
        if (hasStarted && lesson.student_lesson_status === null) {
          notificationsToUpsert.push({
            user_id: lesson.student_id,
            type: 'lesson_reminder',
            title: 'Class-time reminder',
            body: `${lesson.subject || 'Class'} is due now. Confirm whether the class was done.`,
            entity_type: 'lesson',
            entity_id: lesson.id,
            action_url: `/reminder?lessonId=${encodeURIComponent(lesson.id)}&intent=done`,
            action_intent: 'done',
            dedupe_key: `${lesson.student_id}-${lesson.id}-student-start`,
          });
        }

        // D. 4-hour Upcoming check for student (if attendance is still null)
        if (!hasStarted && lesson.student_attendance === null) {
          const minutesUntilStart = Math.max(0, Math.round((lessonTime - now.getTime()) / 60000));
          notificationsToUpsert.push({
            user_id: lesson.student_id,
            type: 'lesson_reminder',
            title: 'Lesson reminder',
            body: `${lesson.subject || 'Class'} starts in ${minutesUntilStart} minutes.`,
            entity_type: 'lesson',
            entity_id: lesson.id,
            action_url: `/reminder?lessonId=${encodeURIComponent(lesson.id)}&intent=attend`,
            action_intent: 'attend',
            dedupe_key: `${lesson.student_id}-${lesson.id}-student-4h`,
          });
        }
      }
    }

    if (notificationsToUpsert.length === 0) {
      return json(res, 200, {
        success: true,
        message: 'No notifications required for lessons in window.',
        evaluated_lessons: lessons.length,
        notifications_queued: 0,
        timestamp: now.toISOString(),
      });
    }

    // 4. Upsert with deduplication key
    const { error: upsertError } = await supabase
      .from('notifications')
      .upsert(notificationsToUpsert, {
        onConflict: 'user_id,dedupe_key',
        ignoreDuplicates: true,
      });

    if (upsertError) {
      throw new Error(`Failed to upsert notifications: ${upsertError.message}`);
    }

    // 5. Enforce 5-year data retention for teacher invoices (delete records older than 5 years)
    try {
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const fiveYearsAgoIso = fiveYearsAgo.toISOString();

      // Find old invoices to clean up from storage & database
      const { data: expiredInvoices } = await supabase
        .from('teacher_invoices')
        .select('id, file_url')
        .lt('created_at', fiveYearsAgoIso)
        .limit(100);

      if (expiredInvoices && expiredInvoices.length > 0) {
        const expiredIds = expiredInvoices.map((inv) => inv.id);
        const storagePathsToRemove = expiredInvoices
          .map((inv) => {
            const url = inv.file_url || '';
            const match = url.match(/teacher-invoices\/([^?]+)/);
            return match ? match[1] : (url.includes('/') && !url.startsWith('data:') && !url.startsWith('http') ? url : null);
          })
          .filter(Boolean);

        if (storagePathsToRemove.length > 0) {
          await supabase.storage.from('teacher-invoices').remove(storagePathsToRemove);
        }

        await supabase.from('teacher_invoices').delete().in('id', expiredIds);
        console.info(`[cron:retention] Cleaned up ${expiredIds.length} invoices older than 5 years.`);
      }
    } catch (retentionErr) {
      console.warn('[cron:retention] Invoice retention cleanup warning:', retentionErr.message);
    }

    return json(res, 200, {
      success: true,
      evaluated_lessons: lessons.length,
      notifications_queued: notificationsToUpsert.length,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error('[cron:reminders] Error running scheduled reminders:', err);
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal cron error',
    });
  }
}
