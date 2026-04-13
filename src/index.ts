#!/usr/bin/env node
// hacienda — CLI para interactuar con la sede electrónica de la AEAT.
// Descarga y sube declaraciones en formato XML oficial (Renta2025.xsd).
// Nunca presenta, firma ni envía la declaración.

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const program = new Command();

program
  .name("hacienda")
  .description(
    "CLI para interactuar con la sede electrónica de la Agencia Tributaria.\n\n" +
      "Descarga/sube declaraciones en formato XML oficial.\n" +
      "Nunca presenta, firma ni envía la declaración.",
  )
  .version("0.3.0");

// ── Modelo registry ────────────────────────────────────────────────
// Extensible: añadir modelos aquí cuando se soporten.
const MODELOS: Record<
  string,
  {
    name: string;
    xsd: string;
    dict: string;
    edfiUrl: string;
    rentaWebUrl: string;
  }
> = {
  "100": {
    name: "IRPF - Impuesto sobre la Renta de las Personas Físicas",
    xsd: "Renta2025.xsd",
    dict: "diccionarioXSD_2025.properties",
    // EDFI = interfaz de presentación mediante fichero (importar/exportar XML)
    edfiUrl: "https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/EDFI/index.zul",
    // Renta WEB normal (borrador interactivo)
    rentaWebUrl:
      "https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/CONT/index.zul?TACCESO=NPROPIO&EJER=2025",
  },
};

function dataDir(): string {
  return join(new URL(".", import.meta.url).pathname, "..", "data");
}

// ── login ──────────────────────────────────────────────────────────
program
  .command("login")
  .description(
    "Abre un navegador para autenticarte en la sede de la AEAT. " +
      "La sesión queda abierta para que download/upload funcionen.",
  )
  .action(async () => {
    const { launchBrowser, getSessionStatus } = await import("./browser.js");

    console.log("Abriendo navegador...");
    const { page } = await launchBrowser({ headed: true });

    const DIALOGO =
      "https://www6.agenciatributaria.gob.es/wlpl/OVCT-CXEW/DialogoRepresentacion" +
      "?ref=%2Fwlpl%2FDASR-CORE%2FAccesoDR2025RVlt";
    await page.goto(DIALOGO, { waitUntil: "networkidle" }).catch(() => {});

    console.log("Autentícate en la ventana del navegador.");
    console.log("Esperando login (máx 5 min)...\n");

    try {
      await page.waitForFunction(
        () =>
          /AccesoDR2025|Servicios Renta/i.test(
            document.title + " " + (document.body.textContent || ""),
          ),
        { timeout: 300_000 },
      );
    } catch {
      console.log("Timeout. Verificando sesión...");
    }

    const status = await getSessionStatus();
    if (status.authenticated) {
      console.log("✓ Sesión autenticada.");
      console.log(`  URL: ${status.currentUrl}`);
      console.log("\n  Navegador abierto. Los demás comandos se conectan a él.");
      console.log("  Ciérralo con Ctrl+C cuando termines.");
    } else {
      console.log("✗ No se detectó sesión. Verifica tu login.");
    }

    // Mantener vivo
    await new Promise(() => {});
  });

// ── download ───────────────────────────────────────────────────────
program
  .command("download <modelo>")
  .description("Descarga la declaración actual como XML.")
  .option("-o, --output <file>", "Fichero de salida", "declaracion-{modelo}.xml")
  .action(async (modelo, opts) => {
    const m = MODELOS[modelo];
    if (!m) {
      console.error(`Modelo ${modelo} no soportado. Disponibles: ${Object.keys(MODELOS).join(", ")}`);
      process.exit(1);
    }

    const { ensureBrowser, closeBrowser } = await import("./browser.js");

    console.log(`Conectando al navegador...`);
    const { page } = await ensureBrowser();

    // Navegar a EDFI (presentación mediante fichero)
    await page.goto(m.edfiUrl, { waitUntil: "networkidle" }).catch(() => {});

    // Mostrar opciones (si existen)
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.offsetParent !== null && /Mostrar opciones/i.test(b.textContent || ""),
      );
      b?.click();
    });
    await page.waitForTimeout(500);

    // Buscar botón "Exportar XML" o "Guardar" que descargue
    const outputFile = opts.output.replace("{modelo}", modelo);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }).catch(() => null),
      page.evaluate(() => {
        const b = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
          (b) =>
            /Exportar XML|Guardar.*\.ses|Descargar/i.test(
              (b.title || "") + " " + (b.textContent || ""),
            ),
        );
        b?.click();
        return !!b;
      }),
    ]);

    if (download) {
      const path = resolve(outputFile);
      await download.saveAs(path);
      console.log(`✓ Declaración descargada: ${path}`);
    } else {
      console.log("⚠ No se generó descarga automática.");
      console.log("  Para descargar, usa EDFI manualmente:");
      console.log(`  ${m.edfiUrl}`);
    }

    await closeBrowser();
  });

// ── upload ─────────────────────────────────────────────────────────
program
  .command("upload <modelo> <xmlFile>")
  .description("Importa un XML en el borrador de la AEAT.")
  .action(async (modelo, xmlFile) => {
    const m = MODELOS[modelo];
    if (!m) {
      console.error(`Modelo ${modelo} no soportado.`);
      process.exit(1);
    }

    if (!existsSync(xmlFile)) {
      console.error(`Fichero no encontrado: ${xmlFile}`);
      process.exit(1);
    }

    // Validar contra XSD primero
    const xsdPath = join(dataDir(), m.xsd);
    if (existsSync(xsdPath)) {
      console.log("Validando XML contra XSD...");
      try {
        execSync(`xmllint --schema "${xsdPath}" "${xmlFile}" --noout 2>&1`);
        console.log("✓ XML válido.");
      } catch (e: any) {
        console.log("⚠ Validación XSD falló (xmllint):");
        console.log("  " + (e.stdout?.toString() || e.message).slice(0, 500));
        console.log("  Continuando igualmente...");
      }
    }

    const { ensureBrowser, closeBrowser } = await import("./browser.js");

    console.log("Conectando al navegador...");
    const { page } = await ensureBrowser();

    // Navegar a EDFI (presentación mediante fichero)
    await page.goto(m.edfiUrl, { waitUntil: "networkidle" }).catch(() => {});

    // Click "Importar Xml"
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll<HTMLButtonElement>("button, a")).find(
        (b) => b.offsetParent !== null && /Importar\s*Xml/i.test(b.textContent || ""),
      );
      b?.click();
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Buscar file input y subir el fichero
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(resolve(xmlFile));
      await page.waitForLoadState("networkidle").catch(() => {});
      console.log("✓ XML importado. Revisa el resultado en el navegador.");
      console.log(`  URL: ${m.edfiUrl}`);
    } else {
      // Puede que "Importar Xml" abra directamente un file picker del OS
      // Intentar via page.setInputFiles en cualquier input file oculto
      const hiddenInput = await page.$('input[type="file"]');
      if (hiddenInput) {
        await hiddenInput.setInputFiles(resolve(xmlFile));
        await page.waitForLoadState("networkidle").catch(() => {});
        console.log("✓ XML importado.");
      } else {
        console.log("⚠ No se encontró input de fichero.");
        console.log("  Importa manualmente desde el navegador:");
        console.log(`  ${m.edfiUrl}`);
      }
    }

    // NO cerrar el browser — el usuario quiere ver el resultado
    console.log("\n  El navegador queda abierto para que revises el resultado.");
  });

// ── validate ───────────────────────────────────────────────────────
program
  .command("validate <modelo> <xmlFile>")
  .description("Valida un XML contra el XSD oficial de la AEAT (offline).")
  .action(async (modelo, xmlFile) => {
    const m = MODELOS[modelo];
    if (!m) {
      console.error(`Modelo ${modelo} no soportado.`);
      process.exit(1);
    }

    if (!existsSync(xmlFile)) {
      console.error(`Fichero no encontrado: ${xmlFile}`);
      process.exit(1);
    }

    const xsdPath = join(dataDir(), m.xsd);
    if (!existsSync(xsdPath)) {
      console.error(`XSD no encontrado: ${xsdPath}`);
      console.error(`Descárgalo de: https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/${m.xsd}`);
      process.exit(1);
    }

    console.log(`Validando ${xmlFile} contra ${m.xsd}...`);
    try {
      const result = execSync(`xmllint --schema "${xsdPath}" "${xmlFile}" --noout 2>&1`).toString();
      console.log("✓ XML válido.");
      if (result.trim()) console.log(result);
    } catch (e: any) {
      const output = e.stdout?.toString() || e.stderr?.toString() || e.message;
      console.log("✗ Errores de validación:\n");
      console.log(output);
      process.exit(1);
    }
  });

// ── info ───────────────────────────────────────────────────────────
program
  .command("info <modelo>")
  .description("Muestra información del modelo: XSD, diccionario, URLs.")
  .action(async (modelo) => {
    const m = MODELOS[modelo];
    if (!m) {
      console.error(`Modelo ${modelo} no soportado. Disponibles: ${Object.keys(MODELOS).join(", ")}`);
      process.exit(1);
    }

    const xsdPath = join(dataDir(), m.xsd);
    const dictPath = join(dataDir(), m.dict);

    console.log(`Modelo ${modelo}: ${m.name}\n`);
    console.log(`XSD:         ${existsSync(xsdPath) ? xsdPath : "NO ENCONTRADO"}`);
    console.log(`Diccionario: ${existsSync(dictPath) ? dictPath : "NO ENCONTRADO"}`);
    console.log(`EDFI URL:    ${m.edfiUrl}`);
    console.log(`Renta WEB:   ${m.rentaWebUrl}`);
    console.log(`\nFuentes AEAT:`);
    console.log(`  XSD:  https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/${m.xsd}`);
    console.log(`  Dict: https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/${m.dict}`);

    if (existsSync(dictPath)) {
      const lines = readFileSync(dictPath, "latin1").split("\n").filter((l) => l.trim());
      console.log(`\n  Campos en diccionario: ${lines.length}`);
    }
    if (existsSync(xsdPath)) {
      const content = readFileSync(xsdPath, "utf8");
      const elements = (content.match(/xs:element name=/g) || []).length;
      console.log(`  Elementos en XSD: ${elements}`);
    }
  });

program.parse();
