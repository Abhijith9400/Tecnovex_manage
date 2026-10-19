import { describe, expect, it } from "vitest";
import { calculatePayroll } from "../src/services/payrollCalculator";
import { amountInWords } from "../src/utils/amountInWords";
import { financialYear } from "../src/utils/dates";
import { calculateInvoiceTotals, calculateLine } from "../src/utils/money";

describe("invoice line calculation", () => {
  it("applies discount before tax and rounds to paise", () => {
    const line = calculateLine({ quantity: "3", unitPrice: "333.33", discount: "10", taxRate: "18" });
    expect(line.lineSubtotal.toFixed(2)).toBe("999.99");
    expect(line.taxableAmount.toFixed(2)).toBe("989.99");
    expect(line.taxAmount.toFixed(2)).toBe("178.20"); // 178.1982 → 178.20
    expect(line.lineTotal.toFixed(2)).toBe("1168.19");
  });

  it("avoids floating point errors", () => {
    const { totals } = calculateInvoiceTotals([
      { quantity: "1", unitPrice: "0.10" },
      { quantity: "1", unitPrice: "0.20" },
    ]);
    expect(totals.total.toFixed(2)).toBe("0.30");
  });

  it("stored line amounts always add up to the invoice totals", () => {
    const { lines, totals } = calculateInvoiceTotals([
      { quantity: "1", unitPrice: "35000", taxRate: "18" },
      { quantity: "4", unitPrice: "2500", discount: "1000", taxRate: "18" },
      { quantity: "2.5", unitPrice: "199.99", taxRate: "5" },
    ]);
    const lineTotalSum = lines.reduce((s, l) => s.plus(l.lineTotal), lines[0].lineTotal.minus(lines[0].lineTotal));
    expect(lineTotalSum.toFixed(2)).toBe(totals.total.toFixed(2));
    expect(totals.subtotal.minus(totals.discountTotal).plus(totals.taxTotal).toFixed(2)).toBe(totals.total.toFixed(2));
  });

  it("rejects a discount larger than the line amount", () => {
    expect(() => calculateLine({ quantity: "1", unitPrice: "100", discount: "150" })).toThrow(RangeError);
  });
});

describe("amount in words (Indian numbering)", () => {
  it("formats lakhs and crores", () => {
    expect(amountInWords("53100.00")).toBe("Rupees Fifty Three Thousand One Hundred Only");
    expect(amountInWords("1250000.50")).toBe("Rupees Twelve Lakh Fifty Thousand and Fifty Paise Only");
    expect(amountInWords("10000000.00")).toBe("Rupees One Crore Only");
  });
});

describe("financial year", () => {
  it("runs April to March", () => {
    expect(financialYear(new Date("2026-03-31T00:00:00Z"))).toBe("2025-26");
    expect(financialYear(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
  });
});

describe("payroll calculation", () => {
  const structure = { basic: "30000", allowances: "8000", otherEarnings: "0", fixedDeductions: "500", applyStatutory: true };

  it("computes gross, deductions and net", () => {
    const result = calculatePayroll(structure, [], { incentives: "2000" });
    expect(result.grossEarnings.toFixed(2)).toBe("40000.00");
    expect(result.totalDeductions.toFixed(2)).toBe("500.00");
    expect(result.netPay.toFixed(2)).toBe("39500.00");
  });

  it("applies configured statutory rules with caps", () => {
    const result = calculatePayroll(structure, [
      { name: "PF (example)", basis: "PERCENT_OF_BASIC", value: "12", maxAmount: "1800" },
      { name: "Gross % (example)", basis: "PERCENT_OF_GROSS", value: "1", maxAmount: null },
      { name: "Fixed (example)", basis: "FIXED", value: "200", maxAmount: null },
    ]);
    const deductions = Object.fromEntries(result.lines.filter((l) => l.type === "DEDUCTION").map((l) => [l.label, l.amount.toFixed(2)]));
    expect(deductions["PF (example)"]).toBe("1800.00"); // 3600 capped
    expect(deductions["Gross % (example)"]).toBe("380.00");
    expect(deductions["Fixed (example)"]).toBe("200.00");
    expect(result.netPay.toFixed(2)).toBe("35120.00");
  });

  it("ignores statutory rules unless the structure opts in", () => {
    const result = calculatePayroll({ ...structure, applyStatutory: false }, [{ name: "X", basis: "FIXED", value: "999", maxAmount: null }]);
    expect(result.lines.some((l) => l.label === "X")).toBe(false);
  });

  it("refuses negative net pay", () => {
    expect(() => calculatePayroll(structure, [], { additionalDeductions: [{ label: "Huge", amount: "100000" }] })).toThrow(RangeError);
  });
});
