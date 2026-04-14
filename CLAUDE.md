# CLAUDE.md — hacienda-cli

## Qué es este proyecto

CLI para interactuar con la sede electrónica de la AEAT (Agencia Tributaria española).
Actualmente soporta el Modelo 100 (IRPF / declaración de la renta).

El CLI es deliberadamente mínimo: login, download, upload, validate. Toda la lógica
fiscal (generar el XML) es responsabilidad del agente AI, no del CLI.

## Comandos

```bash
hacienda login              # Abre Chromium, usuario se autentica, queda vivo
hacienda download 100       # Descarga borrador como PDF (vista previa desde Renta WEB)
hacienda upload 100 f.xml   # Importa XML en EDFI de la AEAT
hacienda validate 100 f.xml # Valida XML contra XSD oficial (offline, xmllint)
hacienda info 100           # Muestra XSD, diccionario, URLs
```

## Archivos clave

- `src/index.ts` — CLI (commander). 4 subcomandos + info.
- `src/browser.ts` — Playwright: launch (headed) + connect (CDP).
- `data/Renta2025.xsd` — XSD oficial de la AEAT (ISO-8859-1, 811KB).
- `data/Renta2025-fixed.xsd` — Versión con regex corregidos para xmllint.
- `data/diccionarioXSD_2025.properties` — Diccionario campo→xpath→tipo→label (4009 líneas).

## Cómo generar un XML válido

El XML debe conformar a `Renta2025.xsd`. Estructura raíz:

```xml
<Declaracion modelo="100" ejercicio="2025" periodo="0A" versionxsd="1.02">
  <Aux>
    <Idioma>E</Idioma>           <!-- E=castellano, C=catalán, G=gallego, V=valenciano -->
    <VERSION>1.02</VERSION>
  </Aux>
  <DatosIdentificativos>...</DatosIdentificativos>
  <AsignacionTributaria>...</AsignacionTributaria>   <!-- opcional -->
  <DatosEconomicos codigoCADeclaracion="12" TIPOTRIBUTACION="1">
    <TomaDatosAmpliada codigoCA="12" titular="2" nif="...">
      <RdtoTrabajo>...</RdtoTrabajo>
      <RdtoCapitalMobiliario>...</RdtoCapitalMobiliario>
      <Inmuebles>...</Inmuebles>
      <GPAcciones>...</GPAcciones>           <!-- ganancias acciones -->
      <GPOtrosInmuebles>...</GPOtrosInmuebles>
      <GPOtrosCriptomonedas>...</GPOtrosCriptomonedas>
      <!-- ... más secciones -->
    </TomaDatosAmpliada>
    <Resultados>...</Resultados>
  </DatosEconomicos>
</Declaracion>
```

### Valores clave para los enums

- **EstadoCivil**: 1=soltero, 2=casado, 3=viudo, 4=separado/divorciado
- **Sexo**: H=hombre, M=mujer
- **Titular**: 2=declarante, 3=cónyuge, 4-7=hijos
- **codigoCA** (comunidad autónoma): 01=Andalucía, 02=Aragón, 03=Asturias, 04=Baleares, 05=Canarias, 06=Cantabria, 07=C. La Mancha, 08=C. León, 09=Cataluña, 10=Extremadura, 11=Galicia, 12=Madrid, 13=Murcia, 16=La Rioja, 17=C. Valenciana, 18=Ceuta, 19=Melilla, 20=No residente
- **TIPOTRIBUTACION**: 1=individual, 2=conjunta

### Validación local

```bash
xmllint --schema data/Renta2025-fixed.xsd mi-declaracion.xml --noout
```

Usa `Renta2025-fixed.xsd` (no el original) porque el XSD de la AEAT tiene regex
con escapes incorrectos que xmllint no acepta.

## URLs de la AEAT

- EDFI (importar/exportar XML): `https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/EDFI/index.zul`
- Renta WEB (borrador interactivo): `https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/CONT/index.zul`
- Datos fiscales: `https://www6.agenciatributaria.gob.es/wlpl/DFPA-D182/SvVisDF25Net`
- XSD: `https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/Renta2025.xsd`

## Restricciones técnicas

- **Headless no funciona**: la AEAT detecta bots y redirige a login Cl@ve.
- **La sesión se vincula al proceso del navegador**: cerrar Chromium y reabrir pierde la sesión.
- **No hay API REST/SOAP** para el Modelo 100. Solo XML vía EDFI.
- El diccionario de campos está en ISO-8859-1 (latin1).

## Pendientes

- [x] `download 100` — descarga el borrador como PDF (vista previa de Renta WEB)
- [ ] `validate --remote` — subir a EDFI y capturar errores del servidor
- [x] Explorar si EDFI precarga datos fiscales → **NO**, EDFI solo valida XML importado
- [ ] Skill para agentes AI con el contexto del XSD + diccionario

## Descubrimientos de ingeniería inversa

- **No hay exportar XML**: ni Renta WEB ni EDFI ofrecen exportar el borrador como XML.
- **EDFI y Renta WEB son apps ZK independientes**: no comparten sesión/estado.
- **EDFI no precarga datos fiscales**: al importar XML con un NIF, no fusiona con datos fiscales del contribuyente.
- **Download = PDF**: el borrador se obtiene como PDF via "Vista previa" en Renta WEB. El PDF se sirve en un iframe temporal (`/zkau/view/.../PDFborrador.pdf`).
- **tipo_logico = "0"/"1"** (no "S"/"N"); **tipo_SINO_Exclusivo = "SI"/"NO"**.
- **EDFI valida Resultados**: rechaza XMLs donde los cálculos del servidor no coinciden con los declarados.
