# Plan: Preserve and complete Hail Samar Stock

## ZIP findings
- The ZIP is a small Android project: a Kotlin launcher opens one bundled Arabic HTML page in a WebView. It is a basic working prototype, not a complete stock-management app, and contains no exported stock records or separate data files.
- Existing sections: item entry/list, a combined inbound/outbound movement form, and a stock report with recent movement history. The report also includes CSV export and JSON backup/restore.
- Existing page is Arabic RTL with a dark, gold-accented style. It saves records in browser `localStorage`; it does not use IndexedDB.

## Missing or incomplete against the requirements
- No separate balances, inbound, outbound, or search screens; no outbound invoice.
- The required bundle-count, pieces-per-ton, and total-ton calculations are not present. The current “number of tons” fields do not implement those rules.
- The uploaded official logo is not included or used in the ZIP. It needs to appear on the home screen, header, and invoice.
- The existing offline claim is not a guarantee of airplane-mode operation for a web app; there is no IndexedDB storage or controlled offline app-shell caching.
- The existing colors are dark blue/gold rather than the requested black/gold.

## Work to complete
1. Preserve the client’s existing item, movement, stock report, history, CSV export, and backup/restore behavior; adapt the current prototype rather than replacing it with a new stock workflow.
2. Add separate Arabic RTL screens for item creation, balances, inbound, outbound with invoice, stock report, and search.
3. Store all item, movement, and invoice records locally in IndexedDB only. Add offline app-shell support and avoid network-dependent data or backend services, so normal use and saved records remain available in airplane mode.
4. Implement and display the required calculations: total pieces = bundle count × pieces per bundle; pieces per ton = 1000 ÷ piece weight; total tons = total pieces ÷ pieces per ton. Include the stated example as a calculation check.
5. Apply the uploaded brand image and black/gold styling consistently to the home screen, header, and invoice. Keep existing useful backup/restore and CSV export functions.
6. Verify the main stock flows, calculations, persistence after reload, and operation with the network unavailable.

## Assumptions
- The invoice is generated from an outbound movement and includes stock quantities and calculated weight; no prices or payment totals are added because none were specified.
- “100% offline” means the app interface and locally saved stock data continue to work after the app has first been opened and its files are available on the device.

## Technical approach
- The uploaded ZIP is the feature reference; implement the preserved and missing experience in the existing Lovable app rather than replacing it with a separate Android-only deliverable.
- Use browser IndexedDB for all application records, and a generated service worker to cache the app shell for offline loading. Do not add Lovable Cloud, a database service, or remote data calls.
