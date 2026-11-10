// All money is handled as integer minor units (cents). Never use floats for amounts.

export function toMinor(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid money amount: "${value}"`);
  const cents = (match[2] ?? "").padEnd(2, "0");
  return Number(match[1]) * 100 + Number(cents);
}

export function fromMinor(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new Error(`Invalid minor amount: ${minor}`);
  }
  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

export function formatUsd(minor: number): string {
  const [dollars, cents] = fromMinor(minor).split(".");
  return `$${Number(dollars).toLocaleString("en-US")}.${cents}`;
}
