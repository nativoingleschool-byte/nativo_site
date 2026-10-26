import { getSupabaseAdmin, getSupabaseConfig, verifyUserFromToken } from '../../services/supabase-admin.js'
import { createClient } from '@supabase/supabase-js'

const respond = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)) }
export default async function handler(req,res) {
  if (!['GET','POST','DELETE'].includes(req.method)) return respond(res,405,{error:'Method not allowed'})
  const token = String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim()
  if (!token) return respond(res,401,{error:'Authentication required'})
  try {
    const {url,anonKey} = getSupabaseConfig()
    const auth = createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data,error} = await auth.auth.getUser(token)
    const user = data?.user || (!error ? null : await verifyUserFromToken(token))
    if(!user) return respond(res,401,{error:'Invalid session'})
    const db = getSupabaseAdmin()
    const {data:profile,error:profileError} = await db.from('profiles').select('id,archived').eq('id',user.id).single()
    if(profileError || !profile || profile.archived) return respond(res,403,{error:'Profile unavailable'})
    if(req.method==='GET') return respond(res,200,{publicKey:process.env.VAPID_PUBLIC_KEY||'',configured:Boolean(process.env.VAPID_PUBLIC_KEY)})
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{})
    if(req.method==='DELETE') {
      if(typeof body.endpoint!=='string'||body.endpoint.length>2048) return respond(res,400,{error:'Invalid endpoint'})
      const {error:removeError}=await db.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',body.endpoint)
      if(removeError) throw removeError
      return respond(res,200,{ok:true})
    }
    if(!process.env.VAPID_PUBLIC_KEY) return respond(res,503,{error:'Push has not been configured'})
    const sub=body.subscription
    if(!sub||!/^https:\/\//.test(sub.endpoint||'')||sub.endpoint.length>2048||!sub.keys?.p256dh||!sub.keys?.auth) return respond(res,400,{error:'Invalid push subscription'})
    const hostname = new URL(sub.endpoint).hostname.toLowerCase()
    const allowedHosts = ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','push.services.mozilla.com','wns2-by3p.notify.windows.com']
    if (!allowedHosts.includes(hostname) && !hostname.endsWith('.notify.windows.com') && !hostname.endsWith('.push.apple.com'))
      return respond(res,400,{error:'Unsupported push service'})

    if(sub.keys.p256dh.length>512||sub.keys.auth.length>512) return respond(res,400,{error:'Invalid push keys'})
    const {error:saveError}=await db.from('push_subscriptions').upsert({user_id:user.id,endpoint:sub.endpoint,p256dh:sub.keys.p256dh,auth_secret:sub.keys.auth,updated_at:new Date().toISOString()},{onConflict:'endpoint'})
    if(saveError) throw saveError
    return respond(res,200,{ok:true})
  } catch(err) { console.error('[push:subscription]',err?.message);return respond(res,500,{error:'Unable to save push settings'}) }
}
