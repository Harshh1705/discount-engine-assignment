/**
 * App.jsx
 *
 * Top-level component. Manages state for rules, cart items, and results.
 * Wires together CSV upload → parse → engine → display.
 */

import { useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { processCart } from './engine/discountEngine.js'
import { parseCartPdf } from './engine/pdfParser.js'

// ── Column definitions ───────────────────────────────────────────

const RULES_COLUMNS = [
  { key: 'ruleId',    label: 'Rule ID' },
  { key: 'scope',     label: 'Scope',      render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  { key: 'appliesTo', label: 'Applies To' },
  { key: 'type',      label: 'Type',       render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => row.type === 'percentage' ? `${v}% off` : `Rs.${v} off`,
  },
  { key: 'stackable', label: 'Stackable',  render: (v) => (v ? 'Yes' : 'No') },
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
]

const RESULTS_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'basePrice', label: 'Base Price',  render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
  { key: 'finalPrice',label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>
        Rs.{v.toLocaleString('en-IN')}
      </span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? (
        <span style={{ color: '#1e5c2c', fontWeight: 600 }}>Rs.{v.toLocaleString('en-IN')}</span>
      ) : (
        <span style={{ color: '#888' }}>—</span>
      ),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v) => (
      <span style={{ color: v === 'No offers available' ? '#888' : '#131A48', fontStyle: v === 'No offers available' ? 'italic' : 'normal' }}>
        {v}
      </span>
    ),
  },
]

const RULE_PARSE_ENDPOINT = '/api/parse-discount-rule'

// ── Styles ───────────────────────────────────────────────────────

const S = {
  page:    { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header:  { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan:{ color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main:    { maxWidth: 960, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  gridAuto: { display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1rem' },
  btn:     {
    background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  btnDisabled: {
    background: '#CECECE', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  secondaryBtn: {
    background: '#fff', color: '#131A48', border: '1px solid #CECECE', borderRadius: 4,
    padding: '0.65rem 1.2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.03em', textTransform: 'uppercase',
  },
  textArea: {
    width: '100%', minHeight: 118, border: '1px solid #CECECE', borderRadius: 6,
    padding: '0.8rem 0.9rem', fontSize: 14, lineHeight: 1.45, resize: 'vertical',
    color: '#131A48', background: '#fff', boxSizing: 'border-box',
  },
  inputHint: { fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.4 },
  draftCard: {
    background: '#f7f8ff', border: '1px solid #d7dcef', borderRadius: 6,
    padding: '0.95rem 1rem', marginTop: '0.75rem',
  },
  draftGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.7rem 1rem',
    marginTop: '0.7rem',
  },
  draftItem: { fontSize: 12, color: '#131A48' },
  draftLabel: { display: 'block', fontSize: 10, color: '#6b6f86', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  helperPill: (bg, color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
    background: bg, color, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  }),
  totalRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem',
    borderTop: '2px solid #131A48',
  },
  cartOfferRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem',
    borderTop: '1px dashed #CECECE',
    color: '#131A48', fontWeight: 600,
  },
  cartOfferLabel: { color: '#131A48' },
  cartOfferValue: { color: '#1e5c2c' },
  totalLabel: { fontWeight: 700, fontSize: 14, color: '#131A48' },
  totalValue: { fontWeight: 700, fontSize: 16, color: '#131A48' },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px',
    borderRadius: 20, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
  }),
}

// ── Component ────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules]           = useState([])
  const [rulesErrors, setRulesErr]  = useState([])
  const [rulesFileName, setRulesFileName] = useState('')
  const [naturalLanguageRule, setNaturalLanguageRule] = useState('')
  const [draftRule, setDraftRule] = useState(null)
  const [draftRuleNote, setDraftRuleNote] = useState('')
  const [ruleParseErrors, setRuleParseErrors] = useState([])
  const [isParsingRule, setIsParsingRule] = useState(false)
  const [lastConfirmedRuleId, setLastConfirmedRuleId] = useState(0)
  const [isParsingPdf, setIsParsingPdf] = useState(false)

  const [cartItems, setCartItems]   = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName]   = useState('')

  const [results, setResults]       = useState(null)

  // ── Handlers ──

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
    setResults(null) // clear stale results
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setResults(null)
  }

  async function handleCartPdfLoad(file) {
    setIsParsingPdf(true)
    const { data, errors } = await parseCartPdf(file)
    setCartItems(data)
    setCartErrors(errors)
    setIsParsingPdf(false)
    if (rules.length > 0 && data.length > 0 && errors.length === 0) {
      setResults(processCart(data, rules))
    } else {
      setResults(null)
    }
  }

  function handleCalculate() {
    setResults(processCart(cartItems, rules))
  }

  async function handleParseNaturalLanguageRule() {
    const description = naturalLanguageRule.trim()
    if (!description) {
      setRuleParseErrors(['Enter a discount rule description first.'])
      setDraftRule(null)
      setDraftRuleNote('')
      return
    }

    setIsParsingRule(true)
    setRuleParseErrors([])
    setDraftRule(null)
    setDraftRuleNote('')

    const knownBrands = [...new Set(cartItems.map((i) => i.brand).filter(Boolean))]
    const knownPlatforms = [...new Set(cartItems.map((i) => i.platform).filter(Boolean))]

    try {
      const response = await fetch(RULE_PARSE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, knownBrands, knownPlatforms }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to parse the discount rule.')
      }

      if (payload.status !== 'ok' || !payload.draft) {
        const missing = Array.isArray(payload.missingFields) && payload.missingFields.length > 0
          ? ` Missing fields: ${payload.missingFields.join(', ')}.`
          : ''
        throw new Error(`${payload.notes || 'The request is ambiguous and cannot be resolved.'}${missing}`)
      }

      setDraftRule({
        ...payload.draft,
        ruleId: `RULE-NL-${String(lastConfirmedRuleId + 1).padStart(3, '0')}`,
      })
      setDraftRuleNote(payload.notes || 'Parsed successfully.')
    } catch (error) {
      setRuleParseErrors([error instanceof Error ? error.message : 'Failed to parse discount rule.'])
    } finally {
      setIsParsingRule(false)
    }
  }

  function handleConfirmNaturalLanguageRule() {
    if (!draftRule) return

    const confirmedRule = {
      ruleId: draftRule.ruleId,
      scope: draftRule.scope,
      appliesTo: draftRule.appliesTo || '',
      minCartValue: draftRule.minCartValue ?? null,
      type: draftRule.type,
      value: draftRule.value,
      stackable: draftRule.stackable,
    }

    const nextRules = [...rules, confirmedRule]
    setRules(nextRules)
    setLastConfirmedRuleId((current) => current + 1)
    setDraftRule(null)
    setDraftRuleNote('')
    setNaturalLanguageRule('')
    setRuleParseErrors([])

    if (cartItems.length > 0) {
      setResults(processCart(cartItems, nextRules))
    } else {
      setResults(null)
    }
  }

  function handleDiscardNaturalLanguageRule() {
    setDraftRule(null)
    setDraftRuleNote('')
    setRuleParseErrors([])
  }

  function renderRuleValue(rule) {
    if (rule.scope === 'cart') {
      return `Cart value >= Rs.${Number(rule.minCartValue || 0).toLocaleString('en-IN')}`
    }

    return rule.type === 'percentage'
      ? `${rule.value}% off`
      : `Rs.${Number(rule.value || 0).toLocaleString('en-IN')} off`
  }

  function renderRuleScope(rule) {
    return rule.scope.charAt(0).toUpperCase() + rule.scope.slice(1)
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  // ── Render ──

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoTxt}>O<span style={S.logoSpan}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>

        {/* Rules entry row */}
        <div style={S.gridAuto}>
          {/* Rules upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ECECF2' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#131A48', marginBottom: 6 }}>Or describe a new rule</div>
              <textarea
                style={S.textArea}
                value={naturalLanguageRule}
                onChange={(e) => setNaturalLanguageRule(e.target.value)}
                placeholder="Example: 20% off for Natura Casa brand, stackable with other offers"
              />
              <div style={S.inputHint}>
                Examples: brand discount, platform flat discount, or cart-wide threshold discount. Ambiguous prompts will be rejected for clarification.
              </div>
              <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                <button
                  style={isParsingRule ? S.btnDisabled : S.secondaryBtn}
                  onClick={handleParseNaturalLanguageRule}
                  disabled={isParsingRule}
                >
                  {isParsingRule ? 'Parsing…' : 'Parse Rule'}
                </button>
                <button
                  style={S.secondaryBtn}
                  onClick={handleDiscardNaturalLanguageRule}
                  disabled={!draftRule && !ruleParseErrors.length}
                >
                  Clear
                </button>
              </div>
              <ErrorBanner errors={ruleParseErrors} />
              {draftRule && (
                <div style={S.draftCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: '#131A48' }}>Confirm parsed rule</div>
                    <span style={S.helperPill('#e7f6eb', '#1e5c2c')}>Ready to add</span>
                  </div>
                  <div style={S.draftGrid}>
                    <div style={S.draftItem}><span style={S.draftLabel}>Scope</span>{renderRuleScope(draftRule)}</div>
                    <div style={S.draftItem}><span style={S.draftLabel}>Applies To</span>{draftRule.appliesTo || '—'}</div>
                    <div style={S.draftItem}><span style={S.draftLabel}>Type</span>{draftRule.type.charAt(0).toUpperCase() + draftRule.type.slice(1)}</div>
                    <div style={S.draftItem}><span style={S.draftLabel}>Value</span>{renderRuleValue(draftRule)}</div>
                    <div style={S.draftItem}><span style={S.draftLabel}>Stackable</span>{draftRule.stackable ? 'Yes' : 'No'}</div>
                    <div style={S.draftItem}><span style={S.draftLabel}>Min Cart Value</span>{draftRule.minCartValue ? `Rs.${Number(draftRule.minCartValue).toLocaleString('en-IN')}` : '—'}</div>
                  </div>
                  {draftRuleNote && (
                    <div style={{ marginTop: '0.75rem', fontSize: 12, color: '#4d5270' }}>{draftRuleNote}</div>
                  )}
                  <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
                    <button style={S.btn} onClick={handleConfirmNaturalLanguageRule}>Confirm and Add Rule</button>
                    <button style={S.secondaryBtn} onClick={handleDiscardNaturalLanguageRule}>Discard</button>
                  </div>
                </div>
              )}
            </div>
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
          </div>

          {/* Cart upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartLoad}
              hasData={cartItems.length > 0 && !cartFileName.endsWith('.pdf')}
              fileName={cartFileName}
            />
            <div
              style={{
                marginTop: 8,
                border: `2px dashed ${cartItems.length > 0 && !cartFileName.endsWith('.pdf') ? '#1e5c2c' : '#CECECE'}`,
                borderRadius: 6,
                padding: '0.7rem 1.2rem',
                background: cartItems.length > 0 && !cartFileName.endsWith('.pdf') ? '#f0faf2' : '#fafafa',
                cursor: isParsingPdf ? 'not-allowed' : 'pointer',
                opacity: isParsingPdf ? 0.6 : 1,
                textAlign: 'center',
              }}
              onClick={() => {
                if (!isParsingPdf) document.getElementById('pdf-input').click()
              }}
            >
              <input
                id="pdf-input"
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                disabled={isParsingPdf}
                onChange={async (e) => {
                  const file = e.target.files[0]
                  if (file) await handleCartPdfLoad(file)
                  e.target.value = ''
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center' }}>
                <span style={{ fontSize: 18 }}>{isParsingPdf ? '⏳' : '📄'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#131A48' }}>
                    {isParsingPdf ? 'Parsing PDF…' : 'Or upload invoice PDF'}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    Table with Product, Brand, Platform, Base Price
                  </div>
                </div>
              </div>
            </div>
            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Calculate button */}
        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <button
            style={canCalculate ? S.btn : S.btnDisabled}
            onClick={handleCalculate}
            disabled={!canCalculate}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Upload both files to calculate
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results.itemResults} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', borderTop: '1px dashed #CECECE', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#131A48' }}>Cart Total (before discounts)</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#131A48' }}>
                Rs.{cartItems.reduce((s, i) => s + i.basePrice, 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.35rem' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#1e5c2c' }}>Cart Total (after discounts)</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e5c2c' }}>
                Rs.{results.cartSubtotal.toLocaleString('en-IN')}
              </span>
            </div>
            {results.cartOffer && (
              <div style={S.cartOfferRow}>
                <span style={S.cartOfferLabel}>{results.cartOffer.reasoning}</span>
                <span style={S.cartOfferValue}>— Rs.{results.cartOffer.savings.toLocaleString('en-IN')} saved</span>
              </div>
            )}
            <div style={S.totalRow}>
              <span style={S.totalLabel}>Cart Total</span>
              <span style={S.totalValue}>Rs.{results.finalCartTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
