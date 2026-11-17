import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../android-web/android-shell/index.html", import.meta.url);
const destination = new URL("../android-web/index.html", import.meta.url);
const html = (await readFile(source, "utf8")).replaceAll("../assets/", "./assets/");
if (!html.includes('id="root"') || !html.includes("./assets/index-")) {
  throw new Error("مخرجات واجهة Android غير مكتملة");
}
await writeFile(destination, html);
