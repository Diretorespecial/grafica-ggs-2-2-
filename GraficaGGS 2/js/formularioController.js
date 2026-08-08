// Cola o fluxo novo (Solicitação -> Autorização oficial em PDF -> documentos ->
// ZIP/PDF único) em cima do formulário existente, sem tocar na lógica de
// procuração/requisição/receituário de js/main.js. Este arquivo registra seu
// próprio handler em #generateDoc (jQuery aceita múltiplos handlers no mesmo
// evento); ele roda depois do handler de main.js porque este é um script
// clássico (executa primeiro) e formularioController.js é um module (deferred).
import { whenAuthenticated } from "./authGuard.js";
import { WHATSAPP_DISPLAY } from "./whatsapp.js";
import { fillAuthorizationPdf } from "./pdfAuthorizationService.js";
import { mergeProcesso } from "./pdfMergeService.js";
import { buildProcessoZip } from "./zipService.js";
import {
  allocateSolicitacao,
  updateDraft,
  uploadGeneratedArtifact,
  uploadDocumento,
  getSolicitacao,
  listDocumentos,
  getDownloadUrlFor,
} from "./requestService.js";

const DRAFT_KEY = "ggs_draft_protocolo";

$(document).ready(function () {
  $("#whatsappNumber").text(WHATSAPP_DISPLAY);

  let protocoloAtual = localStorage.getItem(DRAFT_KEY) || null;
  let procuracaoBytesAtual = null; // bytes da última procuração gerada (jpg), para ZIP/PDF único
  let autorizacaoBytesAtual = null; // bytes da autorização oficial já preenchida

  if (protocoloAtual) {
    restaurarRascunho(protocoloAtual);
  }

  async function restaurarRascunho(protocolo) {
    try {
      const solicitacao = await getSolicitacao(protocolo);
      if (!solicitacao) {
        localStorage.removeItem(DRAFT_KEY);
        protocoloAtual = null;
        return;
      }
      repopularFormulario(solicitacao);
      $("#protocoloLabel").text(solicitacao.protocolo);
      $("#statusLabel").text(solicitacao.status);
      $(".results").removeClass("hidden");
      $("#solicitacaoResult").removeClass("hidden");
    } catch (err) {
      console.error("Não foi possível restaurar o rascunho:", err);
    }
  }

  function repopularFormulario(sol) {
    const p = sol.profissional || {};
    if (sol.tipoPessoa === "PJ") {
      $("#juridica").click();
      $("#nomePJ").val(p.nome || "");
      $("#nomeSocialPJ").val(p.nomeSocial || "");
      $("#crmPJ").val(p.crm || "");
      $("#especialidadePJ").val(p.especialidade || "");
      $("#telefonePJ").val(p.telefone || "");
      $("#ruaPJ").val(p.rua || "");
      $("#numero_pj").val(p.numero || "");
      $("#complemento_pj").val(p.complemento || "");
      $("#bairro_pj").val(p.bairro || "");
      $("#cidade_pj").val(p.cidade || "");
      $("#cep_pj").val(p.cep || "");
      $("#razaoSocial").val(sol.estabelecimento?.razaoSocial || "");
      $("#cnpj").val(sol.estabelecimento?.cnpj || "");
      $("#enderecoPJ").val(sol.enderecoResidencial || "");
    } else {
      $("#fisica").click();
      $("#nameform").val(p.nome || "");
      $("#nomeSocial").val(p.nomeSocial || "");
      $("#crm").val(p.crm || "");
      $("#especialidade").val(p.especialidade || "");
      $("#telefone").val(p.telefone || "");
      $("#rua").val(p.rua || "");
      $("#numero").val(p.numero || "");
      $("#complemento").val(p.complemento || "");
      $("#bairro").val(p.bairro || "");
      $("#cidade").val(p.cidade || "");
      $("#cep").val(p.cep || "");
      $("#cpf").val(p.cpf || "");
      $("#rg").val(p.rg || "");
      $("#endereco").val(sol.enderecoResidencial || "");
    }
    const tipo = sol.receituarios?.[0];
    if (tipo) {
      $(`input[name='receituario'][value='${tipo}']`).prop("checked", true).trigger("change");
    }
  }

  function coletarDados() {
    const isPJ = $("#fisica").hasClass("inactive");
    if (isPJ) {
      const enderecoComum = {
        rua: $("#ruaPJ").val(),
        numero: $("#numero_pj").val(),
        complemento: $("#complemento_pj").val(),
        bairro: $("#bairro_pj").val(),
        cidade: $("#cidade_pj").val(),
        cep: $("#cep_pj").val(),
        estado: "MG",
      };
      return {
        tipoPessoa: "PJ",
        profissional: {
          nome: $("#nomePJ").val(),
          nomeSocial: $("#nomeSocialPJ").val(),
          crm: $("#crmPJ").val(),
          especialidade: $("#especialidadePJ").val(),
          telefone: $("#telefonePJ").val(),
          ...enderecoComum,
        },
        estabelecimento: {
          razaoSocial: $("#razaoSocial").val(),
          cnpj: $("#cnpj").val(),
          telefone: $("#telefonePJ").val(),
          crm: $("#crmPJ").val(),
          especialidade: $("#especialidadePJ").val(),
          ...enderecoComum,
        },
        enderecoResidencial: $("#enderecoPJ").val(),
      };
    }
    return {
      tipoPessoa: "PF",
      profissional: {
        nome: $("#nameform").val(),
        nomeSocial: $("#nomeSocial").val(),
        crm: $("#crm").val(),
        especialidade: $("#especialidade").val(),
        telefone: $("#telefone").val(),
        rua: $("#rua").val(),
        numero: $("#numero").val(),
        complemento: $("#complemento").val(),
        bairro: $("#bairro").val(),
        cidade: $("#cidade").val(),
        cep: $("#cep").val(),
        cpf: $("#cpf").val(),
        rg: $("#rg").val(),
        estado: "MG",
      },
      estabelecimento: null,
      enderecoResidencial: $("#endereco").val(),
    };
  }

  // Captura os bytes da procuração assim que main.js termina de desenhá-la no
  // canvas (o link de download recebe um data: URL) — usados depois no ZIP e
  // no PDF único, sem regenerar/redesenhar nada.
  const downloadBtn2 = document.getElementById("downloadBtn2");
  if (downloadBtn2) {
    new MutationObserver(() => {
      const href = downloadBtn2.getAttribute("href");
      if (href && href.startsWith("data:")) {
        fetch(href)
          .then((r) => r.arrayBuffer())
          .then((buf) => { procuracaoBytesAtual = new Uint8Array(buf); });
      }
    }).observe(downloadBtn2, { attributes: true, attributeFilter: ["href"] });
  }

  $("#generateDoc").click(async function () {
    if (typeof checkimputs === "function" && !checkimputs()) return;

    const tipo = $("input[name='receituario']:checked").val();
    if (!tipo) return;

    const usuario = await whenAuthenticated;
    const dados = coletarDados();

    try {
      if (!protocoloAtual) {
        protocoloAtual = await allocateSolicitacao(
          { uid: usuario.uid, email: usuario.email, displayName: usuario.displayName },
          { ...dados, receituarios: [tipo] }
        );
        localStorage.setItem(DRAFT_KEY, protocoloAtual);
      } else {
        await updateDraft(protocoloAtual, { ...dados, receituarios: [tipo] });
      }

      autorizacaoBytesAtual = await fillAuthorizationPdf({
        profissional: dados.profissional,
        estabelecimento: dados.estabelecimento,
        receituarios: [tipo],
      });

      await uploadGeneratedArtifact(
        protocoloAtual, "autorizacao", autorizacaoBytesAtual, "application/pdf", "autorizacao.pdf", usuario
      );

      const blob = new Blob([autorizacaoBytesAtual], { type: "application/pdf" });
      $("#downloadAutorizacaoBtn").attr("href", URL.createObjectURL(blob));
      $("#protocoloLabel").text(protocoloAtual);
      $("#statusLabel").text("RASCUNHO");
      $("#solicitacaoResult").removeClass("hidden");
    } catch (err) {
      console.error("Erro ao gerar a autorização oficial:", err);
      alert("Não foi possível gerar a autorização oficial. Veja o console do navegador para detalhes.");
    }
  });

  $(document).on("change", ".documentoInput", async function () {
    const file = this.files[0];
    const input = this;
    if (!file) return;

    if (!protocoloAtual) {
      alert("Clique em \"Gerar documentos\" antes de enviar documentos anexos.");
      input.value = "";
      return;
    }

    const tipo = $(this).closest("[data-doc-tipo]").data("doc-tipo");
    const statusSpan = $(this).siblings(".documentoStatus");
    const usuario = await whenAuthenticated;

    statusSpan.text("Enviando...");
    try {
      await uploadDocumento(protocoloAtual, tipo, tipo, file, usuario);
      statusSpan.text(`Enviado: ${file.name}`);
    } catch (err) {
      console.error("Erro ao enviar documento:", err);
      statusSpan.text(err.message || "Erro ao enviar — tente novamente");
      input.value = "";
    }
  });

  $("#enviarSolicitacaoBtn").click(async function () {
    if (!protocoloAtual) {
      alert("Gere a autorização antes de enviar a solicitação.");
      return;
    }
    await updateDraft(protocoloAtual, { status: "AGUARDANDO DOCUMENTOS" });
    $("#statusLabel").text("AGUARDANDO DOCUMENTOS");
    alert(`Solicitação ${protocoloAtual} enviada. A Gráfica GGS vai analisar os documentos.`);
  });

  $("#baixarZipBtn").click(async function () {
    if (!validarProcessoCompleto()) return;
    const documentos = await coletarDocumentosParaProcesso(protocoloAtual);
    const blob = await buildProcessoZip({
      protocolo: protocoloAtual,
      procuracaoBytes: procuracaoBytesAtual,
      procuracaoMimeType: "image/jpeg",
      autorizacaoPdfBytes: autorizacaoBytesAtual,
      documentos,
    });
    baixarBlob(blob, `${protocoloAtual}.zip`);
  });

  $("#baixarPdfUnicoBtn").click(async function () {
    if (!validarProcessoCompleto()) return;
    const documentos = await coletarDocumentosParaProcesso(protocoloAtual);
    const bytes = await mergeProcesso({
      procuracaoBytes: procuracaoBytesAtual,
      procuracaoMimeType: "image/jpeg",
      autorizacaoPdfBytes: autorizacaoBytesAtual,
      documentos,
    });
    baixarBlob(new Blob([bytes], { type: "application/pdf" }), `${protocoloAtual}-processo.pdf`);
  });

  function validarProcessoCompleto() {
    if (!protocoloAtual || !procuracaoBytesAtual || !autorizacaoBytesAtual) {
      alert("Gere a procuração (\"Gerar documentos\") e aguarde a autorização oficial antes de continuar.");
      return false;
    }
    return true;
  }

  async function coletarDocumentosParaProcesso(protocolo) {
    const documentos = await listDocumentos(protocolo);
    const resultados = [];
    for (const documento of documentos) {
      const versao = documento.versions?.[documento.versions.length - 1];
      if (!versao) continue;
      const url = await getDownloadUrlFor(versao.storagePath);
      const bytes = new Uint8Array(await fetch(url).then((r) => r.arrayBuffer()));
      resultados.push({ bytes, mimeType: versao.mimeType, fileName: versao.fileName });
    }
    return resultados;
  }

  function baixarBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
});
