import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDduCmbkMJCMPjzB4KrMjufIoGP-myiibs",
  authDomain: "graficaggs-1ac94.firebaseapp.com",
  projectId: "graficaggs-1ac94",
  storageBucket: "graficaggs-1ac94.firebasestorage.app",
  messagingSenderId: "413867470248",
  appId: "1:413867470248:web:8374ac2beca05162fb819d",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
