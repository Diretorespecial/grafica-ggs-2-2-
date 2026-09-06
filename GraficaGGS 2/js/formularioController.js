// Cola o fluxo novo (Solicitação -> Autorização oficial em PDF -> ZIP/PDF
// único) em cima do formulário existente, sem tocar na lógica de
// procuração/requisição/receituário de js/main.js. Este arquivo registra seu
// próprio handler em #generateDoc (jQuery aceita múltiplos handlers no mesmo
// evento); ele roda depois do handler de main.js porque este é um script
// clássico (executa primeiro) e formularioController.js é um module (deferred).
//
// Tudo fica no Firestore (sem Firebase Storage, que exige plano pago) — os
// PDFs gerados são guardados como base64. Documentos do profissional (CRM,
// comprovante etc.) continuam indo por WhatsApp, como no fluxo original.
//
// Sem login: o cliente entra direto (vindo da vitrine em index.html) e uma
// sessão anônima do Firebase é criada nos bastidores, só para as regras de
// segurança do Firestore terem um dono para o pedido.
import { whenReady as whenAuthenticated } from "./anonAuth.js";
import { WHATSAPP_DISPLAY } from "./whatsapp.js";
import { fillAuthorizationPdf } from "./pdfAuthorizationService.js";
import { mergeProcesso } from "./pdfMergeService.js";
import { buildProcessoZip } from "./zipService.js";
import {
  allocateSolicitacao,
  updateDraft,
  saveGeneratedArtifact,
  getArtifact,
  getSolicitacao,
  base64ToBytes,
} from "./requestService.js";

const DRAFT_KEY = "ggs_draft_protocolo";

$(document).ready(function () {
  $("#whatsappNumber").text(WHATSAPP_DISPLAY);

  let protocoloAtual = localStorage.getItem(DRAFT_KEY) || null;
  let procuracaoBytesAtual = null; // bytes da última procuração gerada (jpg), para ZIP/PDF único
  let autorizacaoBytesAtual = null; // bytes da autorização oficial já preenchida

  if (protocoloAtual) {
    restaurarRascunho(protocoloAtual);
  } else {
    // Cliente veio da vitrine já com um produto escolhido (Formulario.html?tipo=tipo_b)
    const tipoEscolhido = new URLSearchParams(window.location.search).get("tipo");
    if (tipoEscolhido) {
      $(`input[name='receituario'][value='${tipoEscolhido}']`).prop("checked", true).trigger("change");
    }
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

      if (solicitacao.temAutorizacao) {
        const artefato = await getArtifact(protocolo, "autorizacao");
        if (artefato) {
          autorizacaoBytesAtual = base64ToBytes(artefato.base64);
          const blob = new Blob([autorizacaoBytesAtual], { type: artefato.mimeType });
          $("#downloadAutorizacaoBtn").attr("href", URL.createObjectURL(blob));
        }
      }
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

      await saveGeneratedArtifact(
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

  $("#enviarSolicitacaoBtn").click(async function () {
    if (!protocoloAtual) {
      alert("Gere a autorização antes de confirmar o pedido.");
      return;
    }
    const usuario = await whenAuthenticated;
    try {
      await updateDraft(protocoloAtual, { status: "AGUARDANDO DOCUMENTOS" });
      $("#statusLabel").text("AGUARDANDO DOCUMENTOS");
      alert(`Pedido ${protocoloAtual} confirmado! Envie seus documentos pelo WhatsApp ${WHATSAPP_DISPLAY} para seguir com a análise.`);
    } catch (err) {
      console.error("Erro ao confirmar pedido:", err);
      alert("Não foi possível confirmar o pedido agora. Tente de novo em instantes.");
    }
  });

  $("#baixarZipBtn").click(async function () {
    if (!validarProcessoCompleto()) return;
    const blob = await buildProcessoZip({
      protocolo: protocoloAtual,
      procuracaoBytes: procuracaoBytesAtual,
      procuracaoMimeType: "image/jpeg",
      autorizacaoPdfBytes: autorizacaoBytesAtual,
    });
    baixarBlob(blob, `${protocoloAtual}.zip`);
  });

  $("#baixarPdfUnicoBtn").click(async function () {
    if (!validarProcessoCompleto()) return;
    const bytes = await mergeProcesso({
      procuracaoBytes: procuracaoBytesAtual,
      procuracaoMimeType: "image/jpeg",
      autorizacaoPdfBytes: autorizacaoBytesAtual,
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
