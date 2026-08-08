// Mapa dos campos REAIS do AcroForm do template oficial
// (templates/autorizacao-2026.pdf), extraído inspecionando os objetos /Widget
// do PDF (nomes /T e dicas /TU). Nenhuma coordenada é usada — o preenchimento
// é sempre por nome de campo (ver pdfAuthorizationService.js).
//
// Confirmado com o cliente da Gráfica GGS:
//  - Ordem dos 4 checkboxes de tipo de receituário no PDF (de cima para baixo):
//    A (amarelo) / B / B2 / Retinóides.
//  - Os campos "DATA" (36) e "CRM/CRO/CRMV" (37), perto da assinatura, são do
//    profissional requerente (podem ser pré-preenchidos). O último "DATA" (38),
//    mais próximo do carimbo, é exclusivo da VISA e NUNCA é preenchido.
//
// Observação sobre os campos 11 e 19: o /TU do PDF diz "BAIRRO" nos dois, mas a
// posição/largura das colunas (estreita "10"/"18" -> larga "11"/"19" -> estreita
// "12"/"20", igual ao padrão Bairro/Cidade/CEP) indica que 11 e 19 são, na
// prática, o campo CIDADE. Tratados como tal aqui.

// Bloco do profissional — corresponde aos campos 2 a 12 do PDF.
export const PROFISSIONAL_FIELDS = {
  nome: "2",
  nomeSocial: "3",
  crm: "4",
  especialidade: "5",
  telefone: "6",
  rua: "7",
  numero: "8",
  complemento: "9",
  bairro: "10",
  cidade: "11",
  cep: "12",
};

// Bloco do estabelecimento (só é preenchido quando a solicitação é de Pessoa
// Jurídica) — corresponde aos campos 13 a 23 do PDF.
export const ESTABELECIMENTO_FIELDS = {
  razaoSocial: "13",
  cnpj: "14",
  rua: "15",
  numero: "16",
  complemento: "17",
  bairro: "18",
  cidade: "19",
  cep: "20",
  crm: "21",
  especialidade: "22",
  telefone: "23",
};

// Checkboxes de seleção do tipo de receituário — mesmos 4 valores usados no
// radio "receituario" de Formulario.html.
export const RECEITUARIO_CHECKBOXES = {
  tipo_amarelo: "24a",
  tipo_b: "24",
  tipo_b2: "28",
  retinoides: "32",
};

// Campos de identificação do requerente perto da assinatura — pré-preenchidos.
export const SIGNATURE_FIELDS = {
  data: "36",
  crm: "37",
};

// Nunca preencher automaticamente: checkbox "1" (propósito não confirmado
// visualmente), a grade de numeração inicial/final ao lado de cada tipo de
// receituário (exclusiva da Vigilância Sanitária), o último campo de DATA (38,
// junto ao carimbo da VISA) e os botões internos do PDF.
export const NEVER_FILL = [
  "1",
  "26a", "27a",
  "26", "27",
  "30", "31",
  "34", "35",
  "38",
  "LIMPAR", "IMPRIMIR",
];
