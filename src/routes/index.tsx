import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  FileBarChart,
  FileText,
  Home,
  PackagePlus,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Weight,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  buildBackupFile,
  buildMovementCsv,
  downloadBlob,
  getMovementQuantities,
  localDateStamp,
} from "@/lib/data-exports";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { Input } from "@/components/ui/input";
import {
  computePiecesPerTon,
  computeTotalPieces,
  computeTotalTons,
  createOpeningStockMovement,
  getItemBalance,
  type CountryOfOrigin,
  type MovementKind,
  type StockItem,
  type StockMovement,
  type StockSnapshot,
} from "@/lib/stock-domain";
import {
  deleteStockItemWithBackup,
  readStockSnapshot,
  replaceInvoiceMovements,
  restoreStockSnapshot,
  saveStockItem,
  saveStockItemAndOpeningMovement,
  saveStockItemWithOpeningMovement,
  saveStockMovements,
} from "@/lib/stock-storage";
import { registerOfflineSupport } from "@/lib/offline-registration";
import brandLogo from "@/assets/hail-samar-brand.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "إدارة مخازن هايل سمر | فرع الحديدة" },
      {
        name: "description",
        content: "إدارة مخزون هايل سمر للتجارة - فرع الحديدة، محلياً دون اتصال بالإنترنت.",
      },
      { property: "og:title", content: "إدارة مخازن هايل سمر | فرع الحديدة" },
      {
        property: "og:description",
        content: "إضافة الأصناف، متابعة الأرصدة والحركات، وإصدار فواتير المخازن محلياً.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockApp,
});

type Screen = "home" | "items" | "balances" | "inbound" | "outbound" | "report" | "search";

const screenTitles: Record<Screen, string> = {
  home: "الرئيسية",
  items: "إضافة صنف",
  balances: "الأرصدة",
  inbound: "الوارد",
  outbound: "الصادر والفاتورة",
  report: "كشف المخزون",
  search: "بحث",
};

const navigation: { id: Screen; icon: LucideIcon }[] = [
  { id: "home", icon: Home },
  { id: "items", icon: PackagePlus },
  { id: "balances", icon: Boxes },
  { id: "inbound", icon: ArrowDownToLine },
  { id: "outbound", icon: ArrowUpFromLine },
  { id: "report", icon: FileBarChart },
  { id: "search", icon: Search },
];

export function StockApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [snapshot, setSnapshot] = useState<StockSnapshot>({ items: [], movements: [] });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<StockMovement | null>(null);
  const [selectedReportItem, setSelectedReportItem] = useState<StockItem | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"pdf" | "backup" | "csv" | null>(null);
  const exportLock = useRef(false);
  const restoreInput = useRef<HTMLInputElement>(null);

  const refresh = async () => setSnapshot(await readStockSnapshot());
  useEffect(() => {
    void registerOfflineSupport().catch(() => undefined);
    void refresh()
      .catch(() => setError("تعذر فتح البيانات المحفوظة على هذا الجهاز."))
      .finally(() => setLoading(false));
  }, []);

  const totalPieces = useMemo(
    () =>
      snapshot.items.reduce((sum, item) => sum + getItemBalance(item.id, snapshot.movements), 0),
    [snapshot],
  );
  const showNotice = (message: string) => {
    setError("");
    setNotice(message);
  };
  const showError = (message: string) => {
    setNotice("");
    setError(message);
  };

  async function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    const bundleCount = Number(form.get("bundleCount"));
    const piecesPerBundle = Number(form.get("piecesPerBundle"));
    const pieceWeightKg = Number(form.get("pieceWeightKg"));
    const countryValue = String(form.get("countryOfOrigin") ?? "");
    if (
      !name ||
      !Number.isFinite(bundleCount) ||
      bundleCount <= 0 ||
      !Number.isFinite(piecesPerBundle) ||
      piecesPerBundle <= 0 ||
      !Number.isFinite(pieceWeightKg) ||
      pieceWeightKg <= 0 ||
      !["اليمن", "السعودية", "الصين"].includes(countryValue)
    ) {
      showError("أدخل بيانات الصنف وعدد البنادل والحبات ووزن الحبة واختر بلد الصنع.");
      return;
    }
    try {
      const createdAt = new Date().toISOString();
      const item: StockItem = {
        id: crypto.randomUUID(),
        name,
        bundleCount,
        piecesPerBundle,
        pieceWeightKg,
        countryOfOrigin: countryValue as CountryOfOrigin,
        createdAt,
      };
      const openingMovement = createOpeningStockMovement(
        item,
        bundleCount,
        crypto.randomUUID(),
        createdAt,
      );
      await saveStockItemWithOpeningMovement(item, openingMovement);
      await refresh();
      formElement.reset();
      showNotice("تم حفظ الصنف ورصيده الافتتاحي على هذا الجهاز.");
    } catch {
      showError("تعذر حفظ الصنف. تحقق من مساحة التخزين في الجهاز.");
    }
  }

  async function handleAddMovement(kind: MovementKind, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const itemIds = form.getAll("itemId").map(String);
    const bundleCounts = form.getAll("bundleCount").map((value) => Number(value));
    const requestedPieces =
      kind === "out" ? form.getAll("totalPieces").map((value) => Number(value)) : [];
    const note = String(form.get("note") ?? "").trim();
    const customer = String(form.get("customer") ?? "").trim();
    const lines = itemIds.map((itemId, index) => ({
      item: snapshot.items.find((candidate) => candidate.id === itemId),
      bundleCount: bundleCounts[index] ?? 0,
      totalPieces: kind === "out" ? (requestedPieces[index] ?? 0) : 0,
    }));
    if (
      !lines.length ||
      lines.some(
        (line) =>
          !line.item ||
          !Number.isFinite(line.bundleCount) ||
          line.bundleCount <= 0 ||
          (kind === "out" && (!Number.isFinite(line.totalPieces) || line.totalPieces <= 0)),
      )
    ) {
      showError("اختر صنفاً وأدخل عدد البنادل لكل صنف بقيمة أكبر من صفر.");
      return;
    }
    for (const line of lines) {
      const pieces =
        kind === "out"
          ? line.totalPieces
          : computeTotalPieces(line.bundleCount, line.item!.piecesPerBundle);
      if (
        kind === "out" &&
        line.item &&
        pieces > getItemBalance(line.item.id, snapshot.movements)
      ) {
        showError(`الكمية المطلوبة أكبر من الرصيد المتاح للصنف: ${line.item?.name ?? ""}.`);
        return;
      }
    }
    const createdAt = new Date().toISOString();
    const invoiceNumber =
      kind === "out"
        ? `HS-${createdAt.slice(0, 10).replaceAll("-", "")}-${String(snapshot.movements.filter((entry) => entry.invoiceNumber).length + 1).padStart(3, "0")}`
        : undefined;
    const newMovements: StockMovement[] = lines.map(
      ({ item, bundleCount, totalPieces: requestedTotalPieces }) => {
        const pieces =
          kind === "out"
            ? requestedTotalPieces
            : computeTotalPieces(bundleCount, item!.piecesPerBundle);
        return {
          id: crypto.randomUUID(),
          itemId: item!.id,
          kind,
          bundleCount,
          piecesPerBundle: item!.piecesPerBundle,
          totalPieces: pieces,
          pieceWeightKg: item!.pieceWeightKg,
          piecesPerTon: computePiecesPerTon(item!.pieceWeightKg),
          totalTons: computeTotalTons(pieces, item!.pieceWeightKg),
          note,
          createdAt,
          ...(customer && { customer }),
          ...(invoiceNumber && { invoiceNumber }),
        };
      },
    );
    try {
      await saveStockMovements(newMovements);
      await refresh();
      setSelectedInvoice(kind === "out" ? (newMovements[0] ?? null) : null);
      showNotice(
        kind === "in"
          ? "تم تسجيل الوارد وحفظه محلياً."
          : "تم تسجيل الصادر متعدد الأصناف وإصدار الفاتورة.",
      );
      if (kind === "out") setScreen("outbound");
    } catch {
      showError("تعذر حفظ الحركة على هذا الجهاز.");
    }
  }

  async function handleUpdateItem(item: StockItem) {
    try {
      const openingMovement = snapshot.movements.find(
        (movement) =>
          movement.itemId === item.id && movement.kind === "in" && movement.note === "رصيد افتتاحي",
      );
      if (!openingMovement) await saveStockItem(item);
      else {
        const bundleCount = item.bundleCount ?? openingMovement.bundleCount;
        const totalPieces = computeTotalPieces(bundleCount, item.piecesPerBundle);
        await saveStockItemAndOpeningMovement(item, {
          ...openingMovement,
          bundleCount,
          piecesPerBundle: item.piecesPerBundle,
          totalPieces,
          pieceWeightKg: item.pieceWeightKg,
          piecesPerTon: computePiecesPerTon(item.pieceWeightKg),
          totalTons: computeTotalTons(totalPieces, item.pieceWeightKg),
        });
      }
      await refresh();
      setSelectedReportItem(null);
      showNotice("تم تحديث بيانات الصنف ورصيده على الفرق.");
    } catch {
      showError("تعذر تحديث الصنف.");
    }
  }

  async function handleUpdateInvoice(
    invoiceNumber: string,
    lines: Array<{ itemId: string; bundleCount: number; totalPieces: number }>,
    customer: string,
    note: string,
  ) {
    const previous = snapshot.movements.filter(
      (movement) => movement.kind === "out" && movement.invoiceNumber === invoiceNumber,
    );
    const withoutPrevious = snapshot.movements.filter(
      (movement) => !previous.some((movementToRemove) => movementToRemove.id === movement.id),
    );
    const resolvedLines = lines.map((line, index) => ({
      ...line,
      item: snapshot.items.find((item) => item.id === line.itemId),
      previous: previous[index],
    }));
    if (
      !resolvedLines.length ||
      resolvedLines.some((line) => !line.item || line.bundleCount <= 0 || line.totalPieces <= 0)
    ) {
      showError("أدخل بيانات الفاتورة كاملة.");
      return false;
    }
    for (const line of resolvedLines) {
      if (line.item && line.totalPieces > getItemBalance(line.item.id, withoutPrevious)) {
        showError(`الكمية المطلوبة أكبر من الرصيد المتاح للصنف: ${line.item.name}.`);
        return false;
      }
    }
    const createdAt = previous[0]?.createdAt ?? new Date().toISOString();
    const updated = resolvedLines.map((line) => ({
      id: line.previous?.id ?? crypto.randomUUID(),
      itemId: line.item!.id,
      kind: "out" as const,
      bundleCount: line.bundleCount,
      piecesPerBundle: line.item!.piecesPerBundle,
      totalPieces: line.totalPieces,
      pieceWeightKg: line.item!.pieceWeightKg,
      piecesPerTon: computePiecesPerTon(line.item!.pieceWeightKg),
      totalTons: computeTotalTons(line.totalPieces, line.item!.pieceWeightKg),
      note,
      createdAt,
      ...(customer && { customer }),
      invoiceNumber,
    }));
    try {
      await replaceInvoiceMovements(
        previous.map((movement) => movement.id),
        updated,
      );
      await refresh();
      setSelectedInvoice(updated[0] ?? null);
      showNotice(`تم تحديث الفاتورة ${invoiceNumber} وخصم الفرق الحقيقي من الرصيد.`);
      return true;
    } catch {
      showError("تعذر تحديث الفاتورة على هذا الجهاز.");
      return false;
    }
  }

  async function handleDeleteItem(item: StockItem) {
    if (
      !window.confirm(
        `هل أنت متأكد من حذف الصنف «${item.name}» وجميع حركاته؟ سيتم حفظ نسخة احتياطية تلقائية قبل الحذف.`,
      )
    )
      return;
    try {
      await deleteStockItemWithBackup(item.id);
      await refresh();
      setSelectedReportItem(null);
      showNotice("تم حذف الصنف وحركاته بعد التأكيد.");
    } catch {
      showError("تعذر حذف الصنف.");
    }
  }

  async function runExport(
    action: "pdf" | "backup" | "csv",
    prepare: () => Promise<void>,
    successMessage: string,
  ) {
    if (exportLock.current) return;
    exportLock.current = true;
    setBusyAction(action);
    showNotice("جاري التجهيز...");
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
      await prepare();
      showNotice(successMessage);
    } catch (caught) {
      console.error("File export failed", caught);
      showError(
        caught instanceof Error
          ? `تعذر إنشاء الملف: ${caught.message}`
          : "تعذر إنشاء الملف. حاول مرة أخرى.",
      );
    } finally {
      exportLock.current = false;
      setBusyAction(null);
    }
  }

  function exportCsv() {
    void runExport(
      "csv",
      async () => {
        const csv = buildMovementCsv(snapshot);
        downloadBlob(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
          `كشف-${localDateStamp()}.csv`,
        );
      },
      "تم تنزيل كشف CSV بنجاح",
    );
  }

  function exportBackup() {
    void runExport(
      "backup",
      async () => {
        const payload = buildBackupFile(snapshot);
        const contents = JSON.stringify(payload, null, 2);
        downloadBlob(
          new Blob([contents], { type: "application/json;charset=utf-8" }),
          `نسخة-احتياطية-${localDateStamp()}.json`,
        );
      },
      "تم تنزيل النسخة الاحتياطية بنجاح",
    );
  }

  function exportInvoice(invoiceNumber: string) {
    void runExport(
      "pdf",
      async () => {
        const invoiceElement = document.querySelector<HTMLElement>(".invoice-paper");
        if (!invoiceElement) throw new Error("لم يتم العثور على الفاتورة المعروضة.");
        await downloadInvoicePdf(invoiceElement, invoiceNumber);
      },
      "تم تنزيل الفاتورة بصيغة PDF بنجاح",
    );
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Partial<StockSnapshot> & {
        snapshot?: Partial<StockSnapshot>;
        data?: Partial<StockSnapshot>;
      };
      const payload = data.snapshot ?? data.data ?? data;
      if (!Array.isArray(payload.items) || !Array.isArray(payload.movements)) {
        showError("ملف النسخة الاحتياطية غير صالح أو لا يحتوي المخزون والحركات.");
        return;
      }
      await restoreStockSnapshot({ items: payload.items, movements: payload.movements });
      await refresh();
      showNotice("تمت استعادة البيانات على هذا الجهاز.");
    } catch {
      showError("تعذرت استعادة الملف. اختر نسخة احتياطية صالحة.");
    } finally {
      inputElement.value = "";
    }
  }

  const matches = snapshot.items.filter(
    (item) =>
      !searchTerm.trim() ||
      item.name.toLocaleLowerCase("ar").includes(searchTerm.trim().toLocaleLowerCase("ar")),
  );

  return (
    <div className="stock-app min-h-screen bg-background text-foreground" dir="rtl">
      <header className="stock-header">
        <Button
          variant="ghost"
          size="icon"
          className="header-home"
          aria-label="الرئيسية"
          onClick={() => setScreen("home")}
        >
          <Home aria-hidden="true" />
        </Button>
        <img
          className="header-logo"
          src={brandLogo.url}
          alt="محمد الشريف — إدارة المخازن، هايل سمر للتجارة"
        />
        <div className="header-copy">
          <p className="eyebrow">هايل سمر للتجارة</p>
          <h1>إدارة المخازن</h1>
          <p className="header-location">
            فرع الحديدة <span aria-hidden="true">·</span> محمد الشريف
          </p>
        </div>
        <span className="offline-indicator">
          <span aria-hidden="true" /> محلي
        </span>
      </header>
      <nav className="desktop-nav" aria-label="التنقل الرئيسي">
        {navigation.map(({ id, icon: Icon }) => (
          <Button
            key={id}
            variant={screen === id ? "secondary" : "ghost"}
            className="nav-button"
            aria-current={screen === id ? "page" : undefined}
            onClick={() => setScreen(id)}
          >
            <Icon aria-hidden="true" />
            {screenTitles[id]}
          </Button>
        ))}
      </nav>
      <main className="stock-main">
        {(notice || error) && (
          <div
            className={error ? "app-message error-message" : "app-message"}
            role="status"
            aria-live="polite"
          >
            {error || notice}
          </div>
        )}
        {loading ? (
          <section className="content-section">
            <p>جارٍ فتح المخزون المحفوظ…</p>
          </section>
        ) : (
          <>
            {screen === "home" && (
              <HomeScreen
                itemCount={snapshot.items.length}
                totalPieces={totalPieces}
                onNavigate={setScreen}
              />
            )}
            {screen === "items" && (
              <ItemsScreen
                key={snapshot.items.length}
                items={snapshot.items}
                movements={snapshot.movements}
                onSubmit={handleAddItem}
              />
            )}
            {screen === "balances" && (
              <BalancesScreen items={snapshot.items} movements={snapshot.movements} />
            )}
            {screen === "inbound" && (
              <MovementScreen
                key={snapshot.movements.length}
                kind="in"
                items={snapshot.items}
                movements={snapshot.movements}
                onSubmit={(event) => void handleAddMovement("in", event)}
              />
            )}
            {screen === "outbound" && (
              <OutboundScreen
                items={snapshot.items}
                movements={snapshot.movements}
                selectedInvoice={selectedInvoice}
                busyAction={busyAction}
                onExportPdf={exportInvoice}
                onSubmit={(event) => void handleAddMovement("out", event)}
                onUpdateInvoice={handleUpdateInvoice}
                onSelectInvoice={setSelectedInvoice}
              />
            )}
            {screen === "report" && (
              <ReportScreen
                items={snapshot.items}
                movements={snapshot.movements}
                onSelectItem={setSelectedReportItem}
                onExportCsv={exportCsv}
                onBackup={exportBackup}
                busyAction={busyAction}
                onRestore={() => restoreInput.current?.click()}
              />
            )}
            {screen === "search" && (
              <SearchScreen
                searchTerm={searchTerm}
                onSearch={setSearchTerm}
                items={matches}
                movements={snapshot.movements}
              />
            )}
          </>
        )}
        {selectedReportItem && (
          <ItemDetailsDialog
            item={selectedReportItem}
            movements={snapshot.movements}
            onClose={() => setSelectedReportItem(null)}
            onSave={handleUpdateItem}
            onDelete={() => void handleDeleteItem(selectedReportItem)}
          />
        )}
        <input
          ref={restoreInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importBackup(event)}
          aria-label="اختر ملف النسخة الاحتياطية"
        />
      </main>
      <footer className="stock-footer">
        <ShieldCheck aria-hidden="true" />
        <span>البيانات محفوظة على هذا الجهاز فقط</span>
      </footer>
      <nav className="mobile-nav" aria-label="التنقل الرئيسي">
        {navigation.map(({ id, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            size="icon"
            className={screen === id ? "mobile-nav-button active" : "mobile-nav-button"}
            aria-label={screenTitles[id]}
            aria-current={screen === id ? "page" : undefined}
            onClick={() => setScreen(id)}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
      </nav>
    </div>
  );
}

function HomeScreen({
  itemCount,
  totalPieces,
  onNavigate,
}: {
  itemCount: number;
  totalPieces: number;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <div className="home-layout">
      <section className="home-hero">
        <div className="hero-brand-image">
          <img src={brandLogo.url} alt="شعار محمد الشريف — إدارة المخازن — هايل سمر للتجارة" />
        </div>
        <div className="hero-content">
          <p className="eyebrow">فرع الحديدة</p>
          <h2>مخزونك، بين يديك.</h2>
          <p>إدارة يومية واضحة لأصناف المخزن وحركاته.</p>
          <Button onClick={() => onNavigate("inbound")} className="primary-action">
            <ArrowDownToLine aria-hidden="true" /> تسجيل وارد
          </Button>
        </div>
      </section>
      <section className="summary-strip" aria-label="ملخص المخزون">
        <div className="summary-stat">
          <span>عدد الأصناف</span>
          <strong>{formatNumber(itemCount)}</strong>
        </div>
        <div className="summary-stat">
          <span>إجمالي الرصيد</span>
          <strong>
            {formatNumber(totalPieces)} <small>حبة</small>
          </strong>
        </div>
        <div className="summary-stat">
          <span>حفظ البيانات</span>
          <strong>محلي</strong>
        </div>
      </section>
      <section className="home-actions" aria-label="الشاشات">
        <HomeAction icon={PackagePlus} label="إضافة صنف" onClick={() => onNavigate("items")} />
        <HomeAction icon={Boxes} label="الأرصدة" onClick={() => onNavigate("balances")} />
        <HomeAction icon={FileText} label="صادر وفاتورة" onClick={() => onNavigate("outbound")} />
        <HomeAction icon={FileBarChart} label="كشف المخزون" onClick={() => onNavigate("report")} />
      </section>
      <section className="calculation-note">
        <Weight aria-hidden="true" />
        <p>
          <strong>حساب الوزن</strong>
          <span>عدد الحبات × وزن الحبة ÷ ١٠٠٠ = الوزن بالطن</span>
        </p>
      </section>
    </div>
  );
}

function HomeAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="home-action" onClick={onClick}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <span className="action-arrow" aria-hidden="true">
        ←
      </span>
    </button>
  );
}

function ItemsScreen({
  items,
  movements,
  onSubmit,
}: {
  items: StockItem[];
  movements: StockMovement[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [bundleCountInput, setBundleCountInput] = useState("");
  const [piecesPerBundleInput, setPiecesPerBundleInput] = useState("");
  const [pieceWeightInput, setPieceWeightInput] = useState("");
  const bundles = Number(bundleCountInput) || 0;
  const piecesPerBundle = Number(piecesPerBundleInput) || 0;
  const pieceWeightKg = Number(pieceWeightInput) || 0;
  const validInputs = bundles > 0 && piecesPerBundle > 0 && pieceWeightKg > 0;
  const totalPieces = validInputs ? computeTotalPieces(bundles, piecesPerBundle) : 0;
  const piecesPerTon = validInputs ? computePiecesPerTon(pieceWeightKg) : 0;
  const totalTons = validInputs ? computeTotalTons(totalPieces, pieceWeightKg) : 0;
  return (
    <section className="content-section">
      <SectionHeading
        icon={PackagePlus}
        title="إضافة صنف"
        subtitle="تعريف الصنف ووحدة التعبئة ووزن الحبة."
      />
      <form className="stock-form" onSubmit={onSubmit}>
        <Field label="اسم الصنف">
          <Input name="name" required maxLength={120} placeholder="مثال: أكياس أسمنت" />
        </Field>
        <div className="form-grid two-columns">
          <Field label="عدد البنادل">
            <Input
              name="bundleCount"
              type="number"
              min="1"
              step="1"
              required
              value={bundleCountInput}
              onChange={(event) => setBundleCountInput(event.target.value)}
              placeholder="مثال: ١٠"
            />
          </Field>
          <Field label="عدد الحبات في البندل">
            <Input
              name="piecesPerBundle"
              type="number"
              min="1"
              step="1"
              required
              value={piecesPerBundleInput}
              onChange={(event) => setPiecesPerBundleInput(event.target.value)}
              placeholder="٥٠"
            />
          </Field>
        </div>
        <div className="form-grid two-columns">
          <Field label="وزن الحبة بالكيلوغرام">
            <Input
              name="pieceWeightKg"
              type="number"
              min="0.001"
              step="any"
              required
              value={pieceWeightInput}
              onChange={(event) => setPieceWeightInput(event.target.value)}
              placeholder="٢٥"
            />
          </Field>
          <Field label="بلد الصنع">
            <select name="countryOfOrigin" className="stock-select" defaultValue="اليمن" required>
              <option value="اليمن">اليمن</option>
              <option value="السعودية">السعودية</option>
              <option value="الصين">الصين</option>
            </select>
          </Field>
        </div>
        <p className="field-hint">تُستخدم بيانات التعبئة والوزن تلقائياً في حركات الصنف.</p>
        <ItemCalculationPreview
          pieces={totalPieces}
          bundles={bundles}
          piecesPerBundle={piecesPerBundle}
          piecesPerTon={piecesPerTon}
          tons={totalTons}
        />
        <Button type="submit">
          <PackagePlus aria-hidden="true" /> حفظ الصنف
        </Button>
      </form>
      <div className="section-divider" />
      <div className="section-subheading">
        <h3>الأصناف المسجلة</h3>
        <span>{formatNumber(items.length)} صنف</span>
      </div>
      {items.length === 0 ? (
        <EmptyState text="لا توجد أصناف مسجلة بعد." />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>الصنف</th>
                <th>بلد الصنع</th>
                <th>حبة / بندل</th>
                <th>وزن الحبة</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.name}</th>
                  <td>{item.countryOfOrigin ?? "—"}</td>
                  <td>{formatNumber(item.piecesPerBundle)}</td>
                  <td>{formatNumber(item.pieceWeightKg)} كجم</td>
                  <td>{formatNumber(getItemBalance(item.id, movements))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BalancesScreen({ items, movements }: { items: StockItem[]; movements: StockMovement[] }) {
  return (
    <section className="content-section">
      <SectionHeading
        icon={Boxes}
        title="الأرصدة"
        subtitle="الرصيد الحالي لكل صنف محسوب من حركات المخزون."
      />
      {items.length === 0 ? (
        <EmptyState text="أضف صنفاً لتظهر أرصدته هنا." />
      ) : (
        <div className="balance-list">
          {items.map((item) => {
            const balance = getItemBalance(item.id, movements);
            return (
              <article className="balance-row" key={item.id}>
                <div className="balance-name">
                  <span className="item-mark">
                    <Boxes aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{formatNumber(item.piecesPerBundle)} حبة في البندل</p>
                  </div>
                </div>
                <div className="balance-value">
                  <strong>{formatNumber(balance)}</strong>
                  <span>
                    حبة · {formatNumber(computeTotalTons(balance, item.pieceWeightKg))} طن
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MovementScreen({
  kind,
  items,
  movements,
  onSubmit,
}: {
  kind: MovementKind;
  items: StockItem[];
  movements: StockMovement[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [rows, setRows] = useState([
    { key: crypto.randomUUID(), itemId: "", bundleCount: "", totalPieces: "" },
  ]);
  const isInbound = kind === "in";
  const updateRow = (index: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  return (
    <section className="content-section">
      <SectionHeading
        icon={isInbound ? ArrowDownToLine : ArrowUpFromLine}
        title={isInbound ? "تسجيل وارد" : "تسجيل صادر"}
        subtitle={
          isInbound
            ? "أضف صنفاً أو أكثر في حركة وارد واحدة."
            : "أضف صنفاً أو أكثر في حركة صادر واحدة وفاتورة موحدة."
        }
      />
      {items.length === 0 ? (
        <EmptyState text="أضف صنفاً أولاً قبل تسجيل الحركة." />
      ) : (
        <form className="stock-form" onSubmit={onSubmit}>
          {rows.map((row, index) => {
            const item = items.find((candidate) => candidate.id === row.itemId) ?? items[0];
            const bundles = Number(row.bundleCount) || 0;
            const calculatedPieces = item ? computeTotalPieces(bundles, item.piecesPerBundle) : 0;
            const pieces = isInbound ? calculatedPieces : Number(row.totalPieces) || 0;
            return (
              <div className="movement-line" key={row.key}>
                <div className="section-subheading">
                  <h3>الصنف {formatNumber(index + 1)}</h3>
                  {rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="حذف الصنف من الحركة"
                      onClick={() =>
                        setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <Field label="الصنف">
                  <select
                    name="itemId"
                    className="stock-select"
                    value={item?.id ?? ""}
                    onChange={(event) => {
                      const selected = items.find((entry) => entry.id === event.target.value);
                      updateRow(index, {
                        itemId: event.target.value,
                        totalPieces: selected
                          ? String(
                              computeTotalPieces(
                                Number(row.bundleCount) || 0,
                                selected.piecesPerBundle,
                              ),
                            )
                          : "",
                      });
                    }}
                  >
                    {items.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {item && (
                  <div className="available-balance">
                    <span>الرصيد المتاح</span>
                    <strong>{formatNumber(getItemBalance(item.id, movements))} حبة</strong>
                  </div>
                )}
                <div className="form-grid two-columns">
                  <Field label="عدد البنادل">
                    <Input
                      name="bundleCount"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={row.bundleCount}
                      onChange={(event) =>
                        updateRow(index, {
                          bundleCount: event.target.value,
                          totalPieces: String(
                            item
                              ? computeTotalPieces(
                                  Number(event.target.value) || 0,
                                  item.piecesPerBundle,
                                )
                              : 0,
                          ),
                        })
                      }
                      placeholder="أدخل عدد البنادل"
                    />
                  </Field>
                  {!isInbound && item && (
                    <Field label="عدد حبات البندل">
                      <Input value={item.piecesPerBundle} readOnly aria-label="عدد حبات البندل" />
                    </Field>
                  )}
                </div>
                {!isInbound && (
                  <Field label="إجمالي الحبات (قابل للتعديل)">
                    <Input
                      name="totalPieces"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={row.totalPieces}
                      onChange={(event) => updateRow(index, { totalPieces: event.target.value })}
                      placeholder="عدد الحبات الفعلي"
                    />
                  </Field>
                )}
                {item && (
                  <CalculationPreview
                    pieces={pieces}
                    bundles={bundles}
                    piecesPerBundle={item.piecesPerBundle}
                    piecesPerTon={computePiecesPerTon(item.pieceWeightKg)}
                    tons={computeTotalTons(pieces, item.pieceWeightKg)}
                  />
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: crypto.randomUUID(), itemId: "", bundleCount: "", totalPieces: "" },
              ])
            }
          >
            <Plus aria-hidden="true" /> إضافة صنف
          </Button>
          <Field label="العميل (اختياري)">
            <Input name="customer" maxLength={160} placeholder="اسم العميل" />
          </Field>
          <Field label="ملاحظة (اختياري)">
            <Input name="note" maxLength={250} placeholder="تفاصيل الحركة" />
          </Field>
          <Button type="submit" className="form-submit">
            {isInbound ? (
              <ArrowDownToLine aria-hidden="true" />
            ) : (
              <ArrowUpFromLine aria-hidden="true" />
            )}
            {isInbound ? "حفظ الوارد" : "حفظ الصادر وإصدار الفاتورة"}
          </Button>
        </form>
      )}
    </section>
  );
}

function OutboundScreen({
  items,
  movements,
  selectedInvoice,
  busyAction,
  onExportPdf,
  onSubmit,
  onUpdateInvoice,
  onSelectInvoice,
}: {
  items: StockItem[];
  movements: StockMovement[];
  selectedInvoice: StockMovement | null;
  busyAction: "pdf" | "backup" | "csv" | null;
  onExportPdf: (invoiceNumber: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateInvoice: (
    invoiceNumber: string,
    lines: Array<{ itemId: string; bundleCount: number; totalPieces: number }>,
    customer: string,
    note: string,
  ) => Promise<boolean>;
  onSelectInvoice: (invoice: StockMovement) => void;
}) {
  const [editing, setEditing] = useState(false);
  const invoicesByNumber = new Map<string, StockMovement>();
  movements
    .filter((movement) => movement.kind === "out" && movement.invoiceNumber)
    .forEach((movement) => invoicesByNumber.set(movement.invoiceNumber!, movement));
  const recentInvoices = [...invoicesByNumber.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const activeInvoice = selectedInvoice ?? recentInvoices[0] ?? null;
  const activeMovements = activeInvoice
    ? movements.filter(
        (entry) => entry.kind === "out" && entry.invoiceNumber === activeInvoice.invoiceNumber,
      )
    : [];
  return (
    <div className="outbound-layout">
      <MovementScreen
        key={movements.length}
        kind="out"
        items={items}
        movements={movements}
        onSubmit={onSubmit}
      />
      <section className="content-section invoice-section">
        <div className="section-subheading">
          <h3>فاتورة الصادر</h3>
          <FileText aria-hidden="true" />
        </div>
        {activeInvoice ? (
          editing ? (
            <InvoiceEditScreen
              invoice={activeInvoice}
              movements={activeMovements}
              items={items}
              onCancel={() => setEditing(false)}
              onSave={async (lines, customer, note) => {
                const saved = await onUpdateInvoice(
                  activeInvoice.invoiceNumber ?? "",
                  lines,
                  customer,
                  note,
                );
                if (saved) setEditing(false);
              }}
            />
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="no-print"
                onClick={() => setEditing(true)}
              >
                تعديل الفاتورة
              </Button>
              <InvoicePreview
                invoice={activeInvoice}
                movements={activeMovements}
                items={items}
                onExportPdf={onExportPdf}
                busyAction={busyAction}
              />
            </>
          )
        ) : (
          <EmptyState text="ستظهر الفاتورة هنا بعد تسجيل حركة صادر." />
        )}
        {recentInvoices.length > 1 && (
          <div className="invoice-history">
            <h3>الفواتير السابقة</h3>
            {recentInvoices.slice(0, 8).map((invoice) => (
              <Button
                key={invoice.id}
                variant={activeInvoice?.id === invoice.id ? "secondary" : "ghost"}
                className="invoice-history-row"
                onClick={() => {
                  onSelectInvoice(invoice);
                  setEditing(false);
                }}
              >
                <span>{invoice.invoiceNumber}</span>
                <span>{formatDate(invoice.createdAt)}</span>
              </Button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InvoiceEditScreen({
  invoice,
  movements,
  items,
  onCancel,
  onSave,
}: {
  invoice: StockMovement;
  movements: StockMovement[];
  items: StockItem[];
  onCancel: () => void;
  onSave: (
    lines: Array<{ itemId: string; bundleCount: number; totalPieces: number }>,
    customer: string,
    note: string,
  ) => Promise<void>;
}) {
  const [rows, setRows] = useState(
    movements.map((movement) => ({
      key: movement.id,
      itemId: movement.itemId,
      bundleCount: String(movement.bundleCount),
      totalPieces: String(movement.totalPieces),
    })),
  );
  const first = movements[0] ?? invoice;
  const [customer, setCustomer] = useState(first.customer ?? "");
  const [note, setNote] = useState(first.note ?? "");
  const updateRow = (index: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  return (
    <form
      className="stock-form invoice-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(
          rows.map((row) => ({
            itemId: row.itemId,
            bundleCount: Number(row.bundleCount),
            totalPieces: Number(row.totalPieces),
          })),
          customer.trim(),
          note.trim(),
        );
      }}
    >
      <div className="invoice-edit-heading">
        <strong>تعديل {invoice.invoiceNumber}</strong>
        <Button type="button" variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
      {rows.map((row, index) => {
        const item = items.find((entry) => entry.id === row.itemId);
        return (
          <div className="movement-line" key={row.key}>
            <div className="section-subheading">
              <h3>الصنف {formatNumber(index + 1)}</h3>
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </div>
            <Field label="الصنف">
              <select
                className="stock-select"
                value={row.itemId}
                onChange={(event) => {
                  const selected = items.find((entry) => entry.id === event.target.value);
                  updateRow(index, {
                    itemId: event.target.value,
                    totalPieces: selected
                      ? String(
                          computeTotalPieces(
                            Number(row.bundleCount) || 0,
                            selected.piecesPerBundle,
                          ),
                        )
                      : row.totalPieces,
                  });
                }}
              >
                {items.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid two-columns">
              <Field label="عدد البنادل">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={row.bundleCount}
                  onChange={(event) => updateRow(index, { bundleCount: event.target.value })}
                />
              </Field>
              <Field label="عدد حبات البندل">
                <Input value={item?.piecesPerBundle ?? ""} readOnly />
              </Field>
            </div>
            <Field label="إجمالي الحبات (قابل للتعديل)">
              <Input
                type="number"
                min="1"
                step="1"
                required
                value={row.totalPieces}
                onChange={(event) => updateRow(index, { totalPieces: event.target.value })}
              />
            </Field>
            {item && (
              <CalculationPreview
                pieces={Number(row.totalPieces) || 0}
                bundles={Number(row.bundleCount) || 0}
                piecesPerBundle={item.piecesPerBundle}
                piecesPerTon={computePiecesPerTon(item.pieceWeightKg)}
                tons={computeTotalTons(Number(row.totalPieces) || 0, item.pieceWeightKg)}
              />
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: crypto.randomUUID(),
              itemId: items[0]?.id ?? "",
              bundleCount: "",
              totalPieces: "",
            },
          ])
        }
      >
        <Plus aria-hidden="true" /> إضافة صنف
      </Button>
      <Field label="العميل (اختياري)">
        <Input
          value={customer}
          onChange={(event) => setCustomer(event.target.value)}
          maxLength={160}
        />
      </Field>
      <Field label="ملاحظة (اختياري)">
        <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={250} />
      </Field>
      <div className="dialog-actions">
        <Button type="submit">حفظ التعديل</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

function InvoicePreview({
  invoice,
  movements,
  items,
  onExportPdf,
  busyAction,
}: {
  invoice: StockMovement;
  movements: StockMovement[];
  items: StockItem[];
  onExportPdf: (invoiceNumber: string) => void;
  busyAction: "pdf" | "backup" | "csv" | null;
}) {
  const invoiceMovements = movements.length ? movements : [invoice];
  const invoiceTotals = invoiceMovements.map((entry) => ({
    movement: entry,
    ...getMovementQuantities(entry),
  }));
  return (
    <article className="invoice-paper" aria-label={`فاتورة رقم ${invoice.invoiceNumber}`}>
      <div className="invoice-brand">
        <img src={brandLogo.url} alt="شعار هايل سمر للتجارة" />
        <div>
          <strong>هايل سمر للتجارة</strong>
          <span>فرع الحديدة · إدارة المخازن</span>
        </div>
      </div>
      <div className="invoice-rule" />
      <div className="invoice-title-line">
        <h4>فاتورة صادر</h4>
        <span>{invoice.invoiceNumber}</span>
      </div>
      <p className="invoice-date">التاريخ: {formatDate(invoice.createdAt)}</p>
      <div className="invoice-lines">
        <div className="invoice-line invoice-line-head">
          <span>الصنف</span>
          <span>البنادل</span>
          <span>حبات البندل</span>
          <span>إجمالي الحبات</span>
          <span>الوزن (طن)</span>
        </div>
        {invoiceTotals.map(({ movement: entry, totalPieces, totalTons }) => (
          <div className="invoice-line" key={entry.id}>
            <span>{items.find((item) => item.id === entry.itemId)?.name ?? "صنف محفوظ"}</span>
            <span>{formatNumber(entry.bundleCount)}</span>
            <span>{formatNumber(entry.piecesPerBundle)}</span>
            <span>{formatNumber(totalPieces)}</span>
            <span>{formatNumber(totalTons)}</span>
          </div>
        ))}
      </div>
      <dl className="invoice-details">
        <InvoiceValue
          label="إجمالي الحبات"
          value={formatNumber(invoiceTotals.reduce((sum, entry) => sum + entry.totalPieces, 0))}
        />
        <InvoiceValue
          label="إجمالي الوزن"
          value={`${formatNumber(invoiceTotals.reduce((sum, entry) => sum + entry.totalTons, 0))} طن`}
        />
        {invoice.customer && <InvoiceValue label="العميل" value={invoice.customer} />}
        {invoice.note && <InvoiceValue label="ملاحظة" value={invoice.note} />}
      </dl>
      <div className="invoice-rule" />
      <p className="invoice-signature">استلمت الأصناف الموضحة أعلاه</p>
      <div className="invoice-sign-lines">
        <span>المستلم</span>
        <span>المسؤول</span>
      </div>
      <Button
        type="button"
        className="print-button no-print"
        disabled={busyAction === "pdf"}
        aria-busy={busyAction === "pdf"}
        onClick={() => onExportPdf(invoice.invoiceNumber ?? "بدون-رقم")}
      >
        <Printer aria-hidden="true" />
        {busyAction === "pdf" ? "جاري التجهيز..." : "طباعة الفاتورة"}
      </Button>
    </article>
  );
}

function InvoiceValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReportScreen({
  items,
  movements,
  onSelectItem,
  onExportCsv,
  onBackup,
  onRestore,
  busyAction,
}: {
  items: StockItem[];
  movements: StockMovement[];
  onSelectItem: (item: StockItem) => void;
  onExportCsv: () => void;
  onBackup: () => void;
  onRestore: () => void;
  busyAction: "pdf" | "backup" | "csv" | null;
}) {
  return (
    <section className="content-section">
      <SectionHeading
        icon={FileBarChart}
        title="كشف المخزون"
        subtitle="ملخص الوارد والصادر والأرصدة المتاحة."
      />
      {items.length === 0 ? (
        <EmptyState text="لا توجد حركات أو أصناف لعرضها." />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الوارد</th>
                <th>الصادر</th>
                <th>الرصيد</th>
                <th>الرصيد (طن)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const entries = movements.filter((movement) => movement.itemId === item.id);
                const incoming = entries.filter((movement) => movement.kind === "in");
                const outgoing = entries.filter((movement) => movement.kind === "out");
                const balance = getItemBalance(item.id, movements);
                return (
                  <tr
                    key={item.id}
                    className="report-item-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`تفاصيل الصنف ${item.name}`}
                    onClick={() => onSelectItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectItem(item);
                      }
                    }}
                  >
                    <th scope="row">{item.name}</th>
                    <td>
                      {formatNumber(
                        incoming.reduce((sum, movement) => sum + movement.totalPieces, 0),
                      )}
                    </td>
                    <td>
                      {formatNumber(
                        outgoing.reduce((sum, movement) => sum + movement.totalPieces, 0),
                      )}
                    </td>
                    <td className="table-balance">{formatNumber(balance)}</td>
                    <td>{formatNumber(computeTotalTons(balance, item.pieceWeightKg))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="report-tools no-print">
        <Button
          type="button"
          variant="secondary"
          disabled={busyAction !== null}
          aria-busy={busyAction === "csv"}
          onClick={onExportCsv}
        >
          <FileBarChart aria-hidden="true" />
          {busyAction === "csv" ? "جاري التجهيز..." : "تصدير كشف CSV"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busyAction !== null}
          aria-busy={busyAction === "backup"}
          onClick={onBackup}
        >
          <Archive aria-hidden="true" />
          {busyAction === "backup" ? "جاري التجهيز..." : "نسخة احتياطية"}
        </Button>
        <Button type="button" variant="outline" disabled={busyAction !== null} onClick={onRestore}>
          <ArrowLeftRight aria-hidden="true" /> استعادة النسخة الاحتياطية
        </Button>
      </div>
      <div className="section-divider" />
      <div className="section-subheading">
        <h3>آخر الحركات</h3>
        <ArrowLeftRight aria-hidden="true" />
      </div>
      {movements.length === 0 ? (
        <EmptyState text="لم تُسجل أي حركة حتى الآن." />
      ) : (
        <div className="history-list">
          {movements
            .slice()
            .reverse()
            .slice(0, 20)
            .map((movement) => {
              const item = items.find((entry) => entry.id === movement.itemId);
              const incoming = movement.kind === "in";
              return (
                <div className="history-row" key={movement.id}>
                  <span
                    className={
                      incoming ? "movement-icon inbound-icon" : "movement-icon outbound-icon"
                    }
                  >
                    {incoming ? (
                      <ArrowDownToLine aria-hidden="true" />
                    ) : (
                      <ArrowUpFromLine aria-hidden="true" />
                    )}
                  </span>
                  <div className="history-description">
                    <strong>{item?.name ?? "صنف محفوظ"}</strong>
                    <span>
                      {incoming ? "وارد" : "صادر"} · {formatNumber(movement.bundleCount)} بندل ·{" "}
                      {formatDate(movement.createdAt)}
                    </span>
                  </div>
                  <strong className={incoming ? "movement-quantity positive" : "movement-quantity"}>
                    {incoming ? "+" : "−"}
                    {formatNumber(movement.totalPieces)}
                  </strong>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}

function ItemDetailsDialog({
  item,
  movements,
  onClose,
  onSave,
  onDelete,
}: {
  item: StockItem;
  movements: StockMovement[];
  onClose: () => void;
  onSave: (item: StockItem) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [piecesPerBundle, setPiecesPerBundle] = useState(String(item.piecesPerBundle));
  const [pieceWeightKg, setPieceWeightKg] = useState(String(item.pieceWeightKg));
  const [country, setCountry] = useState<CountryOfOrigin>(item.countryOfOrigin ?? "اليمن");
  const balance = getItemBalance(item.id, movements);
  const openingMovement = movements.find(
    (movement) =>
      movement.itemId === item.id && movement.kind === "in" && movement.note === "رصيد افتتاحي",
  );
  const [bundleCount, setBundleCount] = useState(
    String(item.bundleCount ?? openingMovement?.bundleCount ?? ""),
  );
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="item-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-details-title"
      >
        <div className="section-subheading">
          <h2 id="item-details-title">تفاصيل الصنف</h2>
          <Button type="button" variant="ghost" onClick={onClose}>
            إغلاق
          </Button>
        </div>
        <p>
          الرصيد الحالي:{" "}
          <strong>
            {formatNumber(balance)} حبة ·{" "}
            {formatNumber(computeTotalTons(balance, Number(pieceWeightKg)))} طن
          </strong>
        </p>
        <form
          className="stock-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !name.trim() ||
              Number(bundleCount) <= 0 ||
              Number(piecesPerBundle) <= 0 ||
              Number(pieceWeightKg) <= 0
            )
              return;
            onSave({
              ...item,
              name: name.trim(),
              bundleCount: Number(bundleCount),
              piecesPerBundle: Number(piecesPerBundle),
              pieceWeightKg: Number(pieceWeightKg),
              countryOfOrigin: country,
            });
          }}
        >
          <Field label="اسم الصنف">
            <Input required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="عدد البنادل">
            <Input
              type="number"
              min="1"
              step="1"
              required
              value={bundleCount}
              onChange={(event) => setBundleCount(event.target.value)}
            />
          </Field>
          <Field label="عدد الحبات في البندل">
            <Input
              type="number"
              min="1"
              step="1"
              required
              value={piecesPerBundle}
              onChange={(event) => setPiecesPerBundle(event.target.value)}
            />
          </Field>
          <Field label="وزن الحبة بالكيلوغرام">
            <Input
              type="number"
              min="0.001"
              step="any"
              required
              value={pieceWeightKg}
              onChange={(event) => setPieceWeightKg(event.target.value)}
            />
          </Field>
          <Field label="بلد الصنع">
            <select
              className="stock-select"
              value={country}
              onChange={(event) => setCountry(event.target.value as CountryOfOrigin)}
            >
              <option value="اليمن">اليمن</option>
              <option value="السعودية">السعودية</option>
              <option value="الصين">الصين</option>
            </select>
          </Field>
          <div className="dialog-actions">
            <Button type="submit">حفظ التعديلات</Button>
            <Button type="button" variant="destructive" onClick={onDelete}>
              <Trash2 aria-hidden="true" /> حذف الصنف
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SearchScreen({
  searchTerm,
  onSearch,
  items,
  movements,
}: {
  searchTerm: string;
  onSearch: (value: string) => void;
  items: StockItem[];
  movements: StockMovement[];
}) {
  return (
    <section className="content-section">
      <SectionHeading
        icon={Search}
        title="بحث"
        subtitle="ابحث باسم الصنف للوصول إلى رصيده وحركاته."
      />
      <label className="search-field">
        <Search aria-hidden="true" />
        <Input
          autoFocus
          value={searchTerm}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="اكتب اسم الصنف"
          aria-label="البحث باسم الصنف"
        />
      </label>
      {items.length === 0 ? (
        <EmptyState text={searchTerm ? "لا توجد أصناف تطابق البحث." : "أضف صنفاً لبدء البحث."} />
      ) : (
        <div className="search-results">
          {items.map((item) => {
            const entries = movements
              .filter((movement) => movement.itemId === item.id)
              .slice()
              .reverse()
              .slice(0, 4);
            return (
              <article className="search-result" key={item.id}>
                <div className="search-result-heading">
                  <h3>{item.name}</h3>
                  <strong>
                    {formatNumber(getItemBalance(item.id, movements))} <small>حبة</small>
                  </strong>
                </div>
                <p>
                  {formatNumber(item.piecesPerBundle)} حبة في البندل{" "}
                  <span aria-hidden="true">·</span> وزن الحبة {formatNumber(item.pieceWeightKg)} كجم
                </p>
                {entries.length > 0 && (
                  <ul>
                    {entries.map((movement) => (
                      <li key={movement.id}>
                        <span>
                          {movement.kind === "in" ? "وارد" : "صادر"} ·{" "}
                          {formatDate(movement.createdAt)}
                        </span>
                        <strong>{formatNumber(movement.totalPieces)} حبة</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CalculationPreview({
  pieces,
  bundles,
  piecesPerBundle,
  piecesPerTon,
  tons,
}: {
  pieces: number;
  bundles: number;
  piecesPerBundle: number;
  piecesPerTon: number;
  tons: number;
}) {
  return (
    <div className="calculation-preview" aria-live="polite">
      <p>
        <span>إجمالي الكمية</span>
        <strong>{formatNumber(pieces)} حبة</strong>
        <small>
          {formatNumber(bundles)} بندل × {formatNumber(piecesPerBundle)} حبة
        </small>
      </p>
      <p>
        <span>عدد الحبات في الطن</span>
        <strong>{formatNumber(piecesPerTon)} حبة</strong>
        <small>١٠٠٠ ÷ وزن الحبة</small>
      </p>
      <p>
        <span>إجمالي الوزن</span>
        <strong>{formatNumber(tons)} طن</strong>
        <small>عدد الحبات × الوزن ÷ ١٠٠٠</small>
      </p>
    </div>
  );
}

function ItemCalculationPreview({
  pieces,
  bundles,
  piecesPerBundle,
  piecesPerTon,
  tons,
}: {
  pieces: number;
  bundles: number;
  piecesPerBundle: number;
  piecesPerTon: number;
  tons: number;
}) {
  return (
    <div className="item-calculation-preview" aria-label="نتائج الحساب المباشر" aria-live="polite">
      <p>
        <span>إجمالي الكمية (حبة)</span>
        <strong>{formatNumber(pieces)} حبة</strong>
        <small>
          {formatNumber(bundles)} بندل × {formatNumber(piecesPerBundle)} حبة
        </small>
      </p>
      <p>
        <span>عدد الحبات في الطن</span>
        <strong>{formatNumber(piecesPerTon)} حبة</strong>
        <small>١٠٠٠ ÷ وزن الحبة</small>
      </p>
      <p>
        <span>إجمالي الوزن بالطن</span>
        <strong>{formatNumber(tons)} طن</strong>
        <small>إجمالي الكمية ÷ عدد الحبات في الطن</small>
      </p>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="section-heading">
      <span className="section-icon">
        <Icon aria-hidden="true" />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(
    Number.isFinite(value) ? value : 0,
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
