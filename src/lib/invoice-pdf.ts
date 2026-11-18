import html2canvas from "html2canvas";
import Color from "colorjs.io";
import { jsPDF } from "jspdf";
import { downloadArrayBuffer } from "@/lib/data-exports";

export async function downloadInvoicePdf(element: HTMLElement, invoiceNumber: string) {
  await document.fonts?.ready;
  const canvas = await html2canvas(element, {
    scale: Math.min(Math.max(window.devicePixelRatio || 1, 2), 3),
    useCORS: true,
    backgroundColor: null,
    logging: false,
    ignoreElements: (node) => node instanceof HTMLElement && node.classList.contains("no-print"),
    onclone: (clonedDocument) => {
      const elements = clonedDocument.querySelectorAll<HTMLElement>(".invoice-paper, .invoice-paper *");
      for (const element of elements) {
        const computed = clonedDocument.defaultView?.getComputedStyle(element);
        if (!computed) continue;
        for (let index = 0; index < computed.length; index += 1) {
          const property = computed.item(index);
          const value = computed.getPropertyValue(property);
          if (!/\b(?:oklch|oklab|lch|lab|color-mix|color)\(/i.test(value)) continue;
          try {
            element.style.setProperty(property, new Color(value).to("srgb").toString());
          } catch {
            // Keep unrelated/non-color values untouched if the browser reports an unsupported color.
          }
        }
      }
    },
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
  const maxSliceHeight = Math.max(1, Math.floor((pageHeight / pageWidth) * canvas.width));
  let y = 0;
  let page = 0;

  while (y < canvas.height) {
    const sliceHeight = Math.min(maxSliceHeight, canvas.height - y);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز صورة الفاتورة لملف PDF.");
    context.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    if (page > 0) pdf.addPage();
    const imageHeight = (sliceHeight / canvas.width) * pageWidth;
    pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.94), "JPEG", margin, margin, pageWidth, imageHeight, undefined, "FAST");
    y += sliceHeight;
    page += 1;
  }

  const safeNumber = invoiceNumber.replace(/[^\p{L}\p{N}-]/gu, "-");
  const pdfBytes = pdf.output("arraybuffer");
  await downloadArrayBuffer(pdfBytes, `فاتورة-${safeNumber}.pdf`, "application/pdf");
}
