import { Prisma } from "../generated/prisma/client";

export type Money = Prisma.Decimal;
export type MoneyInput = Prisma.Decimal | string | number;

export const ZERO = new Prisma.Decimal(0);

export function money(value: MoneyInput | null | undefined): Money {
  return new Prisma.Decimal(value ?? 0);
}

/** Round half-up to 2 decimal places (paise). */
export function round2(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: MoneyInput[]): Money {
  return round2(values.reduce<Money>((acc, value) => acc.plus(value), ZERO));
}

export interface LineInput {
  quantity: MoneyInput;
  unitPrice: MoneyInput;
  discount?: MoneyInput;
  taxRate?: MoneyInput;
}

export interface LineAmounts {
  lineSubtotal: Money;
  taxableAmount: Money;
  taxAmount: Money;
  lineTotal: Money;
}

/**
 * subtotal = qty x price; taxable = subtotal - discount; tax = taxable x rate%; total = taxable + tax.
 * Each step is rounded to paise so stored lines always add up to stored invoice totals.
 */
export function calculateLine(line: LineInput): LineAmounts {
  const lineSubtotal = round2(money(line.quantity).times(line.unitPrice));
  const discount = round2(money(line.discount));
  if (discount.isNegative()) throw new RangeError("Discount cannot be negative");
  if (discount.greaterThan(lineSubtotal)) throw new RangeError("Discount cannot exceed the line amount");
  const taxableAmount = lineSubtotal.minus(discount);
  const taxAmount = round2(taxableAmount.times(money(line.taxRate)).dividedBy(100));
  return { lineSubtotal, taxableAmount, taxAmount, lineTotal: taxableAmount.plus(taxAmount) };
}

export interface InvoiceTotals {
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  total: Money;
}

export function calculateInvoiceTotals(lines: LineInput[]): { lines: LineAmounts[]; totals: InvoiceTotals } {
  const computed = lines.map(calculateLine);
  const subtotal = sum(computed.map((l) => l.lineSubtotal));
  const taxableTotal = sum(computed.map((l) => l.taxableAmount));
  const taxTotal = sum(computed.map((l) => l.taxAmount));
  return {
    lines: computed,
    totals: {
      subtotal,
      discountTotal: subtotal.minus(taxableTotal),
      taxTotal,
      total: taxableTotal.plus(taxTotal),
    },
  };
}

/** Format for PDFs and CSV: 1,23,456.00 (Indian digit grouping). */
export function formatAmount(value: MoneyInput): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(money(value).toFixed(2)));
}
