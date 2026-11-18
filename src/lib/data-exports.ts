import { Directory, Filesystem } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { FileOpener } from "@capacitor-community/file-opener";
import {
  computeTotalPieces,
  computeTotalTons,
  type StockItem,
  type StockMovement,
  type StockSnapshot,
} from "@/lib/stock-domain";

export type SavedFile = { fileName: string; uri: string };

export function getMovementQuantities(movement: StockMovement) {
  const totalPieces =
    Number.isFinite(movement.totalPieces) && movement.totalPieces >= 0
      ? movement.totalPieces
      : computeTotalPieces(movement.bundleCount, movement.piecesPerBundle);
  return {
    totalPieces,
    totalTons: Number(computeTotalTons(totalPieces, movement.pieceWeightKg).toFixed(6)),
  };
}

export type BackupFile = {
  app: "weigh-and-stock-arabic";
  version: 2;
  exportedAt: string;
  items: StockItem[];
  movements: StockMovement[];
  invoices: Array<{
    invoiceNumber: string;
    createdAt: string;
    customer: string;
    movementIds: string[];
    totalPieces: number;
    totalTons: number;
  }>;
  customers: Array<{ name: string; movementIds: string[] }>;
};

export function buildBackupFile(
  snapshot: StockSnapshot,
  exportedAt = new Date().toISOString(),
): BackupFile {
  const invoiceGroups = new Map<string, StockMovement[]>();
  for (const movement of snapshot.movements) {
    if (movement.kind !== "out" || !movement.invoiceNumber) continue;
    const group = invoiceGroups.get(movement.invoiceNumber) ?? [];
    group.push(movement);
    invoiceGroups.set(movement.invoiceNumber, group);
  }
  const customerGroups = new Map<string, StockMovement[]>();
  for (const movement of snapshot.movements) {
    const name = movement.customer?.trim();
    if (!name) continue;
    const group = customerGroups.get(name) ?? [];
    group.push(movement);
    customerGroups.set(name, group);
  }
  return {
    app: "weigh-and-stock-arabic",
    version: 2,
    exportedAt,
    items: snapshot.items,
    movements: snapshot.movements,
    invoices: [...invoiceGroups.entries()].map(([invoiceNumber, movements]) => ({
      invoiceNumber,
      createdAt: movements[0]?.createdAt ?? exportedAt,
      customer: movements[0]?.customer ?? "",
      movementIds: movements.map((movement) => movement.id),
      totalPieces: movements.reduce(
        (sum, movement) => sum + getMovementQuantities(movement).totalPieces,
        0,
      ),
      totalTons: movements.reduce(
        (sum, movement) => sum + getMovementQuantities(movement).totalTons,
        0,
      ),
    })),
    customers: [...customerGroups.entries()].map(([name, movements]) => ({
      name,
      movementIds: movements.map((movement) => movement.id),
    })),
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function buildMovementCsv(snapshot: StockSnapshot) {
  const rows: unknown[][] = [
    [
      "التاريخ",
      "النوع (صادر / وارد)",
      "الصنف",
      "البادل",
      "الحبات",
      "الوزن (طن)",
      "العميل",
      "ملاحظة",
    ],
  ];
  const itemNames = new Map(snapshot.items.map((item) => [item.id, item.name]));
  for (const movement of snapshot.movements
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const quantities = getMovementQuantities(movement);
    rows.push([
      movement.createdAt,
      movement.kind === "out" ? "صادر" : "وارد",
      itemNames.get(movement.itemId) ?? "صنف محفوظ",
      movement.bundleCount,
      quantities.totalPieces,
      quantities.totalTons,
      movement.customer ?? "",
      movement.note,
    ]);
  }
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function saveNativeBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<SavedFile> {
  if (!bytes.length) throw new Error("الملف الناتج فارغ.");
  try {
    await Filesystem.requestPermissions();
  } catch {
    // Android 11+ does not require the legacy storage prompt for app-created Documents files.
  }
  const candidates = [
    { directory: Directory.ExternalStorage, path: `Download/${filename}` },
    { directory: Directory.Documents, path: filename },
  ];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      await Filesystem.writeFile({
        directory: candidate.directory,
        path: candidate.path,
        data: bytesToBase64(bytes),
        recursive: true,
      });
      const { uri } = await Filesystem.getUri(candidate);
      return { fileName: filename, uri };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("تعذر حفظ الملف على الجهاز.");
}

async function shareSavedFile(savedFile: SavedFile) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Share.share({
      title: savedFile.fileName,
      files: [savedFile.uri],
      dialogTitle: "فتح أو مشاركة الملف",
    });
  } catch {
    // Closing the Android share sheet is not a save failure. The file is already on disk.
  }
}

export async function downloadArrayBuffer(
  data: ArrayBuffer,
  filename: string,
  mimeType: string,
): Promise<SavedFile | null> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return saveNativeBytes(new Uint8Array(data), filename, mimeType);
  }
  await downloadBlob(new Blob([data], { type: mimeType }), filename);
  return null;
}

export async function openPrintPreview(savedFile: SavedFile | null) {
  if (savedFile && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    try {
      await FileOpener.open({
        filePath: savedFile.uri,
        contentType: "application/pdf",
        openWithDefault: true,
      });
    } catch {
      await shareSavedFile(savedFile);
    }
    return;
  }
  window.print();
}

export async function downloadBlob(blob: Blob, filename: string): Promise<SavedFile | null> {
  const mimeType =
    (blob.type || "application/octet-stream").split(";")[0] ?? "application/octet-stream";
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const savedFile = await saveNativeBytes(
      new Uint8Array(await blob.arrayBuffer()),
      filename,
      mimeType,
    );
    await shareSavedFile(savedFile);
    return savedFile;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.position = "fixed";
  anchor.style.insetInlineStart = "-10000px";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return null;
}

export function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
