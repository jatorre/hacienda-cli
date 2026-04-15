import { writeFileSync } from "node:fs";

import { BoeBuffer, normalizeString } from "./boe-writer.js";

export interface DeclaranteData {
  nif: string;
  apellidosNombre: string;
  sexo: "H" | "M";
  estadoCivil: "1" | "2" | "3" | "4"; // 1=soltero, 2=casado, 3=viudo, 4=separado/divorciado
  fechaNacimiento: string; // DDMMYYYY
  // Domicilio
  tipoVia: string; // CALLE, PLAZA, etc (up to 5 chars)
  nombreVia: string;
  tipoNumeracion: string; // NUM, KM, etc
  numeroCasa: string;
  codigoPostal: string;
  /** Municipio (AEAT usa este campo para "MAJADAHONDA", no localidad). */
  municipio: string;
  codigoProvincia: string; // "01" to "52"
  provincia: string;
  nacionalidad?: "0" | "1" | "2"; // AEAT default is "0" (no consta)
  regimenMatrimonio?: "5" | "6" | "7"; // 5=gananciales, 6=separación, 7=otro
  codigoCA: string; // "01" to "19" (Madrid=12)
  /** Tipo de declaración: "I"=Ingreso, "N"=Negativa/saldo cero, "U"=Domiciliación, "T"=Transferencia. Required. */
  tipoDeclaracion?: "I" | "N" | "U" | "T";
}

export interface ViviendaHabitual {
  clave: "P" | "U"; // P=propiedad, U=usufructo
  porcentajeTitularidad: number; // 0-100, 2 decimals
  referenciaCatastral: string;
  situacion: "1" | "2" | "3" | "4" | "5";
  valorUtilizado: "V" | "A" | "P" | "C";
  direccion: string;
  valorComputar: number; // euros
}

export interface Declaracion714Data {
  declarante: DeclaranteData;
  viviendaHabitual?: ViviendaHabitual;
}

const PAGE_LENGTHS: Record<string, number> = {
  "01": 1100,
  "02": 1500,
  "03": 2000,
  "04": 3100,
  "05": 3100,
  "06": 1600,
  "07": 2100,
  "08": 2200,
  "09": 600,
  "10": 500,
  "11": 451,
};

function buildPage(pageNum: string, length: number): BoeBuffer {
  const buf = new BoeBuffer(length);
  buf.writeConstant(1, "<T");
  buf.write(3, 3, "714", "Num");
  buf.writeConstant(6, `${pageNum}000`);
  buf.writeConstant(11, ">");
  // Indicador de página complementaria (pos 12) — blank by default
  // End marker
  buf.writeConstant(length - 11, `</T714${pageNum}000>`);
  return buf;
}

function buildPage01(data: DeclaranteData): Buffer {
  const p = buildPage("01", PAGE_LENGTHS["01"]);

  // Tipo de declaración (pos 13, len 1) — OBLIGATORIO según AEAT.
  // "N" (Negativa/saldo cero) por defecto.
  p.write(13, 1, data.tipoDeclaracion ?? "N", "A");

  // NIF (pos 14, len 9)
  p.write(14, 9, data.nif.toUpperCase(), "An");

  // Apellidos y nombre (pos 23, len 80)
  p.write(23, 80, normalizeString(data.apellidosNombre), "A");

  // Ejercicio (pos 103, len 4)
  p.write(103, 4, "2025", "Num");

  // Periodo (pos 107, len 2)
  p.writeConstant(107, "0A");

  // Sexo (pos 109, len 1)
  p.write(109, 1, data.sexo, "A");

  // Estado civil (pos 110, len 1)
  p.write(110, 1, data.estadoCivil, "Num");

  // Fecha nacimiento (pos 111, len 8) DDMMYYYY
  p.write(111, 8, data.fechaNacimiento, "Num");

  // Discapacidad % (pos 119, len 2) — Num, ceros si no aplica
  p.write(119, 2, "0", "Num");

  // Clase discapacidad (pos 121, len 1) — Num, cero si no aplica
  p.write(121, 1, "0", "Num");

  // Domicilio
  p.write(122, 5, data.tipoVia.toUpperCase(), "A"); // Tipo vía (A = uppercase)

  // Código municipio INE (pos 127, len 5) — Num, ceros si no aplica
  p.write(127, 5, "0", "Num");

  p.write(132, 50, normalizeString(data.nombreVia), "An"); // Nombre vía
  p.write(182, 3, data.tipoNumeracion.toUpperCase(), "An"); // Tipo numeración
  if (data.numeroCasa) {
    p.write(185, 5, data.numeroCasa, "Num"); // Número casa
  }

  // Localidad (pos 248, len 30) — AEAT lo deja vacío, el dato va en Municipio
  // (no escribimos nada, queda en blancos por defecto)

  if (data.codigoPostal) {
    p.write(278, 5, data.codigoPostal, "Num"); // CP
  }

  // Código postal reservado AEAT (pos 283, len 5) — Num, ceros
  p.write(283, 5, "0", "Num");

  if (data.municipio) {
    p.write(288, 30, normalizeString(data.municipio), "An"); // Municipio
  }
  if (data.codigoProvincia) {
    p.write(318, 2, data.codigoProvincia, "Num"); // Código provincia
  }
  if (data.provincia) {
    p.write(320, 20, normalizeString(data.provincia), "An");
  }

  // Nacionalidad (pos 662, len 1) — Num, "0" si no consta
  p.write(662, 1, data.nacionalidad ?? "0", "Num");

  // Modalidades especiales tributación (pos 663-667, 5 chars total) — Num, ceros
  p.write(663, 1, "0", "Num"); // residencia fuera de España
  p.write(664, 1, "0", "Num"); // dejó de ser residente
  p.write(665, 2, "0", "Num"); // CA mayor bienes
  p.write(667, 1, "0", "Num"); // régimen especial art. 93 IRPF

  // N.º Justificante (pos 688, len 13) — Num, ceros
  p.write(688, 13, "0", "Num");

  // Régimen matrimonio (pos 701, len 1) — "5" gananciales, "6" separación, "7" otro
  if (data.regimenMatrimonio) {
    p.write(701, 1, data.regimenMatrimonio, "An");
  }

  // CA residencia (pos 702, len 2)
  p.write(702, 2, data.codigoCA, "Num");

  // Declaración complementaria (pos 704, len 1) — Num, "0" por defecto
  p.write(704, 1, "0", "Num");

  // Fecha declaración (todos Num, rellenar con ceros)
  p.write(766, 2, "0", "Num"); // Día
  p.write(778, 4, "0", "Num"); // Año

  // Campos reservados numéricos (pos 816-829, 14 chars) — Num, ceros
  // Estos aparecen como ceros en el export de AEAT
  p.write(816, 1, "0", "Num");
  p.write(817, 13, "0", "Num");

  return p.toBuffer();
}

function buildPage02(vivienda?: ViviendaHabitual): Buffer {
  const p = buildPage("02", PAGE_LENGTHS["02"]);

  if (!vivienda) {
    return p.toBuffer();
  }

  p.write(14, 1, vivienda.clave, "A");

  // % Titularidad — 5 chars numeric, XXXYY (e.g., 10000 = 100.00%)
  const pctStr = Math.round(vivienda.porcentajeTitularidad * 100).toString().padStart(5, "0");
  p.writeConstant(15, pctStr);

  p.write(20, 20, vivienda.referenciaCatastral.toUpperCase(), "An");
  p.write(40, 1, vivienda.situacion, "Num");
  p.write(41, 1, vivienda.valorUtilizado, "A");
  p.write(42, 33, normalizeString(vivienda.direccion), "An");
  p.write(75, 13, vivienda.valorComputar, "N");

  // Subtotal fields at end of A1 (pos 310, 13 bytes)
  p.write(310, 13, vivienda.valorComputar, "N");

  return p.toBuffer();
}

function buildPage09(): Buffer {
  const p = buildPage("09", PAGE_LENGTHS["09"]);
  // Fill all numeric positions with zeros. AEAT's export shows many consecutive zeros here.
  // For a minimal declaration with no wealth tax due (Madrid bonus), most fields are zero.
  // We fill positions 13 to 432 with zeros (approximate based on AEAT export).
  // This is conservative — the server will recalculate anyway.
  for (let i = 13; i <= 432; i++) {
    p.write(i, 1, "0", "Num");
  }
  return p.toBuffer();
}

function buildPage10(): Buffer {
  const p = buildPage("10", PAGE_LENGTHS["10"]);
  // Fill numeric positions with zeros
  for (let i = 13; i <= 350; i++) {
    p.write(i, 1, "0", "Num");
  }
  return p.toBuffer();
}

function buildPage11(): Buffer {
  const p = buildPage("11", PAGE_LENGTHS["11"]);
  // Document of income/devolution — for negativa/saldo cero, tipo=1 in pos 139
  // Fill leading numeric positions with zeros (AEAT shows ~95 zeros at start)
  for (let i = 13; i <= 108; i++) {
    p.write(i, 1, "0", "Num");
  }
  // "1" at pos 139 indicates negativa/saldo cero based on AEAT export
  p.write(139, 1, "1", "Num");
  return p.toBuffer();
}

function buildEnvelope(pages: Buffer[]): Buffer {
  // Envelope structure per page 00 spec:
  // Pos 1:  "<T714020250A0000>" (17 bytes)
  // Pos 18: "<AUX>" (5 bytes)
  // Pos 23-52: 30 blanks (RESERVADO AEAT)
  // Pos 53: Idioma (1 byte)
  // Pos 54-92: 39 blanks
  // Pos 93-96: Versión programa (4 bytes)
  // Pos 97-100: 4 blanks
  // Pos 101-109: NIF empresa desarrollo (9 bytes)
  // Pos 110-322: 213 blanks
  // Pos 323: "</AUX>" (6 bytes) — ends at pos 328
  // Pos 329 onwards: page content
  // Ends with "</T714020250A0000>" (18 bytes)

  const header = Buffer.alloc(328, 0x20);
  Buffer.from("<T714020250A0000>", "latin1").copy(header, 0);
  Buffer.from("<AUX>", "latin1").copy(header, 17);
  // Idioma (pos 53, 0-indexed 52)
  Buffer.from("E", "latin1").copy(header, 52);
  // Versión programa (pos 93, 0-indexed 92)
  Buffer.from("1.00", "latin1").copy(header, 92);
  // </AUX> at pos 323 (0-indexed 322)
  Buffer.from("</AUX>", "latin1").copy(header, 322);

  const footer = Buffer.from("</T714020250A0000>", "latin1");

  return Buffer.concat([header, ...pages, footer]);
}

/**
 * Generates a BOE-format Modelo 714 file.
 *
 * Key AEAT learnings from empirical testing:
 * - Only include pages that have data. AEAT's own export includes only pages
 *   01, 09, 10, 11 for a minimal declaration. Including empty pages 02-08
 *   may cause parser errors.
 * - Numeric fields must be filled with "0" when not used, NOT blanks.
 * - Tipo de declaración (pos 13) is mandatory: "N" for negativa/saldo cero.
 * - Fields for pages 09-11 should be pre-filled with zeros; the server recalculates.
 */
export function generate714Boe(data: Declaracion714Data, outPath: string): Buffer {
  const page01 = buildPage01(data.declarante);
  const page09 = buildPage09();
  const page10 = buildPage10();
  const page11 = buildPage11();

  const pages: Buffer[] = [page01];

  // Page 02 only if we have vivienda habitual or any inmueble data
  if (data.viviendaHabitual) {
    pages.push(buildPage02(data.viviendaHabitual));
  }

  // Pages 09, 10, 11 are always included (summary/liquidation/document)
  pages.push(page09, page10, page11);

  const envelope = buildEnvelope(pages);
  writeFileSync(outPath, envelope);
  return envelope;
}
