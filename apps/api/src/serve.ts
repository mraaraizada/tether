import { allSegments, app, startupSummary, transcripts } from './index.js'

const PORT = Number(process.env.PORT ?? 8787)

const server = app.listen(PORT, () => {
  console.log(
    `API on http://localhost:${PORT} — ${transcripts.length} transcripts, ${allSegments.length} segments, mode: ${startupSummary()}`,
  )
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`
Port ${PORT} is already in use. Set PORT to something else, or stop the other process.
`)
    process.exit(1)
  }
  console.error('Server error:', error)
  process.exit(1)
})
