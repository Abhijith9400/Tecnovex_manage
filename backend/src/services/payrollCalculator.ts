import type { DeductionBasis } from "../generated/prisma/enums";
import { type Money, type MoneyInput, money, round2, sum, ZERO } from "../utils/money";

export interface StructureInput {
  basic: MoneyInput;
  allowances: MoneyInput;
  otherEarnings: MoneyInput;
  fixedDeductions: MoneyInput;
  applyStatutory: boolean;
}

export interface StatutoryRuleInput {
  name: string;
  basis: DeductionBasis;
  value: MoneyInput;
  maxAmount: MoneyInput | null;
}

export interface MonthInput {
  incentives?: MoneyInput;
  additionalEarnings?: { label: string; amount: MoneyInput }[];
  additionalDeductions?: { label: string; amount: MoneyInput }[];
}

export interface PayrollLineOut {
  type: "EARNING" | "DEDUCTION";
  label: string;
  amount: Money;
}

/**
 * Pure payroll calculation. Statutory rules apply only when the structure opts in and are entirely
 * configuration-driven; no tax or statutory rule is assumed.
 */
export function calculatePayroll(structure: StructureInput, rules: StatutoryRuleInput[], month: MonthInput = {}) {
  const earnings: PayrollLineOut[] = [
    { type: "EARNING" as const, label: "Basic salary", amount: round2(money(structure.basic)) },
    { type: "EARNING" as const, label: "Allowances", amount: round2(money(structure.allowances)) },
    { type: "EARNING" as const, label: "Other earnings", amount: round2(money(structure.otherEarnings)) },
    { type: "EARNING" as const, label: "Incentives", amount: round2(money(month.incentives)) },
    ...(month.additionalEarnings ?? []).map((e) => ({ type: "EARNING" as const, label: e.label, amount: round2(money(e.amount)) })),
  ].filter((line) => !line.amount.isZero());

  const basic = money(structure.basic);
  const gross = sum(earnings.map((e) => e.amount));

  const deductions: PayrollLineOut[] = [];
  if (!money(structure.fixedDeductions).isZero()) {
    deductions.push({ type: "DEDUCTION", label: "Fixed deductions", amount: round2(money(structure.fixedDeductions)) });
  }
  if (structure.applyStatutory) {
    for (const rule of rules) {
      let amount: Money =
        rule.basis === "FIXED"
          ? money(rule.value)
          : (rule.basis === "PERCENT_OF_BASIC" ? basic : gross).times(money(rule.value)).dividedBy(100);
      if (rule.maxAmount !== null && amount.greaterThan(rule.maxAmount)) amount = money(rule.maxAmount);
      amount = round2(amount);
      if (!amount.isZero()) deductions.push({ type: "DEDUCTION", label: rule.name, amount });
    }
  }
  for (const d of month.additionalDeductions ?? []) {
    const amount = round2(money(d.amount));
    if (!amount.isZero()) deductions.push({ type: "DEDUCTION", label: d.label, amount });
  }

  const totalDeductions = deductions.length ? sum(deductions.map((d) => d.amount)) : ZERO;
  const netPay = gross.minus(totalDeductions);
  if (netPay.isNegative()) throw new RangeError("Deductions exceed gross earnings; net pay cannot be negative");

  return { lines: [...earnings, ...deductions], grossEarnings: gross, totalDeductions, netPay };
}
