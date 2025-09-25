import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDnKrtZgb-Kx_sjIlkRgvpryCP0Tj3OQ7Q",
  authDomain: "goldenbellai.com",
  projectId: "goldenbellai-d2605",
  storageBucket: "goldenbellai-d2605.firebasestorage.app",
  messagingSenderId: "76012037597",
  appId: "1:76012037597:web:9a7fc2fee400db25dd0234",
  measurementId: "G-XDTT7Q4T8V"
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firestore 초기화
export const db = getFirestore(app);

// Auth 초기화
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
