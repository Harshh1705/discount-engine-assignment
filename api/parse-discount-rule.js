import { parseDiscountRule } from '../src/engine/nlRuleParser.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}')
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (!description) {
      return res.status(400).json({ error: 'description is required.' })
    }

    const result = await parseDiscountRule(description, {
      knownBrands: Array.isArray(body.knownBrands) ? body.knownBrands : undefined,
      knownPlatforms: Array.isArray(body.knownPlatforms) ? body.knownPlatforms : undefined,
    })

    return res.status(200).json(result)
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to parse discount rule.',
    })
  }
}
