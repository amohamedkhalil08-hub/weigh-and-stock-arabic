# Update the Add Item screen only

## What the screen will include
- Keep the current Arabic RTL item form and black-and-gold branding, including the existing official logo elsewhere in the app.
- Add required bundle count and a country-of-origin dropdown with Yemen, Saudi Arabia, and China.
- Show a live, gold-bordered calculation summary before “حفظ الصنف” for total pieces, pieces per ton, and total tons.
- Save the selected country with the item and register the entered bundle count as its opening stock balance, as requested.
- Preserve existing items and movements; old saved items remain readable.

## Technical details
- Update only item-entry-related UI, item data handling, and focused tests; do not rebuild or redesign other screens.
- Save the new item and its opening inbound quantity atomically in the existing IndexedDB storage so balances and reports use the opening quantity consistently.
- Verify the live example: 10 bundles × 50 pieces = 500 pieces, 25 kg per piece = 40 pieces per ton and 12.5 tons; verify the opening balance is 500 pieces.
