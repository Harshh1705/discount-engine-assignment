# Opptra Discount Engine — Base Implementation

This is the base implementation for the Opptra FDE Intern assignment.
Fork this repo, complete the tasks in the assignment brief, and submit your GitHub link + Loom.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploying

```bash
npm run build
```

Deploy the `dist/` folder to Vercel, Netlify, or any static host.
The live deployment URL must be in your README before submission.

## How to use

1. Upload `sample-data/rules.csv` as the discount rules input
2. Upload `sample-data/cart.csv` as the cart input
3. Click **Calculate Discounts**

## Project structure

```
src/
  engine/
    discountEngine.js   ← pure discount logic (no UI)
    csvParser.js        ← CSV → typed objects
  components/
    CsvUploader.jsx     ← file upload area
    DataTable.jsx       ← reusable table
    ErrorBanner.jsx     ← parse error display
  App.jsx               ← main UI + state
  main.jsx              ← entry point

sample-data/
  rules.csv             ← sample discount rules
  cart.csv              ← sample cart items
```

## CSV formats

**rules.csv**

| Column     | Type              | Example          |
|------------|-------------------|------------------|
| rule_id    | string            | RULE-01          |
| scope      | brand \| platform \| cart | cart    |
| applies_to | string            | Amazon India     |
| min_cart_value | number        | 4000             |
| type       | percentage \| flat| percentage       |
| value      | number            | 15               |
| stackable  | true \| false     | false            |

Item rules use `scope=brand` or `scope=platform` and must provide `applies_to`. Cart rules use `scope=cart`, must provide `min_cart_value`, and use `type=percentage` to apply a cart-wide discount after item discounts are finalized.

**cart.csv**

| Column     | Type   | Example      |
|------------|--------|--------------|
| item_id    | string | ITEM-01      |
| product    | string | Cushion Cover|
| brand      | string | Natura Casa  |
| platform   | string | Amazon India |
| base_price | number | 1299         |

## Discount logic

- When multiple non-stackable rules match an item, the one giving the **largest saving in rupees** is applied.
- Rules marked `stackable: true` apply **on top of** the winning non-stackable rule.
- If no rules match, the base price is returned with a "No offers available" note.
- Cart-level rules are evaluated after all item-level discounts are applied.
- The cart discount is checked against the sum of final item prices and, if matched, is shown as a separate cart offer line in the results.

## Expected results for the sample data

| Item    | Base Price | Final Price | Reasoning                              |
|---------|-----------|-------------|----------------------------------------|
| ITEM-01 | Rs.1,299  | Rs.1,104    | Platform offer: 15% off                |
| ITEM-02 | Rs.849    | Rs.629      | Brand offer: Rs.150 off + Platform offer: 10% off |
| ITEM-03 | Rs.599    | Rs.509      | Platform offer: 15% off                |
| ITEM-04 | Rs.2,499  | Rs.2,499    | No offers available                    |
| ITEM-05 | Rs.449    | Rs.382      | Platform offer: 15% off                |
| ITEM-06 | Rs.899    | Rs.809      | Platform offer: 10% off                |

Cart subtotal after item discounts: Rs.5,932

Cart offer: 10% off — Rs.593 saved

Final cart total: Rs.5,339
