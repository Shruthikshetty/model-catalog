// utils -------------------------------------
/**
 * Strips provider prefixes and replaces hyphens with spaces for a clean display name.
 * Example: "openai/gpt-4o-mini" -> "gpt 4o mini"
 */
export function cleanDisplayName(id: string): string {
  const stripped = id.includes("/") ? id.split("/").slice(1).join("/") : id;
  return stripped.replace(/-/g, " ");
}
