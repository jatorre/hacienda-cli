# Cómo he hecho la declaración de la renta con un agente de IA

Ha llegado la campaña de la renta. Y como cada año, el primer paso es el mismo:
recopilar información de todas partes. Bancos, brokers, plataformas de
inversión, fondos, inmuebles, nóminas. Si tienes una situación mínimamente
compleja, sabes que esto lleva días.

Para esa primera fase, un agente de IA ya es una maravilla. Le pasas todos los
documentos — extractos bancarios, informes anuales de DEGIRO o Interactive
Brokers, el borrador de Hacienda, los PDFs de datos fiscales — y el agente se
encarga de organizarlo todo en una carpeta. Extrae las cifras relevantes, las
cruza entre documentos, y va documentando en un fichero qué información tiene
disponible para cada casilla de la declaración.

Hasta aquí, genial.

## El verdadero problema

Te vas a la web de la Agencia Tributaria a meter toda esa información y te
encuentras con un formulario interminable. Si has vendido acciones en varios
brokers, tienes fondos de inversión, algún inmueble, dividendos extranjeros con
doble imposición... introducir todo eso manualmente en Renta Web es un ejercicio
de paciencia y una fuente casi garantizada de errores.

Además, no hay manera de saber si lo que has metido cuadra con lo que Hacienda
ya tiene hasta que terminas de rellenarlo todo. Y si te equivocas en una
casilla, puedes pasarte otra hora buscando dónde está el error.

## Lo que he construido: hacienda-cli

Este año decidí resolver ese cuello de botella. He creado
[hacienda-cli](https://github.com/jatorre/hacienda-cli), un programa de línea
de comandos que te permite interactuar directamente con la sede electrónica de
la AEAT desde tu terminal.

Lo que hace es sencillo:

- **`hacienda login`** — Abre un navegador, te autenticas con Cl@ve como
  harías normalmente.
- **`hacienda download 100`** — Descarga tus datos fiscales (lo que Hacienda
  ya sabe de ti) y el borrador actual.
- **`hacienda upload 100 declaracion.xml`** — Sube tu declaración en formato
  XML al sistema EDFI de la AEAT, que la valida y te devuelve errores o el
  resultado.
- **`hacienda validate 100 declaracion.xml`** — Validación offline contra el
  esquema XSD oficial.

## Por qué importa: cierra el loop con el agente

La potencia real aparece cuando combinas el CLI con un agente de IA. El flujo
completo queda así:

1. Recopilas toda tu documentación fiscal y se la pasas al agente.
2. El agente organiza la información, la reconcilia y genera un XML conforme al
   esquema oficial de la AEAT (más de 7.000 campos posibles, codificación
   ISO-8859-1, con un orden estricto de secciones).
3. Con el CLI, descargas lo que Hacienda ya tiene de ti. El agente lo compara
   con tus documentos y detecta discrepancias.
4. Subes el XML a Hacienda. EDFI lo valida, devuelve errores si faltan datos o
   no cuadran los cálculos.
5. El agente lee esos errores, corrige el XML y vuelve a subir. Ciclo
   iterativo hasta que cuadra.
6. Tú revisas el resultado final en la web de Hacienda y **tú decides si
   presentas**. El CLI nunca presenta ni firma nada por ti.

Lo que antes me llevaba una tarde entera de copiar cifras y verificar casillas,
se convirtió en un proceso donde el agente hacía el trabajo pesado y yo solo
revisaba y aprobaba.

## El CLI que Hacienda debería tener

En el fondo, `hacienda-cli` llena un hueco que no debería existir. Si la AEAT
tuviera una API o interfaz programática para interactuar con el sistema de
declaraciones, herramientas como esta no harían falta. Cualquier software
comercial, asesoría o agente de IA podría conectarse directamente.

Hasta que eso exista, este CLI automatiza los flujos web existentes de la AEAT
para que puedas trabajar con ellos de forma programática.

## Para quién es (y para quién no)

Esto no es para todo el mundo. Para usarlo necesitas:

- Saber lo que es un CLI y moverte cómodo en una terminal.
- Entender qué es un skill de IA o un agente y cómo se usa.
- Tener criterio fiscal propio para revisar lo que el agente genera. Si no
  sabes lo que estás mirando, no uses esto.

Si tu situación es sencilla (una nómina, pocos movimientos), probablemente el
borrador de Hacienda ya te sirve. Si es compleja y no tienes conocimiento
técnico, un asesor fiscal sigue siendo la mejor opción.

## Lo que incluye el repositorio

Además del CLI, el repo incluye todo lo que un agente de IA necesita para
generar declaraciones válidas:

- Los **esquemas XSD oficiales** de la AEAT para la campaña 2025.
- Un **diccionario de más de 4.000 campos** con sus etiquetas y tipos.
- Un **CLAUDE.md** con la documentación técnica completa: estructura XML,
  mapping de campos, tipos de datos, orden de secciones, errores comunes y
  el ciclo iterativo de validación con EDFI.
- Un **skill** que cualquier agente compatible puede usar para ejecutar el
  flujo completo de preparación.

## Disclaimers

- Es un proyecto personal, open source (AGPL-3.0), sin ninguna relación con
  la AEAT.
- No ofrece asesoramiento fiscal, legal ni contable.
- El CLI **nunca presenta la declaración**. Eso siempre lo haces tú
  manualmente.
- Que EDFI acepte un XML no significa que la declaración sea fiscalmente
  correcta. Significa que pasa la validación técnica.
- Úsalo bajo tu propio criterio y responsabilidad.

## Hacia dónde vamos

Más allá de la renta, creo que esto es un ejemplo claro de hacia dónde vamos.
Muchos procesos burocráticos que hoy son manuales y propensos a errores van a
poder ser asistidos por agentes. Y las administraciones públicas que ofrezcan
interfaces programáticas serán las que mejor se adapten a ese futuro.

El repositorio está aquí: [github.com/jatorre/hacienda-cli](https://github.com/jatorre/hacienda-cli)

Si te es útil, compártelo. Y si lo mejoras, manda un PR.
