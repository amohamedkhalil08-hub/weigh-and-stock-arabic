import type { StockItem, StockMovement, StockSnapshot } from "@/lib/stock-domain";

const DATABASE_NAME = "hail-samar-stock";
const DATABASE_VERSION = 1;
const ITEMS_STORE = "items";
const MOVEMENTS_STORE = "movements";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEMS_STORE)) {
        database.createObjectStore(ITEMS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(MOVEMENTS_STORE)) {
        const movements = database.createObjectStore(MOVEMENTS_STORE, { keyPath: "id" });
        movements.createIndex("itemId", "itemId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح قاعدة البيانات المحلية"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر قراءة البيانات المحلية"));
  });
}

export async function readStockSnapshot(): Promise<StockSnapshot> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([ITEMS_STORE, MOVEMENTS_STORE], "readonly");
    const [items, movements] = await Promise.all([
      requestResult<StockItem[]>(transaction.objectStore(ITEMS_STORE).getAll()),
      requestResult<StockMovement[]>(transaction.objectStore(MOVEMENTS_STORE).getAll()),
    ]);
    return { items, movements };
  } finally {
    database.close();
  }
}

export async function saveStockItem(item: StockItem) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ITEMS_STORE, "readwrite");
    transaction.objectStore(ITEMS_STORE).put(item);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حفظ الصنف"));
      transaction.onabort = () => reject(transaction.error ?? new Error("تم إلغاء حفظ الصنف"));
    });
  } finally {
    database.close();
  }
}

export async function saveStockItemWithOpeningMovement(item: StockItem, movement: StockMovement) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([ITEMS_STORE, MOVEMENTS_STORE], "readwrite");
    transaction.objectStore(ITEMS_STORE).put(item);
    transaction.objectStore(MOVEMENTS_STORE).add(movement);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حفظ الصنف ورصيده الافتتاحي"));
      transaction.onabort = () => reject(transaction.error ?? new Error("تم إلغاء حفظ الصنف ورصيده الافتتاحي"));
    });
  } finally {
    database.close();
  }
}

export async function saveStockMovement(movement: StockMovement) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MOVEMENTS_STORE, "readwrite");
    transaction.objectStore(MOVEMENTS_STORE).add(movement);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حفظ الحركة"));
      transaction.onabort = () => reject(transaction.error ?? new Error("تم إلغاء حفظ الحركة"));
    });
  } finally {
    database.close();
  }
}

export async function restoreStockSnapshot(snapshot: StockSnapshot) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([ITEMS_STORE, MOVEMENTS_STORE], "readwrite");
    const items = transaction.objectStore(ITEMS_STORE);
    const movements = transaction.objectStore(MOVEMENTS_STORE);
    items.clear();
    movements.clear();
    snapshot.items.forEach((item) => items.put(item));
    snapshot.movements.forEach((movement) => movements.put(movement));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذرت استعادة النسخة"));
      transaction.onabort = () => reject(transaction.error ?? new Error("تم إلغاء الاستعادة"));
    });
  } finally {
    database.close();
  }
}