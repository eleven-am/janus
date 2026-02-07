const PORT = parseInt(process.env.PORT || "3000", 10)

const handler = await import("./dist/server/server.js").then((m) => m.default)

function serveStaticAsset(pathname: string): Response | null {
  const filePath = `./dist/client${pathname}`
  const file = Bun.file(filePath)

  if (!file.size) return null

  const headers: Record<string, string> = {}

  if (pathname.startsWith("/assets/")) {
    headers["cache-control"] = "public, max-age=31536000, immutable"
  }

  return new Response(file, { headers })
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)

    const staticResponse = serveStaticAsset(url.pathname)
    if (staticResponse) return staticResponse

    return handler.fetch(request)
  },
})

console.log(`[Janus] Server listening on port ${PORT}`)
