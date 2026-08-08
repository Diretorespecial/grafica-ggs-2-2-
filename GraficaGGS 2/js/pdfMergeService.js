// Junta procuração + autorização oficial (preenchida) + documentos anexados em
// um único PDF, na ordem exigida: 1) procuração, 2) autorização oficial
// (exatamente o mesmo arquivo gerado por pdfAuthorizationService — nunca
// regenerada/redesenhada aqui), 3) documentos.
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

/**
 * Adiciona uma imagem (JPG ou PNG) como uma nova página de tamanho igual ao da
 * imagem, sem redesenhar nada além da própria imagem.
 */
export async function embedImageAsPage(pdfDoc, bytes, mimeType) {
  const image = mimeType === "image/png"
    ? await pdfDoc.embedPng(bytes)
    : await pdfDoc.embedJpg(bytes);
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
}

async function appendPdfBytes(mergedDoc, sourceBytes) {
  const sourceDoc = await PDFDocument.load(sourceBytes);
  const pages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
  pages.forEach((page) => mergedDoc.addPage(page));
}

/**
 * @param {object} params
 * @param {Uint8Array} params.procuracaoBytes - imagem (jpg/png) da procuração já gerada
 * @param {string} params.procuracaoMimeType
 * @param {Uint8Array} params.autorizacaoPdfBytes - PDF oficial já preenchido (pdfAuthorizationService)
 * @param {{bytes: Uint8Array, mimeType: string}[]} params.documentos - na ordem de upload
 * @returns {Promise<Uint8Array>}
 */
export async function mergeProcesso({ procuracaoBytes, procuracaoMimeType, autorizacaoPdfBytes, documentos = [] }) {
  const merged = await PDFDocument.create();

  await embedImageAsPage(merged, procuracaoBytes, procuracaoMimeType);
  await appendPdfBytes(merged, autorizacaoPdfBytes);

  for (const documento of documentos) {
    if (documento.mimeType === "application/pdf") {
      await appendPdfBytes(merged, documento.bytes);
    } else {
      await embedImageAsPage(merged, documento.bytes, documento.mimeType);
    }
  }

  return merged.save();
}
