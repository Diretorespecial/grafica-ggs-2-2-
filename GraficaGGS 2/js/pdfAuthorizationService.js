// Serviço responsável por preencher o PDF OFICIAL da autorização.
//
// Fluxo (nunca varia): TEMPLATE ORIGINAL (templates/autorizacao-2026.pdf, nunca
// tocado) -> carregado em memória -> cópia preenchida via pdf-lib usando os
// nomes reais dos campos do AcroForm (pdfFieldMap.js) -> bytes da cópia
// preenchida retornados para quem chamou salvar/subir para o Storage.
//
// Não há geração de HTML/canvas/coordenadas aqui — é o PDF real sendo aberto e
// preenchido pelos próprios campos de formulário que ele já tem.
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import {
  PROFISSIONAL_FIELDS,
  ESTABELECIMENTO_FIELDS,
  RECEITUARIO_CHECKBOXES,
  SIGNATURE_FIELDS,
} from "./pdfFieldMap.js";

export const TEMPLATE_PATH = "templates/autorizacao-2026.pdf";

/**
 * @param {object} params
 * @param {object} params.profissional - dados do profissional (campos 2-12)
 * @param {object|null} params.estabelecimento - dados do estabelecimento, só para PJ (campos 13-23)
 * @param {string[]} params.receituarios - valores como "tipo_amarelo", "tipo_b", ...
 * @param {Date} [params.hoje] - data usada no campo de assinatura do requerente
 * @returns {Promise<Uint8Array>} bytes do PDF preenchido
 */
export async function fillAuthorizationPdf({ profissional, estabelecimento, receituarios, hoje = new Date() }) {
  const templateBytes = await loadTemplate();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  fillTextFields(form, PROFISSIONAL_FIELDS, profissional);
  if (estabelecimento) {
    fillTextFields(form, ESTABELECIMENTO_FIELDS, estabelecimento);
  }

  (receituarios || []).forEach((tipo) => {
    const fieldName = RECEITUARIO_CHECKBOXES[tipo];
    if (!fieldName) return;
    try {
      form.getCheckBox(fieldName).check();
    } catch (e) {
      console.error(`Checkbox de receituário "${fieldName}" (${tipo}) não encontrado no PDF`, e);
    }
  });

  fillTextFields(form, SIGNATURE_FIELDS, {
    data: formatDate(hoje),
    crm: profissional?.crm,
  });

  // Deliberadamente NÃO chama form.flatten(): o formulário continua editável
  // porque a VISA ainda precisa preencher a numeração concedida e assinar
  // digitalmente. Os campos da área exclusiva da VISA (ver NEVER_FILL em
  // pdfFieldMap.js) nunca são tocados por este serviço.
  return pdfDoc.save();
}

async function loadTemplate() {
  const response = await fetch(TEMPLATE_PATH);
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o template oficial em ${TEMPLATE_PATH} (HTTP ${response.status})`);
  }
  return response.arrayBuffer();
}

function fillTextFields(form, fieldMap, data) {
  Object.entries(fieldMap).forEach(([dataKey, pdfFieldName]) => {
    const value = data?.[dataKey];
    if (value === undefined || value === null || value === "") return;
    try {
      form.getTextField(pdfFieldName).setText(String(value));
    } catch (e) {
      console.error(`Campo do PDF "${pdfFieldName}" (${dataKey}) não encontrado ou não é um campo de texto`, e);
    }
  });
}

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
