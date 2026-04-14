# CLAUDE.md — hacienda-cli

## Qué es este proyecto

CLI para interactuar con la sede electrónica de la AEAT (Agencia Tributaria española).
Soporta el Modelo 100 (IRPF / declaración de la renta), campaña 2025.

El CLI es deliberadamente mínimo: login, download, upload, validate. Toda la lógica
fiscal (generar el XML) es responsabilidad del agente AI, no del CLI.

## Comandos

```bash
hacienda login              # Abre Chromium, usuario se autentica, queda vivo
hacienda download 100       # Descarga datos fiscales (HTML) + borrador (PDF)
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
- `scripts/edfi-upload.mjs` — Script auxiliar para subir XML a EDFI y capturar errores ERES.

## Cómo generar un XML válido

El XML debe conformar a `Renta2025.xsd` y estar codificado en **ISO-8859-1**.

### Estructura raíz

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<Declaracion modelo="100" ejercicio="2025" periodo="0A" versionxsd="1.02">
  <Aux>
    <Idioma>E</Idioma>
    <VERSION>1.02</VERSION>
  </Aux>
  <DatosIdentificativos>
    <Declarante>...</Declarante>
    <Conyuge>...</Conyuge>           <!-- si casado -->
    <Hijos PH18="SI">...</Hijos>    <!-- si tiene hijos menores -->
  </DatosIdentificativos>
  <AsignacionTributaria>             <!-- opcional -->
    <FINESSOCIALES>SI</FINESSOCIALES>
  </AsignacionTributaria>
  <DatosEconomicos codigoCADeclaracion="12" TIPOTRIBUTACION="1">
    <TomaDatosAmpliada titular="2" nif="..." codigoCA="12">
      <RdtoTrabajo>...</RdtoTrabajo>
      <RdtoCapitalMobiliario>...</RdtoCapitalMobiliario>
      <Inmuebles>...</Inmuebles>
      <GPFondos>...</GPFondos>
      <GPAcciones>...</GPAcciones>
      <GPOtrosInmuebles>...</GPOtrosInmuebles>      <!-- ANTES de GPOtrosElementos -->
      <GPOtrosElementos>...</GPOtrosElementos>
      <CalculoImpuesto>...</CalculoImpuesto>         <!-- doble imposición -->
      <AnexoA>...</AnexoA>                           <!-- donativos -->
    </TomaDatosAmpliada>
    <TomaDatosAmpliada titular="3" nif="..." codigoCA="12">
      <!-- cónyuge: vacío si tributación individual -->
    </TomaDatosAmpliada>
    <Resultados>...</Resultados>
  </DatosEconomicos>
</Declaracion>
```

### Tipos de datos clave

- **tipo_logico**: `"0"` o `"1"` (NO "S"/"N")
- **tipo_SINO_Exclusivo**: `"SI"` o `"NO"` (para PH18, C_REV, etc.)
- **tipo_Fecha**: `dd/mm/yyyy` (string, max 10 chars)
- **tipo_ImpPositivo**: decimal >= 0, 2 decimales
- **tipo_ImpNegativo**: decimal (puede ser negativo), 2 decimales
- **tipo_Nif**: 9 caracteres alfanuméricos
- **tipo_ApeNom**: mayúsculas + acentos, max 80 chars

### Valores clave para enums

- **EstadoCivil**: 1=soltero, 2=casado, 3=viudo, 4=separado/divorciado
- **Sexo**: H=hombre, M=mujer
- **Titular**: 2=declarante, 3=cónyuge, 4-7=hijos
- **codigoCA**: 01=Andalucía, 02=Aragón, 03=Asturias, 04=Baleares, 05=Canarias, 06=Cantabria, 07=C. La Mancha, 08=C. León, 09=Cataluña, 10=Extremadura, 11=Galicia, 12=Madrid, 13=Murcia, 16=La Rioja, 17=C. Valenciana, 18=Ceuta, 19=Melilla, 20=No residente
- **TIPOTRIBUTACION**: 1=individual, 2=conjunta
- **VINCUDLG** (hijos): A=ambos progenitores, B=solo declarante, C=solo cónyuge

### Secciones dentro de TomaDatosAmpliada

El orden de elementos es estricto (xs:sequence). Orden correcto:

1. `RdtoTrabajo` — Rendimientos del trabajo
2. `RdtoCapitalMobiliario` — Capital mobiliario (intereses, dividendos)
3. `Inmuebles` — Inmuebles (vivienda habitual, a disposición, arrendados)
4. `GPFondos` — Fondos de inversión (IIC no cotizadas)
5. `GPFondosCoti` — ETFs / SICAV cotizadas
6. `GPAcciones` — Acciones cotizadas (negociadas en mercados)
7. `GPDerechos` — Derechos de suscripción
8. `GPOtrosCriptomonedas` — Criptomonedas
9. `GPOtrosInmuebles` — Venta de inmuebles
10. `GPOtrosElementos` — Acciones NO negociadas, private equity
11. `GPOtrasGanancias` — Otras ganancias patrimoniales
12. `CalculoImpuesto` — Doble imposición internacional (DOBIMPINT)
13. `AnexoA` — Donativos, deducción vivienda, etc.

### Mapping de campos GPAcciones

```xml
<EntidadAccion>
  <G2B_DE>NOMBRE ENTIDAD</G2B_DE>           <!-- nombre, NO ISIN -->
  <G2B_A valor="57378.19">                   <!-- valor = total transmisión -->
    <ENTIDAD>NOMBRE ENTIDAD</ENTIDAD>
    <TRANSACCION>
      <IT>57378.19</IT>                      <!-- valor transmisión -->
      <IA>30513.83</IA>                      <!-- valor adquisición -->
    </TRANSACCION>
  </G2B_A>
  <G2B_B>30513.83</G2B_B>                   <!-- total adquisición -->
  <G2B_C>26864.36</G2B_C>                   <!-- ganancia (0 si pérdida) -->
  <G2B_D>26864.36</G2B_D>                   <!-- ganancia reducida -->
  <!-- O si hay pérdida: -->
  <G2B_E>2693.36</G2B_E>                    <!-- pérdida -->
  <G2B_F>2693.36</G2B_F>                    <!-- pérdida computable -->
</EntidadAccion>
```

### Subtotales en B11/B13 (capital mobiliario)

Los elementos B11 (intereses) y B13 (dividendos) necesitan un atributo `valor` con el subtotal:

```xml
<B11 valor="8327.72">
  <RegistroB11><IMP1DB11>6237.00</IMP1DB11><IMP2DB11>1185.00</IMP2DB11></RegistroB11>
  <RegistroB11><IMP1DB11>2090.72</IMP1DB11><IMP2DB11>397.24</IMP2DB11></RegistroB11>
</B11>
```

### GPFondos — campos dentro de cada Fondo

Cada Fondo necesita campos de totalización además de VT1/VAD1:
```xml
<Fondo>
  <VT1>126388.19</VT1>          <!-- valor transmisión -->
  <VAD1>119693.90</VAD1>         <!-- valor adquisición -->
  <RET>1271.92</RET>             <!-- retenciones -->
  <G2VTTF>126388.19</G2VTTF>    <!-- total transmisión (=VT1) -->
  <G2VATF>119693.90</G2VATF>    <!-- total adquisición (=VAD1) -->
  <G2GANF>6694.29</G2GANF>      <!-- ganancia -->
  <G2A_R0>6694.29</G2A_R0>      <!-- ganancia reducida -->
</Fondo>
```

### GPOtrosElementos (acciones no negociadas / private equity)

```xml
<ElementoPatrimonial>
  <OT2>1</OT2>                              <!-- acciones no negociadas -->
  <ONEROSANA>1</ONEROSANA>                   <!-- transmisión onerosa -->
  <FECHA1NA>12/09/2025</FECHA1NA>            <!-- FECHA TRANSMISIÓN (no adquisición!) -->
  <FECHA2NA>02/09/2022</FECHA2NA>            <!-- FECHA ADQUISICIÓN -->
  <IMP1VTNA>194168.36</IMP1VTNA>             <!-- valor transmisión -->
  <IMP1VANA>20000.00</IMP1VANA>              <!-- valor adquisición -->
  <F2ONEROSA>1</F2ONEROSA>                   <!-- flag onerosa (después del bloque NA) -->
  <G2DE>194168.36</G2DE>                     <!-- valor transmisión (resultado) -->
  <G2DF>20000.00</G2DF>                      <!-- valor adquisición (resultado) -->
  <G2DI>174168.36</G2DI>                     <!-- ganancia -->
  <G2NDEX>174168.36</G2NDEX>                 <!-- ganancia no exenta -->
  <G2DO>174168.36</G2DO>                     <!-- ganancia reducida -->
  <G2DP>174168.36</G2DP>                     <!-- ganancia imputable a 2025 -->
</ElementoPatrimonial>
```

**IMPORTANTE**: En GPOtrosElementos, FECHA1NA = transmisión, FECHA2NA = adquisición.
Esto es al revés que en GPOtrosInmuebles (donde FECHA1INMNA = adquisición).

### GPOtrosInmuebles (venta de inmuebles)

```xml
<ElementoInmueble>
  <G2DINMB valor="I">                        <!-- I=propiedad, O=otros derechos -->
    <EP1>1</EP1><TIPOIN1>1</TIPOIN1>
    <CLAVEIN>1</CLAVEIN>                     <!-- 1=con ref catastral -->
    <REFERENCIA>1234567AB1234C0001XY</REFERENCIA>
  </G2DINMB>
  <G2INMCL>1</G2INMCL>                       <!-- required -->
  <F2INMLUCRATIVA>1</F2INMLUCRATIVA>         <!-- herencia -->
  <G2DINMC valor="08/02/2006">               <!-- valor = fecha ADQUISICIÓN -->
    <LUCRATIVAINMNA>1</LUCRATIVAINMNA>
    <FECHA1INMNA>08/02/2006</FECHA1INMNA>    <!-- fecha adquisición -->
    <FECHA2INMNA>26/11/2025</FECHA2INMNA>    <!-- fecha transmisión -->
    <VTINMNA><IMP1VTINMNA>875.00</IMP1VTINMNA></VTINMNA>
    <VAINMNA><IMP1VAINMNA>875.00</IMP1VAINMNA></VAINMNA>
  </G2DINMC>
  <G2DINME>875.00</G2DINME>                  <!-- valor transmisión resultado -->
  <G2INMITR>875.00</G2INMITR>               <!-- importe real transmisión -->
  <G2DINMF>875.00</G2DINMF>                  <!-- valor adquisición resultado -->
  <G2INMIAO>875.00</G2INMIAO>                <!-- importe real adquisición -->
  <G2DINMG>0.00</G2DINMG>                   <!-- ganancia -->
</ElementoInmueble>
```

### Criptomonedas (GPOtrosCriptomonedas)

Plataformas comunes: Binance, Coinbase, Kraken, Bit2Me, Crypto.com.
Cada operación de venta/permuta es una transmisión patrimonial.

```xml
<GPOtrosCriptomonedas>
  <ElementoCriptomoneda>
    <CRIPTODE>BITCOIN</CRIPTODE>               <!-- descripción -->
    <CRIPTOVT>15000.00</CRIPTOVT>              <!-- valor transmisión -->
    <CRIPTOVA>10000.00</CRIPTOVA>              <!-- valor adquisición -->
    <CRIPTOG>5000.00</CRIPTOG>                 <!-- ganancia -->
    <!-- O si pérdida: -->
    <CRIPTOP>2000.00</CRIPTOP>                 <!-- pérdida -->
  </ElementoCriptomoneda>
</GPOtrosCriptomonedas>
```

Método FIFO obligatorio. Cada permuta cripto→cripto es una transmisión fiscalmente relevante.

### Alquiler de inmuebles (InmuebleArrendado)

Dentro de cada `<Inmueble>`, se puede declarar alquiler:

```xml
<Inmueble>
  <PC>100</PC>
  <CURBA>1</CURBA>
  <CL>1</CL>
  <RC>1234567AB1234C0001XY</RC>
  <CDIRECCION>CALLE EJEMPLO 1</CDIRECCION>
  <VACATOT>150000.00</VACATOT>
  <InmuebleArrendado>
    <USOARR>1</USOARR>
    <DatosArrendamiento>
      <C_DIASARR>365</C_DIASARR>
      <Arrendamiento>
        <ElemTAR><TAR1>1</TAR1></ElemTAR>      <!-- vivienda habitual del inquilino -->
        <V02II>12000.00</V02II>                 <!-- ingresos íntegros anuales -->
        <V02RET>0.00</V02RET>                   <!-- retenciones -->
        <V02GCOM>800.00</V02GCOM>               <!-- gastos comunidad -->
        <V02PRIMCONTRA>400.00</V02PRIMCONTRA>   <!-- seguros -->
        <V02TASA>500.00</V02TASA>               <!-- IBI y tasas -->
        <V02OG>1200.00</V02OG>                  <!-- otros gastos deducibles -->
      </Arrendamiento>
    </DatosArrendamiento>
  </InmuebleArrendado>
</Inmueble>
```

Reducción del 50-90% del rendimiento neto si es vivienda habitual del inquilino
(depende del contrato y zona tensionada).

### Planes de pensiones (reducción base imponible)

Las aportaciones a planes de pensiones reducen la base imponible general.
Van dentro de `RendimientoTrabajo`:

```xml
<RendimientoTrabajo>
  <IDII>50000.00</IDII>
  <IDRE>10000.00</IDRE>
  <IEIP>1500.00</IEIP>       <!-- contribuciones empresariales a planes de pensiones -->
  <REGIMEN>1</REGIMEN>        <!-- solo si hay aportaciones del promotor -->
  <GSS>3000.00</GSS>
</RendimientoTrabajo>
```

Límite anual: 1.500 EUR aportaciones individuales + 8.500 EUR contribuciones empresariales.

### Doble imposición internacional (DOBIMPINT)

Para dividendos y ganancias extranjeros con retención en origen:

```xml
<CalculoImpuesto>
  <CuotaAutoliquidacion>
    <DOBIMPINT>
      <!-- Base del ahorro: rendimientos capital mobiliario extranjero -->
      <VRBE1>
        <RDTAHVRBE1>1755.90</RDTAHVRBE1>       <!-- renta bruta -->
        <IEXAHVRBE1>290.89</IEXAHVRBE1>         <!-- impuesto pagado en extranjero -->
      </VRBE1>
      <!-- Base general: rendimientos trabajo en extranjero -->
      <VRBG1>
        <RTEXVRBG1>5000.00</RTEXVRBG1>          <!-- rendimiento neto trabajo extranjero -->
        <IEXGVRBG1>750.00</IEXGVRBG1>           <!-- impuesto pagado -->
      </VRBG1>
    </DOBIMPINT>
  </CuotaAutoliquidacion>
</CalculoImpuesto>
```

Máximo 3 entradas por tipo (VRBE1-3 para ahorro, VRBG1-3 para general).

## Plataformas y brokers comunes

### Reportan a la AEAT (datos precargados en datos fiscales)
- Bancos españoles: BBVA, Santander, CaixaBank, Bankinter, ING, Openbank
- Brokers españoles: Renta 4, Andbank/Inversis, Self Bank
- Fondos: Indexa Capital, MyInvestor, Finizens (vía gestora)

### NO reportan a la AEAT (hay que añadir manualmente)
- **DEGIRO** (Países Bajos) — acciones, ETFs. Informe Anual con G/P por ISIN.
- **Interactive Brokers** (EEUU/Irlanda) — acciones, opciones, futuros.
- **eToro** (Chipre) — acciones, CFDs, cripto.
- **Trading 212** (Bulgaria) — acciones, CFDs.
- **XTB** (Polonia) — acciones, CFDs.
- **Revolut** (Lituania) — acciones, cripto.
- **Binance, Coinbase, Kraken** — criptomonedas.
- **Bit2Me** (España, pero no siempre precargado) — criptomonedas.

Para brokers extranjeros: las operaciones van en GPAcciones con IT/IA.
Si solo se tiene la G/P neta (sin desglose IT/IA), usar valores sintéticos:
`IA = abs(G/P) + 1000`, `IT = IA + G/P`.

## Ciclo iterativo para Resultados (ERES)

EDFI recalcula TODAS las casillas del servidor y rechaza el XML si los Resultados
no coinciden. Para obtener los valores correctos:

1. Sube el XML con Resultados en valores mínimos (BLGGRAV=0, CDIF=0, RESULTADO=0)
2. EDFI devuelve errores ERES con el valor calculado para cada casilla
3. Pon esos valores en la sección Resultados del XML
4. Resube → si quedan ERES, repite; si no, aceptado

Los ERES tienen el formato:
```
ERES[CAMPO] ... se ha calculado el valor X y en la declaración no se encontró ningún valor
```

Script auxiliar: `node scripts/edfi-upload.mjs mi-declaracion.xml`

### Resultados mínimos para XSD válido

```xml
<Resultados>
  <BaseLiquidableRes><BLGGRAV>0.00</BLGGRAV></BaseLiquidableRes>
  <CalculoImpuestoRes>
    <CuotaDiferencialRes><CDIF>0.00</CDIF></CuotaDiferencialRes>
    <RESULTADO>0.00</RESULTADO>
  </CalculoImpuestoRes>
</Resultados>
```

## URLs de la AEAT

- EDFI (importar XML): `https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/EDFI/index.zul`
- Renta WEB (borrador): `https://www6.agenciatributaria.gob.es/wlpl/PARE-RW25/CONT/index.zul`
- Datos fiscales: `https://www6.agenciatributaria.gob.es/wlpl/DFPA-D182/SvVisDF25Net`
- XSD oficial: `https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/Renta2025.xsd`

## Restricciones técnicas

- **Headless no funciona**: la AEAT detecta bots y redirige a login Cl@ve.
- **La sesión se vincula al proceso del navegador**: cerrar Chromium y reabrir pierde la sesión.
- **No hay API REST/SOAP** para el Modelo 100. Solo XML vía EDFI.
- **No hay exportar XML**: ni Renta WEB ni EDFI permiten exportar el borrador como XML.
- **EDFI no precarga datos fiscales**: al importar XML con un NIF, no fusiona con datos fiscales.
- **EDFI y Renta WEB son apps ZK independientes**: no comparten sesión/estado.
- El fichero XML debe ser **ISO-8859-1** (no UTF-8). Convertir con `iconv -f UTF-8 -t ISO-8859-1`.
- El diccionario de campos está en ISO-8859-1 (latin1).

### Validación local

```bash
xmllint --schema data/Renta2025-fixed.xsd mi-declaracion.xml --noout
```

Usa `Renta2025-fixed.xsd` (no el original) porque el XSD de la AEAT tiene regex
con escapes incorrectos que xmllint no acepta.
