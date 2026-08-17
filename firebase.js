import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider
} from "firebase/auth";
import {
  getFirestore
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDQS11maoQYMBZTjMx7rkhq6oR5SigDUQU",
  authDomain: "xoro-social.firebaseapp.com",
  projectId: "xoro-social",
  storageBucket: "xoro-social.firebasestorage.app",
  messagingSenderId: "477868315814",
  appId: "1:477868315814:web:2127fe0868deaf20a31067"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const googleProvider =
  new GoogleAuthProvider();

export {
  auth,
  db,
  googleProvider
};
