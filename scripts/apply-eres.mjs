#!/usr/bin/env node
// Sube XML a EDFI, captura ERES, genera XML con Resultados corregidos, resube.
// Uso: node scripts/apply-eres.mjs <fichero.xml>

import { chromium } from "playwright";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const xmlFile = process.argv[2];
if (!xmlFile) { console.error("Uso: node scripts/apply-eres.mjs <fichero.xml>"); process.exit(1); }

const CDP_PORT = 9223;

async function uploadAndGetErrors(page, file) {
  await page.goto("https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/EDFI/index.zul", { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2000);

  if (/SesionCaducada|ObtenerClave/i.test(page.url())) {
    console.error("✗ Sesión caducada."); process.exit(1);
  }

  const importBtn = page.locator('button:has-text("Importar XML")');
  await importBtn.waitFor({ state: "visible", timeout: 10000 });
  await importBtn.click();
  await page.waitForTimeout(1000);

  const siBtn = page.locator('button:has-text("Si")');
  if (await siBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10000 }),
      siBtn.click(),
    ]);
    await fileChooser.setFiles(resolve(file));
  }
  await page.waitForTimeout(5000);

  return page.evaluate(() => {
    const errors = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 4) {
        const codigo = cells[2]?.textContent?.trim() || "";
        const desc = cells[3]?.textContent?.trim().replace(/\s+/g, " ") || "";
        if (/^(FRECH|ERES|EXML|AVIS|100R)/.test(codigo)) {
          errors.push({ codigo, desc });
        }
      }
    }
    const isResumen = /Resumen de declaraciones/i.test(document.body.textContent || "");
    return { accepted: isResumen, errors };
  });
}

async function main() {
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const page = browser.contexts()[0].pages()[0];
  page.on("dialog", (d) => d.accept().catch(() => {}));

  // Round 1: upload and collect ERES
  console.log(`\n=== Round 1: Upload ${xmlFile} ===`);
  const r1 = await uploadAndGetErrors(page, xmlFile);

  if (r1.accepted) {
    console.log("✓ Aceptado en el primer intento!");
    browser.close();
    return;
  }

  // Parse ERES values
  const eresValues = {};
  for (const e of r1.errors) {
    const m = e.codigo.match(/^ERES\[(\w+)\]$/);
    if (m) {
      const vm = e.desc.match(/calculado el valor\s+([\d.,\-]+)/);
      if (vm) {
        eresValues[m[1]] = parseFloat(vm[1]);
      }
    }
  }

  const nonEres = r1.errors.filter(e => !e.codigo.startsWith("ERES[") && e.codigo !== "FRECH");
  if (nonEres.length > 0) {
    console.log("\n⚠ Errores no-ERES (no se pueden auto-corregir):");
    for (const e of nonEres) console.log(`  [${e.codigo}] ${e.desc}`);
  }

  console.log(`\nEn total ${Object.keys(eresValues).length} valores ERES capturados.`);
  console.log("Valores clave:");
  console.log(`  CINTEST (cuota íntegra estatal): ${eresValues.CINTEST}`);
  console.log(`  CINTAUT (cuota íntegra autonómica): ${eresValues.CINTAUT}`);
  console.log(`  RESINGDEV (resultado): ${eresValues.RESINGDEV}`);

  // Save ERES values as JSON for reference
  const jsonFile = xmlFile.replace(/\.xml$/, "-eres.json");
  writeFileSync(jsonFile, JSON.stringify(eresValues, null, 2));
  console.log(`\nERES guardados en: ${jsonFile}`);

  browser.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
