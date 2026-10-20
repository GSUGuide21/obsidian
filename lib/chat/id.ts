// crypto.randomUUID only exists in secure contexts (https or localhost), so
// fall back to getRandomValues when the app is opened over a LAN address.
export function createId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
