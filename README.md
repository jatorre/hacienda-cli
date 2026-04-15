# hacienda-cli

> [!WARNING]
> Herramienta no oficial, sin ninguna relación con la AEAT.
>
> Se proporciona "tal cual", sin garantías de ningún tipo y sin asumir ninguna
> responsabilidad por errores, omisiones, rechazos, cálculos incorrectos,
> incidencias técnicas, pérdidas económicas, sanciones o incumplimientos
> fiscales derivados de su uso.
>
> Úsala bajo tu propio riesgo. No ofrece asesoramiento fiscal, legal ni
> contable. La revisión final, la interpretación fiscal de los datos y la
> presentación de la declaración son siempre responsabilidad exclusiva del
> usuario.
>
> Si no entiendes bien tu declaración o no puedes revisar manualmente el
> resultado, probablemente deberías usar software comercial o contratar un
> asesor fiscal.

CLI para reconciliar y preparar la declaración de la renta a partir de dos
fuentes de información:

- lo que tú o tu agente de IA habéis recopilado de bancos, brokers, exchanges,
  nóminas y otras fuentes
- lo que la AEAT ya sabe de ti y expone en sus pantallas y flujos oficiales

La idea del proyecto es cerrar un hueco muy concreto: un agente puede organizar
excelentemente tus operaciones y documentos, pero sin acceso práctico a los
datos fiscales de la AEAT ni al flujo de validación EDFI no puede dejar la
declaración realmente reconciliada. Este CLI sirve para eso.

No calcula "la renta correcta", no decide qué debes declarar y no presenta la
declaración por ti. Extrae, contrasta, valida y deja el trabajo preparado para
que tú lo revises y, si procede, lo presentes manualmente en la AEAT.

## Qué hace

| Comando | Descripción |
|---------|-------------|
| `hacienda login` | Abre un navegador para autenticarte con **Cl@ve** |
| `hacienda download 100` | Descarga tus datos fiscales (HTML) y el borrador actual (PDF) |
| `hacienda upload 100 decl.xml` | Importa un XML en el flujo EDFI de la AEAT |
| `hacienda validate 100 decl.xml` | Valida el XML contra el XSD oficial en local (`xmllint`) |
| `hacienda info 100` | Muestra rutas al XSD, diccionario y URLs relevantes |

## Qué no hace

- No presenta, firma ni envía la declaración.
- No ofrece asesoramiento fiscal ni recomendaciones sobre qué criterio aplicar.
- No garantiza que un XML aceptado por EDFI sea fiscalmente correcto.
- No sustituye a un asesor fiscal ni a un revisor humano.
- No fusiona mágicamente tu información con la de AEAT: te da herramientas para
  contrastarlas y preparar el XML.

## Autenticación

La autenticación soportada por diseño es **Cl@ve**. No se soporta certificado
digital en el flujo documentado de esta herramienta.

El navegador se deja abierto a propósito para reutilizar la sesión en
`download` y `upload`. La herramienta no presenta por ti precisamente para
reducir superficie de riesgo: el último paso siempre lo haces tú manualmente.

## Flujo recomendado

```text
1. hacienda login
2. hacienda download 100
3. Tu agente o tú analizáis:
   - datos-fiscales-100-2025.html
   - borrador-100-2025.pdf
   - documentación externa: bancos, brokers, exchanges, etc.
4. Generáis un XML conforme al XSD oficial
5. hacienda validate 100 decl.xml
6. hacienda upload 100 decl.xml
7. Revisas el resultado en el navegador
8. Si todo cuadra, decides tú si presentarlo manualmente en la AEAT
```

Casos en los que más aporta:

- compras y ventas de acciones con múltiples brokers
- fondos y ETFs
- dividendos e intereses
- criptomonedas
- consolidación de información dispersa en varias plataformas
- reconciliación entre tus registros y los datos que ya aparecen en la AEAT

## Para quién es

Encaja bien si:

- eres un usuario técnico o trabajas con un agente de IA que te ayuda a
  estructurar datos
- entiendes que esto prepara y valida, pero no sustituye la revisión humana
- necesitas contraste con AEAT antes de terminar la declaración

Probablemente no encaja si:

- buscas una solución de "un clic"
- no vas a revisar manualmente el resultado
- necesitas asesoramiento fiscal sobre interpretación normativa

## Instalación

```bash
git clone https://github.com/jatorre/hacienda-cli.git
cd hacienda-cli
npm install
npm run build
npm link
```

Requisitos:

- Node.js >= 20
- `xmllint` para `validate`
- Chromium instalado por Playwright

## Privacidad y seguridad

- `download` genera ficheros locales con información fiscal sensible:
  `datos-fiscales-100-2025.html` y `borrador-100-2025.pdf`.
- `upload` envía a la AEAT exclusivamente el XML que tú decidas importar.
- El proyecto no necesita presentar ni firmar la declaración para cumplir su
  propósito.
- Si compartes HTML, PDF o XML con Claude, ChatGPT u otro proveedor externo de
  IA, esa decisión y ese riesgo de privacidad son tuyos, no del CLI.
- Un XML aceptado por EDFI solo significa que pasó ese flujo de importación y
  validación; no certifica que la declaración sea correcta ni completa.

## Datos incluidos

El repositorio incluye los esquemas oficiales de la AEAT para la campaña 2025:

**Modelo 100 (IRPF):**
- `data/Renta2025.xsd` — XSD oficial
- `data/Renta2025-fixed.xsd` — variante adaptada para `xmllint`
- `data/diccionarioXSD_2025.properties` — diccionario de campos y etiquetas

**Modelo 714 (Patrimonio):**
- `data/DR714_2025.xls` — Diseño de registro oficial (formato BOE posicional)
- `data/DR714_2025.json` — Esquema parseado del XLS para uso programático

Fuentes oficiales:

- [XSD Modelo 100](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/Renta2025.xsd)
- [Diccionario Modelo 100](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/diccionarioXSD_2025.properties)
- [Documentación EDFI](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/renta-ayuda-tecnica/presentar-declaracion-mediante-fichero-generado-externo.html)
- [Diseño registro Modelo 714](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_Resto_Mod/DR714_2025.xls)
- [Documentación Patrimonio WEB](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/funcionamiento-manejo-patrimonio-web.html)

## Modelos soportados

| Modelo | Descripción | Formato | Estado |
|--------|-------------|---------|--------|
| `100` | IRPF / Declaración de la Renta | XML (ISO-8859-1) | Funcional |
| `714` | Impuesto sobre el Patrimonio | BOE (texto posicional) | En desarrollo |

El Modelo 100 usa XML contra XSD vía EDFI. El Modelo 714 usa formato BOE
(fichero posicional de ancho fijo) importado directamente en Patrimonio WEB.

## Limitaciones conocidas

- **No es una API oficial**: automatiza flujos web existentes de la AEAT.
- **Headless no funciona**: la AEAT detecta navegadores headless.
- **La sesión se vincula al navegador vivo**: `login` deja Chromium abierto y
  `download`/`upload` se conectan vía CDP.
- **Solo cubre lo que la AEAT expone en esos flujos**.
- **No se puede descargar el borrador como XML**: la AEAT permite importar XML,
  pero no exportar el borrador en ese formato.
- **EDFI recalcula resultados**: un XML estructuralmente válido puede ser
  rechazado si los importes de `Resultados` no cuadran con el cálculo del
  servidor.
- **El XML debe ir en ISO-8859-1**.
- **Puede romperse si la AEAT cambia URLs, selectores o comportamiento web**.

## Cómo funciona internamente

La AEAT expone dos aplicaciones web separadas para Renta:

- **Renta WEB** (`/PARE-RW25/CONT/`) para revisar el borrador y la vista previa
- **EDFI** (`/PARE-RW25/EDFI/`) para importar y validar XML

El CLI:

- usa `download` para obtener datos fiscales (HTML) y borrador (PDF)
- usa `upload` para importar un XML al flujo EDFI y devolver errores/avisos
- usa `validate` para una comprobación local previa contra el XSD

## Licencia

AGPL-3.0-or-later
