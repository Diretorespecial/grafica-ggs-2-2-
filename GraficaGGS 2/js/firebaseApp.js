// Sem Firebase Storage de propósito: o Storage exige o plano pago Blaze.
// Todo arquivo gerado pelo app fica embutido (base64) no Firestore, que é
// gratuito no plano Spark — ver js/requestService.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYJvDkaJ9ZvDEh_kipVxhjPaoB2hdcBzY",
  authDomain: "grafica-ggs.firebaseapp.com",
  projectId: "grafica-ggs",
  storageBucket: "grafica-ggs.firebasestorage.app",
  messagingSenderId: "419998765555",
  appId: "1:419998765555:web:8dc7e5df806ab0fd5c4286",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
