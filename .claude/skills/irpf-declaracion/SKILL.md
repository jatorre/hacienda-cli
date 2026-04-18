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

Ask the user about common items that AEAT does NOT have:
- **Foreign brokers** (DEGIRO, Interactive Brokers, eToro, Trading 212, XTB, Revolut) — stock/ETF operations
- **Crypto** (Binance, Coinbase, Kraken, Bit2Me, Crypto.com) — sales, swaps, staking
- **Rental income** — if they rent out properties
- **Private equity / SAFEs** — startup investments, acquisitions
- **Foreign employment income** — work abroad during the year
- **Pension plan contributions** — for base imponible reduction
- Are there discrepancies with their records?
- Do they have additional documents (broker annual reports, sale contracts)?

### Phase 3: Gather Missing Data

For items NOT in datos fiscales (foreign brokers, private sales, etc.):
- Ask the user for PDFs, annual reports, or manual data
- For each operation, collect: acquisition date/price, transmission date/price, commissions
- For stock operations without IT/IA breakdown (only G/P known), use synthetic values: `IA = abs(G/P) + 1000`, `IT = IA + G/P`

Common scenarios by platform:
- **DEGIRO/IBKR**: Annual report PDF with G/P by ISIN → GPAcciones
- **Binance/Coinbase**: Transaction history CSV → GPOtrosCriptomonedas (FIFO method)
- **Rental income**: Monthly rent × 12, deductible expenses (IBI, community, insurance, repairs) → InmuebleArrendado
- **Pension plans**: Annual certificate from the plan manager → IEIP in RendimientoTrabajo + RedBaseImponible
- **Property sale**: Notarial deed with acquisition/transmission values → GPOtrosInmuebles

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

## Common Tax Scenarios

### Typical salaried employee
Work income + bank interest + maybe a fund or stocks via Spanish broker. Most data precargado. Quick.

### Investor with foreign brokers (DEGIRO, IBKR, eToro)
All foreign operations must be added manually. Ask for the annual report PDF. Key: AEAT won't have acquisition prices for stocks bought through foreign brokers.

### Crypto trader
Every sale AND every swap (crypto-to-crypto) is a taxable event. FIFO method required. Can be hundreds of operations — suggest using transaction history CSV and aggregating by coin.

### Landlord (alquiler)
Rental income with deductible expenses. Reduction of 50-90% if tenant uses it as primary residence. Check if the area is a "zona tensionada" for the 90% reduction.

### Property sale
Acquisition value = purchase price + taxes + notary + registry. If inherited: value declared in succession tax. Capital gains may be exempt if reinvested in primary residence within 2 years.

### Autónomos (self-employed)
RegEstimaDirecta or RegEstimaObj sections. Complex — involves quarterly VAT/IRPF returns (models 303, 130). Beyond the scope of basic declaration help; suggest a tax advisor for this.

## Important Caveats

- AEAT data may have errors (wrong acquisition prices, missing foreign operations)
- Foreign brokers (DEGIRO, Interactive Brokers, eToro, etc.) don't report to AEAT — their data must be added manually
- Stock splits and corporate events affect acquisition prices but aren't reflected in broker annual reports
- Double taxation deductions require declaring foreign withholdings separately
- Crypto-to-crypto swaps are taxable events (not just crypto-to-fiat)
- If foreign assets exceed 50,000 EUR, Modelo 721 may be required (informative, not in Modelo 100)
- The declaration is NOT submitted by this tool — the user must review and present manually
- This is not tax advice — for complex situations, recommend a professional tax advisor (asesor fiscal)
