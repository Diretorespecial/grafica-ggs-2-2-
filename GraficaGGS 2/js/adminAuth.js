// Login do painel administrativo. Diferente do cliente (anônimo, invisível),
// o admin precisa mesmo fazer login com Google — este módulo mostra um botão
// de login direto na própria página (admin.html), sem redirecionar para
// nenhum outro lugar.
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { auth } from "./firebaseApp.js";

const provider = new GoogleAuthProvider();

export function signInAdmin() {
  return signInWithPopup(auth, provider);
}

/**
 * Resolve com o usuário real (não anônimo) logado, ou com `null` se ninguém
 * estiver logado ainda — nunca redireciona.
 */
export function whenAuthStateKnown() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user && !user.isAnonymous ? user : null);
    });
  });
}

export { auth };
