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

    console.log("Autentícate en la ventana del navegador (Cl@ve Móvil / PIN / certificado).");
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
      console.log("\n  Navegador abierto. Los demás comandos se conectan a él.");
      console.log("  Ciérralo con Ctrl+C cuando termines.\n");
      console.log("  Comandos disponibles (en otra terminal):");
      console.log("    hacienda download 100    # descarga borrador PDF");
      console.log("    hacienda upload 100 f.xml # importa XML en EDFI");
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

    // Handle beforeunload dialogs automatically
    page.on("dialog", (d) => d.accept().catch(() => {}));

    const outDir = resolve(opts.output);

    // ── Paso 1: Datos fiscales (HTML) ─────────────────────────────
    const datosFiscalesUrl = "https://www6.agenciatributaria.gob.es/wlpl/DFPA-D182/SvVisDF25Net";
    console.log("Descargando datos fiscales...");
    await page.goto(datosFiscalesUrl, { waitUntil: "networkidle" }).catch(() => {});

    // Detectar sesión caducada
    if (/SesionCaducada|ObtenerClave/i.test(page.url())) {
      console.error("✗ Sesión caducada. Ejecuta 'hacienda login' primero.");
      process.exit(1);
    }

    // Esperar a que cargue el contenido (buscar encabezado de datos fiscales)
    try {
      await page.locator("text=Consulta de Datos Fiscales").waitFor({ timeout: 15000 });
    } catch {
      console.error("✗ No se pudo cargar la página de datos fiscales.");
      console.error(`  URL actual: ${page.url()}`);
      process.exit(1);
    }

    // Extraer el HTML del contenido principal (sin cabecera/pie de la sede)
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

    // ── Paso 2: PDF del borrador ──────────────────────────────────
    console.log("Abriendo Renta WEB...");
    await page.goto(m.rentaWebUrl, { waitUntil: "networkidle" }).catch(() => {});

    // Si hay sesión previa, continuar; si no, nueva declaración
    const continuar = page.locator('button:has-text("Continuar sesión")');
    const nuevaDecl = page.locator('button:has-text("Nueva declaración")');
    try {
      await Promise.race([
        continuar.waitFor({ state: "visible", timeout: 10000 }),
        nuevaDecl.waitFor({ state: "visible", timeout: 10000 }),
      ]);
    } catch {
      // Puede que ya estemos en el resumen directamente
    }

    if (await continuar.isVisible().catch(() => false)) {
      console.log("Continuando sesión existente...");
      await continuar.click();
    } else if (await nuevaDecl.isVisible().catch(() => false)) {
      console.log("Iniciando nueva declaración...");
      await nuevaDecl.click();
    }

    // Esperar a que cargue el resumen
    console.log("Esperando a que cargue el borrador...");
    const vistaPrevia = page.locator("#VistapreviaXML");
    try {
      await vistaPrevia.waitFor({ state: "visible", timeout: 20000 });
    } catch {
      console.error("✗ No se encontró el botón 'Vista previa'.");
      console.error("  ¿Estás autenticado? Ejecuta 'hacienda login' primero.");
      console.error(`  URL actual: ${page.url()}`);
      process.exit(1);
    }

    // Click "Vista previa" para generar el PDF
    console.log("Generando vista previa PDF...");
    await vistaPrevia.click();

    // Esperar a que aparezca el iframe con el PDF
    const pdfIframe = page.locator('iframe[src*="PDFborrador.pdf"]');
    try {
      await pdfIframe.waitFor({ state: "attached", timeout: 20000 });
    } catch {
      console.error("✗ No se generó el PDF. Puede que haya errores en la declaración.");
      process.exit(1);
    }

    const pdfUrl = await pdfIframe.getAttribute("src");
    if (!pdfUrl) {
      console.error("✗ No se pudo obtener la URL del PDF.");
      process.exit(1);
    }

    // Descargar el PDF dentro del contexto del navegador (preserva cookies de sesión)
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
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    writeFileSync(pdfFile, pdfBuffer);
    console.log(`✓ Borrador PDF: ${pdfFile} (${Math.round(pdfBuffer.length / 1024)} KB)`);

    // Volver a la declaración
    const volver = page.locator('button:has-text("Volver a declaración")');
    if (await volver.isVisible({ timeout: 2000 }).catch(() => false)) {
      await volver.click();
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
