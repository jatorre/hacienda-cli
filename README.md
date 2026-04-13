# hacienda-cli

CLI para interactuar con la sede electrónica de la Agencia Tributaria (AEAT).
Descarga y sube declaraciones en formato XML oficial.

> **Nunca presenta, firma ni envía la declaración.**

## Qué hace

- **`hacienda login`** — Abre un navegador para autenticarte con Cl@ve o certificado digital.
- **`hacienda download 100`** — Descarga tu declaración actual como XML.
- **`hacienda upload 100 declaracion.xml`** — Importa un XML en el borrador de la AEAT.
- **`hacienda validate 100 declaracion.xml`** — Valida el XML contra el XSD oficial (offline).
- **`hacienda info 100`** — Muestra rutas al XSD, diccionario de campos, y URLs.

## Cómo funciona

La AEAT publica el esquema XSD oficial del Modelo 100 (`Renta2025.xsd`) y acepta
importar ficheros XML conformes a ese esquema vía la interfaz EDFI ("Presentación
mediante fichero"). Este CLI automatiza ese flujo.

Un agente de IA (Claude, etc.) puede:
1. Leer tus documentos fiscales (PDFs, notas, extractos).
2. Generar un XML válido contra `Renta2025.xsd` usando el diccionario de campos.
3. Tú ejecutas `hacienda upload 100 declaracion.xml` para cargarlo en la AEAT.
4. Revisas el resultado en el navegador.

## Instalación

```bash
git clone https://github.com/jatorre/hacienda-cli.git
cd hacienda-cli
npm install
npx playwright install chromium
npm run build
npm link  # para usar 'hacienda' como comando global
```

## Uso

```bash
# 1. Autenticarte (abre navegador, queda abierto)
hacienda login

# 2. En otra terminal: subir una declaración
hacienda upload 100 mi-declaracion.xml

# 3. Validar offline antes de subir
hacienda validate 100 mi-declaracion.xml

# 4. Ver info del modelo
hacienda info 100
```

## Datos incluidos

- `data/Renta2025.xsd` — Esquema XSD oficial de la AEAT (811 KB, 7.251 elementos).
- `data/Renta2025-fixed.xsd` — Versión con regex corregidos para xmllint.
- `data/diccionarioXSD_2025.properties` — Diccionario de 4.009 campos con labels en español.

Fuentes:
- XSD: https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/Renta2025.xsd
- Diccionario: https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/diccionarioXSD_2025.properties
- Documentación: https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/renta-ayuda-tecnica/presentar-declaracion-mediante-fichero-generado-externo.html

## Arquitectura

```
Tu agente AI  →  genera XML conforme a Renta2025.xsd
                      ↓
              hacienda validate 100 declaracion.xml  (offline, xmllint)
                      ↓
              hacienda upload 100 declaracion.xml    (Playwright → EDFI)
                      ↓
              AEAT carga el XML en el borrador
                      ↓
              Tú revisas y decides si presentar (manualmente)
```

## Modelos soportados

| Modelo | Descripción | Estado |
|--------|------------|--------|
| 100    | IRPF (Renta) | Funcional |

Extensible a otros modelos (720, 303, etc.) añadiendo su XSD al registro.

## Limitaciones

- **Headless no funciona**: la AEAT detecta navegadores headless y redirige a login. El CLI usa Playwright headed (ventana visible).
- **La sesión del navegador no persiste** entre procesos: `login` y `upload`/`download` deben ejecutarse con el mismo proceso de Playwright vivo.
- **No existe API** REST/SOAP para el Modelo 100. El único canal es el XML vía EDFI.
- El XSD oficial tiene regex con escapes incorrectos. `Renta2025-fixed.xsd` los corrige para xmllint.

## Licencia

AGPL-3.0-or-later
