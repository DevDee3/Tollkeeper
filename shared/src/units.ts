export const YOCTO_PER_NEAR = 10n ** 24n;

/** "1.5" -> 1500000000000000000000000n. Rejects anything that is not a plain decimal. */
export function parseNear(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,24}))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a valid NEAR amount: "${value}"`);
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(24, "0") || "0");
  return whole * YOCTO_PER_NEAR + fraction;
}

/** Shows an amount the way a person reads it: "1.5 NEAR", never yocto. */
export function formatNear(yocto: bigint | string, maxDecimals = 4): string {
  const value = typeof yocto === "bigint" ? yocto : BigInt(yocto);
  const whole = value / YOCTO_PER_NEAR;
  const fraction = (value % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, maxDecimals);
  const trimmed = fraction.replace(/0+$/, "");
  return `${whole}${trimmed ? `.${trimmed}` : ""} NEAR`;
}
