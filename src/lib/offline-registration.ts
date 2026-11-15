/// <reference types="vite-plugin-pwa/client" />

import { registerSW } from "virtual:pwa-register";

const previewDomains = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];
const previewLabel = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const devProjectLabel = /^project--.+-dev$/;

function isLovablePreview(hostname: string) {
  const firstLabel = hostname.split(".")[0] ?? "";
  return (
    (previewDomains.some((domain) => hostname.endsWith(domain)) && previewLabel.test(firstLabel)) ||
    ((hostname.endsWith(".lovable.app") ||
      hostname.endsWith(".gpt-eng.com") ||
      hostname.endsWith(".gptengineer.run")) &&
      devProjectLabel.test(firstLabel)) ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => {
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      if (!worker) return Promise.resolve(false);
      const workerUrl = new URL(worker.scriptURL);
      return workerUrl.origin === window.location.origin && workerUrl.pathname === "/sw.js"
        ? registration.unregister()
        : Promise.resolve(false);
    }),
  );
}

export async function registerOfflineSupport() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const hostname = window.location.hostname.toLowerCase();
  const disabledByQuery = new URLSearchParams(window.location.search).get("sw") === "off";
  const insideFrame = window.self !== window.top;
  const shouldRefuseRegistration =
    !import.meta.env.PROD || insideFrame || isLovablePreview(hostname) || disabledByQuery;

  if (shouldRefuseRegistration) {
    await unregisterAppWorker();
    return;
  }

  registerSW({ immediate: true });
}