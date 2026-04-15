#!/usr/bin/env node
// Test script to generate a minimal Modelo 714 BOE file with real data.
// For testing format and upload flow. Does NOT submit the declaration.

import { generate714Boe } from "../dist/aeat/generate-patrimonio.js";
import { validateBoeFile } from "../dist/aeat/validate-patrimonio.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outPath = resolve(__dirname, "..", "test-714-minimal.714");

const data = {
  declarante: {
    nif: "53407180F",
    apellidosNombre: "DE LA TORRE ALONSO JAVIER",
    sexo: "H",
    estadoCivil: "2", // casado
    fechaNacimiento: "07071979",
    tipoVia: "CALLE",
    nombreVia: "ALMENDROS",
    tipoNumeracion: "NUM",
    numeroCasa: "36",
    codigoPostal: "28221",
    municipio: "MAJADAHONDA",
    codigoProvincia: "28",
    provincia: "MADRID",
    nacionalidad: "0", // AEAT default: no consta
    regimenMatrimonio: "6", // separación de bienes
    codigoCA: "12", // Madrid
    tipoDeclaracion: "N", // negativa/saldo cero
  },
  viviendaHabitual: {
    clave: "P", // propiedad
    porcentajeTitularidad: 100.0,
    referenciaCatastral: "7613109VK2871S0001KK",
    situacion: "1", // territorio nacional
    valorUtilizado: "P", // precio de adquisición
    direccion: "CL ALMENDROS 36 MAJADAHONDA",
    valorComputar: 595000.0,
  },
};

console.log("Generando fichero BOE de prueba para Modelo 714...");
const buf = generate714Boe(data, outPath);
console.log(`✓ Fichero generado: ${outPath}`);
console.log(`  Tamaño: ${buf.length} bytes`);

console.log("\nValidando estructura...");
const schemaPath = resolve(__dirname, "..", "data", "DR714_2025.json");
const result = validateBoeFile(outPath, schemaPath);
if (result.valid) {
  console.log("✓ Fichero válido");
  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.log(`  ⚠ ${w}`);
  }
} else {
  console.log("✗ Errores:");
  for (const e of result.errors) console.log(`  ✗ ${e}`);
}

console.log("\n=== Verificación de posiciones clave (página 01) ===");
const content = buf.toString("latin1");
const p01Start = content.indexOf("<T71401000>");
const p01 = content.slice(p01Start, p01Start + 1100);
console.log(`Pos 13 (Tipo decl.):       [${p01[12]}]`);
console.log(`Pos 14-22 (NIF):           [${p01.slice(13, 22)}]`);
console.log(`Pos 662 (Nacionalidad):    [${p01[661]}]`);
console.log(`Pos 688-700 (Justificante):[${p01.slice(687, 700)}]`);
console.log(`Pos 701 (Régimen matrim):  [${p01[700]}]`);
console.log(`Pos 702-703 (CA):          [${p01.slice(701, 703)}]`);
console.log(`Pos 704 (Decl. comp):      [${p01[703]}]`);
