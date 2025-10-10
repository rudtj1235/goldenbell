import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth, googleProvider } from '../config/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, signInAnonymously, User } from 'firebase/auth';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutApp: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      try { (window as any).firebaseAuthUid = u?.uid || null; } catch {}
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // 로그인하지 않은 경우 자동으로 익명 로그인하여 세션 지속성 보장
    if (!loading && !user) {
      signInAnonymously(auth).catch(() => {});
    }
  }, [loading, user]);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOutApp = async () => {
    await signOut(auth);
  };

  const value = useMemo<AuthContextValue>(() => ({ user, loading, signInWithGoogle, signOutApp }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};


