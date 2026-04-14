import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";

import { aeatSelectors, aeatSessionExpiredPattern } from "./selectors.js";

export async function downloadModelo100Artifacts(args: {
  page: Page;
  modelo: string;
  outDir: string;
  rentaWebUrl: string;
}): Promise<{ htmlFile: string; pdfFile: string }> {
  const { modelo, outDir, page, rentaWebUrl } = args;
  const datosFiscalesUrl = "https://www6.agenciatributaria.gob.es/wlpl/DFPA-D182/SvVisDF25Net";

  page.on("dialog", (d) => d.accept().catch(() => {}));

  console.log("Descargando datos fiscales...");
  await page.goto(datosFiscalesUrl, { waitUntil: "networkidle" }).catch(() => {});

  if (aeatSessionExpiredPattern.test(page.url())) {
    throw new Error("Sesión caducada. Ejecuta 'hacienda login' primero.");
  }

  try {
    await page.locator(aeatSelectors.fiscalDataHeader).waitFor({ timeout: 15000 });
  } catch {
    throw new Error(`No se pudo cargar la página de datos fiscales. URL actual: ${page.url()}`);
  }

  const datosFiscalesHtml = await page.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    return main.innerHTML;
  });

  const htmlFile = join(outDir, `datos-fiscales-${modelo}-2025.html`);
  const htmlWrapper =
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">` +
    `<title>Datos Fiscales ${modelo} - 2025</title>` +
    `<style>body{font-family:sans-serif;margin:2em}table{border-collapse:collapse;width:100%;margin:1em 0}` +
    `td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}h2{margin-top:2em;color:#333}</style>` +
    `</head><body>${datosFiscalesHtml}</body></html>`;
  writeFileSync(htmlFile, htmlWrapper);
  console.log(`✓ Datos fiscales: ${htmlFile}`);

  console.log("Abriendo Renta WEB...");
  await page.goto(rentaWebUrl, { waitUntil: "networkidle" }).catch(() => {});

  const continuar = page.locator(aeatSelectors.continueSession);
  const nuevaDecl = page.locator(aeatSelectors.newDeclaration);
  try {
    await Promise.race([
      continuar.waitFor({ state: "visible", timeout: 10000 }),
      nuevaDecl.waitFor({ state: "visible", timeout: 10000 }),
    ]);
  } catch {
    // Puede que ya estemos en el resumen directamente.
  }

  if (await continuar.isVisible().catch(() => false)) {
    console.log("Continuando sesión existente...");
    await continuar.click();
  } else if (await nuevaDecl.isVisible().catch(() => false)) {
    console.log("Iniciando nueva declaración...");
    await nuevaDecl.click();
  }

  console.log("Esperando a que cargue el borrador...");
  const vistaPrevia = page.locator(aeatSelectors.previewButton);
  try {
    await vistaPrevia.waitFor({ state: "visible", timeout: 20000 });
  } catch {
    throw new Error(
      `No se encontró el botón 'Vista previa'. ¿Estás autenticado? URL actual: ${page.url()}`,
    );
  }

  console.log("Generando vista previa PDF...");
  await vistaPrevia.click();

  const pdfIframe = page.locator(aeatSelectors.pdfIframe);
  try {
    await pdfIframe.waitFor({ state: "attached", timeout: 20000 });
  } catch {
    throw new Error("No se generó el PDF. Puede que haya errores en la declaración.");
  }

  const pdfUrl = await pdfIframe.getAttribute("src");
  if (!pdfUrl) {
    throw new Error("No se pudo obtener la URL del PDF.");
  }

  console.log("Descargando PDF...");
  const pdfBase64: string = await page.evaluate(async (url) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, pdfUrl);

  const pdfFile = join(outDir, `borrador-${modelo}-2025.pdf`);
  writeFileSync(pdfFile, Buffer.from(pdfBase64, "base64"));
  console.log(`✓ Borrador PDF: ${pdfFile}`);

  const volver = page.locator(aeatSelectors.backToReturn);
  if (await volver.isVisible({ timeout: 2000 }).catch(() => false)) {
    await volver.click();
  }

  return { htmlFile, pdfFile };
}
