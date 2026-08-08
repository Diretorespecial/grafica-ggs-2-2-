// Painel administrativo: lista de solicitações + detalhe (dados, arquivos,
// documentos, histórico, mudança de status/pendência). A checagem de admin
// feita aqui é só para a UI decidir o que mostrar — quem garante segurança de
// verdade são as regras do Firestore/Storage (firestore.rules/storage.rules).
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { whenAuthenticated } from "./authGuard.js";
import { db } from "./firebaseApp.js";
import {
  STATUSES,
  listAllSolicitacoes,
  getSolicitacao,
  listDocumentos,
  listHistorico,
  getDownloadUrlFor,
  setStatus,
} from "./requestService.js";

const params = new URLSearchParams(window.location.search);
const protocoloQuery = params.get("protocolo");

function formatTimestamp(ts) {
  if (!ts) return "";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleString("pt-BR");
}

function renderPessoa(selector, pessoa) {
  $(selector).html(
    Object.entries(pessoa || {})
      .map(([campo, valor]) => `<div><b>${campo}:</b> ${valor ?? ""}</div>`)
      .join("")
  );
}

async function renderList() {
  $("#listView").removeClass("hidden");
  const solicitacoes = await listAllSolicitacoes();
  const tbody = $("#solicitacoesTableBody").empty();

  solicitacoes.forEach((sol) => {
    const arquivos = [
      sol.arquivos?.procuracao?.current ? "Procuração" : null,
      sol.arquivos?.autorizacao?.current ? "Autorização" : null,
    ].filter(Boolean).join(", ");

    tbody.append(`
      <tr>
        <td>${sol.protocolo}</td>
        <td>${sol.profissional?.nome || ""}</td>
        <td>${sol.profissional?.crm || ""}</td>
        <td>${(sol.receituarios || []).join(", ")}</td>
        <td>${formatTimestamp(sol.createdAt)}</td>
        <td>${sol.status}</td>
        <td>${arquivos}</td>
        <td><a href="admin.html?protocolo=${encodeURIComponent(sol.protocolo)}">Ver</a></td>
      </tr>
    `);
  });
}

async function renderDetail(protocolo, usuarioAdmin) {
  $("#detailView").removeClass("hidden");
  const sol = await getSolicitacao(protocolo);
  if (!sol) {
    $("#detailView").html("<p>Solicitação não encontrada.</p>");
    return;
  }

  $("#detailProtocolo").text(sol.protocolo);
  $("#detailStatus").text(sol.status);
  $("#detailTipoPessoa").text(sol.tipoPessoa);
  $("#detailReceituarios").text((sol.receituarios || []).join(", "));

  renderPessoa("#detailProfissional", sol.profissional);
  if (sol.estabelecimento) {
    renderPessoa("#detailEstabelecimento", sol.estabelecimento);
  } else {
    $("#estabelecimentoSection").addClass("hidden");
  }

  const procuracaoVersoes = sol.arquivos?.procuracao?.versions || [];
  if (procuracaoVersoes.length) {
    const url = await getDownloadUrlFor(procuracaoVersoes[procuracaoVersoes.length - 1].storagePath);
    $("#procuracaoLink").attr("href", url).removeClass("hidden");
  }
  const autorizacaoVersoes = sol.arquivos?.autorizacao?.versions || [];
  if (autorizacaoVersoes.length) {
    const url = await getDownloadUrlFor(autorizacaoVersoes[autorizacaoVersoes.length - 1].storagePath);
    $("#autorizacaoLink").attr("href", url).removeClass("hidden");
  }

  const documentos = await listDocumentos(protocolo);
  const docsList = $("#detailDocumentos").empty();
  for (const documento of documentos) {
    const versaoAtual = documento.versions?.[documento.versions.length - 1];
    const url = versaoAtual ? await getDownloadUrlFor(versaoAtual.storagePath) : "#";
    const pendenciaHtml = documento.status === "pendencia"
      ? ` — <span class="pendencia">Pendência: ${documento.observacaoPendencia || ""}</span>`
      : "";
    docsList.append(
      `<li><b>${documento.tipo}</b> (v${documento.currentVersion}) — <a href="${url}" target="_blank">baixar</a>${pendenciaHtml}</li>`
    );
  }

  const historico = await listHistorico(protocolo);
  const histList = $("#detailHistorico").empty();
  historico.forEach((evento) => {
    const transicao = evento.statusNovo ? ` (${evento.statusAnterior || "—"} → ${evento.statusNovo})` : "";
    const obs = evento.observacao ? `: ${evento.observacao}` : "";
    histList.append(`<li>${formatTimestamp(evento.data)} — ${evento.acao}${transicao}${obs}</li>`);
  });

  const statusSelect = $("#statusSelect").empty();
  STATUSES.forEach((status) => {
    statusSelect.append(`<option value="${status}" ${status === sol.status ? "selected" : ""}>${status}</option>`);
  });

  const pendenciaDocSelect = $("#pendenciaDocSelect").empty();
  pendenciaDocSelect.append(`<option value="">(nenhum documento específico)</option>`);
  documentos.forEach((documento) => {
    pendenciaDocSelect.append(`<option value="${documento.id}">${documento.tipo}</option>`);
  });

  $("#salvarStatusBtn").off("click").on("click", async function () {
    const novoStatus = statusSelect.val();
    const observacao = $("#observacaoInput").val();
    const pendenciaDocId = pendenciaDocSelect.val() || null;
    try {
      await setStatus(protocolo, novoStatus, { observacao, pendenciaDocId, usuario: usuarioAdmin });
      alert("Status atualizado.");
      window.location.reload();
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      alert("Não foi possível atualizar o status. Veja o console para detalhes.");
    }
  });
}

async function init() {
  const usuario = await whenAuthenticated;
  const adminSnap = await getDoc(doc(db, "admins", usuario.uid));

  if (!adminSnap.exists()) {
    $("#accessDenied").removeClass("hidden");
    return;
  }

  $("#adminContent").removeClass("hidden");

  if (protocoloQuery) {
    await renderDetail(protocoloQuery, usuario);
  } else {
    await renderList();
  }
}

init();
