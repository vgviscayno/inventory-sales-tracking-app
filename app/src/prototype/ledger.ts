// PROTOTYPE ONLY — throwaway. Resolving:
// INV-18 (Movement history surface) — https://linear.app/inventory-sales-tracking/issue/INV-18
//
// A stub stock-movement ledger built deterministically from the app's REAL
// products, so the per-product history and the global feed are two views of the
// same data. Nothing here touches Convex — the ledger tables don't exist yet.
//
// Schema mirrors ticket 01's locked shape: one flat `stockMovements` table
// tagged by `type`, signed `quantity`, optional `refId` back to a header row.

export type MovementType = "sale" | "delivery" | "pullout" | "opening";

export type ReasonCategory =
  | "damaged"
  | "expired"
  | "personal use"
  | "given away"
  | "other";

export const REASON_LABELS: Record<ReasonCategory, string> = {
  damaged: "Damaged",
  expired: "Expired",
  "personal use": "Personal use",
  "given away": "Given away",
  other: "Other",
};

const SUPPLIERS = [
  "Mercado Wholesale",
  "Santos Distributor",
  "Local Farm Co-op",
];

export type Movement = {
  _id: string;
  type: MovementType;
  refId?: string;
  productId: string;
  productName: string;
  quantity: number; // signed: +delivery/opening, -sale/pullout
  unitPriceAtSale?: number;
  reasonCategory?: ReasonCategory;
  reasonNotes?: string;
  createdAt: number;
};

/** A header row (delivery/pullout/sale) plus the movement lines pointing at it. */
export type Entry = {
  _id: string;
  type: "delivery" | "pullout" | "sale";
  supplier?: string;
  createdAt: number;
  lines: Movement[];
};

export type Ledger = {
  movements: Movement[]; // newest first
  entries: Entry[]; // newest first
  entryById: Map<string, Entry>;
};

export type ProductLike = {
  _id: string;
  name: string;
  sellingPrice: number;
  quantityOnHand: number;
};

const DAY = 86_400_000;

/** Tiny deterministic PRNG so the stub ledger is stable across reloads. */
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Builds ~3 weeks of history across all products. Deliveries and pull-outs are
 * grouped entries spanning SEVERAL products — the case that makes "edit the
 * whole entry" vs "edit one line" an actual decision.
 */
export function buildLedger(products: ProductLike[], now = Date.now()): Ledger {
  if (products.length === 0) {
    return { movements: [], entries: [], entryById: new Map() };
  }

  const rand = rng(hash(products.map((p) => p._id).join("")) || 7);
  const movements: Movement[] = [];
  const entries: Entry[] = [];
  const start = now - 45 * DAY;
  let n = 0;
  const id = (prefix: string) => `${prefix}_stub_${n++}`;

  const pick = (count: number) =>
    [...products].sort(() => rand() - 0.5).slice(0, count);

  for (let day = 1; day <= 45; day++) {
    const at = start + day * DAY + Math.floor(rand() * 8) * 3_600_000;

    // A delivery every few days, covering 2–4 products.
    if (rand() < 0.28) {
      const entryId = id("del");
      const lines = pick(2 + Math.floor(rand() * 3)).map((p) => ({
        _id: id("mv"),
        type: "delivery" as const,
        refId: entryId,
        productId: p._id,
        productName: p.name,
        quantity: 5 + Math.floor(rand() * 20),
        createdAt: at,
      }));
      entries.push({
        _id: entryId,
        type: "delivery",
        supplier: SUPPLIERS[Math.floor(rand() * SUPPLIERS.length)],
        createdAt: at,
        lines,
      });
      movements.push(...lines);
    }

    // A pull-out now and then — reason lives per line (ticket 02's list).
    if (rand() < 0.18) {
      const entryId = id("pull");
      const reasons = Object.keys(REASON_LABELS) as ReasonCategory[];
      const lines = pick(1 + Math.floor(rand() * 2)).map((p) => {
        const reason = reasons[Math.floor(rand() * reasons.length)];
        return {
          _id: id("mv"),
          type: "pullout" as const,
          refId: entryId,
          productId: p._id,
          productName: p.name,
          quantity: -(1 + Math.floor(rand() * 4)),
          reasonCategory: reason,
          reasonNotes:
            reason === "other" ? "Nabuak sa pag-arrange sa shelf" : "",
          createdAt: at,
        };
      });
      entries.push({ _id: entryId, type: "pullout", createdAt: at, lines });
      movements.push(...lines);
    }

    // Sales most days — these dominate the ledger by row count, which is the
    // whole reason "does history show sales too?" is a real question.
    const salesToday = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < salesToday; s++) {
      const entryId = id("sale");
      const lines = pick(1 + Math.floor(rand() * 2)).map((p) => ({
        _id: id("mv"),
        type: "sale" as const,
        refId: entryId,
        productId: p._id,
        productName: p.name,
        quantity: -(1 + Math.floor(rand() * 3)),
        unitPriceAtSale: p.sellingPrice,
        createdAt: at + s * 1_800_000,
      }));
      entries.push({
        _id: entryId,
        type: "sale",
        createdAt: at + s * 1_800_000,
        lines,
      });
      movements.push(...lines);
    }
  }

  // Opening-balance snapshot: one movement per product, no header. It is the
  // plug that makes the ledger reconcile — sum(movements) === quantityOnHand —
  // which is exactly what an opening snapshot does at real cutover.
  for (const p of products) {
    const since = movements
      .filter((m) => m.productId === p._id)
      .reduce((sum, m) => sum + m.quantity, 0);
    movements.push({
      _id: id("mv"),
      type: "opening",
      productId: p._id,
      productName: p.name,
      quantity: p.quantityOnHand - since,
      createdAt: start,
    });
  }

  movements.sort((a, b) => b.createdAt - a.createdAt);
  entries.sort((a, b) => b.createdAt - a.createdAt);

  return {
    movements,
    entries,
    entryById: new Map(entries.map((e) => [e._id, e])),
  };
}

/**
 * Movements for one product, newest first, each carrying the running balance
 * *after* that movement — the "why is my count 7?" audit trail.
 */
export function withRunningBalance(movements: Movement[]) {
  const oldestFirst = [...movements].sort((a, b) => a.createdAt - b.createdAt);
  let balance = 0;
  const withBalance = oldestFirst.map((m) => {
    balance += m.quantity;
    return { ...m, balance };
  });
  return withBalance.reverse();
}

export function movementLabel(m: Movement): string {
  switch (m.type) {
    case "opening":
      return "Opening balance";
    case "delivery":
      return "Delivery";
    case "pullout":
      return m.reasonCategory ? REASON_LABELS[m.reasonCategory] : "Pull-out";
    case "sale":
      return "Sale";
  }
}

export function entryLabel(e: Entry): string {
  if (e.type === "delivery") return `Delivery · ${e.supplier}`;
  if (e.type === "pullout") return "Pull-out";
  return "Sale";
}

export function entryTotal(e: Entry): number {
  return e.lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Calendar-day identity, for grouping the ledger under date headings. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatDayHeading(at: number, now = Date.now()): string {
  if (dayKey(at) === dayKey(now)) return "Today";
  if (dayKey(at) === dayKey(now - DAY)) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Colour token for a signed delta. */
export function deltaColor(quantity: number): string {
  return quantity > 0 ? "var(--accent)" : "var(--utang)";
}
