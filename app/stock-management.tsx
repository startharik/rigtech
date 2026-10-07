"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  History,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type StockItem = {
  id: string;
  item_code: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  minimum_quantity: number;
  quantity_on_hand: number;
  last_unit_price: number | null;
};

type StockCategory = {
  id: string;
  name: string;
};

type StockMovement = {
  id: string;
  stock_item_id: string;
  project_id: string | null;
  movement_type: "receipt" | "issue";
  quantity: number;
  ordered_quantity: number | null;
  movement_date: string;
  purchase_order: string | null;
  project_number: string | null;
  delivery_note: string | null;
  area: string | null;
  mtc: string | null;
  unit_price: number | null;
  comments: string | null;
};

type StockProject = { id: string; name: string };
type StockRole = "admin" | "manager" | "supervisor" | "employee" | "client";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const formatQuantity = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));

const itemFields = "id, item_code, name, category, description, unit, minimum_quantity, quantity_on_hand, last_unit_price";
const categoryFields = "id, name";
const movementFields = "id, stock_item_id, project_id, movement_type, quantity, ordered_quantity, movement_date, purchase_order, project_number, delivery_note, area, mtc, unit_price, comments";

export default function StockManagement({
  organizationId,
  role,
  canManageOverride = false,
  projects,
}: {
  organizationId: string;
  role: StockRole | null;
  canManageOverride?: boolean;
  projects: StockProject[];
}) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  useEffect(() => {
    const message = errorMessage || successMessage;
    if (!message) return;
    const timeout = window.setTimeout(() => {
      setErrorMessage("");
      setSuccessMessage("");
    }, errorMessage ? 6000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [errorMessage, successMessage]);
  const [activeTab, setActiveTab] = useState<"inventory" | "history">("inventory");
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [showItemForm, setShowItemForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [itemDescription, setItemDescription] = useState("");
  const [itemUnit, setItemUnit] = useState("pcs");
  const [minimumQuantity, setMinimumQuantity] = useState("0");
  const [movementType, setMovementType] = useState<"receipt" | "issue">("receipt");
  const movementFormRef = useRef<HTMLFormElement>(null);
  const [movementItemId, setMovementItemId] = useState("");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [orderedQuantity, setOrderedQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(today);
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [movementProjectId, setMovementProjectId] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [area, setArea] = useState("");
  const [mtc, setMtc] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [comments, setComments] = useState("");

  const canManage = canManageOverride || role === "admin" || role === "manager" || role === "supervisor";

  const loadStock = useCallback(async () => {
    try {
      const [itemResult, movementResult, categoryResult] = await Promise.all([
        supabase.from("stock_items").select(itemFields).eq("organization_id", organizationId).order("name"),
        supabase.from("stock_movements").select(movementFields).eq("organization_id", organizationId).order("movement_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("stock_categories").select(categoryFields).eq("organization_id", organizationId).order("name"),
      ]);
      if (itemResult.error || movementResult.error || categoryResult.error) {
        setErrorMessage(`Unable to load stock records: ${itemResult.error?.message ?? movementResult.error?.message ?? categoryResult.error?.message}`);
        return false;
      }
      setItems((itemResult.data ?? []) as StockItem[]);
      setMovements((movementResult.data ?? []) as StockMovement[]);
      setCategories((categoryResult.data ?? []) as StockCategory[]);
      return true;
    } catch (error) {
      setErrorMessage(`Unable to load stock records: ${error instanceof Error ? error.message : "Unexpected network error."}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void loadStock();
    });
    return () => {
      cancelled = true;
    };
  }, [loadStock]);

  useEffect(() => {
    if (!showMovementForm) return;
    movementFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showMovementForm]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !query || `${item.item_code} ${item.name} ${item.category} ${item.description}`.toLowerCase().includes(query);
      const matchesStock = stockFilter === "all" ||
        (stockFilter === "low" && item.minimum_quantity > 0 && item.quantity_on_hand > 0 && item.quantity_on_hand <= item.minimum_quantity) ||
        (stockFilter === "out" && item.quantity_on_hand <= 0);
      return matchesSearch && matchesStock;
    });
  }, [items, searchTerm, stockFilter]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const movementTotals = useMemo(() => {
    const totals = new Map<string, { received: number; issued: number }>();
    for (const movement of movements) {
      const total = totals.get(movement.stock_item_id) ?? { received: 0, issued: 0 };
      if (movement.movement_type === "receipt") total.received += Number(movement.quantity);
      else total.issued += Number(movement.quantity);
      totals.set(movement.stock_item_id, total);
    }
    return totals;
  }, [movements]);

  const resetItemForm = () => {
    setShowItemForm(false);
    setEditingItemId(null);
    setItemCode("");
    setItemName("");
    setItemCategory("");
    setNewCategoryName("");
    setShowNewCategory(false);
    setItemDescription("");
    setItemUnit("pcs");
    setMinimumQuantity("0");
  };

  const resetMovementForm = () => {
    setShowMovementForm(false);
    setMovementType("receipt");
    setMovementItemId("");
    setMovementQuantity("");
    setOrderedQuantity("");
    setMovementDate(today());
    setPurchaseOrder("");
    setMovementProjectId("");
    setDeliveryNote("");
    setArea("");
    setMtc("");
    setUnitPrice("");
    setComments("");
  };

  const beginMovement = (item: StockItem, type: "receipt" | "issue") => {
    resetMovementForm();
    setMovementItemId(item.id);
    setMovementType(type);
    setShowMovementForm(true);
    setSuccessMessage("");
    setErrorMessage("");
  };

  const beginEditItem = (item: StockItem) => {
    setEditingItemId(item.id);
    setItemCode(item.item_code);
    setItemName(item.name);
    setItemCategory(item.category);
    setItemDescription(item.description);
    setItemUnit(item.unit);
    setMinimumQuantity(String(item.minimum_quantity));
    setShowItemForm(true);
    setSuccessMessage("");
    setErrorMessage("");
  };

  const handleSaveItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const values = {
      item_code: itemCode.trim(),
      name: itemName.trim(),
      category: itemCategory.trim(),
      description: itemDescription.trim(),
      unit: itemUnit.trim() || "pcs",
      minimum_quantity: Number(minimumQuantity),
    };
    try {
      const result = editingItemId
        ? await supabase.from("stock_items").update(values).eq("id", editingItemId).select(itemFields).single()
        : await supabase.from("stock_items").insert({ ...values, organization_id: organizationId }).select(itemFields).single();
      if (result.error || !result.data) {
        setErrorMessage(`Unable to save item: ${result.error?.message ?? "No item was returned by the database."}`);
        return;
      }
      const savedItem = result.data as StockItem;
      setItems((current) => {
        const updated = editingItemId
          ? current.map((item) => item.id === savedItem.id ? savedItem : item)
          : [...current, savedItem];
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
      setSuccessMessage(editingItemId ? "Item details updated." : "Item added to inventory.");
      resetItemForm();
    } catch (error) {
      setErrorMessage(`Unable to save item: ${error instanceof Error ? error.message : "Unexpected network error."}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { data, error } = await supabase.from("stock_categories").insert({
      organization_id: organizationId,
      name,
    }).select(categoryFields).single();
    if (error) {
      if (error.code === "23505") {
        const { data: existing, error: lookupError } = await supabase.from("stock_categories")
          .select(categoryFields)
          .eq("organization_id", organizationId)
          .ilike("name", name)
          .maybeSingle();
        if (lookupError) {
          setErrorMessage(`Category already exists, but could not be selected: ${lookupError.message}`);
        } else if (existing) {
          setCategories((current) => [...current.filter((category) => category.id !== existing.id), existing as StockCategory].sort((a, b) => a.name.localeCompare(b.name)));
          setItemCategory((existing as StockCategory).name);
          setNewCategoryName("");
          setShowNewCategory(false);
          setSuccessMessage("Existing category selected.");
        }
      } else {
        setErrorMessage(`Unable to add category: ${error.message}`);
      }
      setSaving(false);
      return;
    }
    if (!data) {
      setErrorMessage("Unable to add category: no category was returned by the database.");
      setSaving(false);
      return;
    }
    const category = data as StockCategory;
    setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
    setItemCategory(category.name);
    setNewCategoryName("");
    setShowNewCategory(false);
    setSuccessMessage(`Category “${category.name}” added and selected.`);
    setSaving(false);
  };

  const handleDeleteItem = async (item: StockItem) => {
    if (!window.confirm(`Delete “${item.name}” (${item.item_code})? Items with remaining stock or movement history cannot be deleted.`)) return;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { error } = await supabase.rpc("delete_stock_item_with_role", {
      p_organization_id: organizationId,
      p_stock_item_id: item.id,
    });
    if (error) {
      setErrorMessage(`Unable to delete item: ${error.message}`);
      setSaving(false);
      return;
    }
    setItems((current) => current.filter((stockItem) => stockItem.id !== item.id));
    setSuccessMessage("Stock item deleted.");
    setSaving(false);
  };

  const handleRecordMovement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!movementItemId) {
      setErrorMessage("Select an inventory item before recording stock.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await supabase.rpc("record_stock_movement_with_role", {
        p_organization_id: organizationId,
        p_stock_item_id: movementItemId,
        p_movement_type: movementType,
        p_quantity: Number(movementQuantity),
        p_movement_date: movementDate,
        p_ordered_quantity: movementType === "receipt" && orderedQuantity ? Number(orderedQuantity) : null,
        p_purchase_order: movementType === "receipt" ? purchaseOrder.trim() || null : null,
        p_project_number: null,
        p_delivery_note: movementType === "receipt" ? deliveryNote.trim() || null : null,
        p_area: movementType === "issue" ? area.trim() || null : null,
        p_mtc: movementType === "receipt" ? mtc.trim() || null : null,
        p_unit_price: movementType === "receipt" && unitPrice ? Number(unitPrice) : null,
        p_comments: comments.trim() || null,
        p_project_id: movementProjectId || null,
      });
      if (error) {
        setErrorMessage(`Unable to record ${movementType}: ${error.message}`);
        return;
      }
      resetMovementForm();
      await loadStock();
      setSuccessMessage(movementType === "receipt" ? "Stock receipt recorded." : "Stock issue recorded.");
    } catch (error) {
      setErrorMessage(`Unable to record ${movementType}: ${error instanceof Error ? error.message : "Unexpected network error."}`);
    } finally {
      setSaving(false);
    }
  };

  const lowStockCount = items.filter((item) => item.quantity_on_hand > 0 && item.minimum_quantity > 0 && item.quantity_on_hand <= item.minimum_quantity).length;
  const outOfStockCount = items.filter((item) => item.quantity_on_hand <= 0).length;

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700">Materials and inventory</div>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.06em] text-slate-950 sm:text-4xl">Stock</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Inventory balances, low-stock alerts, and stock movements.</p>
        </div>
        {canManage && (
          <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
            <button type="button" onClick={() => { resetItemForm(); setShowItemForm(true); setSuccessMessage(""); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
              <Plus className="h-4 w-4" /> Add item
            </button>
            <button type="button" disabled={!items.length} onClick={() => { resetMovementForm(); setShowMovementForm(true); setSuccessMessage(""); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              <ArrowDownToLine className="h-4 w-4" /> Record stock
            </button>
          </div>
        )}
      </div>

      {(errorMessage || successMessage) && (
        <div role={errorMessage ? "alert" : "status"} className={`fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+5rem)] z-[70] mx-auto max-w-lg rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur sm:left-auto sm:right-6 sm:top-5 ${errorMessage ? "border-rose-200 bg-rose-50/95 text-rose-800" : "border-emerald-200 bg-emerald-50/95 text-emerald-800"}`}>
          <span>{errorMessage || successMessage}</span>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {[
          { label: "Items", value: items.length, icon: Boxes, tone: "bg-slate-950 text-white" },
          { label: "Low stock", value: lowStockCount, icon: Package, tone: "border-amber-200 bg-amber-50 text-amber-950" },
          { label: "Out of stock", value: outOfStockCount, icon: ArrowUpFromLine, tone: "border-rose-200 bg-rose-50 text-rose-950" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border border-slate-200 p-3 sm:p-4 ${tone}`}>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold opacity-80"><span>{label}</span><Icon className="h-4 w-4 shrink-0" /></div>
            <div className="mt-1 text-2xl font-black tracking-[-0.05em] sm:mt-3 sm:text-3xl">{value}</div>
          </div>
        ))}
      </div>

      {showItemForm && canManage && (
        <form onSubmit={handleSaveItem} className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm [&_input]:min-h-12 [&_input]:text-base [&_select]:min-h-12 [&_select]:text-base sm:p-5 md:[&_input]:min-h-0 md:[&_input]:text-sm md:[&_select]:min-h-0 md:[&_select]:text-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">{editingItemId ? "Edit inventory item" : "Add inventory item"}</h2>
            <button type="button" onClick={resetItemForm} aria-label="Close item form" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600">Item number<input value={itemCode} onChange={(event) => setItemCode(event.target.value)} required maxLength={80} placeholder="e.g. SET-HP-02-01" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
            <label className="text-xs font-semibold text-slate-600">Item name<input value={itemName} onChange={(event) => setItemName(event.target.value)} required maxLength={160} placeholder="e.g. UPN 120 x 6 meter" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
            <div className="text-xs font-semibold text-slate-600">
              <label htmlFor="stock-item-category">Category</label>
              <div className="mt-1.5 flex gap-2">
                <select id="stock-item-category" value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400">
                  <option value="">No category</option>
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
                <button type="button" onClick={() => { setShowNewCategory((current) => !current); setNewCategoryName(""); }} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              {showNewCategory && (
                <div className="mt-2 flex gap-2">
                  <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} required maxLength={100} placeholder="New category name" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" />
                  <button type="button" onClick={() => void handleAddCategory()} disabled={saving || !newCategoryName.trim()} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Add category"}</button>
                </div>
              )}
            </div>
            <label className="text-xs font-semibold text-slate-600">Unit<input value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} required maxLength={24} placeholder="pcs, m, kg…" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
            <label className="text-xs font-semibold text-slate-600">Low-stock threshold<input value={minimumQuantity} onChange={(event) => setMinimumQuantity(event.target.value)} required type="number" min="0" step="0.001" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2 xl:col-span-1">Description<input value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} maxLength={500} placeholder="Size, material, or specification" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:justify-end">
            <button type="button" onClick={resetItemForm} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : editingItemId ? "Save changes" : "Add item"}</button>
          </div>
        </form>
      )}

      {showMovementForm && canManage && (
        <form ref={movementFormRef} onSubmit={handleRecordMovement} className="mb-5 scroll-mt-20 rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm ring-1 ring-emerald-100 [&_input]:min-h-12 [&_input]:text-base [&_select]:min-h-12 [&_select]:text-base [&_textarea]:text-base sm:p-5 md:[&_input]:min-h-0 md:[&_input]:text-sm md:[&_select]:min-h-0 md:[&_select]:text-sm md:[&_textarea]:text-sm">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="font-bold text-slate-900">Record stock movement</h2><p className="mt-1 text-xs text-slate-500">Issues cannot exceed the item’s current balance.</p></div>
            <button type="button" onClick={resetMovementForm} aria-label="Close stock movement form" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><X className="h-4 w-4" /></button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["receipt", "issue"] as const).map((type) => (
              <button key={type} type="button" onClick={() => setMovementType(type)} aria-pressed={movementType === type} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${movementType === type ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-800"}`}>
                {type === "receipt" ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                {type === "receipt" ? "Incoming receipt" : "Issue to project"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2 xl:col-span-1">Item<select value={movementItemId} onChange={(event) => setMovementItemId(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400"><option value="">Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.item_code} — {item.name} ({formatQuantity(item.quantity_on_hand)} {item.unit})</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">{movementType === "receipt" ? "Received quantity" : "Issued quantity"}<input value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} required type="number" min="0.001" step="0.001" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
            <label className="text-xs font-semibold text-slate-600">Date<input value={movementDate} onChange={(event) => setMovementDate(event.target.value)} required type="date" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
            <label className="text-xs font-semibold text-slate-600">Project<select value={movementProjectId} onChange={(event) => setMovementProjectId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            {movementType === "receipt" ? (
              <>
                <label className="text-xs font-semibold text-slate-600">Ordered quantity<input value={orderedQuantity} onChange={(event) => setOrderedQuantity(event.target.value)} type="number" min="0" step="0.001" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
                <label className="text-xs font-semibold text-slate-600">Purchase order<input value={purchaseOrder} onChange={(event) => setPurchaseOrder(event.target.value)} maxLength={100} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
                <label className="text-xs font-semibold text-slate-600">Delivery note<input value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} maxLength={120} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
                <label className="text-xs font-semibold text-slate-600">MTC / certificate<input value={mtc} onChange={(event) => setMtc(event.target.value)} maxLength={120} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
                <label className="text-xs font-semibold text-slate-600">Unit price<input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} type="number" min="0" step="0.01" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
              </>
            ) : (
              <>
                <label className="text-xs font-semibold text-slate-600">Area / location<input value={area} onChange={(event) => setArea(event.target.value)} maxLength={100} placeholder="e.g. Area 1" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
              </>
            )}
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2 xl:col-span-3">Comments<textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={2} maxLength={500} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-emerald-400" /></label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:justify-end">
            <button type="button" onClick={resetMovementForm} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : movementType === "receipt" ? "Record receipt" : "Record issue"}</button>
          </div>
        </form>
      )}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Stock views">
          <button type="button" onClick={() => setActiveTab("inventory")} aria-pressed={activeTab === "inventory"} className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${activeTab === "inventory" ? "bg-emerald-50 text-emerald-900" : "text-slate-700"}`}><span className="inline-flex items-center justify-center gap-2"><Boxes className="h-4 w-4" /> Inventory</span></button>
          <button type="button" onClick={() => setActiveTab("history")} aria-pressed={activeTab === "history"} className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${activeTab === "history" ? "bg-emerald-50 text-emerald-900" : "text-slate-700"}`}><span className="inline-flex items-center justify-center gap-2"><History className="h-4 w-4" /> History</span></button>
        </div>
        {activeTab === "inventory" && (
          <label className="relative block w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" aria-label="Search inventory" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search items" className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:text-sm" />
          </label>
        )}
      </div>

      {activeTab === "inventory" && (
        <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-2" role="group" aria-label="Filter inventory by stock level">
            {([
              { id: "all", label: "All items", count: items.length },
              { id: "low", label: "Low stock", count: lowStockCount },
              { id: "out", label: "Out of stock", count: outOfStockCount },
            ] as const).map((filter) => (
              <button key={filter.id} type="button" onClick={() => setStockFilter(filter.id)} aria-pressed={stockFilter === filter.id} className={`min-h-11 rounded-xl border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${stockFilter === filter.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-800"}`}>
                {filter.label}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${stockFilter === filter.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">Loading stock records…</div>
      ) : activeTab === "inventory" ? (
        items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Boxes className="h-6 w-6" /></div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">No inventory items yet</h2>
            <p className="mt-1 text-sm text-slate-500">{canManage ? "Add your first item to start recording receipts and project issues." : "Inventory items added by your workspace will appear here."}</p>
            {canManage && <button type="button" onClick={() => setShowItemForm(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add item</button>}
          </div>
        ) : filteredItems.length ? (
          <>
          <div className="space-y-3 md:hidden">
            {filteredItems.map((item) => {
              const outOfStock = item.quantity_on_hand <= 0;
              const lowStock = !outOfStock && item.minimum_quantity > 0 && item.quantity_on_hand <= item.minimum_quantity;
              const totals = movementTotals.get(item.id) ?? { received: 0, issued: 0 };
              const statusLabel = outOfStock ? "Out of stock" : lowStock ? "Low stock" : "In stock";
              return (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-bold leading-5 text-slate-950">{item.name}</h2>
                      <p className="mt-1 text-xs font-medium text-slate-600">{item.item_code}{item.category ? ` · ${item.category}` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${outOfStock ? "bg-rose-100 text-rose-800" : lowStock ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{statusLabel}</span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Available</div>
                      <div className={`mt-0.5 text-3xl font-black tracking-tight ${outOfStock ? "text-rose-800" : lowStock ? "text-amber-900" : "text-slate-950"}`}>
                        {formatQuantity(item.quantity_on_hand)} <span className="text-sm font-semibold">{item.unit}</span>
                      </div>
                    </div>
                    {item.minimum_quantity > 0 && <div className="text-right text-xs text-slate-600">Minimum<br /><span className="font-semibold text-slate-900">{formatQuantity(item.minimum_quantity)} {item.unit}</span></div>}
                  </div>
                  <div className="mt-3 flex gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <span>Received {formatQuantity(totals.received)}</span>
                    <span>Issued {formatQuantity(totals.issued)}</span>
                  </div>
                  {item.description && <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {canManage && (
                      <>
                        <button type="button" onClick={() => beginMovement(item, "receipt")} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"><ArrowDownToLine className="h-4 w-4" /> Receive</button>
                        <button type="button" onClick={() => beginMovement(item, "issue")} disabled={outOfStock} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50"><ArrowUpFromLine className="h-4 w-4" /> Issue</button>
                        <button type="button" onClick={() => beginEditItem(item)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Pencil className="h-4 w-4" /> Edit item</button>
                        <button type="button" onClick={() => void handleDeleteItem(item)} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Delete</button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Minimum</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Description</th>{canManage && <th className="px-4 py-3">Actions</th>}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const outOfStock = item.quantity_on_hand <= 0;
                    const lowStock = !outOfStock && item.minimum_quantity > 0 && item.quantity_on_hand <= item.minimum_quantity;
                    const totals = movementTotals.get(item.id) ?? { received: 0, issued: 0 };
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3"><div className="font-semibold text-slate-900">{item.name}</div><div className="mt-0.5 text-xs text-slate-500">{item.item_code}</div></td>
                        <td className="px-4 py-3 text-slate-600">{item.category || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{formatQuantity(totals.received)} <span className="text-slate-500">{item.unit}</span></td>
                        <td className="px-4 py-3 text-slate-600">{formatQuantity(totals.issued)} <span className="text-slate-500">{item.unit}</span></td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{formatQuantity(item.quantity_on_hand)} <span className="font-normal text-slate-500">{item.unit}</span></td>
                        <td className="px-4 py-3 text-slate-600">{item.minimum_quantity > 0 ? `${formatQuantity(item.minimum_quantity)} ${item.unit}` : "—"}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${outOfStock ? "bg-rose-100 text-rose-700" : lowStock ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{outOfStock ? "Out of stock" : lowStock ? "Low stock" : "In stock"}</span></td>
                        <td className="max-w-56 truncate px-4 py-3 text-slate-500" title={item.description}>{item.description || "—"}</td>
                        {canManage && <td className="px-4 py-3"><div className="flex items-center gap-1.5"><button type="button" onClick={() => beginEditItem(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"><Pencil className="h-3.5 w-3.5" /> Edit</button><button type="button" onClick={() => void handleDeleteItem(item)} disabled={saving} aria-label={`Delete ${item.name}`} title="Delete is allowed only when the balance is zero and there is no movement history." className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button></div></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-600">{searchTerm ? `No inventory items match “${searchTerm}”.` : "No items match this stock filter."}</div>
        )
      ) : movements.length ? (
        <>
        <div className="space-y-3 md:hidden">
          {movements.map((movement) => {
            const item = itemById.get(movement.stock_item_id);
            const receipt = movement.movement_type === "receipt";
            return (
              <article key={movement.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-bold text-slate-950">{item?.name ?? "Unknown item"}</h2>
                    <p className="mt-1 text-xs text-slate-600">{item?.item_code ?? "Item unavailable"} · {formatDate(movement.movement_date)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${receipt ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>{receipt ? "Receipt" : "Issue"}</span>
                </div>
                <div className={`mt-3 text-2xl font-black tracking-tight ${receipt ? "text-emerald-800" : "text-slate-950"}`}>{receipt ? "+" : "−"}{formatQuantity(movement.quantity)} <span className="text-sm font-semibold">{item?.unit ?? ""}</span></div>
                <div className="mt-2 space-y-1 text-xs text-slate-700">
                  {(projects.find((project) => project.id === movement.project_id)?.name || movement.project_number) && <p>Project {projects.find((project) => project.id === movement.project_id)?.name ?? movement.project_number}{movement.area ? ` · ${movement.area}` : ""}</p>}
                  {(movement.purchase_order || movement.delivery_note || movement.mtc) && <p>Reference {[movement.purchase_order, movement.delivery_note, movement.mtc].filter(Boolean).join(" · ")}</p>}
                  {movement.comments && <p className="break-words text-slate-600">{movement.comments}</p>}
                </div>
              </article>
            );
          })}
        </div>
        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Project / area</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Notes</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((movement) => {
                  const item = itemById.get(movement.stock_item_id);
                  return (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(movement.movement_date)}</td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-900">{item?.name ?? "Unknown item"}</div><div className="mt-0.5 text-xs text-slate-500">{item?.item_code ?? "Item unavailable"}</div></td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${movement.movement_type === "receipt" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>{movement.movement_type === "receipt" ? "Receipt" : "Issue"}</span></td>
                      <td className={`px-4 py-3 font-semibold ${movement.movement_type === "receipt" ? "text-emerald-700" : "text-slate-700"}`}>{movement.movement_type === "receipt" ? "+" : "−"}{formatQuantity(movement.quantity)} {item?.unit ?? ""}</td>
                      <td className="px-4 py-3 text-slate-600">{[projects.find((project) => project.id === movement.project_id)?.name ?? movement.project_number, movement.area].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{movement.movement_type === "receipt" ? [movement.purchase_order, movement.delivery_note].filter(Boolean).join(" · ") || "—" : movement.mtc || "—"}</td>
                      <td className="max-w-56 truncate px-4 py-3 text-slate-500" title={movement.comments ?? ""}>{movement.comments || (movement.movement_type === "receipt" && movement.ordered_quantity !== null ? `Ordered ${formatQuantity(movement.ordered_quantity)}` : "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">Stock receipts and project issues will appear here.</div>
      )}
    </section>
  );
}
