# Opptra Discount Engine

**Loom walkthrough:** https://www.loom.com/share/0f396c982217495588c9d24a13a36e24

**Live demo:** https://opptra-harsh.vercel.app/

---

## What I've built

### Task 1 — Cart-level discount rules

A cart-level discount applies a percentage off the entire cart when the subtotal meets a minimum threshold. The cart offer is evaluated after all item-level (brand/platform) discounts are applied and is shown as a separate line in the results.

**How it works:**
- The CSV format accepts `scope=cart` rules with `min_cart_value` and `type=percentage`
- The engine (`discountEngine.js`) sums item-level final prices, compares against the threshold, and applies the best matching cart offer
- The results section shows the full breakdown: "Cart Total (before discounts)" → "Cart Total (after discounts)" → cart offer line → "Cart Total"

**Subtlety handled:** If multiple cart rules match, the one giving the highest savings is selected (ties broken by highest threshold).

---

### Task 2 — Natural language rule parser

Users can type a discount rule in plain English (e.g. "35% off on Amazon India, stackable") and an LLM converts it into a structured rule. The parsed rule is previewed in a confirmation card — the user confirms or discards it before it's added to the active rules list.

**Provider-agnostic design:** The parser supports switching between LLM providers via a single `.env` flag (`LLM_PROVIDER`). Currently implemented:
- **OpenRouter** — for access to a wide range of models
- **Groq** — for much faster inference (~1–2s vs 10–15s on OpenRouter free tier)

Adding a new provider requires only a config file — the core parser logic stays unchanged.

**Context injection for accuracy:** The parser passes the cart's known brands and platforms as context to the LLM. This helps the model pick the correct brand/platform name and scope instead of guessing. On top of that, a server-side case-insensitive correction step matches the LLM's output against the known names list, fixing any casing mismatches the model misses.

**Pre-processing and validation:**
- Regex-based extraction handles currency symbols, commas, and whitespace
- `normalizeDraft()` validates required fields per scope type (brand rules need `appliesTo`, cart rules need `minCartValue`)
- Ambiguous or incomplete requests are rejected with specific missing-field feedback

---

### Task 3 — PDF invoice upload

Instead of uploading a CSV, users can upload an invoice PDF. The app parses the table in the PDF (columns: Product, Brand, Platform, Base Price) and loads the items into the cart. If discount rules are already loaded, the engine auto-recalculates and shows results immediately.

**How it works:**
- Uses `pdfjs-dist` entirely in the browser — no server upload needed
- Groups text items by Y position to reconstruct lines, then detects column boundaries from the header row's X positions
- Falls back to splitting on 3+ whitespace when position-based assignment fails
- Generates synthetic `itemId` values (ITEM-01, ITEM-02, …)
- The discount engine never changes — it receives the same `CartItem[]` shape regardless of input format

**Proposed improvement:** For non-tabular invoices (scanned PDFs, varied layouts), an OCR-based architecture using open-source models (Tesseract, PaddleOCR) with a microservice wrapper would be the next step. I've built similar invoice parsing systems at scale.

---

### Architecture highlights

**Clean separation of concerns:**
- `src/engine/discountEngine.js` — pure discount logic, no I/O, no knowledge of CSV/PDF/LLM
- `src/engine/csvParser.js` / `src/engine/pdfParser.js` — input parsers that return typed `CartItem[]` / `DiscountRule[]`
- `src/engine/nlRuleParser.js` — LLM-based NL → rule conversion
- `server.js` / `api/*.js` — thin HTTP wrappers (works both locally and on Vercel as serverless functions)

A fourth input mode (JSON, API import, etc.) can be added without touching the engine.

---

## Running locally

```bash
npm install
cp .env.example .env   # add your API key
npm run dev
```

Open http://localhost:5173

## Deploying

Push to GitHub and import on Vercel. Add your env vars in the dashboard:

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | `openrouter` (default) or `groq` |
| `OPENROUTER_API_KEY` | Required if using OpenRouter |
| `GROQ_API_KEY` | Required if using Groq |
| `OPENROUTER_MODEL` | Optional, defaults to `openrouter/free` |
| `GROQ_MODEL` | Optional, defaults to `llama-3.3-70b-versatile` |

## Project structure

```
api/                        — Vercel serverless functions
  health.js
  parse-discount-rule.js
public/
  pdf.worker.min.mjs         — PDF.js worker (for PDF upload)
sample-data/
  rules.csv                  — sample discount rules
  cart.csv                   — sample cart items
  invoice.html               — print to PDF for testing PDF upload
src/
  config/
    openRouterRuleConfig.js  — OpenRouter LLM config
    groqRuleConfig.js        — Groq LLM config
  engine/
    discountEngine.js        — core discount calculation (pure functions)
    csvParser.js             — CSV → typed objects
    nlRuleParser.js          — natural language → discount rule via LLM
    pdfParser.js             — invoice PDF → CartItem[]
  components/
    CsvUploader.jsx
    DataTable.jsx
    ErrorBanner.jsx
  App.jsx                    — main UI + state
server.js                    — local dev server (npm run dev)
vercel.json                  — Vercel deployment config
```

## CSV formats

**rules.csv**

| Column | Type | Example |
|---|---|---|
| rule_id | string | RULE-01 |
| scope | brand \| platform \| cart | cart |
| applies_to | string | Amazon India |
| min_cart_value | number | 4000 |
| type | percentage \| flat | percentage |
| value | number | 15 |
| stackable | true \| false | false |

**cart.csv**

| Column | Type | Example |
|---|---|---|
| item_id | string | ITEM-01 |
| product | string | Cushion Cover |
| brand | string | Natura Casa |
| platform | string | Amazon India |
| base_price | number | 1299 |

## Discount logic

- When multiple non-stackable rules match an item, the one giving the **largest saving in rupees** is applied.
- Rules marked `stackable: true` apply **on top of** the winning non-stackable rule.
- If no rules match, the base price is returned with a "No offers available" note.
- Cart-level rules are evaluated after all item-level discounts are applied — if the subtotal meets the threshold, the best cart offer is applied.

## Expected results for the sample data

| Item | Base Price | Final Price | Reasoning |
|---|---|---|---|
| ITEM-01 | Rs.1,299 | Rs.1,104 | Platform offer: 15% off |
| ITEM-02 | Rs.849 | Rs.629 | Brand offer: Rs.150 off + Platform offer: 10% off |
| ITEM-03 | Rs.599 | Rs.509 | Platform offer: 15% off |
| ITEM-04 | Rs.2,499 | Rs.2,499 | No offers available |
| ITEM-05 | Rs.449 | Rs.382 | Platform offer: 15% off |
| ITEM-06 | Rs.899 | Rs.809 | Platform offer: 10% off |

Cart Total (before discounts): Rs.6,594  
Cart Total (after discounts): Rs.5,932  
Cart offer: 10% off — Rs.593 saved  
**Final cart total: Rs.5,339**
