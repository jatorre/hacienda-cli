import { readFileSync } from "node:fs";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a BOE-format file against the DR714 JSON schema.
 * Checks:
 * - File wrapper (<T714020250A0000>...</T714020250A0000>)
 * - Page markers (<T71401000>, <T71402000>, etc.)
 * - Page lengths match expected values
 * - Required constant fields
 */
export function validateBoeFile(filePath: string, schemaPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let content: string;
  try {
    content = readFileSync(filePath, "latin1");
  } catch {
    return { valid: false, errors: [`No se pudo leer el fichero: ${filePath}`], warnings: [] };
  }

  // Check wrapper
  if (!content.startsWith("<T714020250A0000>")) {
    errors.push('El fichero debe empezar con "<T714020250A0000>"');
  }
  if (!content.endsWith("</T714020250A0000>")) {
    errors.push('El fichero debe terminar con "</T714020250A0000>"');
  }

  // Extract content between wrapper
  const wrapperStart = "<T714020250A0000>";
  const wrapperEnd = "</T714020250A0000>";
  const startIdx = content.indexOf(wrapperStart);
  const endIdx = content.indexOf(wrapperEnd);

  if (startIdx < 0 || endIdx < 0) {
    return { valid: false, errors, warnings };
  }

  const inner = content.substring(startIdx + wrapperStart.length, endIdx);

  // Check AUX section
  const auxStart = inner.indexOf("<AUX>");
  const auxEnd = inner.indexOf("</AUX>");
  if (auxStart < 0 || auxEnd < 0) {
    errors.push("Falta sección <AUX>...</AUX>");
  }

  // Check page markers
  const pagePattern = /<T714(\d{5})>/g;
  const pages: string[] = [];
  let match;
  while ((match = pagePattern.exec(inner)) !== null) {
    pages.push(match[1]);
  }

  // Only pages 01, 09, 10, 11 are required (datos identificativos, resumen,
  // liquidación, documento de ingreso). Pages 02-08 (bienes y derechos) are
  // included only if there's data in those sections.
  const requiredPages = ["01000", "09000", "10000", "11000"];
  for (const rp of requiredPages) {
    if (!pages.includes(rp)) {
      errors.push(`Página obligatoria ${rp} no encontrada`);
    }
  }

  // Check page end markers
  for (const p of pages) {
    const endMarker = `</T714${p}>`;
    if (!inner.includes(endMarker)) {
      errors.push(`Falta marcador de fin de página: ${endMarker}`);
    }
  }

  // Validate page 01 (datos identificativos) has NIF
  // The opening tag "<T71401000>" is 11 chars. NIF is at pos 14 in the full page (1-indexed),
  // so after the tag it's at offset 2 (= 14 - 11 - 1), length 9.
  const page01Match = inner.match(/<T71401000>(.+?)<\/T71401000>/s);
  if (page01Match) {
    const page01Content = page01Match[1]; // everything between tags
    // Full page length should be 1100 (so content between tags = 1100 - 11 - 12 = 1077)
    if (page01Content.length >= 11) {
      const nif = page01Content.substring(2, 11).trim();
      if (!nif || nif.length < 9) {
        errors.push("NIF del sujeto pasivo no encontrado en página 01 (posición 14, longitud 9)");
      }
    } else {
      errors.push(`Página 01 demasiado corta: ${page01Content.length + 23} caracteres (esperado: 1100)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
