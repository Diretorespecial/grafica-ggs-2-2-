// Painel administrativo: lista de solicitações + detalhe (dados, arquivos,
// histórico, mudança de status). A checagem de admin feita aqui é só para a
// UI decidir o que mostrar — quem garante segurança de verdade são as regras
// do Firestore (firestore.rules).
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { signInAdmin, whenAuthStateKnown } from "./adminAuth.js";
import { db } from "./firebaseApp.js";
import {
  STATUSES,
  listAllSolicitacoes,
  getSolicitacao,
  getArtifact,
  listHistorico,
  setStatus,
  base64ToBytes,
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

async function attachArtifactLink(protocolo, kind, linkSelector) {
  const artefato = await getArtifact(protocolo, kind);
  if (!artefato) return;
  const bytes = base64ToBytes(artefato.base64);
  const blob = new Blob([bytes], { type: artefato.mimeType });
  $(linkSelector).attr("href", URL.createObjectURL(blob)).attr("download", artefato.fileName).removeClass("hidden");
}

async function renderList() {
  $("#listView").removeClass("hidden");
  const solicitacoes = await listAllSolicitacoes();
  const tbody = $("#solicitacoesTableBody").empty();

  solicitacoes.forEach((sol) => {
    const arquivos = [
      sol.temProcuracao ? "Procuração" : null,
      sol.temAutorizacao ? "Autorização" : null,
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

  if (sol.temProcuracao) await attachArtifactLink(protocolo, "procuracao", "#procuracaoLink");
  if (sol.temAutorizacao) await attachArtifactLink(protocolo, "autorizacao", "#autorizacaoLink");

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

  $("#salvarStatusBtn").off("click").on("click", async function () {
    const novoStatus = statusSelect.val();
    const observacao = $("#observacaoInput").val();
    try {
      await setStatus(protocolo, novoStatus, { observacao, usuario: usuarioAdmin });
      alert("Status atualizado.");
      window.location.reload();
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      alert("Não foi possível atualizar o status. Veja o console para detalhes.");
    }
  });
}

async function iniciarComoAdmin(usuario) {
  $("#loginGate").addClass("hidden");
  $("#accessDenied").addClass("hidden");
  $("#adminContent").removeClass("hidden");

  if (protocoloQuery) {
    await renderDetail(protocoloQuery, usuario);
  } else {
    await renderList();
  }
}

async function init() {
  const usuario = await whenAuthStateKnown();

  if (!usuario) {
    $("#loginGate").removeClass("hidden");
    $("#loginAdminBtn").off("click").on("click", async function () {
      try {
        const cred = await signInAdmin();
        const adminSnap = await getDoc(doc(db, "admins", cred.user.uid));
        if (!adminSnap.exists()) {
          $("#loginGate").addClass("hidden");
          $("#accessDenied").removeClass("hidden");
          return;
        }
        await iniciarComoAdmin(cred.user);
      } catch (err) {
        console.error("Erro ao fazer login:", err);
        alert("Não foi possível fazer login. Tente de novo.");
      }
    });
    return;
  }

  const adminSnap = await getDoc(doc(db, "admins", usuario.uid));
  if (!adminSnap.exists()) {
    $("#accessDenied").removeClass("hidden");
    return;
  }

  await iniciarComoAdmin(usuario);
}

init();
