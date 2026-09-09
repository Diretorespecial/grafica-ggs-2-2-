// CRUD de Solicitações — 100% Firestore, sem Firebase Storage (o Storage exige
// o plano pago Blaze; para manter o projeto gratuito, os PDFs gerados
// (procuração/autorização) são guardados como texto base64 dentro do próprio
// Firestore, num documento por artefato — cada um cabe tranquilo no limite de
// 1 MiB por documento). Documentos enviados pelo profissional (CRM, comprovante
// etc.) continuam indo por WhatsApp, como já era o fluxo original.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, where, orderBy, runTransaction, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { db } from "./firebaseApp.js";

export const STATUSES = [
  "RASCUNHO",
  "AGUARDANDO DOCUMENTOS",
  "DOCUMENTACAO RECEBIDA",
  "EM ANALISE",
  "PENDENCIA",
  "PROTOCOLADO NA VISA",
  "AGUARDANDO AUTORIZACAO",
  "AUTORIZACAO LIBERADA",
  "EM IMPRESSAO",
  "PRONTO PARA ENTREGA",
  "FINALIZADO",
];

export function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Aloca um novo protocolo (GGS-{ano}-{numero}) de forma atômica via transação
 * no contador do ano corrente, e cria a solicitação em status RASCUNHO.
 */
export async function allocateSolicitacao(owner, initialData) {
  const year = new Date().getFullYear();
  const counterRef = doc(db, "contadores", String(year));

  return runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const next = (counterSnap.exists() ? counterSnap.data().value : 0) + 1;
    const protocolo = `GGS-${year}-${String(next).padStart(6, "0")}`;
    const requestRef = doc(db, "solicitacoes", protocolo);

    tx.set(counterRef, { value: next });
    tx.set(requestRef, {
      protocolo,
      ano: year,
      numero: next,
      ownerUid: owner.uid,
      ownerEmail: owner.email || null,
      ownerNome: owner.displayName || null,
      status: "RASCUNHO",
      temProcuracao: false,
      temAutorizacao: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...initialData,
    });

    return protocolo;
  });
}

export async function updateDraft(protocolo, patch) {
  await updateDoc(doc(db, "solicitacoes", protocolo), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function getSolicitacao(protocolo) {
  const snap = await getDoc(doc(db, "solicitacoes", protocolo));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listHistorico(protocolo) {
  const snap = await getDocs(
    query(collection(db, "solicitacoes", protocolo, "historico"), orderBy("data", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listMinhasSolicitacoes(ownerUid) {
  const snap = await getDocs(
    query(collection(db, "solicitacoes"), where("ownerUid", "==", ownerUid), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAllSolicitacoes() {
  const snap = await getDocs(
    query(collection(db, "solicitacoes"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addHistoricoEvent(protocolo, { usuarioUid, usuarioNome, acao, statusAnterior = null, statusNovo = null, observacao = null }) {
  await addDoc(collection(db, "solicitacoes", protocolo, "historico"), {
    data: serverTimestamp(),
    usuarioUid,
    usuarioNome: usuarioNome || null,
    acao,
    statusAnterior,
    statusNovo,
    observacao,
  });
}

/**
 * Salva um artefato GERADO pelo próprio sistema (procuração ou autorização)
 * como base64 num documento próprio (solicitacoes/{protocolo}/arquivos/{kind}),
 * substituindo a versão anterior (não guardamos histórico de versões desses
 * dois arquivos — eles são sempre re-gerados a partir dos dados do formulário).
 * @param {"procuracao"|"autorizacao"} kind
 */
export async function saveGeneratedArtifact(protocolo, kind, bytes, mimeType, fileName, usuario) {
  const base64 = bytesToBase64(bytes);

  await setDoc(doc(db, "solicitacoes", protocolo, "arquivos", kind), {
    base64,
    mimeType,
    fileName,
    size: bytes.byteLength || bytes.length,
    generatedAt: new Date().toISOString(),
  });

  await updateDoc(doc(db, "solicitacoes", protocolo), {
    [kind === "autorizacao" ? "temAutorizacao" : "temProcuracao"]: true,
    updatedAt: serverTimestamp(),
  });

  await addHistoricoEvent(protocolo, {
    usuarioUid: usuario.uid,
    usuarioNome: usuario.displayName,
    acao: kind === "autorizacao" ? "autorizacao_gerada" : "procuracao_gerada",
  });
}

export async function getArtifact(protocolo, kind) {
  const snap = await getDoc(doc(db, "solicitacoes", protocolo, "arquivos", kind));
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Muda o status da solicitação e registra o evento no histórico numa única
 * escrita atômica.
 */
export async function setStatus(protocolo, novoStatus, { observacao = null, usuario }) {
  const solicitacao = await getSolicitacao(protocolo);
  const statusAnterior = solicitacao?.status || null;

  const batch = writeBatch(db);
  batch.update(doc(db, "solicitacoes", protocolo), {
    status: novoStatus,
    updatedAt: serverTimestamp(),
  });

  const historicoRef = doc(collection(db, "solicitacoes", protocolo, "historico"));
  batch.set(historicoRef, {
    data: serverTimestamp(),
    usuarioUid: usuario.uid,
    usuarioNome: usuario.displayName || null,
    acao: "mudanca_status",
    statusAnterior,
    statusNovo: novoStatus,
    observacao,
  });

  await batch.commit();
}
