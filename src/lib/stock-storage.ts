import { normalizeStockItem, normalizeStockMovement, type StockBackup, type StockItem, type StockMovement, type StockSnapshot } from "@/lib/stock-domain";

const DATABASE_NAME = "hail-samar-stock";
const DATABASE_VERSION = 2;
const ITEMS_STORE = "items";
const MOVEMENTS_STORE = "movements";
const BACKUPS_STORE = "backups";

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("تعذر إكمال العملية"));
    transaction.onabort = () => reject(transaction.error ?? new Error("تم إلغاء العملية"));
  });
}

function migrationBackup(items: unknown[], movements: unknown[]): StockBackup {
  return {
    id: `migration-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    reason: "نسخة تلقائية قبل ترقية قاعدة البيانات",
    snapshot: { items: items as StockItem[], movements: movements as StockMovement[] },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEMS_STORE)) {
        database.createObjectStore(ITEMS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(MOVEMENTS_STORE)) {
        const movements = database.createObjectStore(MOVEMENTS_STORE, { keyPath: "id" });
        movements.createIndex("itemId", "itemId", { unique: false });
      }
      if (!database.objectStoreNames.contains(BACKUPS_STORE)) {
        database.createObjectStore(BACKUPS_STORE, { keyPath: "id" });
      }

      if (oldVersion > 0 && oldVersion < DATABASE_VERSION) {
        const transaction = request.transaction;
        if (transaction) {
          const items = transaction.objectStore(ITEMS_STORE);
          const movements = transaction.objectStore(MOVEMENTS_STORE);
          const oldItemsRequest = items.getAll();
          const oldMovementsRequest = movements.getAll();
          let oldItems: unknown[] | undefined;
          let oldMovements: unknown[] | undefined;
          const saveBackupBeforeMigration = () => {
            if (!oldItems || !oldMovements) return;
            transaction.objectStore(BACKUPS_STORE).put(migrationBackup(oldItems, oldMovements));
          };
          oldItemsRequest.onsuccess = () => {
            oldItems = oldItemsRequest.result;
            saveBackupBeforeMigration();
          };
          oldMovementsRequest.onsuccess = () => {
            oldMovements = oldMovementsRequest.result;
            saveBackupBeforeMigration();
          };

          const normalizeStore = (store: IDBObjectStore, normalize: (value: unknown, id: string) => unknown) => {
            const cursorRequest = store.openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              const fallbackId = String(cursor.primaryKey || crypto.randomUUID());
              cursor.update(normalize(cursor.value, fallbackId));
              cursor.continue();
            };
          };
          normalizeStore(items, normalizeStockItem);
          normalizeStore(movements, normalizeStockMovement);
          if (oldVersion < 2) {
            const movementStore = transaction.objectStore(MOVEMENTS_STORE);
            if (!movementStore.indexNames.contains("itemId")) {
              movementStore.createIndex("itemId", "itemId", { unique: false });
            }
          }
        }
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح قاعدة البيانات المحلية"));
    request.onblocked = () => reject(new Error("أغلق النسخة المفتوحة من التطبيق ثم أعد المحاولة لإكمال تحديث قاعدة البيانات."));
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

export async function updateStockMovement(movement: StockMovement) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(MOVEMENTS_STORE, "readwrite");
    transaction.objectStore(MOVEMENTS_STORE).put(movement);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function deleteStockMovementWithBackup(movementId: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([ITEMS_STORE, MOVEMENTS_STORE, BACKUPS_STORE], "readwrite");
    const itemsRequest = transaction.objectStore(ITEMS_STORE).getAll();
    const movementsRequest = transaction.objectStore(MOVEMENTS_STORE).getAll();
    const [items, movements] = await Promise.all([
      requestResult<StockItem[]>(itemsRequest),
      requestResult<StockMovement[]>(movementsRequest),
    ]);
    const backup: StockBackup = {
      id: `before-delete-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      reason: "نسخة تلقائية قبل حذف فاتورة",
      snapshot: { items, movements },
    };
    transaction.objectStore(BACKUPS_STORE).put(backup);
    transaction.objectStore(MOVEMENTS_STORE).delete(movementId);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function saveStockItem(item: StockItem) {
  const database = await openDatabase();
  try { const transaction = database.transaction(ITEMS_STORE, "readwrite"); transaction.objectStore(ITEMS_STORE).put(item); await waitForTransaction(transaction); }
  finally { database.close(); }
}

export async function deleteStockItemWithBackup(itemId: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([ITEMS_STORE, MOVEMENTS_STORE, BACKUPS_STORE], "readwrite");
    const itemsStore = transaction.objectStore(ITEMS_STORE);
    const movementsStore = transaction.objectStore(MOVEMENTS_STORE);
    const [items, movements] = await Promise.all([
      requestResult<StockItem[]>(itemsStore.getAll()),
      requestResult<StockMovement[]>(movementsStore.getAll()),
    ]);
    transaction.objectStore(BACKUPS_STORE).put({
      id: `before-delete-item-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      reason: "نسخة تلقائية قبل حذف صنف وحركاته",
      snapshot: { items, movements },
    } satisfies StockBackup);
    itemsStore.delete(itemId);
    movementsStore.index("itemId").openCursor(IDBKeyRange.only(itemId)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    await waitForTransaction(transaction);
  } finally { database.close(); }
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

export async function saveStockMovements(movements: StockMovement[]) {
  const database = await openDatabase();
  try { const transaction = database.transaction(MOVEMENTS_STORE, "readwrite"); movements.forEach((movement) => transaction.objectStore(MOVEMENTS_STORE).add(movement)); await waitForTransaction(transaction); }
  finally { database.close(); }
}

export async function saveStockMovement(movement: StockMovement) { return saveStockMovements([movement]); }

export async function restoreStockSnapshot(snapshot: StockSnapshot) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([ITEMS_STORE, MOVEMENTS_STORE, BACKUPS_STORE], "readwrite");
    const items = transaction.objectStore(ITEMS_STORE);
    const movements = transaction.objectStore(MOVEMENTS_STORE);
    const [previousItems, previousMovements] = await Promise.all([
      requestResult<StockItem[]>(items.getAll()),
      requestResult<StockMovement[]>(movements.getAll()),
    ]);
    transaction.objectStore(BACKUPS_STORE).put({
      id: `before-restore-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      reason: "نسخة تلقائية قبل استعادة نسخة احتياطية",
      snapshot: { items: previousItems, movements: previousMovements },
    } satisfies StockBackup);
    items.clear();
    movements.clear();
    snapshot.items.forEach((item) => items.put(normalizeStockItem(item, crypto.randomUUID())));
    snapshot.movements.forEach((movement) => movements.put(normalizeStockMovement(movement, crypto.randomUUID())));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}