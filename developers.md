# Change Log

## Technical
- Added cart-level rule support in `src/engine/csvParser.js` using `scope=cart` and `min_cart_value`.
- Extended `src/engine/discountEngine.js` to calculate cart discount after item-level discounts and return `itemResults`, `cartSubtotal`, `cartOffer`, and `finalCartTotal`.
- Updated `src/App.jsx` to show a separate cart offer line and the final cart total after the cart discount.
- Updated `sample-data/rules.csv` and `README.md` to document the new cart-rule format and output.
- Verified with `npm run build` and direct sample-data checks.

## Simple
- The app now supports a cart-wide discount after all item discounts are applied.
- The results now show each item, a separate cart offer line when it applies, and the final total.
- Sample rules and docs were updated to match the new behavior.