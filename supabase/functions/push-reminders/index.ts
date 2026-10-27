// Deploy to Supabase Edge Functions only after VAPID keys and cron secret are configured.
// Never expose SUPABASE_SERVICE_ROLE_KEY or VAPID_PRIVATE_KEY to clients.
import { createClient } from 'npm:@supabase/supabase-js@2.110.0'
import webpush from 'npm:web-push@3.6.7'

const secret = Deno.env.get('PUSH_DISPATCH_SECRET')
const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const publicVapid = Deno.env.get('VAPID_PUBLIC_KEY')
const privateVapid = Deno.env.get('VAPID_PRIVATE_KEY')
const subject = Deno.env.get('VAPID_SUBJECT')
if (publicVapid && privateVapid && subject) webpush.setVapidDetails(subject, publicVapid, privateVapid)

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405})
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({error:'Unauthorized'},{status:401})
  if (!url || !key || !publicVapid || !privateVapid || !subject) return Response.json({error:'Push server not configured'},{status:503})
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const now=Date.now()
  const start=new Date(now-5*60_000).toISOString()
  const cutoff=new Date(now+4*60*60_000+5*60_000).toISOString()
  // Only upcoming or just-started classes, never a wide unbounded historical scan.
  const {data:lessons,error}=await db.from('lessons').select('id,teacher_id,student_id,subject,starts_at,student_attendance,student_lesson_status,teacher_lesson_status').gte('starts_at',start).lte('starts_at',cutoff).order('starts_at').limit(500)
  if(error) return Response.json({error:'Unable to read lessons'},{status:500})
  const queue=new Map<string,{userId:string,key:string,title:string,body:string,lessonId:string}>()
  for(const l of lessons||[]) {
    const diff=(Date.parse(l.starts_at)-now)/60000
    const isStart=diff<=0&&diff>=-5
    const isFourHours=Math.abs(diff-240)<=5
    // Deduplicate group sessions at teacher level by teacher + exact lesson start and subject.
    if(l.teacher_id && l.teacher_lesson_status===null && isStart) {
      const dedupe=`teacher:${l.teacher_id}:${l.starts_at}:${l.subject}:start`
      queue.set(dedupe,{userId:l.teacher_id,key:dedupe,title:'Aula aguardando confirmação',body:`${l.subject}: registre o que aconteceu.`,lessonId:l.id})
    }
    if(l.student_id && isFourHours && !l.student_attendance) {
      const dedupe=`student:${l.id}:four-hours`
      queue.set(dedupe,{userId:l.student_id,key:dedupe,title:'Sua aula começa em 4 horas',body:`Confirme sua participação em ${l.subject}.`,lessonId:l.id})
    }
    if(l.student_id && isStart && !l.student_lesson_status) {
      const dedupe=`student:${l.id}:start`
      queue.set(dedupe,{userId:l.student_id,key:dedupe,title:'Sua aula está começando',body:`Confira ${l.subject} no Reminder.`,lessonId:l.id})
    }
  }
  let sent=0,failed=0,skipped=0
  for(const item of queue.values()) {
    const {data:profile}=await db.from('profiles').select('push_enabled,archived').eq('id',item.userId).single()
    if(!profile?.push_enabled||profile.archived){skipped++;continue}
    const {data:claim,error:claimError}=await db.from('push_delivery_log').insert({user_id:item.userId,dedupe_key:item.key}).select('id').single()
    if(claimError){skipped++;continue} // Unique constraint means already claimed.
    const {data:devices,error:deviceError}=await db.from('push_subscriptions').select('id,endpoint,p256dh,auth_secret').eq('user_id',item.userId)
    if(deviceError||!devices?.length){await db.from('push_delivery_log').delete().eq('id',claim.id);skipped++;continue}
    let delivered=0
    for(const device of devices) {
      const body=JSON.stringify({title:item.title,options:{body:item.body,tag:item.key,icon:'/app-icon.svg',badge:'/app-icon.svg',data:{baseUrl:`/reminder?lessonId=${encodeURIComponent(item.lessonId)}`}}})
      try { await webpush.sendNotification({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_secret}},body,{TTL:600});delivered++ }
      catch(err) {
        if(err?.statusCode===404||err?.statusCode===410) await db.from('push_subscriptions').delete().eq('id',device.id)
      }
    }
    if(delivered){sent+=delivered}
    else {failed++;await db.from('push_delivery_log').delete().eq('id',claim.id)}
  }
  return Response.json({ok:true,sent,failed,skipped})
})
