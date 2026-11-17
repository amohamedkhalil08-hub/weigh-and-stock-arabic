import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StockApp } from "@/routes/index";
import "@/styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("عنصر التطبيق غير موجود");

createRoot(rootElement).render(
  <StrictMode>
    <StockApp />
  </StrictMode>,
);
