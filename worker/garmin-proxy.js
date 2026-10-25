const GARMIN_ORIGIN = 'https://personal.connectapi.garmin.com'

function cors(origin, allowedOrigin) {
  const allowed = allowedOrigin || origin || '*'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const headers = cors(origin, env.ALLOWED_ORIGIN)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    const incoming = new URL(request.url)
    const target = new URL(incoming.pathname.replace(/^\//, '') + incoming.search, `${GARMIN_ORIGIN}/`)
    const forwarded = new Request(target, request)
    const response = await fetch(forwarded)
    const output = new Response(response.body, response)
    Object.entries(headers).forEach(([key, value]) => output.headers.set(key, value))
    return output
  }
}
