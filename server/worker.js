// Confidback 보관함 (Cloudflare Workers + R2)
// 대표의 녹화 원본만 쌓고, 개발자가 조회·내려받고 '개선 완료'를 체크합니다.
// 받아쓰기·정리는 하지 않습니다. 개발자 컴퓨터의 mlx_whisper와 구독 AI가 맡습니다.
// 체크한 원본은 매시간 도는 cron이 체크 후 24시간이 지나면 지웁니다.

const TYPES = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
const MAX_BYTES = 200 * 2 ** 20;
const NAME = /^[\w-]+$/;
const enc = new TextEncoder();
const json = (data, status = 200) => Response.json(data, { status });
const keepMs = (env) => Number(env.KEEP_HOURS ?? 24) * 3600 * 1000;
// R2에는 청구 상한이 없어서, 무료 저장량(10GB) 안에 머물도록 여기서 막습니다.
const maxTotal = (env) => Number(env.MAX_TOTAL_GB ?? 9) * 2 ** 30;

async function usedBytes(bucket) {
  let total = 0, cursor;
  do {
    const page = await bucket.list({ cursor });
    total += page.objects.reduce((sum, o) => sum + o.size, 0);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

// 키는 시간 차이로 새지 않게 비교하고, 비밀값이 설정돼 있지 않으면 항상 거부합니다.
const same = (given, secret) => {
  if (!given || !secret) return false;
  const a = enc.encode(given), b = enc.encode(secret);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
};

// 체크 표시(done/<이름>) 중 보관 시간이 지난 것
export const expired = (markers, now, ms) => markers.filter((o) => now - new Date(o.uploaded).getTime() >= ms);

export default {
  async fetch(req, env) {
    const { pathname, searchParams } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (pathname === '/api/upload' && req.method === 'POST') {
      if (!same(req.headers.get('X-Upload-Key'), env.UPLOAD_KEY)) return json({ error: 'unauthorized' }, 401);
      const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
      const size = Number(req.headers.get('Content-Length'));
      if (!TYPES[type]) return json({ error: 'video only' }, 415);
      if (!(size > 0 && size <= MAX_BYTES)) return json({ error: 'size' }, 413);
      if ((await usedBytes(env.BUCKET)) + size > maxTotal(env)) return json({ error: 'storage full' }, 507);
      const name = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${crypto.randomUUID().slice(0, 8)}`;
      await env.BUCKET.put(`rec/${name}.${TYPES[type]}`, req.body, { httpMetadata: { contentType: type } });
      return json({ name });
    }

    if (!same(req.headers.get('Authorization'), env.DEV_KEY && `Bearer ${env.DEV_KEY}`)) return json({ error: 'unauthorized' }, 401);

    if (pathname === '/api/list') {
      // shortcut: 한 번에 1000개까지만 조회, 넘으면 cursor로 이어 받는다
      const [recs, dones] = await Promise.all([env.BUCKET.list({ prefix: 'rec/' }), env.BUCKET.list({ prefix: 'done/' })]);
      const checked = new Map(dones.objects.map((o) => [o.key.slice(5), o.uploaded]));
      return json(recs.objects.map((o) => {
        const name = o.key.slice(4).replace(/\.\w+$/, '');
        return { key: o.key, name, size: o.size, uploaded: o.uploaded, checkedAt: checked.get(name) ?? null };
      }));
    }

    if (pathname === '/api/file') {
      const key = searchParams.get('key') ?? '';
      const obj = key.startsWith('rec/') && (await env.BUCKET.get(key));
      if (!obj) return json({ error: 'not found' }, 404);
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Content-Length': String(obj.size) } });
    }

    if (pathname === '/api/done' && req.method === 'POST') {
      const name = searchParams.get('name') ?? '';
      if (!NAME.test(name)) return json({ error: 'bad name' }, 400);
      const prev = await env.BUCKET.head(`done/${name}`); // 다시 체크해도 삭제 시각이 미뤄지지 않게 합니다.
      if (prev) return json({ name, deleteAfter: new Date(prev.uploaded.getTime() + keepMs(env)) });
      const { objects } = await env.BUCKET.list({ prefix: `rec/${name}.` });
      if (!objects.length) return json({ error: 'not found' }, 404);
      await env.BUCKET.put(`done/${name}`, objects[0].key);
      return json({ name, deleteAfter: new Date(Date.now() + keepMs(env)) });
    }

    return json({ error: 'not found' }, 404);
  },

  async scheduled(_event, env) {
    const { objects } = await env.BUCKET.list({ prefix: 'done/' });
    for (const marker of expired(objects, Date.now(), keepMs(env))) {
      const key = await (await env.BUCKET.get(marker.key))?.text();
      await env.BUCKET.delete([key, marker.key].filter((k) => k?.startsWith('rec/') || k === marker.key));
    }
  },
};
