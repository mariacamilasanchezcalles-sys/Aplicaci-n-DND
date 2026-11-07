import { validateCreatureSheet } from "./validate";
import type { SheetValidationResult } from "./validate";

/**
 * Carga una ficha desde texto JSON (archivo empaquetado con la app, guardado
 * local…) o desde un valor ya parseado. Nunca lanza: devuelve los problemas
 * como códigos. Sin red: la app funciona sin conexión.
 */
export function loadCreatureSheet(input: string | unknown): SheetValidationResult {
  if (typeof input !== "string") return validateCreatureSheet(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { valid: false, errors: [{ severity: "error", code: "invalidJson", path: "" }], warnings: [] };
  }
  return validateCreatureSheet(parsed);
}
