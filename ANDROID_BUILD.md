# APK Android تجريبي (Offline)

الواجهة المضمنة تُبنى من `src/offline-entry.tsx` إلى `android-web/` ثم تُنسخ إلى مشروع Capacitor. لا يحتوي إعداد Capacitor على `server.url`؛ لذلك لا يحتاج التطبيق إلى خادم أو اتصال شبكي عند بدء التشغيل. التخزين مستمر محليًا عبر IndexedDB، والشعار محفوظ ضمن الموارد المضمنة.

## بناء APK Debug

المتطلبات: Java JDK، Android SDK مع Android 35 وأدوات البناء، وBun.

```sh
bun install --frozen-lockfile
bun run build:android:debug
```

المخرج: `android/app/build/outputs/apk/debug/app-debug.apk`.
