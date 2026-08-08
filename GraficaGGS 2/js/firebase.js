import {
  signInWithPopup,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { auth } from "./firebaseApp.js";

auth.languageCode = "it";
const provider = new GoogleAuthProvider();


$(document).ready(function () {
  $("#loginbtn").click(function () {
    signInWithPopup(auth, provider)
  .then((result) => {
    
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;
    
    const user = result.user;
    console.log(user);

    //salva nome e foto no local storage
    localStorage.setItem("nomeggs", user.displayName);
    localStorage.setItem("fotoggs", user.photoURL);
    //redireciona para a pagina de perfil
    window.location.href = "Formulario.html";

  }).catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    const email = error.customData.email;
    const credential = GoogleAuthProvider.credentialFromError(error);
  });
  });
});
