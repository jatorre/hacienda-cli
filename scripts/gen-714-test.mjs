#!/usr/bin/env node
// Test script to generate a minimal Modelo 714 BOE file with real data.
// This is for testing the format and upload flow ONLY.
// Does NOT submit the declaration.

import { generate714Boe } from "../dist/aeat/generate-patrimonio.js";
import { validateBoeFile } from "../dist/aeat/validate-patrimonio.js";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const outPath = resolve(__dirname, "..", "test-714-minimal.714");

const data = {
  declarante: {
    nif: "00000000T",
    apellidosNombre: "APELLIDO1 APELLIDO2 NOMBRE",
    sexo: "H",
    estadoCivil: "2", // casado
    fechaNacimiento: "01011980",
    tipoVia: "CALLE",
    nombreVia: "EJEMPLO",
    tipoNumeracion: "NUM",
    numeroCasa: "36",
    codigoPostal: "28000",
    localidad: "MADRID",
    municipio: "MADRID",
    codigoProvincia: "28",
    provincia: "MADRID",
    nacionalidad: "1", // española
    regimenMatrimonio: "6", // separación de bienes (asumido, cambiar si corresponde)
    codigoCA: "12", // Madrid
  },
  viviendaHabitual: {
    clave: "P", // propiedad
    porcentajeTitularidad: 100.0,
    referenciaCatastral: "0000000XX0000X0000XX",
    situacion: "1", // territorio nacional
    valorUtilizado: "P", // precio de adquisición
    direccion: "CL EJEMPLO 36 MADRID",
    valorComputar: 100000.0,
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
  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.log(`  ⚠ ${w}`);
  }
}

// Print hex dump of first 200 bytes and page 01 header region
console.log("\nPrimeros 100 bytes (envelope + inicio AUX):");
console.log(buf.slice(0, 100).toString("latin1"));

console.log("\nInicio de página 01 (pos 329 onwards, first 200 bytes):");
console.log(buf.slice(328, 528).toString("latin1"));
