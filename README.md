# Weigh And Stock Arabic

Import and analyze this ZIP file sent by the client. Do not rebuild from scratch.

First, tell me in Plan:

1. What is inside the ZIP? Is it a complete app, or just data, or just files?

2. What screens already exist inside it?

3. What is missing compared to my requirements?

My requirements for this project:

- App for: هايل سمر للتجارة - فرع الحديدة - محمد الشريف - إدارة المخازن

- Use uploaded logo as official logo everywhere: home hero, header, invoice.

- 100% offline, IndexedDB only, NO Supabase, NO backend, works in airplane mode.

- Black + gold design, RTL Arabic.

- Calculations: إجمالي الكمية = عدد البنادل × عبوة البندل, عدد الحبات في الطن = 1000 / وزن الحبة, إجمالي الوزن بالطن = إجمالي الكمية / عدد الحبات في الطن. Example: 10 × 50 = 500 حبة, وزن 25 => 12.5 طن.

- Screens needed: إضافة صنف, أرصدة, وارد, صادر + فاتورة, كشف مخزون, بحث.

After analyzing ZIP, give me Plan to fix it and complete the missing parts only, without deleting client's work.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://weigh-and-stock-arabic.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/362b08c9-a5f2-453b-a864-f8f6ab8e2a16).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
