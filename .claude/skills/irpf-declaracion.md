---
name: irpf-declaracion
description: >
  Assist Spanish taxpayers with their IRPF Modelo 100 (declaración de la renta) using
  hacienda-cli. Use this skill when the user wants to: prepare their tax declaration,
  download their fiscal data from AEAT, generate the XML for Modelo 100, validate it
  against EDFI, review errors/warnings, or understand their tax situation. Triggers on
  mentions of: renta, IRPF, declaración, hacienda, modelo 100, datos fiscales, borrador,
  AEAT, casillas, or Spanish tax-related topics.
---

# IRPF Modelo 100 — Declaración de la Renta

Assist users in preparing their Spanish income tax declaration (IRPF Modelo 100) using `hacienda-cli`.

**CRITICAL**: Never present, sign, or submit the declaration. Only prepare and validate.

## Workflow

### Phase 1: Authentication and Data Download

1. Ask the user to run `hacienda login` in a terminal (opens browser for Cl@ve authentication)
2. Once authenticated, run `hacienda download 100`
3. This generates two files:
   - `datos-fiscales-100-2025.html` — Everything AEAT knows (employers, banks, brokers, properties)
   - `borrador-100-2025.pdf` — Current draft declaration with pre-loaded data

### Phase 2: Analyze Fiscal Data

Read both downloaded files. From the HTML, extract and present a summary:

- **Rendimientos del trabajo**: employers, gross income, withholdings
- **Capital mobiliario**: interest, dividends (by ISIN), withholdings
- **Ventas de activos**: stock sales (dates, amounts, gains — note: AEAT often lacks acquisition prices)
- **Fondos de inversión**: fund redemptions with gains and withholdings
- **Inmuebles**: properties, cadastral references, ownership percentages, days
- **Donativos**: donations with entity details
- **Préstamos**: mortgage data
- **Rentas extranjeras**: foreign income notices

Ask the user:
- Is anything missing? (Foreign broker operations like DEGIRO, crypto, private equity, rental income)
- Are there discrepancies with their records?
- Do they have additional documents (broker annual reports, sale contracts)?

### Phase 3: Gather Missing Data

For items NOT in datos fiscales (foreign brokers, private sales, etc.):
- Ask the user for PDFs, annual reports, or manual data
- For each operation, collect: acquisition date/price, transmission date/price, commissions
- For stock operations without IT/IA breakdown (only G/P known), use synthetic values: `IA = abs(G/P) + 1000`, `IT = IA + G/P`

### Phase 4: Generate XML

Read `CLAUDE.md` in the repo root for the complete XSD field mapping and technical reference.

Key rules:
- File encoding: **ISO-8859-1** (convert with `iconv -f UTF-8 -t ISO-8859-1`)
- Element order within TomaDatosAmpliada is strict (xs:sequence) — see CLAUDE.md for order
- `tipo_logico` = `"0"` or `"1"` (NOT "S"/"N")
- `tipo_SINO_Exclusivo` = `"SI"` or `"NO"`
- Dates: `dd/mm/yyyy`
- If married (ECIVIL=2), include `<Conyuge>` in DatosIdentificativos AND a second `<TomaDatosAmpliada titular="3">` with codigoCA
- B11/B13 elements need `valor="total"` attribute
- GPAcciones: G2B_DE = entity name (NOT ISIN), G2B_B = acquisition, G2B_C = gain
- GPOtrosElementos: FECHA1NA = transmission, FECHA2NA = acquisition (reversed!)
- Start with minimal Resultados (BLGGRAV=0, CDIF=0, RESULTADO=0) — EDFI will calculate the correct values

Generate the XML file and validate locally:
```bash
xmllint --schema data/Renta2025-fixed.xsd declaracion.xml --noout
```

### Phase 5: Upload and Iterate (ERES Cycle)

Convert to ISO-8859-1 and upload:
```bash
iconv -f UTF-8 -t ISO-8859-1 declaracion.xml > declaracion-latin1.xml
node scripts/edfi-upload.mjs declaracion-latin1.xml
```

The ERES cycle:
1. First upload with zeroed Resultados → EDFI returns ERES errors with calculated values
2. Parse ERES values: `ERES[FIELD_NAME] ... calculado el valor X`
3. Map ERES fields to the correct Resultados XML elements (see CLAUDE.md for mapping)
4. Update the Resultados section with calculated values
5. Re-upload → if more ERES appear, repeat; if accepted, done

Common non-ERES errors:
- **ENC**: File not ISO-8859-1. Convert with iconv.
- **EXML004**: Missing cónyuge data (NIF, birthdate, sex, CA required if married)
- **100R235**: FECHA1NA must be in 2025 (in GPOtrosElementos, FECHA1NA = transmission date)
- **100R545**: Don't set REGIMEN=1 in RendimientoTrabajo (it triggers pension plan validation)
- **E254**: Data value mismatch — the error shows expected vs declared values
- **100S040**: Missing catastral revision mark (C_REV field)

### Phase 6: Review Results

Once EDFI accepts the XML, present the user with:
- **Resultado individual** vs **conjunta** (EDFI calculates both)
- Breakdown: base general, base ahorro, cuota íntegra, deducciones, retenciones
- Which option is "MAS FAVORABLE"
- Any avisos (informational warnings)

Remind the user: this is a draft. To submit, they must do it manually through the AEAT website.

## Important Caveats

- AEAT data may have errors (wrong acquisition prices, missing foreign operations)
- Foreign brokers (DEGIRO, Interactive Brokers) don't report to AEAT — their data must be added manually
- Stock splits and corporate events affect acquisition prices but aren't reflected in broker annual reports
- Double taxation deductions (doble imposición internacional) require declaring foreign withholdings
- The declaration is NOT submitted by this tool — the user must review and present manually
