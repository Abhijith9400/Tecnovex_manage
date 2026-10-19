const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  return n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
}

function belowThousand(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [hundred ? `${ones[hundred]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Indian numbering system: crore, lakh, thousand. */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** "12345.50" → "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only" (INR); generic for others. */
export function amountInWords(amount: string, currency = "INR"): string {
  const [whole, fraction = "0"] = amount.split(".");
  const rupees = Number(whole);
  const paise = Number(fraction.padEnd(2, "0").slice(0, 2));
  if (currency !== "INR") {
    return `${currency} ${integerToWords(rupees)}${paise ? ` and ${belowHundred(paise)} Cents` : ""} Only`;
  }
  return `Rupees ${integerToWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ""} Only`;
}
