#!/usr/bin/env node
// Sube un XML a EDFI y muestra los errores/avisos del servidor.
// Uso: node scripts/edfi-upload.mjs <fichero.xml>

import { chromium } from "playwright";
import { resolve } from "node:path";

const xmlFile = process.argv[2];
if (!xmlFile) {
  console.error("Uso: node scripts/edfi-upload.mjs <fichero.xml>");
  process.exit(1);
}

const CDP_PORT = 9223;

async function main() {
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  page.on("dialog", (d) => d.accept().catch(() => {}));

  // 1. Navegar a EDFI
  console.log("Navegando a EDFI...");
  await page.goto("https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/EDFI/index.zul", {
    waitUntil: "networkidle",
  }).catch(() => {});
  await page.waitForTimeout(2000);

  // Check for expired session
  if (/SesionCaducada|ObtenerClave/i.test(page.url())) {
    console.error("✗ Sesión caducada. Ejecuta 'hacienda login' primero.");
    browser.close();
    process.exit(1);
  }

  // 2. Click "Importar XML"
  const importBtn = page.locator('button:has-text("Importar XML")');
  await importBtn.waitFor({ state: "visible", timeout: 10000 });
  await importBtn.click();
  await page.waitForTimeout(1000);

  // 3. Confirmación "Si"
  const siBtn = page.locator('button:has-text("Si")');
  if (await siBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10000 }),
      siBtn.click(),
    ]);
    await fileChooser.setFiles(resolve(xmlFile));
  }

  // 4. Esperar resultado
  console.log(`Subiendo ${xmlFile}...`);
  await page.waitForTimeout(5000);

  // 5. Wait a bit more for the page to fully render
  await page.waitForTimeout(3000);

  // 5. Extraer resultado
  const result = await page.evaluate(() => {
    const body = document.body.textContent || "";
    const url = window.location.href;

    // Página de errores: look for rows with FRECH, ERES, EXML, AVIS codes
    const allRows = document.querySelectorAll("tr");
    const errors = [];
    for (const row of allRows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 4) {
        const codigo = cells[2]?.textContent?.trim() || "";
        if (/^(FRECH|ERES|EXML|AVIS)/.test(codigo)) {
          const desc = cells[3]?.textContent?.trim().replace(/\s+/g, " ") || "";
          errors.push({ codigo, desc });
        }
      }
    }
    if (errors.length > 0) {
      return { status: "errors", errors };
    }

    // Página de resumen: estamos en Renta WEB con la declaración cargada
    const isResumen = /Resumen de declaraciones|Resultado de la declaraci/i.test(body);
    if (isResumen) {
      // Extraer resultado de la declaración
      const resultado = body.match(/Resultado de la declaraci[oó]n\s*([\d.,\-]+)/)?.[1] || "no encontrado";
      return { status: "accepted", resultado };
    }

    return { status: "unknown", bodySnippet: body.substring(0, 800) };
  });

  if (result.status === "accepted") {
    console.log(`\n✓ XML aceptado por EDFI`);
    console.log(`  Resultado de la declaración: ${result.resultado}`);
  } else if (result.status === "errors") {
    const rejected = result.errors.some(e => e.codigo === "FRECH");
    console.log(`\n${rejected ? "✗ Fichero RECHAZADO" : "⚠ Importado con avisos"}. ${result.errors.length} errores/avisos:`);
    for (const e of result.errors) {
      const icon = e.codigo.startsWith("FRECH") || e.codigo.startsWith("ERES") ? "✗" : "⚠";
      console.log(`  ${icon} [${e.codigo}] ${e.desc}`);
    }
  } else {
    console.log("\n? Estado desconocido:");
    console.log(result.bodySnippet);
  }

  browser.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
