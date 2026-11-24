// Custom machine authentication. Deploy with verify_jwt=false ONLY for this function.
// No service key is ever returned or installed on the ESP8266.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type':'application/json','Cache-Control':'no-store'},
});
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply(405,{error:'POST required'});
  const token = req.headers.get('x-device-token') ?? '';
  if (!tokenPattern.test(token)) return reply(401,{error:'Device authentication failed'});
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply(400,{error:'Missing body'});
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply(413,{error:'Body too large'}); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const c of chunks) { bytes.set(c,offset); offset += c.byteLength; }
    let b;
    try { b = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400,{error:'Invalid JSON'}); }
    if (!b || typeof b.device_id !== 'string' || !uuid.test(b.device_id) ||
      typeof b.state1 !== 'boolean' || typeof b.state2 !== 'boolean' ||
      typeof b.reset !== 'boolean' || !Array.isArray(b.ack) || b.ack.length > 2 ||
      !b.ack.every((x: unknown) => typeof x === 'string' && uuid.test(x))) return reply(400,{error:'Invalid sync payload'});
    // Phase 3 firmware remains supported; absent events means an empty batch.
    const events = b.events === undefined ? [] : b.events;
    if (!Array.isArray(events) || events.length > 8 || !events.every((e: any) =>
      e && typeof e.id === 'string' && /^[0-9a-f]{32}$/.test(e.id) &&
      (e.channel === 1 || e.channel === 2) && typeof e.state === 'boolean' &&
      Number.isInteger(e.epoch) && e.epoch >= 0 && e.epoch <= 4102444800))
      return reply(400,{error:'Invalid offline event batch'});
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply(503,{error:'Server configuration missing'});
    const res = await fetch(`${url}/rest/v1/rpc/smartroom_device_sync_v4`, {
      method:'POST', headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_device:b.device_id,p_token:token,p_state1:b.state1,p_state2:b.state2,p_ack:b.ack,p_reset:b.reset,p_events:events}),
      signal:AbortSignal.timeout(5000),
    });
    const result = await res.json();
    if (!res.ok) {
      if (result?.code === '28000') return reply(401,{error:'Device authentication failed'});
      if (result?.code === '22023') return reply(400,{error:'Invalid sync'});
      console.error('Device sync database error',res.status,result?.code); // Never log credentials/body.
      return reply(502,{error:'Database sync failed'});
    }
    return reply(200,result);
  } catch { return reply(503,{error:'Device sync temporarily unavailable'}); }
});
