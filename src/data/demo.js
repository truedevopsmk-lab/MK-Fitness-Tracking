// Deterministic demo data: 400 days ending today, with correlated metrics so insights have something to find.
import { addDays, eachDay, parseDay, today } from '../lib/dates.js'

function rng(seed) { // mulberry32
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const r1 = v => Math.round(v * 10) / 10

const ACTIVITY_KINDS = {
  running: { names: ['Morning run', 'Easy run', 'Tempo run', 'Long run'], speed: [2.7, 3.5], hr: [140, 168], load: 9, kcal: 62 },
  cycling: { names: ['Road ride', 'Evening ride', 'Weekend ride'], speed: [6.2, 8.4], hr: [120, 150], load: 6, kcal: 40 },
  strength_training: { names: ['Strength', 'Gym session', 'Upper body'], speed: [0, 0], hr: [100, 128], load: 7, kcal: 45 },
  walking: { names: ['Evening walk', 'Lunch walk', 'Walk'], speed: [1.2, 1.5], hr: [90, 112], load: 2, kcal: 28 },
}

export function generateDemo(seed = 20260101) {
  const rand = rng(seed), noise = (s = 1) => (rand() + rand() + rand() - 1.5) * (2 / 3) * s // ~N(0, s/…)
  const end = today(), start = addDays(end, -399), all = eachDay(start, end)
  const gapStart = addDays(end, -92), gapEnd = addDays(end, -88)
  // a 4-night HRV dip running to today, so the 'below baseline' insight has something to find
  const dipStart = addDays(end, -3), dipEnd = end
  const days = [], activities = []
  let prevSleepH = 7, actSeq = 0
  const hrvWindow = []

  all.forEach((date, i) => {
    const dow = parseDay(date).getDay(), weekend = dow === 0 || dow === 6
    const missing = (date >= gapStart && date <= gapEnd) || (date !== end && rand() < .03)
    // activities first (they influence the day's load and next-night recovery)
    const todays = []
    const wantAct = (weekend ? .7 : .45) + (dow === 3 ? .1 : 0)
    if (!missing && date !== end && rand() < wantAct) {
      const roll = rand(), type = roll < .42 ? 'running' : roll < .62 ? 'cycling' : roll < .8 ? 'strength_training' : 'walking'
      const k = ACTIVITY_KINDS[type]
      const hour = weekend ? 6 + Math.floor(rand() * 3) : rand() < .6 ? 6 : 18
      const durMin = type === 'running' ? 28 + rand() * 50 : type === 'cycling' ? 45 + rand() * 90 : type === 'strength_training' ? 35 + rand() * 30 : 25 + rand() * 40
      const durationSec = Math.round(durMin * 60), speed = k.speed[0] + rand() * (k.speed[1] - k.speed[0])
      const avgHr = Math.round(k.hr[0] + rand() * (k.hr[1] - k.hr[0])), startTs = parseDay(date).getTime() + (hour * 60 + Math.floor(rand() * 40)) * 60000
      const intensity = (avgHr - 90) / 80, load = Math.round(k.load * durMin / 6 * clamp(intensity, .3, 1.2))
      const z = [0, 0, 0, 0, 0], peak = clamp(Math.round((avgHr - 95) / 14), 0, 4)
      for (let s = 0; s < durationSec; s += 30) z[clamp(peak + Math.round(noise(1.3)), 0, 4)] += 30
      todays.push({
        id: `demo-${++actSeq}`, name: k.names[Math.floor(rand() * k.names.length)], type, day: date, startTs, durationSec, movingSec: Math.round(durationSec * .96),
        distanceM: speed ? Math.round(speed * durationSec * .96) : 0, calories: Math.round(durMin * k.kcal / 4 * (.9 + rand() * .3) + 40), avgHr, maxHr: Math.round(avgHr + 14 + rand() * 18),
        elevationGainM: speed ? Math.round(durMin * (type === 'cycling' ? 4 : 1.4) * (.5 + rand())) : 0, avgSpeed: speed ? r1(speed * 100) / 100 : null, trainingLoad: load,
        aerobicTE: r1(clamp(1.2 + load / 55 + noise(.4), 1, 5)), anaerobicTE: type === 'strength_training' ? r1(1 + rand() * 1.4) : r1(rand() * .8),
        steps: type === 'running' ? Math.round(durMin * 165) : type === 'walking' ? Math.round(durMin * 105) : null, hrZonesSec: z,
      })
    }
    activities.push(...todays)
    if (missing) { prevSleepH = 7; return }

    const drift = Math.sin(i / 55) * 2.5 + i * .006, dip = date >= dipStart && date <= dipEnd
    const load = todays.reduce((a, x) => a + (x.trainingLoad || 0), 0)
    // sleep
    // weekday nights ~7 h with the odd short one, weekend lie-ins ~8 h
    const sleepH = clamp((weekend ? 8 : 7) + noise(1) - (rand() < .12 ? 1.3 : 0) + (load > 60 ? .2 : 0) - (dip ? .6 : 0), 5.2, 9.2)
    const awakePct = clamp(.055 + noise(.02) + (sleepH < 6.3 ? .01 : 0), .03, .08)
    const deepPct = clamp(.175 + noise(.03) + (load > 40 ? .015 : 0), .15, .2), remPct = clamp(.225 + noise(.025), .2, .25)
    const total = sleepH * 3600, asleep = Math.round(total * (1 - awakePct))
    const deepSec = Math.round(asleep * deepPct), remSec = Math.round(asleep * remPct), lightSec = asleep - deepSec - remSec, awakeSec = Math.round(total - asleep)
    const score = Math.round(clamp(38 + sleepH * 6.2 + deepPct * 60 - awakePct * 140 + noise(5), 45, 96))
    // HRV and heart rate
    const hrv = clamp(56 + drift + (sleepH - 7) * 3 + noise(5) - (dip ? 16 : 0), 36, 78)
    const rhr = Math.round(clamp(58 - (hrv - 56) * .22 + noise(1.6) + (dip ? 3 : 0), 48, 68))
    const hrvStatus = hrv < 46 ? 'LOW' : hrv < 51 ? 'UNBALANCED' : 'BALANCED'
    const baseLow = Math.round(drift + 49), baseHigh = Math.round(drift + 63)
    // body battery
    const charged = Math.round(clamp(8 + sleepH * 8 + (score - 70) * .45 + noise(5), 38, 100))
    const bbStart = Math.round(clamp(charged + noise(5), 35, 100))
    // stress (worse after short sleep, on heavy-load days)
    const stressAvg = Math.round(clamp(33 + (7 - sleepH) * 5 + (dip ? 8 : 0) + load * .05 + (weekend ? -4 : 3) + noise(5), 18, 62))
    const waking = 16 * 3600, hi = Math.round(waking * clamp((stressAvg - 18) / 150, .03, .3)), med = Math.round(waking * clamp((stressAvg - 8) / 110, .08, .38))
    const lowS = Math.round(waking * .3), restS = Math.max(0, waking - hi - med - lowS)
    const drained = Math.round(clamp(20 + stressAvg * .6 + load * .2 + noise(6), 22, 75))
    const bbLow = Math.round(clamp(bbStart - drained, 6, 70))
    // steps and intensity
    const goal = 10000
    const steps = Math.round(clamp((weekend ? 9200 : 8800) + noise(3400) + (todays.some(a => a.type === 'running' || a.type === 'walking') ? 2600 : 0) + (dip ? -1200 : 0), 4000, 16000))
    // Garmin only counts sustained 10+ min bouts, so most of the day's steps earn nothing
    const moderate = Math.round(clamp((steps - 7000) / 260 + noise(6) + (todays.some(a => a.type === 'walking' || a.type === 'strength_training') ? 18 : 0), 0, 45)), vigorous = Math.round(todays.some(a => a.type === 'running' || a.type === 'cycling') ? 12 + rand() * 22 : 0)
    // readiness
    const readiness = Math.round(clamp(22 + score * .32 + (hrv - 40) * .85 - (load > 70 ? 8 : 0) + noise(5), 15, 98))

    const rec = {
      date,
      steps: { total: steps, goal, distanceM: Math.round(steps * .76) },
      stress: { avg: stressAvg, max: Math.round(clamp(stressAvg + 38 + noise(10), 60, 99)), restSec: restS, lowSec: lowS, mediumSec: med, highSec: hi },
      bodyBattery: { start: bbStart, end: Math.round(clamp(bbLow + 4, 6, 70)), high: Math.min(100, bbStart), low: bbLow, charged, drained },
      sleep: {
        score, qualifier: score >= 80 ? 'GOOD' : score >= 60 ? 'FAIR' : 'POOR', durationSec: asleep, deepSec, lightSec, remSec, awakeSec,
        startTs: null, endTs: null, needSec: 7.5 * 3600, restingHr: rhr - 2, avgHr: rhr + 3, avgHrv: Math.round(hrv), avgRespiration: r1(14.2 + noise(1)), avgSpo2: Math.round(95 + noise(2)), bodyBatteryChange: charged,
      },
      hrv: { lastNight: Math.round(hrv), weeklyAvg: (hrvWindow.push(hrv), hrvWindow.length > 7 && hrvWindow.shift(), Math.round(hrvWindow.reduce((a, b) => a + b, 0) / hrvWindow.length)), lastNightHigh: Math.round(hrv + 16 + noise(4)), status: hrvStatus, baselineLow: baseLow, baselineHigh: baseHigh },
      heartRate: { resting: rhr, min: rhr - 6, max: Math.round(clamp(rhr + 70 + load * .6 + noise(10), 110, 185)) },
      intensity: { moderate, vigorous, goal: 150 },
      readiness: { score: readiness, level: readiness >= 75 ? 'HIGH' : readiness >= 50 ? 'MODERATE' : 'LOW', feedback: readiness >= 75 ? 'GOOD_SLEEP_HISTORY' : readiness >= 50 ? 'MODERATE' : 'RECOVERY_NEEDED' },
      weight: rand() < .35 ? { kg: r1(74.5 - i * .004 + noise(.5)) } : undefined,
    }
    // wake time at ~06:30-07:30 local; used for hypnogram + sleep times
    const wake = parseDay(date).getTime() + (6.5 + rand() * 1.0 + (weekend ? .8 : 0)) * 3600000
    rec.sleep.endTs = Math.round(wake); rec.sleep.startTs = Math.round(wake - total * 1000)
    const fromEnd = all.length - 1 - i
    if (fromEnd < 30) rec.sleep.stages = hypnogram(rand, rec.sleep.startTs, { deepSec, lightSec, remSec, awakeSec })
    if (fromEnd < 14) rec.bodyBattery.samples = bbSamples(parseDay(date).getTime(), bbLow, bbStart, rec.sleep.endTs, rec.sleep.startTs - 86400000 * 0, charged, rand)
    if (todays.length) rec.training = { count: todays.length, durationSec: todays.reduce((a, x) => a + x.durationSec, 0), distanceM: todays.reduce((a, x) => a + x.distanceM, 0), calories: todays.reduce((a, x) => a + x.calories, 0), load }
    else rec.training = { count: 0, durationSec: 0, distanceM: 0, calories: 0, load: 0 }
    if (!rec.weight) delete rec.weight
    // today is partial: the day isn't over yet
    if (date === end) {
      const f = clamp((new Date().getHours() * 60 + new Date().getMinutes()) / 1440, .25, 1)
      rec.steps.total = Math.round(rec.steps.total * f); rec.stress.highSec = Math.round(hi * f); rec.stress.mediumSec = Math.round(med * f); rec.stress.lowSec = Math.round(lowS * f); rec.stress.restSec = Math.round(restS * f)
      rec.intensity.moderate = Math.round(moderate * f); rec.intensity.vigorous = 0
      rec.bodyBattery.end = Math.round(bbStart - (bbStart - bbLow) * f); rec.bodyBattery.low = rec.bodyBattery.end
    }
    prevSleepH = sleepH
    days.push(rec)
  })
  return { days, activities, profile: { displayName: 'e0399703-3ad1-4a14-97d1-d21fc75573cf', fullName: null, timeZone: 'Asia/Kolkata', stepGoal: 10000, sleepNeedSec: 7.5 * 3600 } }
}

// Plausible hypnogram: light → deep early, REM later, brief awakenings; segment lengths are rescaled to match the night's totals.
function hypnogram(rand, startTs, t) {
  const total = t.deepSec + t.lightSec + t.remSec + t.awakeSec
  const plan = []
  let cycle = 0
  while (plan.reduce((a, s) => a + s[1], 0) < total / 60 * .98) {
    const deepW = Math.max(.2, 1.5 - cycle * .45), remW = .5 + cycle * .55
    plan.push(['light', 20 + rand() * 12], ['deep', 18 * deepW * (.7 + rand() * .6)], ['light', 8 + rand() * 10], ['rem', 12 * remW * (.7 + rand() * .6)])
    if (rand() < .55) plan.push(['awake', 2 + rand() * 4])
    cycle += 1
  }
  const sums = { deep: 0, light: 0, rem: 0, awake: 0 }
  plan.forEach(([k, m]) => { sums[k] += m })
  const want = { deep: t.deepSec, light: t.lightSec, rem: t.remSec, awake: Math.max(t.awakeSec, 60) }
  let ts = startTs
  return plan.map(([stage, m]) => {
    const dur = Math.max(60000, Math.round((m / (sums[stage] || 1)) * want[stage] * 1000))
    const seg = { start: ts, end: ts + dur, stage }; ts += dur; return seg
  })
}

// Body battery every 15 min across the calendar day: charging overnight, draining by day with small stress dips.
function bbSamples(dayStart, low, start, wakeTs, _sleepStart, charged, rand) {
  const out = []
  let level = clamp(start - charged * .85, 5, 60)
  for (let t = dayStart; t < dayStart + 86400000; t += 900000) {
    const h = (t - dayStart) / 3600000
    if (t < wakeTs) level += (start - level) * .09 + rand() * .6
    else level -= (start - low) / ((24 * 3600000 - (wakeTs - dayStart)) / 900000) * (.6 + rand() * .8)
    out.push([t, Math.round(clamp(level, 3, 100))])
    void h
  }
  return out.filter(s => s[0] <= Date.now())
}
