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
  localidad: string;
  municipio: string;
  codigoProvincia: string; // "01" to "52"
  provincia: string;
  nacionalidad: "0" | "1" | "2"; // 0=no consta, 1=española, 2=otra
  regimenMatrimonio?: "5" | "6" | "7"; // 5=gananciales, 6=separación, 7=otro
  codigoCA: string; // "01" to "19"
  fechaDeclaracionLocalidad?: string;
  fechaDeclaracionDia?: string;
  fechaDeclaracionMes?: string;
  fechaDeclaracionAnyo?: string;
}

export interface ViviendaHabitual {
  clave: "P" | "U"; // P=propiedad, U=usufructo
  porcentajeTitularidad: number; // 0-100, 2 decimals
  referenciaCatastral: string;
  situacion: "1" | "2" | "3" | "4" | "5"; // 1=en territorio nacional excepto País Vasco/Navarra
  valorUtilizado: "V" | "A" | "P" | "C"; // V=valor catastral, A=admin, P=precio adq, C=construcción
  direccion: string;
  valorComputar: number; // euros
}

export interface Deposito {
  descripcion: string; // tipo y entidad
  saldo31Dic: number;
  saldoMedio?: number;
}

export interface Declaracion714Data {
  declarante: DeclaranteData;
  viviendaHabitual?: ViviendaHabitual;
  depositos?: Deposito[];
  // Add more sections as needed
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
  // Wrapper fields common to all pages
  buf.writeConstant(1, "<T");
  buf.write(3, 3, "714", "Num");
  buf.writeConstant(6, `${pageNum}000`);
  buf.writeConstant(11, ">");
  // Indicador de página complementaria (pos 12) — blank by default
  // End marker will be written last
  buf.writeConstant(length - 11, `</T714${pageNum}000>`);
  return buf;
}

function buildPage01(data: DeclaranteData): Buffer {
  const p = buildPage("01", PAGE_LENGTHS["01"]);

  // Tipo declaración — blank for now (could be "I" for ingreso, "U" domiciliación, etc)
  // pos 13, len 1

  // NIF (pos 14, len 9)
  p.write(14, 9, data.nif.toUpperCase(), "An");

  // Apellidos y nombre (pos 23, len 80)
  p.write(23, 80, normalizeString(data.apellidosNombre), "A");

  // Ejercicio (pos 103, len 4) — constant 2025
  p.write(103, 4, "2025", "Num");

  // Periodo (pos 107, len 2) — constant 0A
  p.writeConstant(107, "0A");

  // Sexo (pos 109, len 1)
  p.write(109, 1, data.sexo, "A");

  // Estado civil (pos 110, len 1)
  p.write(110, 1, data.estadoCivil, "Num");

  // Fecha nacimiento (pos 111, len 8) DDMMYYYY
  p.write(111, 8, data.fechaNacimiento, "Num");

  // Domicilio
  p.write(122, 5, data.tipoVia.toUpperCase(), "A"); // Tipo vía
  p.write(132, 50, normalizeString(data.nombreVia), "An"); // Nombre vía
  p.write(182, 3, data.tipoNumeracion.toUpperCase(), "An"); // Tipo numeración
  if (data.numeroCasa) {
    p.write(185, 5, data.numeroCasa, "Num"); // Número casa
  }
  if (data.codigoPostal) {
    p.write(278, 5, data.codigoPostal, "Num"); // CP
  }
  if (data.localidad) {
    p.write(248, 30, normalizeString(data.localidad), "An"); // Localidad
  }
  if (data.municipio) {
    p.write(288, 30, normalizeString(data.municipio), "An"); // Municipio
  }
  if (data.codigoProvincia) {
    p.write(318, 2, data.codigoProvincia, "Num"); // Código provincia
  }
  if (data.provincia) {
    p.write(320, 20, normalizeString(data.provincia), "An");
  }

  // Nacionalidad (pos 662, len 1)
  p.write(662, 1, data.nacionalidad, "Num");

  // N.º Justificante (pos 688, len 13) — zeros
  p.write(688, 13, "0", "Num");

  // Régimen matrimonio (pos 701, len 1)
  if (data.regimenMatrimonio) {
    p.write(701, 1, data.regimenMatrimonio, "An");
  }

  // CA residencia (pos 702, len 2)
  p.write(702, 2, data.codigoCA, "Num");

  // Declaración complementaria (pos 704, len 1) — 0
  p.write(704, 1, "0", "Num");

  // Fecha declaración
  if (data.fechaDeclaracionLocalidad) {
    p.write(746, 20, normalizeString(data.fechaDeclaracionLocalidad), "An");
  }
  if (data.fechaDeclaracionDia) {
    p.write(766, 2, data.fechaDeclaracionDia, "Num");
  }
  if (data.fechaDeclaracionMes) {
    p.write(768, 10, data.fechaDeclaracionMes.toUpperCase(), "A");
  }
  if (data.fechaDeclaracionAnyo) {
    p.write(778, 4, data.fechaDeclaracionAnyo, "Num");
  }

  return p.toBuffer();
}

function buildPage02(vivienda?: ViviendaHabitual): Buffer {
  const p = buildPage("02", PAGE_LENGTHS["02"]);

  if (!vivienda) {
    return p.toBuffer();
  }

  // A1 Vivienda habitual — First entry starts at pos 14
  // Layout per entry (8 fields per entry, 37 bytes each):
  //   Clave (1), % Titularidad (5), Ref catastral (20), Situación (1), Valor utilizado (1), Dirección (33), Valor (13)
  // First entry starts at pos 14

  p.write(14, 1, vivienda.clave, "A"); // Clave P/U

  // % Titularidad — 5 chars numeric, interpreted as XXX.XX (e.g., 10000 = 100.00%)
  const pctStr = Math.round(vivienda.porcentajeTitularidad * 100).toString().padStart(5, "0");
  p.writeConstant(15, pctStr);

  p.write(20, 20, vivienda.referenciaCatastral.toUpperCase(), "An"); // Ref catastral
  p.write(40, 1, vivienda.situacion, "Num"); // Situación
  p.write(41, 1, vivienda.valorUtilizado, "A"); // Valor utilizado
  p.write(42, 33, normalizeString(vivienda.direccion), "An"); // Dirección

  // Valor a computar (pos 75, len 13) — Amount in cents, right-aligned zero-padded
  p.write(75, 13, vivienda.valorComputar, "N");

  // Subtotal fields at end of A1 (positions 310, 323, 336)
  // These are totals that EDFI/Patrimonio WEB typically recalculates
  p.write(310, 13, vivienda.valorComputar, "N"); // Total A1 susceptible exención

  return p.toBuffer();
}

function buildPage04(depositos?: Deposito[]): Buffer {
  const p = buildPage("04", PAGE_LENGTHS["04"]);

  if (!depositos || depositos.length === 0) {
    return p.toBuffer();
  }

  // D. Bienes exentos afectos (pos 14-202, 12 entries × ~15.75 bytes) — skip
  // E. Depósitos bancarios (pos ~300+, 72 entries × ~40 bytes approx)
  // For now, a minimal placeholder — actual positions depend on schema extraction

  return p.toBuffer();
}

function buildPage09(): Buffer {
  // Resumen patrimonio neto — minimal, let server calculate
  return buildPage("09", PAGE_LENGTHS["09"]).toBuffer();
}

function buildPage10(): Buffer {
  // Liquidación — minimal
  return buildPage("10", PAGE_LENGTHS["10"]).toBuffer();
}

function buildPage11(): Buffer {
  // Ingreso/Devolución — minimal
  return buildPage("11", PAGE_LENGTHS["11"]).toBuffer();
}

function buildEnvelope(pages: Buffer[]): Buffer {
  // Envelope: <T714020250A0000><AUX>[30 blanks][idioma][...] [padding] </AUX>[pages]</T714020250A0000>
  // According to page 00 spec:
  // Pos 1:  "<T714020250A0000>" (17 bytes)
  // Pos 18: "<AUX>" (5 bytes)
  // Pos 23-52: 30 blanks
  // Pos 53: Idioma (1 byte)
  // Pos 54-92: 39 blanks
  // Pos 93-96: Versión programa (4 bytes)
  // Pos 97-100: 4 blanks
  // Pos 101-109: NIF empresa desarrollo (9 bytes)
  // Pos 110-322: 213 blanks
  // Pos 323: "</AUX>" (6 bytes)
  // Pos 329 onwards: page content
  // Ends with "</T714020250A0000>" (18 bytes)

  const header = Buffer.alloc(328, 0x20);
  Buffer.from("<T714020250A0000>", "latin1").copy(header, 0); // 17 bytes
  Buffer.from("<AUX>", "latin1").copy(header, 17); // 5 bytes, ends at pos 22
  // Idioma (pos 53, 0-indexed 52)
  Buffer.from("E", "latin1").copy(header, 52); // E = Castellano
  // Versión programa (pos 93, 0-indexed 92)
  Buffer.from("1.00", "latin1").copy(header, 92);
  // </AUX> at pos 323 (0-indexed 322)
  Buffer.from("</AUX>", "latin1").copy(header, 322);

  const footer = Buffer.from("</T714020250A0000>", "latin1");

  return Buffer.concat([header, ...pages, footer]);
}

export function generate714Boe(data: Declaracion714Data, outPath: string): Buffer {
  const page01 = buildPage01(data.declarante);
  const page02 = buildPage02(data.viviendaHabitual);
  const page04 = buildPage04(data.depositos);
  const page09 = buildPage09();
  const page10 = buildPage10();
  const page11 = buildPage11();

  // Pages 03, 05, 06, 07, 08 are empty for this minimal declaration
  const page03 = new BoeBuffer(PAGE_LENGTHS["03"]);
  page03.writeConstant(1, "<T");
  page03.write(3, 3, "714", "Num");
  page03.writeConstant(6, "03000");
  page03.writeConstant(11, ">");
  page03.writeConstant(PAGE_LENGTHS["03"] - 11, "</T71403000>");

  const page05 = new BoeBuffer(PAGE_LENGTHS["05"]);
  page05.writeConstant(1, "<T");
  page05.write(3, 3, "714", "Num");
  page05.writeConstant(6, "05000");
  page05.writeConstant(11, ">");
  page05.writeConstant(PAGE_LENGTHS["05"] - 11, "</T71405000>");

  const page06 = new BoeBuffer(PAGE_LENGTHS["06"]);
  page06.writeConstant(1, "<T");
  page06.write(3, 3, "714", "Num");
  page06.writeConstant(6, "06000");
  page06.writeConstant(11, ">");
  page06.writeConstant(PAGE_LENGTHS["06"] - 11, "</T71406000>");

  const page07 = new BoeBuffer(PAGE_LENGTHS["07"]);
  page07.writeConstant(1, "<T");
  page07.write(3, 3, "714", "Num");
  page07.writeConstant(6, "07000");
  page07.writeConstant(11, ">");
  page07.writeConstant(PAGE_LENGTHS["07"] - 11, "</T71407000>");

  const page08 = new BoeBuffer(PAGE_LENGTHS["08"]);
  page08.writeConstant(1, "<T");
  page08.write(3, 3, "714", "Num");
  page08.writeConstant(6, "08000");
  page08.writeConstant(11, ">");
  page08.writeConstant(PAGE_LENGTHS["08"] - 11, "</T71408000>");

  const envelope = buildEnvelope([
    page01,
    page02,
    page03.toBuffer(),
    page04,
    page05.toBuffer(),
    page06.toBuffer(),
    page07.toBuffer(),
    page08.toBuffer(),
    page09,
    page10,
    page11,
  ]);

  writeFileSync(outPath, envelope);
  return envelope;
}
