// Gestión del navegador Chromium para interactuar con la sede AEAT.
// La AEAT rechaza headless — siempre headed.
// login lanza el proceso; download/upload se conectan via CDP.

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";

function appDataDir(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "hacienda-cli");
    case "win32":
      return join(home, "AppData", "Roaming", "hacienda-cli");
    default:
      return join(home, ".config", "hacienda-cli");
  }
}

const APP_DIR = appDataDir();
const PROFILE_DIR = join(APP_DIR, "aeat-profile");
const CDP_PORT_FILE = join(PROFILE_DIR, ".cdp-port");
const CDP_PORT = 9223;

mkdirSync(PROFILE_DIR, { recursive: true });

let context: BrowserContext | null = null;
let page: Page | null = null;
let connectedBrowser: Browser | null = null;

/** Lanza Chromium con CDP. Usado por `hacienda login`. */
export async function launchBrowser(opts?: { headed?: boolean }): Promise<{ context: BrowserContext; page: Page }> {
  if (context && page && !page.isClosed()) return { context, page };

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      `--remote-debugging-port=${CDP_PORT}`,
    ],
  });

  writeFileSync(CDP_PORT_FILE, String(CDP_PORT));
  page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/** Se conecta al Chromium ya abierto via CDP. */
export async function ensureBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  if (context && page && !page.isClosed()) return { context, page };

  if (existsSync(CDP_PORT_FILE)) {
    const port = parseInt(readFileSync(CDP_PORT_FILE, "utf8").trim(), 10);
    try {
      connectedBrowser = await chromium.connectOverCDP(`http://localhost:${port}`);
      const contexts = connectedBrowser.contexts();
      context = contexts[0] ?? null;
      if (context) {
        page = context.pages()[0] ?? (await context.newPage());
        return { context, page };
      }
    } catch {
      try { unlinkSync(CDP_PORT_FILE); } catch {}
    }
  }

  console.error("No hay navegador abierto. Ejecuta 'hacienda login' primero.");
  process.exit(1);
}

/** Desconecta del navegador sin cerrarlo. Permite que el proceso node termine. */
export async function disconnectBrowser(): Promise<void> {
  if (connectedBrowser) {
    connectedBrowser.close().catch(() => {});
    connectedBrowser = null;
  }
  context = null;
  page = null;
}

export async function closeBrowser(): Promise<void> {
  await disconnectBrowser();
  try { unlinkSync(CDP_PORT_FILE); } catch {}
}

export async function getSessionStatus(): Promise<{
  authenticated: boolean;
  currentUrl: string | null;
}> {
  if (!context || !page || page.isClosed()) {
    return { authenticated: false, currentUrl: null };
  }
  const url = page.url();
  const notOnLogin = !/ObtenerClave|login|MOVI-P24H|SesionCaducada/i.test(url);
  const cookies = await context.cookies("https://www6.agenciatributaria.gob.es");
  const hasSession = cookies.some((c) => c.name.includes("JSESSIONID"));
  return { authenticated: hasSession && notOnLogin, currentUrl: url };
}
