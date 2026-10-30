// FIT import: files and zips the user picked → workouts + series + original files, in batches. Tested in scripts/test-fitimport.mjs.
// Nothing leaves the device. Duplicates are skipped by file hash and by workout id (watch serial + start time).
import { walkFiles } from './zip.js'
import { decodeFit, fitCrc } from './fit.js'
import { normalizeFit } from './fitNormalize.js'
import { deriveWorkout } from '../lib/fitAnalysis.js'

export const MAX_FIT_BYTES = 20 * 1024 * 1024

/** Hex SHA-256 of the bytes (CRC + size where WebCrypto is missing, e.g. plain-http dev hosts). */
export async function hashBytes(u8) {
  if (globalThis.crypto?.subtle) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8))
    return Array.from(h, b => b.toString(16).padStart(2, '0')).join('')
  }
  return `crc-${fitCrc(u8).toString(16)}-${u8.length}`
}

/** Decode one FIT file into stored records. Throws on files that aren't FIT. */
export async function readFitFile(bytes, path, { importedAt = Date.now() } = {}) {
  const sha256 = await hashBytes(bytes)
  const decoded = decodeFit(bytes)
  const { workouts, skipped } = normalizeFit(decoded, { fileName: path, size: bytes.length, sha256, importedAt })
  return {
    sha256, skipped, errors: decoded.errors, crcOk: decoded.crcOk,
    workouts: workouts.map(({ workout, series }) => ({ workout: { ...workout, derived: deriveWorkout(workout, series) }, series })),
  }
}

/**
 * Import picked files. `known` = { hashes: Set, ids: Set } already stored; `onBatch({ workouts, series, files })` persists
 * a batch (awaited). Returns the report: { files, fit, added, duplicates, skipped, damaged, errors: [{ path, error }] }.
 */
export async function importFit(blobs, { known = { hashes: new Set(), ids: new Set() }, onBatch, onProgress = () => {}, batchSize = 20, signal, now = Date.now } = {}) {
  const report = { files: 0, fit: 0, added: 0, duplicates: 0, skipped: 0, damaged: 0, errors: [] }
  const hashes = new Set(known.hashes), ids = new Set(known.ids)
  let batch = { workouts: [], series: [], files: [] }
  const flush = async () => { if (batch.workouts.length || batch.files.length) { await onBatch?.(batch); batch = { workouts: [], series: [], files: [] } } }
  for await (const item of walkFiles(blobs)) {
    if (signal?.aborted) break
    report.files += 1
    if (item.kind === 'error') { report.errors.push({ path: item.path, error: 'This zip could not be opened' }); continue }
    if (item.kind !== 'fit') continue
    report.fit += 1
    onProgress({ ...report, path: item.path })
    try {
      const bytes = await item.read()
      if (bytes.length > MAX_FIT_BYTES) { report.errors.push({ path: item.path, error: 'Too large for a workout file' }); continue }
      const sha = await hashBytes(bytes)
      if (hashes.has(sha)) { report.duplicates += 1; continue }
      const r = await readFitFile(bytes, item.path, { importedAt: now() })
      hashes.add(sha)
      if (r.skipped) { report.skipped += 1; continue }
      if (!r.crcOk || r.errors.length) report.damaged += 1
      const fresh = r.workouts.filter(x => !ids.has(x.workout.id))
      report.duplicates += r.workouts.length - fresh.length
      if (!fresh.length) continue
      for (const { workout, series } of fresh) { ids.add(workout.id); batch.workouts.push(workout); batch.series.push(series); report.added += 1 }
      batch.files.push({ id: sha, name: fresh[0].workout.fileName, size: bytes.length, importedAt: fresh[0].workout.importedAt, workoutIds: fresh.map(x => x.workout.id), bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
      if (batch.workouts.length >= batchSize) await flush()
    } catch (e) {
      report.errors.push({ path: item.path, error: /FIT/.test(e?.message) ? 'Not a readable FIT file' : 'Could not read this file' })
    }
  }
  await flush()
  onProgress({ ...report, path: null })
  return report
}
