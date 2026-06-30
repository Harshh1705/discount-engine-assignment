export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_DEFAULT_MODEL = 'openrouter/free'
export const OPENROUTER_APP_TITLE = 'Opptra Discount Engine'
export const OPENROUTER_SITE_URL = 'http://localhost:5173'

export const OPENROUTER_RULE_SYSTEM_PROMPT = `You convert one plain-English discount request into exactly one normalized discount rule.

Return JSON only. Do not wrap the response in markdown.

Required output shape:
{
  "status": "ok" | "ambiguous",
  "draft": {
    "scope": "brand" | "platform" | "cart",
    "appliesTo": string | null,
    "type": "percentage" | "flat",
    "value": number,
    "stackable": boolean,
    "minCartValue": number | null
  } | null,
  "missingFields": string[],
  "notes": string
}

Rules:
- Infer only one rule per request.
- For brand/platform item rules, scope must be brand or platform and appliesTo must match one of the known brands or platforms listed in the user request (use the exact casing provided there). Do not invent brand or platform names.
- For cart-wide discounts, scope must be cart, appliesTo must be null, type must be percentage, and minCartValue is required.
- Default stackable to false unless the request explicitly says it stacks with other offers.
- Parse rupee values as numbers, ignoring commas and currency symbols.
- Do not invent missing value, threshold, scope, or target details.
- If the request is vague or missing a required fact, set status to ambiguous, set draft to null, and list the missing fields.
- Examples that should be rejected: "Give a discount for big orders" because it lacks both a value and a threshold.`

export const OPENROUTER_RULE_RESPONSE_FORMAT = {
  type: 'json_object',
}