import { createECDH, createPrivateKey, randomBytes, createHmac, createCipheriv, sign } from 'node:crypto'

const b64url = (input) => Buffer.from(input).toString('base64url')
const fromB64url = (value) => Buffer.from(value, 'base64url')
const hmac = (key, value) => createHmac('sha256', key).update(value).digest()
const expand = (prk, info, size) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, size)

/** RFC 8291 aes128gcm with RFC 8292 VAPID. Server-only; never expose VAPID_PRIVATE_KEY. */
export const sendWebPush = async (subscription, payload) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) throw new Error('VAPID server credentials are not configured.')

  const destination = new URL(subscription.endpoint)
  if (destination.protocol !== 'https:') throw new Error('Only HTTPS push endpoints are accepted.')
  const recipientPublic = fromB64url(subscription.p256dh)
  const authSecret = fromB64url(subscription.auth)
  if (recipientPublic.length !== 65 || recipientPublic[0] !== 4 || authSecret.length < 16) {
    throw new Error('Invalid push subscription keys.')
  }

  const sender = createECDH('prime256v1')
  sender.generateKeys()
  const senderPublic = sender.getPublicKey()
  const shared = sender.computeSecret(recipientPublic)
  const ikm = expand(
    hmac(authSecret, shared),
    Buffer.concat([Buffer.from('WebPush: info\0'), recipientPublic, senderPublic]),
    32,
  )
  const salt = randomBytes(16)
  const prk = hmac(salt, ikm)
  const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12)
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const encodedPayload = Buffer.concat([Buffer.from(JSON.stringify(payload), 'utf8'), Buffer.from([2])])
  const encrypted = Buffer.concat([cipher.update(encodedPayload), cipher.final(), cipher.getAuthTag()])
  const recordSize = Buffer.alloc(4)
  recordSize.writeUInt32BE(4096, 0)
  const body = Buffer.concat([salt, recordSize, Buffer.from([senderPublic.length]), senderPublic, encrypted])

  const vapidPublic = fromB64url(publicKey)
  const vapidPrivate = fromB64url(privateKey)
  if (vapidPublic.length !== 65 || vapidPublic[0] !== 4 || vapidPrivate.length !== 32) {
    throw new Error('Invalid VAPID key configuration.')
  }
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: b64url(vapidPublic.subarray(1, 33)),
    y: b64url(vapidPublic.subarray(33, 65)),
    d: b64url(vapidPrivate),
  }
  const signingKey = createPrivateKey({ key: jwk, format: 'jwk' })
  const tokenHeader = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const tokenBody = b64url(JSON.stringify({
    aud: destination.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  }))
  const unsigned = `${tokenHeader}.${tokenBody}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: signingKey, dsaEncoding: 'ieee-p1363' })
  const response = await fetch(destination.href, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${unsigned}.${b64url(signature)}, k=${publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'normal',
    },
    body,
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) {
    const error = new Error(`Push service returned HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.status
}
