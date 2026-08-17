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

export const auth = getAuth(app);

export const db = getFirestore(app);

export const googleProvider =
  new GoogleAuthProvider();

export default app;
