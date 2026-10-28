// Garmin capability probe (src/sync/probe.js): shape/privacy helpers, URL filling, runner and report.
import assert from 'node:assert/strict'
const P = await import(new URL('../src/sync/probe.js', import.meta.url))
const { GarminError } = await import(new URL('../src/sync/garmin.js', import.meta.url))
const { shapeOf, hasData, fill, missingFor, redactKey, statusForError, probeContext, runProbes, buildReport } = P

// shapeOf
assert.equal(shapeOf(null), 'null')
assert.equal(shapeOf(undefined), 'null')
assert.equal(shapeOf(3), 'num')
assert.equal(shapeOf('x'), 'str')
assert.equal(shapeOf(true), 'bool')
assert.equal(shapeOf(() => 1), '?')
assert.equal(shapeOf({ a: 1, b: { c: 'x', d: null } }), '{a:num,b:{c:str,d:null}}')
assert.equal(shapeOf([{ a: 1 }, { b: 'x' }, { a: 2, c: true }]), '[3×{a:num,b:str,c:bool}]')
assert.equal(shapeOf([{ a: null }, { a: 4 }]), '[2×{a:num}]')
assert.equal(shapeOf([[1, 2]]), '[1×[2×num]]')
assert.equal(shapeOf([]), '[]')
assert.equal(shapeOf({}), '{}')
assert.equal(shapeOf([null, 5]), '[2×num]')
assert.equal(shapeOf([null]), '[1×null]')
let deep = { v: 1 }
for (let i = 0; i < 8; i++) deep = { n: deep }
assert.match(shapeOf(deep), /\{…1 keys\}/)
assert.equal(redactKey('2026-01-02'), '<date>')
assert.equal(redactKey('2026-01-02T10:00'), '<date>')
assert.equal(redactKey('12345'), '<n>')
assert.equal(redactKey('E0399703-3ad1-4a14-97d1-d21fc75573cf'), '<id>')
assert.equal(redactKey('a@b.co'), '<email>')
assert.equal(redactKey('x'.repeat(49)), '<key>')
assert.equal(redactKey('heartRate'), 'heartRate')
assert.equal(shapeOf({ '2026-01-01': 1, '2026-01-02': 2, 55: 'x' }), '{<n>:str,<date>:num}')
assert.match(shapeOf(Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`k${i}`, 1]))), /,…\+10 more\}$/)
assert.ok(shapeOf(Array.from({ length: 2000 }, () => Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`some_long_key_name_padding_xxxxxxxxxxxxxxxx_${i}`, 1])))).endsWith('…(truncated)'))
const secret = { name: 'SECRET-NAME', id: 987654321, mail: 'a@b.co', 'a@b.co': 'x', byDay: { '2026-03-04': 55, '2026-03-05': 66 }, list: [{ who: 'SECRET-NAME', n: 987654321 }] }
const out = shapeOf(secret)
for (const bad of ['SECRET-NAME', '987654321', 'a@b.co', '2026-03-04']) assert.ok(!out.includes(bad), `shape leaks ${bad}`)

// hasData
for (const v of [null, [], {}, { calendarDate: '2026-01-01', userProfilePK: 1, value: null }, { a: '' }, { a: [] }, { a: {} }])
  assert.equal(hasData(v), false, JSON.stringify(v))
assert.equal(hasData({ value: 3 }), true)
assert.equal(hasData([{ x: null }, { x: 0 }]), true)

// fill / missingFor
const ctx = probeContext({ displayName: 'a b/c', activityId: 77 }, '2026-02-10')
assert.equal(ctx.weekAgo, '2026-02-04')
assert.equal(ctx.monthAgo, '2026-01-12')
assert.deepEqual(fill('/x/{weekAgo}/{date}', ctx), { path: '/x/2026-02-04/2026-02-10', params: {} })
assert.deepEqual(fill('/x?startDate={weekAgo}&endDate={date}', ctx), { path: '/x', params: { startDate: '2026-02-04', endDate: '2026-02-10' } })
assert.equal(fill('/u/{displayName}', ctx).path, '/u/a%20b%2Fc')
assert.equal(fill('/g?pk={profileId}', ctx), null)
assert.equal(missingFor('/g?pk={profileId}/{activityId}', ctx), 'profileId')
assert.equal(missingFor('/a/{date}', ctx), null)

// statusForError
assert.equal(statusForError({ status: 403 }), 'unavailable')
assert.equal(statusForError({ status: 404 }), 'unavailable')
assert.equal(statusForError({ status: 401 }), 'unavailable')
assert.equal(statusForError({ status: 429 }), 'limited')
assert.equal(statusForError({ status: 500 }), 'error')
assert.equal(statusForError({ kind: 'network' }), 'error')

// runner
const err = (status, kind, extra = {}) => new GarminError('boom', { status, kind, ...extra })
const mk = (routes, calls = [], sleeps = []) => ({
  calls, sleeps,
  deps: {
    request: async (path) => {
      calls.push(path)
      const r = typeof routes[path] === 'function' ? routes[path]() : routes[path]
      if (r instanceof Error) throw r
      return r
    },
    sleep: async ms => { sleeps.push(ms) },
    markExpired: () => { sleeps.expired = (sleeps.expired || 0) + 1 },
    now: () => 0,
  },
})
const pr = (id, url, more = {}) => ({ id, group: 'Account', label: id, unlocks: '', url, ...more })
const run = (probes, routes, c = {}) => { const m = mk(routes); return runProbes({ probes, ctx: { date: 'D', ...c }, deps: m.deps, gapMs: 7 }).then(r => ({ ...r, m })) }
const by = r => Object.fromEntries(r.results.map(x => [x.id, x]))

{
  const r = await run([pr('a', '/a'), pr('b', '/b'), pr('c', '/c'), pr('d', '/d'), pr('e', '/e')],
    { '/a': { x: 1 }, '/b': [], '/c': err(403, 'auth'), '/d': err(404, 'not-found'), '/e': err(500, 'server') })
  const s = by(r)
  assert.equal(s.a.status, 'ok'); assert.equal(s.a.shape, '{x:num}')
  assert.equal(s.b.status, 'empty'); assert.ok(s.b.note)
  assert.equal(s.c.status, 'unavailable'); assert.equal(s.c.http, 403); assert.match(s.c.note, /403/)
  assert.equal(s.d.status, 'unavailable')
  assert.equal(s.e.status, 'error'); assert.equal(s.e.note, 'Garmin server error (500)')
  assert.deepEqual(r.m.sleeps, [7, 7, 7, 7], 'gap between requests only')
  assert.equal(r.error, null); assert.equal(r.cancelled, false)
}
{
  let n = 0
  const r = await run([pr('a', '/a')], { '/a': () => { if (n++ === 0) throw err(429, 'rate-limit', { retryAfterMs: 1234 }); return { x: 1 } } })
  assert.equal(by(r).a.status, 'ok'); assert.deepEqual(r.m.sleeps, [1234])
}
{
  const r = await run([pr('a', '/a')], { '/a': err(429, 'rate-limit') })
  assert.equal(by(r).a.status, 'limited'); assert.equal(by(r).a.http, 429); assert.deepEqual(r.m.sleeps, [5000])
}
{
  const l = err(429, 'rate-limit', { retryAfterMs: 1 })
  const r = await run(['a', 'b', 'c', 'd'].map(i => pr(i, `/${i}`)), { '/a': l, '/b': l, '/c': l, '/d': { x: 1 } })
  assert.equal(r.results.length, 3); assert.match(r.error, /rate limiting/)
}
{
  const r = await run([pr('a', '/a/{displayName}')], {})
  assert.equal(by(r).a.status, 'skipped'); assert.equal(by(r).a.note, P.NEEDS.displayName); assert.equal(r.m.calls.length, 0)
}
{
  const r = await run([pr('p', '/p', { capture: j => ({ displayName: j.n, profileId: 42, activityId: '' }) }), pr('q', '/q/{displayName}'), pr('g', '/g?pk={profileId}')],
    { '/p': { n: 'Zed Q' }, '/q/Zed%20Q': { y: 1 }, '/g': { z: 1 } })
  assert.equal(by(r).q.status, 'ok'); assert.ok(r.m.calls.includes('/q/Zed%20Q')); assert.equal(by(r).g.status, 'ok')
}
{
  const r = await run([pr('s', '/s', { session: true }), pr('t', '/t')], { '/s': err(401, 'auth'), '/t': { x: 1 } })
  assert.match(r.error, /rejected your session/); assert.equal(r.m.sleeps.expired, 1); assert.deepEqual(r.m.calls, ['/s'])
}
{
  const r = await run([pr('s', '/s'), pr('t', '/t')], { '/s': err(null, 'session'), '/t': { x: 1 } })
  assert.match(r.error, /rejected your session/); assert.equal(r.m.sleeps.expired, undefined); assert.deepEqual(r.m.calls, ['/s'])
}
{
  const ac = new AbortController()
  const m = mk({ '/a': { x: 1 }, '/b': { x: 1 } })
  const r = await runProbes({ probes: [pr('a', '/a'), pr('b', '/b')], ctx: { date: 'D' }, signal: ac.signal, deps: m.deps, gapMs: 0, onResult: () => ac.abort() })
  assert.equal(r.cancelled, true); assert.deepEqual(m.calls, ['/a'])
}
{
  const r = await runProbes({ probes: [pr('a', '/a')], ctx: { date: 'D' }, gapMs: 0, timeoutMs: 5, deps: { request: (p, q, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new GarminError('Cancelled', { kind: 'aborted' })))), sleep: async () => {}, markExpired() {}, now: () => 0 } })
  assert.equal(r.results[0].status, 'error'); assert.equal(r.results[0].note, 'Timed out')
}

// error notes are fixed copy: GarminError messages can embed the filled path
{
  const leak = 'SENTINEL-NAME'
  const msg = `Garmin rejected the request (400) for /x/${leak}`
  const routes = { [`/x/${leak}`]: new GarminError(msg, { status: 400, kind: 'bad-request' }), [`/y/${leak}`]: new GarminError(`fetch failed ${leak}`, { kind: 'network' }), [`/z/${leak}`]: new Error(leak) }
  const r = await run([pr('x', '/x/{displayName}'), pr('y', '/y/{displayName}'), pr('z', '/z/{displayName}')], routes, { displayName: leak })
  const s = by(r)
  assert.equal(s.x.note, 'Garmin rejected the request (400)')
  assert.equal(s.y.note, 'Could not reach Garmin')
  assert.equal(s.z.note, 'Unexpected error')
  assert.ok(!JSON.stringify(r.results).includes(leak))
}

// report: templates only, never ctx values
{
  const sentinel = 'SENTINEL-DISPLAY'
  const probes = [pr('a', '/a/{displayName}?d={date}', { extra: () => ['directSpeed'] }), pr('b', '/b/{profileId}'), { ...pr('c', '/c'), group: 'Sleep' }]
  const c = { date: '2026-01-01', displayName: sentinel }
  const m = mk({ [`/a/${sentinel}`]: { x: 1 }, '/c': err(403, 'auth') })
  const r = await runProbes({ probes, ctx: c, deps: m.deps, gapMs: 0 })
  const report = buildReport(r.results, { probes, date: '2026-01-01' })
  assert.ok(!report.includes(sentinel)); assert.ok(!JSON.stringify(r.results).includes(sentinel))
  assert.ok(report.includes('/a/{displayName}?d={date}'))
  assert.ok(report.includes('3 checked · 1 available · 0 no data · 1 not available · 0 errors/limited · 1 skipped'))
  assert.ok(report.includes('## Account') && report.includes('## Sleep'))
  assert.ok(report.indexOf('## Account') < report.indexOf('## Sleep'))
  assert.ok(report.includes('✓ a 200') && report.includes('✗ c 403') && report.includes('– b skipped'))
  assert.ok(report.includes('  metrics: directSpeed'))
}

assert.equal(P.PROBES.length, 38)
assert.deepEqual(P.PROBES.find(p => p.id === 'app.sleep').capture([{ userProfilePK: 7 }]), { profileId: 7 })
assert.deepEqual(P.PROBES.find(p => p.id === 'app.hrv').capture({ userProfilePk: 8 }), { profileId: 8 })
assert.equal(new Set(P.PROBES.map(p => p.id)).size, 38)
console.log('probe tests: all passed')
