// Autenticação invisível para o cliente: sem tela de login, sem senha. Usa
// login anônimo do Firebase só para que as regras de segurança do Firestore
// continuem funcionando (cada pedido fica vinculado a um uid), sem exigir
// conta de ninguém. Se um dia quisermos login de verdade para o cliente
// acompanhar pedidos antigos, dá pra "promover" essa conta anônima depois
// (linkWithCredential) sem perder nada que já foi gerado.
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { auth } from "./firebaseApp.js";

export const whenReady = new Promise((resolve, reject) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      unsubscribe();
      resolve(user);
      return;
    }
    signInAnonymously(auth).catch((err) => {
      unsubscribe();
      console.error("Não foi possível iniciar sessão anônima:", err);
      reject(err);
    });
  });
});
