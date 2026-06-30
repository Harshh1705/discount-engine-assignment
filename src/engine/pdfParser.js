import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

/**
 * Groups pdfjs text items into lines by Y position.
 */
function groupByY(items, tolerance = 3) {
  const groups = []
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5])
  for (const item of sorted) {
    const y = item.transform[5]
    let found = false
    for (const g of groups) {
      if (Math.abs(g.y - y) <= tolerance) {
        g.items.push(item)
        found = true
        break
      }
    }
    if (!found) groups.push({ y, items: [item] })
  }
  return groups
}

/**
 * Reconstructs a line of text from its items, preserving column spacing
 * so we can split on 2+ whitespace later.
 */
function reconstructLine(items) {
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4])
  let result = ''
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]
    if (i === 0) {
      result += item.str
    } else {
      const prevEnd = sorted[i - 1].transform[4] + (sorted[i - 1].width || 0)
      const gap = item.transform[4] - prevEnd
      result += gap > 8 ? '  ' : ' '
      result += item.str
    }
  }
  return result
}

/**
 * Extracts cart items from a PDF invoice page.
 * Expects a table with columns: Product, Brand, Platform, Base Price.
 */
export async function parseCartPdf(file) {
  try {
    const buffer = await file.arrayBuffer()
    const pdf = await getDocument({ data: buffer }).promise
    const page = await pdf.getPage(1)
    const content = await page.getTextContent()

    const groups = groupByY(content.items)
    const textLines = groups.map((g) => reconstructLine(g.items))

    // Find header row and separator
    let headerIdx = -1
    let separatorIdx = -1
    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i].toLowerCase()
      if (line.includes('product') && line.includes('brand') && line.includes('platform')) {
        headerIdx = i
      }
      if (headerIdx !== -1 && i > headerIdx) {
        const stripped = textLines[i].replace(/[─\-=\s]/g, '')
        if (stripped.length === 0 && textLines[i].length > 3) {
          separatorIdx = i
          break
        }
      }
    }

    if (headerIdx === -1) {
      return { data: [], errors: ['Could not find table header (Product, Brand, Platform, Base Price).'] }
    }

    // Determine column boundaries from the header
    const headerGroup = groups[headerIdx]
    const headerItems = [...headerGroup.items].sort((a, b) => a.transform[4] - b.transform[4])
    const columnEdges = []

    for (const item of headerItems) {
      const text = item.str.toLowerCase()
      if (['product', 'brand', 'platform', 'base', 'price'].includes(text)) {
        columnEdges.push(item.transform[4])
      }
    }
    columnEdges.sort((a, b) => a - b)

    // Build midpoints between column starts
    const midpoints = []
    for (let i = 0; i < columnEdges.length - 1; i++) {
      midpoints.push((columnEdges[i] + columnEdges[i + 1]) / 2)
    }

    // Parse data rows
    const dataStartIdx = separatorIdx !== -1 ? separatorIdx + 1 : headerIdx + 1
    const data = []
    const errors = []
    let counter = 0

    for (let i = dataStartIdx; i < groups.length; i++) {
      const raw = textLines[i]
      if (!raw.trim()) continue

      // Skip lines that are purely decorative (dashes, etc.)
      if (/^[─\-=\s]+$/.test(raw)) continue

      const items = [...groups[i].items].sort((a, b) => a.transform[4] - b.transform[4])
      const cols = ['', '', '', '']

      for (const item of items) {
        const x = item.transform[4]
        const str = item.str.trim()
        if (!str) continue

        let assigned = false
        for (let j = 0; j < midpoints.length; j++) {
          if (x < midpoints[j]) {
            cols[j] += (cols[j] ? ' ' : '') + str
            assigned = true
            break
          }
        }
        if (!assigned) {
          cols[3] += str
        }
      }

      const product = cols[0]
      const brand = cols[1]
      const platform = cols[2]
      const priceRaw = cols[3]

      // Fallback: try splitting on 2+ spaces if column assignment failed
      if (!product || !brand || !platform || !priceRaw) {
        const fallbackParts = raw.split(/\s{3,}/)
        if (fallbackParts.length >= 4) {
          const priceMatch = fallbackParts[fallbackParts.length - 1].match(/Rs\.?\s*([\d,]+)/i)
          if (priceMatch) {
            counter++
            data.push({
              itemId: `ITEM-${String(counter).padStart(2, '0')}`,
              product: fallbackParts[0].trim(),
              brand: fallbackParts[1].trim(),
              platform: fallbackParts.slice(2, -1).join(' ').trim(),
              basePrice: parseInt(priceMatch[1].replace(/,/g, ''), 10),
            })
            continue
          }
        }
      }

      const priceMatch = priceRaw.match(/Rs\.?\s*([\d,]+)/i)
      const basePrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : NaN

      if (product && brand && platform && !isNaN(basePrice) && basePrice > 0) {
        counter++
        data.push({ itemId: `ITEM-${String(counter).padStart(2, '0')}`, product, brand, platform, basePrice })
      } else {
        errors.push(`Row ${i + 1}: could not parse "${raw}"`)
      }
    }

    return { data, errors }
  } catch (error) {
    return { data: [], errors: [`Failed to read PDF: ${error.message}`] }
  }
}
