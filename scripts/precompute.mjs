/**
 * Copies locally computed answers into data/precomputed/, which is committed
 * and shipped with the deployment.
 *
 * Why: model calls take 30-120s, and serverless platforms cap a request at 60s.
 * Shipping the answers means the deployed demo responds instantly and cannot
 * time out. Anything not precomputed (a new question in Ask) still hits the
 * model normally.
 *
 * Usage: run the app locally, open every view once, then `npm run precompute`.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const from = path.join(root, '.cache')
const to = path.join(root, 'data', 'precomputed')

if (!fs.existsSync(from)) {
  console.error('No .cache directory. Start the app, open each view once, then re-run this.')
  process.exit(1)
}

fs.mkdirSync(to, { recursive: true })
const files = fs.readdirSync(from).filter((file) => file.endsWith('.json'))

for (const file of files) fs.copyFileSync(path.join(from, file), path.join(to, file))

console.log(`Copied ${files.length} cached answer(s) into data/precomputed/`)
console.log('Commit that folder so the deployment ships with them.')
