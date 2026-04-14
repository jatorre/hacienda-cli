# hacienda-cli

CLI para interactuar con la sede electrónica de la Agencia Tributaria (AEAT).
Permite descargar tus datos fiscales y subir declaraciones en formato XML oficial.

Pensado para que un agente de IA (Claude, ChatGPT, etc.) pueda ayudarte con tu
declaración de la renta generando el XML y validándolo contra la AEAT.

> **Nunca presenta, firma ni envía la declaración.** Eso siempre lo haces tú manualmente.

## Qué hace

| Comando | Descripción |
|---------|-------------|
| `hacienda login` | Abre un navegador para autenticarte con Cl@ve / certificado digital |
| `hacienda download 100` | Descarga tus datos fiscales (HTML) y el borrador (PDF) |
| `hacienda upload 100 decl.xml` | Importa un XML en el borrador de la AEAT vía EDFI |
| `hacienda validate 100 decl.xml` | Valida el XML contra el XSD oficial (offline, xmllint) |
| `hacienda info 100` | Muestra rutas al XSD, diccionario de campos y URLs |

## Flujo de uso

```
1. hacienda login                    # Te autenticas con Cl@ve
2. hacienda download 100             # Descargas lo que Hacienda sabe de ti
3. Tu agente AI lee los datos        # datos-fiscales-100-2025.html + borrador PDF
   y genera un XML conforme al XSD
4. hacienda validate 100 decl.xml    # Validación offline
5. hacienda upload 100 decl.xml      # Sube a EDFI, muestra errores/avisos
6. Tú revisas en el navegador        # Y decides si presentar (manualmente)
```

## Instalación

```bash
git clone https://github.com/jatorre/hacienda-cli.git
cd hacienda-cli
npm install
npx playwright install chromium
npm run build
npm link  # para usar 'hacienda' como comando global
```

Requisitos: Node.js >= 20, xmllint (para validate).

## Datos incluidos

El repositorio incluye los esquemas oficiales de la AEAT para la campaña 2025:

- `data/Renta2025.xsd` — Esquema XSD oficial (811 KB, 7.251 elementos)
- `data/Renta2025-fixed.xsd` — Versión con regex corregidos para xmllint
- `data/diccionarioXSD_2025.properties` — Diccionario de 4.009 campos con labels en español

Fuentes oficiales:
- [XSD](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/Renta2025.xsd)
- [Diccionario](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/diccionarioXSD_2025.properties)
- [Documentación EDFI](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/renta-ayuda-tecnica/presentar-declaracion-mediante-fichero-generado-externo.html)

## Modelos soportados

| Modelo | Descripción | Estado |
|--------|-------------|--------|
| 100    | IRPF (Declaración de la Renta) | Funcional |

Extensible a otros modelos (720, 303, etc.) añadiendo su XSD.

## Limitaciones conocidas

- **Headless no funciona**: la AEAT detecta navegadores headless. El CLI usa Playwright con ventana visible.
- **La sesión se vincula al proceso**: `login` deja el navegador abierto; `download`/`upload` se conectan vía CDP.
- **No existe API REST/SOAP** para el Modelo 100. El único canal es XML vía EDFI.
- **No se puede descargar el borrador como XML**: la AEAT solo permite importar XML, no exportar. El CLI descarga los datos fiscales (HTML) y la vista previa (PDF).
- **EDFI valida los Resultados**: el servidor recalcula todas las casillas y rechaza el XML si no coinciden. Hay que usar el ciclo iterativo (subir con zeros → leer errores ERES → corregir → resubir).
- El fichero XML debe estar codificado en **ISO-8859-1** (no UTF-8).

## Cómo funciona internamente

La AEAT tiene dos interfaces web para la Renta:

- **Renta WEB** (`/PARE-RW25/CONT/`) — El borrador interactivo con los datos fiscales precargados. ZK Framework SPA.
- **EDFI** (`/PARE-RW25/EDFI/`) — "Presentación mediante fichero". Solo importa XML y valida.

Son aplicaciones ZK independientes que no comparten estado. El CLI:
- `download` navega a Datos Fiscales (HTML server-rendered) y a Renta WEB (Vista Previa PDF)
- `upload` navega a EDFI, importa el XML, y espera el resultado

## Licencia

AGPL-3.0-or-later
