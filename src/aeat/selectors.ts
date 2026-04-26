export const AEAT_UPLOAD_CODES = /^(FRECH|ERES|EXML|AVIS)/;

export const aeatSelectors = {
  continueSession: 'button:has-text("Continuar sesión")',
  datosIdentificativosHeader: "text=Datos Identificativos",
  fiscalDataHeader: "text=Consulta de Datos Fiscales",
  importXml: 'button:has-text("Importar XML"), button:has-text("Importar Xml"), a:has-text("Importar XML"), a:has-text("Importar Xml")',
  newDeclaration: 'button:has-text("Nueva declaración")',
  pdfIframe: 'iframe[src*="PDFborrador.pdf"]',
  previewButton: "#VistapreviaXML",
  uploadConfirmYes: 'button:has-text("Si"), button:has-text("Sí")',
  uploadInput: 'input[type="file"]',
  backToReturn: 'button:has-text("Volver a declaración")',
} as const;

export const aeatSessionExpiredPattern = /SesionCaducada|ObtenerClave/i;
