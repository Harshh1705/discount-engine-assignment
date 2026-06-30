import http from 'node:http'
import { config as loadEnv } from 'dotenv'
import { parseDiscountRule } from './src/engine/nlRuleParser.js'

loadEnv()

const PORT = Number(process.env.PORT || 3001)
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8')
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && req.url === '/api/parse-discount-rule') {
    try {
      const body = await readRequestBody(req)
      const description = typeof body.description === 'string' ? body.description.trim() : ''

      if (!description) {
        sendJson(res, 400, { error: 'description is required.' })
        return
      }

      const knownBrands = Array.isArray(body.knownBrands) ? body.knownBrands : undefined
      const knownPlatforms = Array.isArray(body.knownPlatforms) ? body.knownPlatforms : undefined

      const result = await parseDiscountRule(description, { knownBrands, knownPlatforms })
      sendJson(res, 200, result)
    } catch (error) {
      sendJson(res, 502, {
        error: error instanceof Error ? error.message : 'Failed to parse discount rule.',
      })
    }
    return
  }

  sendJson(res, 404, { error: 'Not found.' })
})

server.listen(PORT, () => {
  console.log(`OpenRouter proxy listening on http://localhost:${PORT}`)
})