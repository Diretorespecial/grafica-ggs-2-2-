// CRUD de Solicitações (Firestore + Storage). Nenhuma lógica de PDF mora aqui —
// este módulo só sabe gravar/ler dados e subir/baixar arquivos.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, where, orderBy, runTransaction, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-storage.js";
import { db, storage } from "./firebaseApp.js";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

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

function assertValidUpload(file) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`Tipo de arquivo não permitido: ${file.type || "desconhecido"}. Envie PDF, JPG ou PNG.`);
  }
  if (file.size >= MAX_UPLOAD_BYTES) {
    throw new Error("Arquivo maior que o limite de 15MB.");
  }
}

function extensionFor(mimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  return "jpg";
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
      arquivos: {
        procuracao: { current: 0, versions: [] },
        autorizacao: { current: 0, versions: [] },
      },
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

export async function listDocumentos(protocolo) {
  const snap = await getDocs(collection(db, "solicitacoes", protocolo, "documentos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
 * Sobe um artefato GERADO pelo próprio sistema (procuração ou autorização) para
 * o Storage, versiona no documento da solicitação e registra no histórico.
 * @param {"procuracao"|"autorizacao"} kind
 */
export async function uploadGeneratedArtifact(protocolo, kind, bytes, mimeType, fileName, usuario) {
  const solicitacao = await getSolicitacao(protocolo);
  const currentVersion = solicitacao?.arquivos?.[kind]?.current || 0;
  const nextVersion = currentVersion + 1;
  const storagePath = `solicitacoes/${protocolo}/${kind}/v${nextVersion}.${extensionFor(mimeType)}`;

  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, bytes, { contentType: mimeType });

  const versionEntry = {
    version: nextVersion,
    storagePath,
    fileName,
    mimeType,
    size: bytes.byteLength || bytes.length,
    generatedAt: new Date().toISOString(),
  };

  const versions = [...(solicitacao?.arquivos?.[kind]?.versions || []), versionEntry];
  await updateDoc(doc(db, "solicitacoes", protocolo), {
    [`arquivos.${kind}`]: { current: nextVersion, versions },
    updatedAt: serverTimestamp(),
  });

  await addHistoricoEvent(protocolo, {
    usuarioUid: usuario.uid,
    usuarioNome: usuario.displayName,
    acao: kind === "autorizacao" ? "autorizacao_gerada" : "procuracao_gerada",
  });

  return storagePath;
}

/**
 * Sobe um documento enviado pelo usuário (CRM, comprovante, etc), versionando
 * dentro do tipo (docId). O histórico de versões é mantido; a atual é a mais
 * recente. Ao substituir um documento que estava em pendência, a pendência é
 * limpa automaticamente.
 */
export async function uploadDocumento(protocolo, docId, tipo, file, usuario) {
  assertValidUpload(file);

  const docRef = doc(db, "solicitacoes", protocolo, "documentos", docId);
  const existing = await getDoc(docRef);
  const currentVersion = existing.exists() ? existing.data().currentVersion || 0 : 0;
  const nextVersion = currentVersion + 1;
  const storagePath = `solicitacoes/${protocolo}/documentos/${docId}/v${nextVersion}.${extensionFor(file.type)}`;

  const bytes = await file.arrayBuffer();
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, bytes, { contentType: file.type });

  const versionEntry = {
    version: nextVersion,
    storagePath,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedByUid: usuario.uid,
  };

  const versions = existing.exists() ? [...(existing.data().versions || []), versionEntry] : [versionEntry];
  await setDoc(docRef, {
    tipo,
    currentVersion: nextVersion,
    status: "ok",
    observacaoPendencia: null,
    versions,
  }, { merge: true });

  await addHistoricoEvent(protocolo, {
    usuarioUid: usuario.uid,
    usuarioNome: usuario.displayName,
    acao: "upload_documento",
    observacao: `${tipo} (v${nextVersion})`,
  });

  return storagePath;
}

export async function getDownloadUrlFor(storagePath) {
  return getDownloadURL(ref(storage, storagePath));
}

/**
 * Muda o status da solicitação e registra o evento no histórico numa única
 * escrita atômica. Se `pendenciaDocId` for informado junto de status
 * "PENDENCIA", marca aquele documento específico como pendente com a
 * observação — assim o cliente sabe exatamente qual arquivo substituir.
 */
export async function setStatus(protocolo, novoStatus, { observacao = null, pendenciaDocId = null, usuario }) {
  const solicitacao = await getSolicitacao(protocolo);
  const statusAnterior = solicitacao?.status || null;

  const batch = writeBatch(db);
  batch.update(doc(db, "solicitacoes", protocolo), {
    status: novoStatus,
    updatedAt: serverTimestamp(),
  });

  if (novoStatus === "PENDENCIA" && pendenciaDocId) {
    batch.set(doc(db, "solicitacoes", protocolo, "documentos", pendenciaDocId), {
      status: "pendencia",
      observacaoPendencia: observacao,
    }, { merge: true });
  }

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
