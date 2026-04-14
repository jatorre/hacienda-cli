import { resolve } from "node:path";
import type { Page } from "playwright";

import { aeatSelectors, aeatSessionExpiredPattern } from "./selectors.js";

export type UploadResult =
  | { status: "accepted"; resultado: string }
  | {
      status: "messages";
      rejected: boolean;
      entries: Array<{ codigo: string; desc: string }>;
    }
  | { status: "unknown"; bodySnippet: string };

export async function uploadXmlToEdfi(args: {
  edfiUrl: string;
  page: Page;
  xmlFile: string;
}): Promise<UploadResult> {
  const { edfiUrl, page, xmlFile } = args;

  page.on("dialog", (d) => d.accept().catch(() => {}));

  await page.goto(edfiUrl, { waitUntil: "networkidle" }).catch(() => {});

  if (aeatSessionExpiredPattern.test(page.url())) {
    throw new Error("Sesión caducada. Ejecuta 'hacienda login' primero.");
  }

  // Click "Importar XML" — may be in a modal or directly on the page
  const importBtn = page.locator(aeatSelectors.importXml).first();
  await importBtn.waitFor({ state: "visible", timeout: 10000 });
  await importBtn.click();
  await page.waitForTimeout(1500);

  // EDFI shows a confirmation dialog "Si continúa se borrarán los datos..."
  // Click "Si" and catch the file chooser that opens
  const siBtn = page.locator(aeatSelectors.uploadConfirmYes).first();
  try {
    await siBtn.waitFor({ state: "visible", timeout: 5000 });
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10000 }),
      siBtn.click(),
    ]);
    await fileChooser.setFiles(resolve(xmlFile));
    console.log("XML enviado a EDFI, esperando procesamiento...");
  } catch {
    throw new Error("No se pudo abrir el selector de fichero. ¿Está la sesión activa?");
  }

  // Wait for EDFI to process the file and show results
  // After file upload, EDFI either:
  // 1. Shows "Errores y avisos" table (errors/warnings page)
  // 2. Shows "Resumen de declaraciones" (accepted, loaded into Renta WEB)
  // 3. Shows "Volver a la página principal" (error page)
  await page.waitForTimeout(3000);
  await page.waitForLoadState("networkidle").catch(() => {});
  try {
    await Promise.race([
      page.locator("text=Errores y avisos").waitFor({ state: "visible", timeout: 30000 }),
      page.locator("text=Resumen de declaraciones").waitFor({ state: "visible", timeout: 30000 }),
      page.locator("text=Volver a la página principal").waitFor({ state: "visible", timeout: 30000 }),
    ]);
  } catch {
    // Timeout — proceed to check whatever is on the page
  }
  await page.waitForTimeout(1000);

  return page.evaluate(() => {
    const body = document.body.innerText || "";
    const errors: Array<{ codigo: string; desc: string }> = [];

    for (const row of document.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) continue;
      const codigo = cells[2]?.textContent?.trim() || "";
      if (!/^(FRECH|ERES|EXML|AVIS|100[A-Z]|E254)/.test(codigo)) continue;
      const desc = cells[3]?.textContent?.trim().replace(/\s+/g, " ") || "";
      errors.push({ codigo, desc });
    }

    if (errors.length > 0) {
      return {
        status: "messages" as const,
        rejected: errors.some((entry) => entry.codigo === "FRECH"),
        entries: errors,
      };
    }

    if (/Resumen de declaraciones|Resultado de la declaraci/i.test(body)) {
      return {
        status: "accepted" as const,
        resultado: body.match(/Resultado de la declaraci[oó]n\s*([\d.,\-]+)/)?.[1] || "no encontrado",
      };
    }

    return {
      status: "unknown" as const,
      bodySnippet: body.substring(0, 500),
    };
  });
}
