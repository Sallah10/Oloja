// Parsing and shaping for CSV product imports. Deliberately small: one fixed
// column order (the downloadable template is the spec), header line tolerated,
// quoted fields supported so names with commas work.

export type ImportRow = {
  line: number;
  name: string;
  priceMinor: number;
  costMinor: number;
  initialStockQty: number;
  lowStockThreshold: number;
};

export type CsvParseResult = {
  /** Rows that parsed cleanly and are ready to import. */
  rows: ImportRow[];
  /** row -> why it was skipped, 1-based line numbers. */
  errors: { line: number; reason: string }[];
  /** A top-level problem with the file itself (garbled, empty...). */
  fatal?: string;
};

export const PRODUCT_CSV_TEMPLATE = [
  "name,price,cost,quantity on hand,low-stock alert at",
  "Rose Gold 50ml,12500,8000,24,5",
  "Oud Lumiere 30ml,22000,15000,12,3",
].join("\n");

function toNairaMinor(cell: string): number | null {
  const cleaned = cell.replace(/[₦,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function toCount(cell: string): number {
  const value = Math.floor(Number(cell.trim()));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Splits a CSV line into cells, honouring double-quoted fields (a quoted cell
// may contain the delimiter or escaped ""). Returns null for a broken quote.
function splitLine(line: string): string[] | null {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (inQuotes) return null;
  cells.push(current);
  return cells;
}

function isHeaderRow(cells: string[]): boolean {
  return cells.some((cell) => ["name", "price", "cost", "quantity"].includes(cell.trim().toLowerCase()));
}

export function parseProductsCsv(text: string): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [] };

  // Strip a UTF-8 BOM and normalise Windows line endings.
  const clean = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const lines = clean.split("\n").map((l) => l.trimEnd());

  if (lines.every((l) => l.trim() === "")) {
    result.fatal = "That file is empty.";
    return result;
  }

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === "") return;
    const cells = splitLine(raw);
    if (!cells) {
      result.errors.push({ line, reason: "Unclosed quote - check the line." });
      return;
    }
    if (line === 1 && isHeaderRow(cells)) return;

    const [nameCell, priceCell, costCell, qtyCell, thresholdCell] = cells;

    if (!nameCell?.trim()) {
      result.errors.push({ line, reason: "No name - put the product's name first." });
      return;
    }
    const priceMinor = toNairaMinor(priceCell ?? "");
    if (priceMinor === null) {
      result.errors.push({ line, reason: "Price isn't a number or is less than zero." });
      return;
    }

    result.rows.push({
      line,
      name: nameCell.trim(),
      priceMinor,
      costMinor: toNairaMinor(costCell ?? "") ?? 0,
      initialStockQty: toCount(qtyCell ?? ""),
      lowStockThreshold: toCount(thresholdCell ?? ""),
    });
  });

  return result;
}