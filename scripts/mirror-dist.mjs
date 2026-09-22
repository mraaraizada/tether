/**
 * Copies apps/web/dist to ./dist after a build.
 *
 * Deploy platforms disagree about where a monorepo's output lives: with the
 * project's Root Directory set to the repo root they look for ./dist, and with
 * it set to apps/web they look for apps/web/dist. The build succeeds either
 * way and then fails on a path, which is a miserable thing to debug from a log.
 * Writing both costs a few hundred kilobytes and makes the deployment
 * independent of a dashboard setting.
 */
import fs from 'node:fs'
import path from 'node:path'

const from = path.resolve('apps/web/dist')
const to = path.resolve('dist')

if (!fs.existsSync(from)) {
  console.error(`No build output at ${from} — did the web build run?`)
  process.exit(1)
}

fs.rmSync(to, { recursive: true, force: true })
fs.cpSync(from, to, { recursive: true })

console.log(`Mirrored build output to ${to}`)
