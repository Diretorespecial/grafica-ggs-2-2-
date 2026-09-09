// Monta o ZIP de "processo completo": procuração e autorização, cada uma como
// PDF. Documentos do profissional (CRM, comprovante etc.) continuam indo por
// WhatsApp, não passam por aqui.
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import { embedImageAsPage } from "./pdfMergeService.js";

/**
 * @param {object} params
 * @param {string} params.protocolo - ex "GGS-2026-000001"
 * @param {Uint8Array} params.procuracaoBytes - imagem (jpg/png) da procuração
 * @param {string} params.procuracaoMimeType
 * @param {Uint8Array} params.autorizacaoPdfBytes - PDF oficial já preenchido
 * @returns {Promise<Blob>}
 */
export async function buildProcessoZip({ protocolo, procuracaoBytes, procuracaoMimeType, autorizacaoPdfBytes }) {
  const zip = new JSZip();
  const root = zip.folder(protocolo);

  const procuracaoPdf = await PDFDocument.create();
  await embedImageAsPage(procuracaoPdf, procuracaoBytes, procuracaoMimeType);
  root.file("01-procuracao.pdf", await procuracaoPdf.save());

  root.file("02-autorizacao.pdf", autorizacaoPdfBytes);

  return zip.generateAsync({ type: "blob" });
}
