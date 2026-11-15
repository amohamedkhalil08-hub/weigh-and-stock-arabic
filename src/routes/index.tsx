import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, FileBarChart, FileText, Home, PackagePlus, Printer, Search, ShieldCheck, Weight, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computePiecesPerTon, computeTotalPieces, computeTotalTons, getItemBalance, type MovementKind, type StockItem, type StockMovement, type StockSnapshot } from "@/lib/stock-domain";
import { readStockSnapshot, restoreStockSnapshot, saveStockItem, saveStockMovement } from "@/lib/stock-storage";
import { registerOfflineSupport } from "@/lib/offline-registration";
import brandLogo from "@/assets/hail-samar-brand.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "إدارة مخازن هايل سمر | فرع الحديدة" },
      { name: "description", content: "إدارة مخزون هايل سمر للتجارة - فرع الحديدة، محلياً دون اتصال بالإنترنت." },
      { property: "og:title", content: "إدارة مخازن هايل سمر | فرع الحديدة" },
      { property: "og:description", content: "إضافة الأصناف، متابعة الأرصدة والحركات، وإصدار فواتير المخازن محلياً." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockApp,
});

type Screen = "home" | "items" | "balances" | "inbound" | "outbound" | "report" | "search";

const screenTitles: Record<Screen, string> = {
  home: "الرئيسية", items: "إضافة صنف", balances: "الأرصدة", inbound: "الوارد",
  outbound: "الصادر والفاتورة", report: "كشف المخزون", search: "بحث",
};

const navigation: { id: Screen; icon: LucideIcon }[] = [
  { id: "home", icon: Home }, { id: "items", icon: PackagePlus }, { id: "balances", icon: Boxes },
  { id: "inbound", icon: ArrowDownToLine }, { id: "outbound", icon: ArrowUpFromLine },
  { id: "report", icon: FileBarChart }, { id: "search", icon: Search },
];

function StockApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [snapshot, setSnapshot] = useState<StockSnapshot>({ items: [], movements: [] });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<StockMovement | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const restoreInput = useRef<HTMLInputElement>(null);

  const refresh = async () => setSnapshot(await readStockSnapshot());
  useEffect(() => {
    void registerOfflineSupport();
    void refresh().catch(() => setError("تعذر فتح البيانات المحفوظة على هذا الجهاز.")).finally(() => setLoading(false));
  }, []);

  const totalPieces = useMemo(
    () => snapshot.items.reduce((sum, item) => sum + getItemBalance(item.id, snapshot.movements), 0),
    [snapshot],
  );
  const showNotice = (message: string) => { setError(""); setNotice(message); };
  const showError = (message: string) => { setNotice(""); setError(message); };

  async function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const piecesPerBundle = Number(form.get("piecesPerBundle"));
    const pieceWeightKg = Number(form.get("pieceWeightKg"));
    if (!name || piecesPerBundle <= 0 || pieceWeightKg <= 0) {
      showError("أدخل اسم الصنف وعدد الحبات ووزن الحبة بقيم أكبر من صفر.");
      return;
    }
    try {
      await saveStockItem({ id: crypto.randomUUID(), name, piecesPerBundle, pieceWeightKg, createdAt: new Date().toISOString() });
      await refresh();
      event.currentTarget.reset();
      showNotice("تم حفظ الصنف على هذا الجهاز.");
    } catch {
      showError("تعذر حفظ الصنف. تحقق من مساحة التخزين في الجهاز.");
    }
  }

  async function handleAddMovement(kind: MovementKind, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = snapshot.items.find((candidate) => candidate.id === form.get("itemId"));
    const bundleCount = Number(form.get("bundleCount"));
    if (!item || bundleCount <= 0) {
      showError("اختر صنفاً وأدخل عدد البنادل بقيمة أكبر من صفر.");
      return;
    }
    const pieces = computeTotalPieces(bundleCount, item.piecesPerBundle);
    if (kind === "out" && pieces > getItemBalance(item.id, snapshot.movements)) {
      showError("الكمية المطلوبة أكبر من الرصيد المتاح للصنف.");
      return;
    }
    const createdAt = new Date().toISOString();
    const movement: StockMovement = {
      id: crypto.randomUUID(), itemId: item.id, kind, bundleCount,
      piecesPerBundle: item.piecesPerBundle, totalPieces: pieces,
      pieceWeightKg: item.pieceWeightKg,
      piecesPerTon: computePiecesPerTon(item.pieceWeightKg),
      totalTons: computeTotalTons(pieces, item.pieceWeightKg),
      note: String(form.get("note") ?? "").trim(), createdAt,
      ...(kind === "out" && { invoiceNumber: `HS-${createdAt.slice(0, 10).replaceAll("-", "")}-${String(snapshot.movements.filter((entry) => entry.invoiceNumber).length + 1).padStart(3, "0")}` }),
    };
    try {
      await saveStockMovement(movement);
      await refresh();
      event.currentTarget.reset();
      setSelectedInvoice(kind === "out" ? movement : null);
      showNotice(kind === "in" ? "تم تسجيل الوارد وحفظه محلياً." : "تم تسجيل الصادر وإصدار الفاتورة.");
      if (kind === "out") setScreen("outbound");
    } catch {
      showError("تعذر حفظ الحركة على هذا الجهاز.");
    }
  }

  function downloadFile(contents: string, type: string, filename: string) {
    const file = new Blob([contents], { type });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function exportCsv() {
    const rows = [
      ["الصنف", "عدد البنادل الوارد", "عدد البنادل الصادر", "الوارد (حبة)", "الصادر (حبة)", "الرصيد (حبة)"],
      ...snapshot.items.map((item) => {
        const entries = snapshot.movements.filter((entry) => entry.itemId === item.id);
        const incoming = entries.filter((entry) => entry.kind === "in");
        const outgoing = entries.filter((entry) => entry.kind === "out");
        return [item.name, incoming.reduce((sum, entry) => sum + entry.bundleCount, 0), outgoing.reduce((sum, entry) => sum + entry.bundleCount, 0), incoming.reduce((sum, entry) => sum + entry.totalPieces, 0), outgoing.reduce((sum, entry) => sum + entry.totalPieces, 0), getItemBalance(item.id, snapshot.movements)];
      }),
    ];
    downloadFile(`\ufeff${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}`, "text/csv;charset=utf-8", "كشف_مخزون_هايل_سمر.csv");
    showNotice("تم تجهيز كشف المخزون بصيغة CSV.");
  }

  function exportBackup() {
    downloadFile(JSON.stringify({ version: 1, ...snapshot }, null, 2), "application/json", "نسخة_احتياطية_مخازن_هايل_سمر.json");
    showNotice("تم تنزيل النسخة الاحتياطية.");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Partial<StockSnapshot>;
      if (!Array.isArray(data.items) || !Array.isArray(data.movements)) { showError("ملف النسخة الاحتياطية غير صالح."); return; }
      await restoreStockSnapshot({ items: data.items, movements: data.movements });
      await refresh();
      showNotice("تمت استعادة البيانات على هذا الجهاز.");
    } catch {
      showError("تعذرت استعادة الملف. اختر نسخة احتياطية صالحة.");
    } finally {
      event.currentTarget.value = "";
    }
  }

  const matches = snapshot.items.filter((item) => !searchTerm.trim() || item.name.toLocaleLowerCase("ar").includes(searchTerm.trim().toLocaleLowerCase("ar")));

  return (
    <div className="stock-app min-h-screen bg-background text-foreground" dir="rtl">
      <header className="stock-header">
        <Button variant="ghost" size="icon" className="header-home" aria-label="الرئيسية" onClick={() => setScreen("home")}><Home aria-hidden="true" /></Button>
        <img className="header-logo" src={brandLogo} alt="محمد الشريف — إدارة المخازن، هايل سمر للتجارة" />
        <div className="header-copy"><p className="eyebrow">هايل سمر للتجارة</p><h1>إدارة المخازن</h1><p className="header-location">فرع الحديدة <span aria-hidden="true">·</span> محمد الشريف</p></div>
        <span className="offline-indicator"><span aria-hidden="true" /> محلي</span>
      </header>
      <nav className="desktop-nav" aria-label="التنقل الرئيسي">
        {navigation.map(({ id, icon: Icon }) => <Button key={id} variant={screen === id ? "secondary" : "ghost"} className="nav-button" aria-current={screen === id ? "page" : undefined} onClick={() => setScreen(id)}><Icon aria-hidden="true" />{screenTitles[id]}</Button>)}
      </nav>
      <main className="stock-main">
        {(notice || error) && <div className={error ? "app-message error-message" : "app-message"} role="status" aria-live="polite">{error || notice}</div>}
        {loading ? <section className="content-section"><p>جارٍ فتح المخزون المحفوظ…</p></section> : <>
          {screen === "home" && <HomeScreen itemCount={snapshot.items.length} totalPieces={totalPieces} onNavigate={setScreen} />}
          {screen === "items" && <ItemsScreen items={snapshot.items} movements={snapshot.movements} onSubmit={handleAddItem} />}
          {screen === "balances" && <BalancesScreen items={snapshot.items} movements={snapshot.movements} />}
          {screen === "inbound" && <MovementScreen kind="in" items={snapshot.items} movements={snapshot.movements} onSubmit={(event) => void handleAddMovement("in", event)} />}
          {screen === "outbound" && <OutboundScreen items={snapshot.items} movements={snapshot.movements} selectedInvoice={selectedInvoice} onSubmit={(event) => void handleAddMovement("out", event)} onSelectInvoice={setSelectedInvoice} />}
          {screen === "report" && <ReportScreen items={snapshot.items} movements={snapshot.movements} onExportCsv={exportCsv} onBackup={exportBackup} onRestore={() => restoreInput.current?.click()} />}
          {screen === "search" && <SearchScreen searchTerm={searchTerm} onSearch={setSearchTerm} items={matches} movements={snapshot.movements} />}
        </>}
        <input ref={restoreInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event)} aria-label="اختر ملف النسخة الاحتياطية" />
      </main>
      <footer className="stock-footer"><ShieldCheck aria-hidden="true" /><span>البيانات محفوظة على هذا الجهاز فقط</span></footer>
      <nav className="mobile-nav" aria-label="التنقل الرئيسي">
        {navigation.map(({ id, icon: Icon }) => <Button key={id} variant="ghost" size="icon" className={screen === id ? "mobile-nav-button active" : "mobile-nav-button"} aria-label={screenTitles[id]} aria-current={screen === id ? "page" : undefined} onClick={() => setScreen(id)}><Icon aria-hidden="true" /></Button>)}
      </nav>
    </div>
  );
}

function HomeScreen({ itemCount, totalPieces, onNavigate }: { itemCount: number; totalPieces: number; onNavigate: (screen: Screen) => void }) {
  return <div className="home-layout">
    <section className="home-hero"><div className="hero-brand-image"><img src={brandLogo} alt="شعار محمد الشريف — إدارة المخازن — هايل سمر للتجارة" /></div><div className="hero-content"><p className="eyebrow">فرع الحديدة</p><h2>مخزونك، بين يديك.</h2><p>إدارة يومية واضحة لأصناف المخزن وحركاته.</p><Button onClick={() => onNavigate("inbound")} className="primary-action"><ArrowDownToLine aria-hidden="true" /> تسجيل وارد</Button></div></section>
    <section className="summary-strip" aria-label="ملخص المخزون"><div className="summary-stat"><span>عدد الأصناف</span><strong>{formatNumber(itemCount)}</strong></div><div className="summary-stat"><span>إجمالي الرصيد</span><strong>{formatNumber(totalPieces)} <small>حبة</small></strong></div><div className="summary-stat"><span>حفظ البيانات</span><strong>محلي</strong></div></section>
    <section className="home-actions" aria-label="الشاشات">
      <HomeAction icon={PackagePlus} label="إضافة صنف" onClick={() => onNavigate("items")} />
      <HomeAction icon={Boxes} label="الأرصدة" onClick={() => onNavigate("balances")} />
      <HomeAction icon={FileText} label="صادر وفاتورة" onClick={() => onNavigate("outbound")} />
      <HomeAction icon={FileBarChart} label="كشف المخزون" onClick={() => onNavigate("report")} />
    </section>
    <section className="calculation-note"><Weight aria-hidden="true" /><p><strong>حساب الوزن</strong><span>عدد الحبات × وزن الحبة ÷ ١٠٠٠ = الوزن بالطن</span></p></section>
  </div>;
}

function HomeAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return <button className="home-action" onClick={onClick}><Icon aria-hidden="true" /><span>{label}</span><span className="action-arrow" aria-hidden="true">←</span></button>;
}

function ItemsScreen({ items, movements, onSubmit }: { items: StockItem[]; movements: StockMovement[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <section className="content-section">
    <SectionHeading icon={PackagePlus} title="إضافة صنف" subtitle="تعريف الصنف ووحدة التعبئة ووزن الحبة." />
    <form className="stock-form" onSubmit={onSubmit}>
      <Field label="اسم الصنف"><Input name="name" required maxLength={120} placeholder="مثال: أكياس أسمنت" /></Field>
      <div className="form-grid two-columns"><Field label="عدد الحبات في البندل"><Input name="piecesPerBundle" type="number" min="1" step="1" required placeholder="٥٠" /></Field><Field label="وزن الحبة بالكيلوغرام"><Input name="pieceWeightKg" type="number" min="0.001" step="any" required placeholder="٢٥" /></Field></div>
      <p className="field-hint">تُستخدم بيانات التعبئة والوزن تلقائياً في حركات الصنف.</p>
      <Button type="submit"><PackagePlus aria-hidden="true" /> حفظ الصنف</Button>
    </form>
    <div className="section-divider" /><div className="section-subheading"><h3>الأصناف المسجلة</h3><span>{formatNumber(items.length)} صنف</span></div>
    {items.length === 0 ? <EmptyState text="لا توجد أصناف مسجلة بعد." /> : <div className="table-scroll"><table><thead><tr><th>الصنف</th><th>حبة / بندل</th><th>وزن الحبة</th><th>الرصيد</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><th scope="row">{item.name}</th><td>{formatNumber(item.piecesPerBundle)}</td><td>{formatNumber(item.pieceWeightKg)} كجم</td><td>{formatNumber(getItemBalance(item.id, movements))}</td></tr>)}</tbody></table></div>}
  </section>;
}

function BalancesScreen({ items, movements }: { items: StockItem[]; movements: StockMovement[] }) {
  return <section className="content-section"><SectionHeading icon={Boxes} title="الأرصدة" subtitle="الرصيد الحالي لكل صنف محسوب من حركات المخزون." />
    {items.length === 0 ? <EmptyState text="أضف صنفاً لتظهر أرصدته هنا." /> : <div className="balance-list">{items.map((item) => { const balance = getItemBalance(item.id, movements); return <article className="balance-row" key={item.id}><div className="balance-name"><span className="item-mark"><Boxes aria-hidden="true" /></span><div><h3>{item.name}</h3><p>{formatNumber(item.piecesPerBundle)} حبة في البندل</p></div></div><div className="balance-value"><strong>{formatNumber(balance)}</strong><span>حبة · {formatNumber(computeTotalTons(balance, item.pieceWeightKg))} طن</span></div></article>; })}</div>}
  </section>;
}

function MovementScreen({ kind, items, movements, onSubmit }: { kind: MovementKind; items: StockItem[]; movements: StockMovement[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [selectedId, setSelectedId] = useState("");
  const [bundleCount, setBundleCount] = useState("");
  const item = items.find((candidate) => candidate.id === selectedId) ?? items[0];
  const bundles = Number(bundleCount) || 0;
  const pieces = item ? computeTotalPieces(bundles, item.piecesPerBundle) : 0;
  const piecesPerTon = item ? computePiecesPerTon(item.pieceWeightKg) : 0;
  const tons = item ? computeTotalTons(pieces, item.pieceWeightKg) : 0;
  const isInbound = kind === "in";
  return <section className="content-section">
    <SectionHeading icon={isInbound ? ArrowDownToLine : ArrowUpFromLine} title={isInbound ? "تسجيل وارد" : "تسجيل صادر"} subtitle={isInbound ? "أضف الكمية المستلمة إلى رصيد الصنف." : "تُخصم الكمية من الرصيد ويُصدر لها رقم فاتورة."} />
    {items.length === 0 ? <EmptyState text="أضف صنفاً أولاً قبل تسجيل الحركة." /> : <form className="stock-form" onSubmit={onSubmit}>
      <Field label="الصنف"><select name="itemId" className="stock-select" value={item?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field>
      {item && <div className="available-balance"><span>الرصيد المتاح</span><strong>{formatNumber(getItemBalance(item.id, movements))} حبة</strong></div>}
      <Field label="عدد البنادل"><Input name="bundleCount" type="number" min="1" step="1" required value={bundleCount} onChange={(event) => setBundleCount(event.target.value)} placeholder="أدخل عدد البنادل" /></Field>
      <Field label="ملاحظة (اختياري)"><Input name="note" maxLength={250} placeholder="اسم المورد أو تفاصيل الحركة" /></Field>
      <CalculationPreview pieces={pieces} bundles={bundles} piecesPerBundle={item?.piecesPerBundle ?? 0} piecesPerTon={piecesPerTon} tons={tons} />
      <Button type="submit" className="form-submit">{isInbound ? <ArrowDownToLine aria-hidden="true" /> : <ArrowUpFromLine aria-hidden="true" />}{isInbound ? "حفظ الوارد" : "حفظ الصادر وإصدار الفاتورة"}</Button>
    </form>}
  </section>;
}

function OutboundScreen({ items, movements, selectedInvoice, onSubmit, onSelectInvoice }: { items: StockItem[]; movements: StockMovement[]; selectedInvoice: StockMovement | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onSelectInvoice: (invoice: StockMovement) => void }) {
  const recentInvoices = movements.filter((movement) => movement.invoiceNumber).slice().reverse();
  const activeInvoice = selectedInvoice ?? recentInvoices[0] ?? null;
  return <div className="outbound-layout"><MovementScreen kind="out" items={items} movements={movements} onSubmit={onSubmit} /><section className="content-section invoice-section"><div className="section-subheading"><h3>فاتورة الصادر</h3><FileText aria-hidden="true" /></div>{activeInvoice ? <InvoicePreview invoice={activeInvoice} item={items.find((entry) => entry.id === activeInvoice.itemId)} /> : <EmptyState text="ستظهر الفاتورة هنا بعد تسجيل حركة صادر." />}{recentInvoices.length > 1 && <div className="invoice-history"><h3>الفواتير السابقة</h3>{recentInvoices.slice(0, 8).map((invoice) => <Button key={invoice.id} variant={activeInvoice?.id === invoice.id ? "secondary" : "ghost"} className="invoice-history-row" onClick={() => onSelectInvoice(invoice)}><span>{invoice.invoiceNumber}</span><span>{formatDate(invoice.createdAt)}</span></Button>)}</div>}</section></div>;
}

function InvoicePreview({ invoice, item }: { invoice: StockMovement; item?: StockItem }) {
  return <article className="invoice-paper" aria-label={`فاتورة رقم ${invoice.invoiceNumber}`}><div className="invoice-brand"><img src={brandLogo} alt="شعار هايل سمر للتجارة" /><div><strong>هايل سمر للتجارة</strong><span>فرع الحديدة · إدارة المخازن</span></div></div><div className="invoice-rule" /><div className="invoice-title-line"><h4>فاتورة صادر</h4><span>{invoice.invoiceNumber}</span></div><p className="invoice-date">التاريخ: {formatDate(invoice.createdAt)}</p><dl className="invoice-details"><InvoiceValue label="الصنف" value={item?.name ?? "صنف محفوظ"} /><InvoiceValue label="عدد البنادل" value={formatNumber(invoice.bundleCount)} /><InvoiceValue label="عدد الحبات" value={formatNumber(invoice.totalPieces)} /><InvoiceValue label="وزن الحبة" value={`${formatNumber(invoice.pieceWeightKg)} كجم`} /><InvoiceValue label="إجمالي الوزن" value={`${formatNumber(invoice.totalTons)} طن`} />{invoice.note && <InvoiceValue label="ملاحظة" value={invoice.note} />}</dl><div className="invoice-rule" /><p className="invoice-signature">استلمت الأصناف الموضحة أعلاه</p><div className="invoice-sign-lines"><span>المستلم</span><span>المسؤول</span></div><Button className="print-button no-print" onClick={() => window.print()}><Printer aria-hidden="true" /> طباعة الفاتورة</Button></article>;
}

function InvoiceValue({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ReportScreen({ items, movements, onExportCsv, onBackup, onRestore }: { items: StockItem[]; movements: StockMovement[]; onExportCsv: () => void; onBackup: () => void; onRestore: () => void }) {
  return <section className="content-section"><SectionHeading icon={FileBarChart} title="كشف المخزون" subtitle="ملخص الوارد والصادر والأرصدة المتاحة." />
    {items.length === 0 ? <EmptyState text="لا توجد حركات أو أصناف لعرضها." /> : <div className="table-scroll"><table><thead><tr><th>الصنف</th><th>الوارد</th><th>الصادر</th><th>الرصيد</th><th>الرصيد (طن)</th></tr></thead><tbody>{items.map((item) => { const entries = movements.filter((movement) => movement.itemId === item.id); const incoming = entries.filter((movement) => movement.kind === "in"); const outgoing = entries.filter((movement) => movement.kind === "out"); const balance = getItemBalance(item.id, movements); return <tr key={item.id}><th scope="row">{item.name}</th><td>{formatNumber(incoming.reduce((sum, movement) => sum + movement.totalPieces, 0))}</td><td>{formatNumber(outgoing.reduce((sum, movement) => sum + movement.totalPieces, 0))}</td><td className="table-balance">{formatNumber(balance)}</td><td>{formatNumber(computeTotalTons(balance, item.pieceWeightKg))}</td></tr>; })}</tbody></table></div>}
    <div className="report-tools no-print"><Button variant="secondary" onClick={onExportCsv}><FileBarChart aria-hidden="true" /> تصدير كشف CSV</Button><Button variant="outline" onClick={onBackup}><Archive aria-hidden="true" /> نسخة احتياطية</Button><Button variant="outline" onClick={onRestore}><ArrowLeftRight aria-hidden="true" /> استعادة نسخة</Button></div>
    <div className="section-divider" /><div className="section-subheading"><h3>آخر الحركات</h3><ArrowLeftRight aria-hidden="true" /></div>
    {movements.length === 0 ? <EmptyState text="لم تُسجل أي حركة حتى الآن." /> : <div className="history-list">{movements.slice().reverse().slice(0, 20).map((movement) => { const item = items.find((entry) => entry.id === movement.itemId); const incoming = movement.kind === "in"; return <div className="history-row" key={movement.id}><span className={incoming ? "movement-icon inbound-icon" : "movement-icon outbound-icon"}>{incoming ? <ArrowDownToLine aria-hidden="true" /> : <ArrowUpFromLine aria-hidden="true" />}</span><div className="history-description"><strong>{item?.name ?? "صنف محفوظ"}</strong><span>{incoming ? "وارد" : "صادر"} · {formatNumber(movement.bundleCount)} بندل · {formatDate(movement.createdAt)}</span></div><strong className={incoming ? "movement-quantity positive" : "movement-quantity"}>{incoming ? "+" : "−"}{formatNumber(movement.totalPieces)}</strong></div>; })}</div>}
  </section>;
}

function SearchScreen({ searchTerm, onSearch, items, movements }: { searchTerm: string; onSearch: (value: string) => void; items: StockItem[]; movements: StockMovement[] }) {
  return <section className="content-section"><SectionHeading icon={Search} title="بحث" subtitle="ابحث باسم الصنف للوصول إلى رصيده وحركاته." /><label className="search-field"><Search aria-hidden="true" /><Input autoFocus value={searchTerm} onChange={(event) => onSearch(event.target.value)} placeholder="اكتب اسم الصنف" aria-label="البحث باسم الصنف" /></label>
    {items.length === 0 ? <EmptyState text={searchTerm ? "لا توجد أصناف تطابق البحث." : "أضف صنفاً لبدء البحث."} /> : <div className="search-results">{items.map((item) => { const entries = movements.filter((movement) => movement.itemId === item.id).slice().reverse().slice(0, 4); return <article className="search-result" key={item.id}><div className="search-result-heading"><h3>{item.name}</h3><strong>{formatNumber(getItemBalance(item.id, movements))} <small>حبة</small></strong></div><p>{formatNumber(item.piecesPerBundle)} حبة في البندل <span aria-hidden="true">·</span> وزن الحبة {formatNumber(item.pieceWeightKg)} كجم</p>{entries.length > 0 && <ul>{entries.map((movement) => <li key={movement.id}><span>{movement.kind === "in" ? "وارد" : "صادر"} · {formatDate(movement.createdAt)}</span><strong>{formatNumber(movement.totalPieces)} حبة</strong></li>)}</ul>}</article>; })}</div>}
  </section>;
}

function CalculationPreview({ pieces, bundles, piecesPerBundle, piecesPerTon, tons }: { pieces: number; bundles: number; piecesPerBundle: number; piecesPerTon: number; tons: number }) {
  return <div className="calculation-preview" aria-live="polite"><p><span>إجمالي الكمية</span><strong>{formatNumber(pieces)} حبة</strong><small>{formatNumber(bundles)} بندل × {formatNumber(piecesPerBundle)} حبة</small></p><p><span>عدد الحبات في الطن</span><strong>{formatNumber(piecesPerTon)} حبة</strong><small>١٠٠٠ ÷ وزن الحبة</small></p><p><span>إجمالي الوزن</span><strong>{formatNumber(tons)} طن</strong><small>عدد الحبات × الوزن ÷ ١٠٠٠</small></p></div>;
}

function SectionHeading({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return <div className="section-heading"><span className="section-icon"><Icon aria-hidden="true" /></span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}

function EmptyState({ text }: { text: string }) { return <p className="empty-state">{text}</p>; }
function formatNumber(value: number) { return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(Number.isFinite(value) ? value : 0); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }