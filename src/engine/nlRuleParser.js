import {
  OPENROUTER_API_URL,
  OPENROUTER_DEFAULT_MODEL,
  OPENROUTER_RULE_SYSTEM_PROMPT,
  OPENROUTER_RULE_RESPONSE_FORMAT,
} from '../config/openRouterRuleConfig.js'
import {
  GROQ_API_URL,
  GROQ_DEFAULT_MODEL,
  GROQ_RULE_RESPONSE_FORMAT,
} from '../config/groqRuleConfig.js'

function extractJsonPayload(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function parseNumberLike(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[,\s₹Rs.]/gi, '').replace(/%/g, '')
  if (cleaned === '') return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeDraft(rawDraft) {
  if (!rawDraft || typeof rawDraft !== 'object') {
    return { draft: null, missingFields: ['draft'], notes: 'Missing draft payload.' }
  }

  const missingFields = []
  const scope = typeof rawDraft.scope === 'string' ? rawDraft.scope.trim().toLowerCase() : ''
  const type = typeof rawDraft.type === 'string' ? rawDraft.type.trim().toLowerCase() : ''
  const appliesTo = typeof rawDraft.appliesTo === 'string' ? rawDraft.appliesTo.trim() : ''
  const notes = typeof rawDraft.notes === 'string' ? rawDraft.notes.trim() : ''
  const stackable = typeof rawDraft.stackable === 'boolean' ? rawDraft.stackable : false
  const value = parseNumberLike(rawDraft.value)
  const minCartValue = parseNumberLike(rawDraft.minCartValue)

  if (scope !== 'brand' && scope !== 'platform' && scope !== 'cart') missingFields.push('scope')
  if (type !== 'percentage' && type !== 'flat') missingFields.push('type')
  if (value === null || value <= 0) missingFields.push('value')

  if (scope === 'cart') {
    if (type && type !== 'percentage') missingFields.push('type')
    if (minCartValue === null || minCartValue <= 0) missingFields.push('minCartValue')
  } else if (!appliesTo) {
    missingFields.push('appliesTo')
  }

  if (missingFields.length > 0) {
    return {
      draft: null,
      missingFields: [...new Set(missingFields)],
      notes: notes || 'The request is missing one or more required details.',
    }
  }

  return {
    draft: {
      scope,
      appliesTo: scope === 'cart' ? null : appliesTo,
      type: scope === 'cart' ? 'percentage' : type,
      value: Math.round(value),
      stackable,
      minCartValue: scope === 'cart' ? Math.round(minCartValue) : null,
    },
    missingFields: [],
    notes: notes || 'Parsed successfully.',
  }
}

function resolveProvider() {
  const name = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase()

  if (name === 'groq') {
    const apiKey = process.env.GROQ_API_KEY || ''
    if (!apiKey) throw new Error('GROQ_API_KEY is missing from .env.')
    return {
      apiUrl: GROQ_API_URL,
      apiKey,
      model: process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
      responseFormat: GROQ_RULE_RESPONSE_FORMAT,
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY || ''
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing from .env.')
  return {
    apiUrl: OPENROUTER_API_URL,
    apiKey,
    model: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL,
    responseFormat: OPENROUTER_RULE_RESPONSE_FORMAT,
  }
}

export async function parseDiscountRule(description, context = {}) {
  const provider = resolveProvider()

  let userContent = description
  if (context.knownBrands?.length || context.knownPlatforms?.length) {
    const parts = [`Request: ${description}`, '']
    if (context.knownBrands?.length) {
      parts.push(`Known brands in cart: ${context.knownBrands.join(', ')}`)
    }
    if (context.knownPlatforms?.length) {
      parts.push(`Known platforms in cart: ${context.knownPlatforms.join(', ')}`)
    }
    parts.push('', 'If the request refers to a brand or platform, pick the name exactly from the lists above (preserving case). Do not invent names not in these lists.')
    userContent = parts.join('\n')
  }

  const response = await fetch(provider.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: OPENROUTER_RULE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      response_format: provider.responseFormat,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || 'OpenRouter request failed.'
    throw new Error(message)
  }

  const content = payload?.choices?.[0]?.message?.content
  const parsed = extractJsonPayload(content)

  if (!parsed) {
    throw new Error('OpenRouter returned malformed JSON.')
  }

  const status = typeof parsed.status === 'string' ? parsed.status.trim().toLowerCase() : 'ok'
  const normalized = normalizeDraft(parsed.draft)

  if (status === 'ambiguous' || !normalized.draft) {
    return {
      status: 'ambiguous',
      draft: null,
      missingFields: normalized.missingFields.length > 0 ? normalized.missingFields : parsed.missingFields || ['value'],
      notes: parsed.notes || normalized.notes,
    }
  }

  const knownNames = [
    ...(context.knownBrands || []),
    ...(context.knownPlatforms || []),
  ]
  if (knownNames.length > 0 && normalized.draft.appliesTo) {
    const match = knownNames.find(
      (name) => name.toLowerCase() === normalized.draft.appliesTo.toLowerCase()
    )
    if (match) {
      normalized.draft.appliesTo = match
    }
  }

  return {
    status: 'ok',
    draft: normalized.draft,
    missingFields: [],
    notes: normalized.notes,
  }
}
