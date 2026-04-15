import { resolve } from "node:path";
import type { Page } from "playwright";

import { aeatSessionExpiredPattern } from "./selectors.js";

export type PatrimonioUploadResult =
  | { status: "accepted"; resultado: string }
  | {
      status: "messages";
      rejected: boolean;
      entries: Array<{ tipo: string; codigo: string; desc: string }>;
    }
  | { status: "unknown"; bodySnippet: string };

/**
 * Uploads a BOE-format file to Patrimonio WEB using the "Importar" button.
 * Unlike EDFI (Modelo 100), Patrimonio WEB has the import built into the
 * main form — there's no separate EDFI endpoint.
 */
export async function uploadBoeToPatrimonio(args: {
  patrimonioWebUrl: string;
  page: Page;
  boeFile: string;
}): Promise<PatrimonioUploadResult> {
  const { patrimonioWebUrl, page, boeFile } = args;

  page.on("dialog", (d) => d.accept().catch(() => {}));

  // Navigate to Patrimonio WEB
  await page.goto(patrimonioWebUrl, { waitUntil: "networkidle" }).catch(() => {});

  if (aeatSessionExpiredPattern.test(page.url())) {
    throw new Error("Sesión caducada. Ejecuta 'hacienda login' primero.");
  }

  // Wait for the form to load — look for the "Apartados" button as indicator
  try {
    await page.locator('button:has-text("Apartados")').waitFor({ state: "visible", timeout: 15000 });
  } catch {
    // May be on the initial data transfer page — accept defaults
    const aceptarBtn = page.locator('button:has-text("Aceptar")').first();
    if (await aceptarBtn.isVisible().catch(() => false)) {
      await aceptarBtn.click();
      await page.waitForTimeout(3000);
    }

    // May need to dismiss info dialogs
    const okBtn = page.locator('button:has-text("OK")').first();
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click();
      await page.waitForTimeout(2000);
    }

    // Try again
    try {
      await page.locator('button:has-text("Apartados")').waitFor({ state: "visible", timeout: 15000 });
    } catch {
      throw new Error(`No se pudo cargar Patrimonio WEB. URL actual: ${page.url()}`);
    }
  }

  // Find the "Importar" button and use it to upload the BOE file
  // The Importar button has a hidden file input next to it
  const importarBtn = page.locator('button:has-text("Importar")').first();
  await importarBtn.waitFor({ state: "visible", timeout: 10000 });

  // The file input is in a form next to the Importar button
  const fileInput = page.locator('input[type="file"]').first();

  // Set the file on the hidden input
  await fileInput.setInputFiles(resolve(boeFile));
  console.log("Fichero BOE enviado a Patrimonio WEB, esperando procesamiento...");

  // Wait for processing
  await page.waitForTimeout(5000);
  await page.waitForLoadState("networkidle").catch(() => {});

  // Check for results — Patrimonio WEB may show errors/warnings or load the data
  return page.evaluate(() => {
    const body = document.body.innerText || "";
    const errors: Array<{ tipo: string; codigo: string; desc: string }> = [];

    // Check for error/warning table rows
    for (const row of document.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) continue;
      const tipo = cells[0]?.textContent?.trim() || "";
      const codigo = cells[2]?.textContent?.trim() || "";
      const desc = cells[3]?.textContent?.trim().replace(/\s+/g, " ") || "";
      if (tipo && (codigo || desc)) {
        errors.push({ tipo, codigo, desc });
      }
    }

    if (errors.length > 0) {
      const hasError = errors.some(
        (e) => e.tipo.toLowerCase().includes("error") || e.tipo.toLowerCase().includes("rech"),
      );
      return {
        status: "messages" as const,
        rejected: hasError,
        entries: errors,
      };
    }

    // Check if the form loaded successfully with data
    if (/Apartados|Sujeto Pasivo|Bienes y Derechos/i.test(body)) {
      return {
        status: "accepted" as const,
        resultado: "Fichero importado correctamente en Patrimonio WEB",
      };
    }

    return {
      status: "unknown" as const,
      bodySnippet: body.substring(0, 500),
    };
  });
}
