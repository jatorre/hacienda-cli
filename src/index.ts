#!/usr/bin/env node
// hacienda — CLI para interactuar con la sede electrónica de la AEAT.
// Descarga datos fiscales y sube XML oficial para contraste en EDFI.
// Nunca presenta, firma ni envía la declaración.

import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { downloadModelo100Artifacts, UserActionRequiredError } from "./aeat/download.js";
import { uploadXmlToEdfi } from "./aeat/upload.js";

const program = new Command();

program
  .name("hacienda")
  .description(
    "CLI para interactuar con la sede electrónica de la Agencia Tributaria.\n\n" +
      "Descarga datos fiscales, valida XML y lo importa en EDFI para reconciliación.\n" +
      "Nunca presenta, firma ni envía la declaración.",
  )
  .version("0.3.0");

// ── Modelo registry ────────────────────────────────────────────────
// Extensible: añadir modelos aquí cuando se soporten.
interface ModeloDef {
  name: string;
  format: "xml" | "boe";
  xsd?: string;
  dict?: string;
  schema?: string; // JSON schema for BOE format (parsed from XLS)
  edfiUrl?: string;
  rentaWebUrl?: string;
  patrimonioWebUrl?: string;
}

const MODELOS: Record<string, ModeloDef> = {
  "100": {
    name: "IRPF - Impuesto sobre la Renta de las Personas Físicas",
    format: "xml",
    xsd: "Renta2025-fixed.xsd",
    dict: "diccionarioXSD_2025.properties",
    // EDFI = interfaz de presentación mediante fichero (importar/exportar XML)
    edfiUrl: "https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/EDFI/index.zul",
    // Renta WEB normal (borrador interactivo)
    rentaWebUrl:
      "https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/CONT/index.zul?TACCESO=NPROPIO&EJER=2025",
  },
  "714": {
    name: "Impuesto sobre el Patrimonio",
    format: "boe",
    schema: "DR714_2025.json",
    // Patrimonio WEB — formulario interactivo con botón "Importar" para fichero BOE
    patrimonioWebUrl:
      "https://www6.agenciatributaria.gob.es/wlpl/PAMW-M714/E2025/CONT/index.zul?TACCESO=NPROPIO&EJER=2025",
  },
};

function dataDir(): string {
  return join(fileURLToPath(new URL(".", import.meta.url)), "..", "data");
}

// ── login ──────────────────────────────────────────────────────────
program
  .command("login")
  .description(
    "Abre un navegador para autenticarte en la sede de la AEAT.\n" +
      "La sesión queda abierta para que download/upload funcionen.\n" +
      "Autentícate con Cl@ve en la ventana que se abre.",
  )
  .action(async () => {
    const { launchBrowser, getSessionStatus } = await import("./browser.js");

    console.log("Abriendo navegador...");
    const { page } = await launchBrowser({ headed: true });

    // Ir directo a Renta WEB — si no hay sesión, redirige a Cl@ve automáticamente
    const RENTA_URL =
      "https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/CONT/index.zul?TACCESO=NPROPIO&EJER=2025";
    await page.goto(RENTA_URL, { waitUntil: "networkidle" }).catch(() => {});

    console.log("Autentícate en la ventana del navegador con Cl@ve.");
    console.log("Después pulsa 'CONFIRMAR' en nombre propio y 'Continuar sesión' si aparece.");
    console.log("Esperando (máx 5 min)...\n");

    // Esperar a que lleguemos a Renta WEB (título "Renta 2025") o a Servicios Renta
    try {
      await page.waitForFunction(
        () => /Renta 2025|Servicios Renta|AccesoDR2025/i.test(document.title),
        { timeout: 300_000 },
      );
    } catch {
      console.log("Timeout. Verificando sesión...");
    }

    const status = await getSessionStatus();
    if (status.authenticated) {
      console.log("✓ Sesión autenticada.");
      console.log(`  URL: ${status.currentUrl}`);
      console.log("\n  ⚠  MANTÉN ESTA TERMINAL ABIERTA.");
      console.log("  Este proceso mantiene viva la sesión del navegador.");
      console.log("  Si haces Ctrl+C o cierras esta pestaña, perderás el login");
      console.log("  y tendrás que volver a autenticarte con Cl@ve.\n");
      console.log("  Abre OTRA pestaña de terminal (Cmd+T en Mac) para ejecutar:");
      console.log("    hacienda download 100      # descarga borrador PDF");
      console.log("    hacienda upload 100 f.xml  # importa XML en EDFI\n");
      console.log("  Cuando hayas terminado todos los comandos, pulsa Ctrl+C aquí para cerrar.");
    } else {
      console.log("✗ No se detectó sesión. Verifica tu login.");
    }

    // Mantener vivo
    await new Promise(() => {});
  });

// ── download ───────────────────────────────────────────────────────
program
  .command("download <modelo>")
  .description(
    "Descarga el borrador (PDF) y los datos fiscales (HTML) de la AEAT.\n" +
      "Requiere sesión activa (hacienda login).\n" +
      "Genera dos ficheros: el PDF de la declaración y el HTML con\n" +
      "todos los datos fiscales que la AEAT tiene del contribuyente.",
  )
  .option("-o, --output <dir>", "Directorio de salida", ".")
  .action(async (modelo, opts) => {
    const m = MODELOS[modelo];
    if (!m) {
      console.error(`Modelo ${modelo} no soportado. Disponibles: ${Object.keys(MODELOS).join(", ")}`);
      process.exit(1);
    }

    const { ensureBrowser } = await import("./browser.js");

    console.log("Conectando al navegador...");
    const { page } = await ensureBrowser();

    const outDir = resolve(opts.output);
    let htmlFile = "";
    let pdfFile = "";
    try {
      const result = await downloadModelo100Artifacts({
        modelo,
        outDir,
        page,
        rentaWebUrl: m.rentaWebUrl!,
      });
      htmlFile = result.htmlFile;
      pdfFile = result.pdfFile;
    } catch (error: any) {
      if (error instanceof UserActionRequiredError) {
        console.error(`\nℹ  Atención: ${error.message}\n`);
      } else {
        console.error(`✗ ${error.message}`);
      }
      process.exit(1);
    }

    // Desconectar del navegador para que el proceso termine
    const { disconnectBrowser } = await import("./browser.js");
    await disconnectBrowser();

    console.log("\nDescarga completa. Ficheros generados:");
    console.log(`  ${htmlFile}`);
    console.log(`  ${pdfFile}`);
  });

// ── upload ─────────────────────────────────────────────────────────
program
  .command("upload <modelo> <file>")
  .description(
    "Importa un fichero en la AEAT.\n" +
      "Modelo 100: XML en EDFI.\n" +
      "Modelo 714: fichero BOE en Patrimonio WEB.",
  )
  .action(async (modelo, file) => {
    const m = MODELOS[modelo];
    if (!m) {
      console.error(`Modelo ${modelo} no soportado.`);
      process.exit(1);
    }

    if (!existsSync(file)) {
      console.error(`Fichero no encontrado: ${file}`);
      process.exit(1);
    }

    if (m.format === "xml") {
      // Modelo 100 — XML via EDFI
      const xsdPath = m.xsd ? join(dataDir(), m.xsd) : "";
      if (xsdPath && existsSync(xsdPath)) {
        console.log("Validando XML contra XSD...");
        try {
          execSync(`xmllint --schema "${xsdPath}" "${file}" --noout 2>&1`);
          console.log("✓ XML válido.");
        } catch (e: any) {
          console.log("⚠ Validación XSD falló (xmllint):");
          console.log("  " + (e.stdout?.toString() || e.message).slice(0, 500));
          console.log("  Continuando igualmente...");
        }
      }

      const { ensureBrowser } = await import("./browser.js");
      console.log("Conectando al navegador...");
      const { page } = await ensureBrowser();

      try {
        const result = await uploadXmlToEdfi({
          edfiUrl: m.edfiUrl!,
          page,
          xmlFile: file,
        });

        if (result.status === "accepted") {
          console.log(`✓ XML aceptado por EDFI`);
          console.log(`  Resultado de la declaración: ${result.resultado}`);
        } else if (result.status === "messages") {
          console.log(
            `\n${result.rejected ? "✗ Fichero RECHAZADO" : "⚠ Importado con avisos"}. ${result.entries.length} mensajes:`,
          );
          for (const entry of result.entries) {
            const icon =
              entry.codigo.startsWith("FRECH") || entry.codigo.startsWith("ERES") ? "✗" : "⚠";
            console.log(`  ${icon} [${entry.codigo}] ${entry.desc}`);
          }
        } else {
          console.log("⚠ Estado desconocido tras importar el XML.");
          console.log(result.bodySnippet);
        }
      } catch (error: any) {
        console.error(`✗ ${error.message}`);
        process.exit(1);
      }
    } else if (m.format === "boe") {
      // Modelo 714 — BOE file via Patrimonio WEB
      const { uploadBoeToPatrimonio } = await import("./aeat/upload-patrimonio.js");
      const { ensureBrowser } = await import("./browser.js");

      console.log("Conectando al navegador...");
      const { page } = await ensureBrowser();

      try {
        const result = await uploadBoeToPatrimonio({
          patrimonioWebUrl: m.patrimonioWebUrl!,
          page,
          boeFile: file,
        });

        if (result.status === "accepted") {
          console.log(`✓ Fichero BOE importado en Patrimonio WEB`);
          console.log(`  ${result.resultado}`);
        } else if (result.status === "messages") {
          console.log(
            `\n${result.rejected ? "✗ Fichero RECHAZADO" : "⚠ Importado con avisos"}. ${result.entries.length} mensajes:`,
          );
          for (const entry of result.entries) {
            const icon = entry.tipo.toLowerCase().includes("error") ? "✗" : "⚠";
            console.log(`  ${icon} [${entry.codigo}] ${entry.desc}`);
          }
        } else {
          console.log("⚠ Estado desconocido tras importar el fichero.");
          console.log(result.bodySnippet);
        }
      } catch (error: any) {
        console.error(`✗ ${error.message}`);
        process.exit(1);
      }
    }

    // NO cerrar el browser — el usuario quiere ver el resultado
    console.log("\n  El navegador queda abierto para que revises el resultado.");
  });

// ── validate ───────────────────────────────────────────────────────
program
  .command("validate <modelo> <file>")
  .description(
    "Valida un fichero offline.\n" +
      "Modelo 100: XML contra XSD oficial (xmllint).\n" +
      "Modelo 714: estructura BOE contra diseño de registro.",
  )
  .action(async (modelo, file) => {
    const m = MODELOS[modelo];
    if (!m) {
      console.error(`Modelo ${modelo} no soportado.`);
      process.exit(1);
    }

    if (!existsSync(file)) {
      console.error(`Fichero no encontrado: ${file}`);
      process.exit(1);
    }

    if (m.format === "xml") {
      const xsdPath = join(dataDir(), m.xsd!);
      if (!existsSync(xsdPath)) {
        console.error(`XSD no encontrado: ${xsdPath}`);
        process.exit(1);
      }

      console.log(`Validando ${file} contra ${m.xsd}...`);
      try {
        const result = execSync(`xmllint --schema "${xsdPath}" "${file}" --noout 2>&1`).toString();
        console.log("✓ XML válido.");
        if (result.trim()) console.log(result);
      } catch (e: any) {
        const output = e.stdout?.toString() || e.stderr?.toString() || e.message;
        console.log("✗ Errores de validación:\n");
        console.log(output);
        process.exit(1);
      }
    } else if (m.format === "boe") {
      const { validateBoeFile } = await import("./aeat/validate-patrimonio.js");
      const schemaPath = join(dataDir(), m.schema!);
      console.log(`Validando ${file} contra diseño de registro ${m.schema}...`);
      const result = validateBoeFile(file, schemaPath);
      if (result.valid) {
        console.log("✓ Fichero BOE válido.");
        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            console.log(`  ⚠ ${w}`);
          }
        }
      } else {
        console.log("✗ Errores de validación:\n");
        for (const e of result.errors) {
          console.log(`  ✗ ${e}`);
        }
        process.exit(1);
      }
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

    console.log(`Modelo ${modelo}: ${m.name}\n`);
    console.log(`Formato:     ${m.format === "xml" ? "XML (ISO-8859-1)" : "BOE (texto posicional)"}`);

    if (m.format === "xml") {
      const xsdPath = join(dataDir(), m.xsd!);
      const dictPath = join(dataDir(), m.dict!);
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
    } else if (m.format === "boe") {
      const schemaPath = join(dataDir(), m.schema!);
      console.log(`Schema:      ${existsSync(schemaPath) ? schemaPath : "NO ENCONTRADO"}`);
      console.log(`Patrimonio:  ${m.patrimonioWebUrl}`);
      console.log(`\nFuentes AEAT:`);
      console.log(`  Diseño:  https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_Resto_Mod/DR714_2025.xls`);

      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
        const totalFields = schema.pages.reduce((sum: number, p: any) => sum + p.fields.length, 0);
        console.log(`\n  Páginas: ${schema.pages.length}`);
        console.log(`  Campos totales: ${totalFields}`);
      }
    }
  });

program.parse();
