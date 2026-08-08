import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { auth } from "./firebaseApp.js";

// Importar este módulo já ativa a guarda: redireciona para o login se não houver
// usuário autenticado. `whenAuthenticated` resolve com o usuário para quem precisar
// do uid/email/nome (requestService, formularioController, adminPanel).
export const whenAuthenticated = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    resolve(user);
  });
});
