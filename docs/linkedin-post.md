# Versión LinkedIn (~1.500 caracteres)

Este año he hecho la declaración de la renta con un agente de IA. Y he publicado la herramienta para que otros puedan hacer lo mismo.

El proceso de la renta, cuando tienes una situación compleja (varios brokers, fondos, inmuebles, dividendos extranjeros), tiene dos fases:

La primera es recopilar toda la información. Ahí un agente de IA ya es una maravilla: le pasas los documentos, los organiza, extrae las cifras y te las deja preparadas.

La segunda es el infierno: meter todo eso manualmente en la web de Hacienda. Es lento, engorroso y muy fácil equivocarse.

Para resolver eso he creado hacienda-cli, un programa de línea de comandos que te permite conectarte a la AEAT desde tu terminal:

- hacienda login → Te autenticas con Cl@ve
- hacienda download 100 → Descargas lo que Hacienda ya sabe de ti
- hacienda upload 100 decl.xml → Subes tu declaración en XML para que EDFI la valide
- hacienda validate 100 decl.xml → Validación offline contra el esquema oficial

Combinado con un agente, el flujo es: el agente genera el XML, lo sube, lee los errores, corrige y repite hasta que cuadra. Tú solo revisas y decides si presentas. El CLI nunca presenta ni firma nada por ti.

Es el CLI que todos desearíamos que Hacienda tuviera. Si la AEAT ofreciera una API programática, herramientas como esta no harían falta. Hasta entonces, este CLI llena ese hueco.

No es para todo el mundo: necesitas saber lo que es un CLI, un agente de IA, y tener criterio fiscal para revisar el resultado. Es open source (AGPL-3.0), sin garantías ni responsabilidad. Si no sabes lo que estás haciendo, usa un asesor.

Repo: https://github.com/jatorre/hacienda-cli
Post con más detalle: [link al post largo]

#DeclaracionDeLaRenta #IRPF #AI #OpenSource #AEAT
