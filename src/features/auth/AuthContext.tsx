import React, { createContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { auth, db, googleProvider, isFirebaseConfigured } from '@/lib/firebase';
import { useTenantStore } from '@/store/useTenantStore';
import type { UserProfile } from '@/types/schema';

export interface RegistrationPayload {
  displayName: string;
  phone: string;
  nik: string;
}

export type GoogleRegistrationStepResult = 'ready_to_register' | 'already_registered' | 'cancelled' | 'error';

export interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  needsRegistration: boolean;
  authError: string | null;
  unregisteredEmail: string | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<boolean>;
  startGoogleRegistration: () => Promise<GoogleRegistrationStepResult>;
  completeRegistration: (payload: RegistrationPayload) => Promise<boolean>;
  retryProfileSync: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function formatFirebaseError(error: unknown): string {
  const err = error as { code?: string; message?: string };
  if (err?.code && err?.message) {
    return `[${err.code}] ${err.message}`;
  }
  if (err?.message) return err.message;
  return 'Unknown Firestore error';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured);
  const [needsRegistration, setNeedsRegistration] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [unregisteredEmail, setUnregisteredEmail] = useState<string | null>(null);

  const unsubscribeProfileRef = useRef<(() => void) | null>(null);
  // Prevents onAuthStateChanged from interfering during explicit login/register popup checks
  const authFlowLockRef = useRef<boolean>(false);

  const detachProfileListener = useCallback(() => {
    if (unsubscribeProfileRef.current) {
      unsubscribeProfileRef.current();
      unsubscribeProfileRef.current = null;
    }
  }, []);

  const attachProfileSubscription = useCallback(
    (user: FirebaseUser) => {
      if (!db) return;
      detachProfileListener();
      const userRef = doc(db, 'users', user.uid);

      unsubscribeProfileRef.current = onSnapshot(
        userRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setUserProfile({
              uid: snapshot.id,
              email: data.email ?? user.email ?? '',
              displayName: data.displayName ?? user.displayName ?? 'Unnamed Operator',
              photoURL: data.photoURL ?? user.photoURL ?? undefined,
              role: data.role ?? 'user',
              membershipTier: data.membershipTier === 'premium' ? 'premium' : 'basic',
              tenantId: data.tenantId ?? null,
              phone: data.phone ?? '',
              nik: data.nik ?? undefined,
              kycStatus: data.kycStatus ?? 'unverified',
              kycDocs: data.kycDocs ?? [],
              isBlacklisted: Boolean(data.isBlacklisted),
              blacklistReason: data.blacklistReason ?? undefined,
              createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
            });
            setNeedsRegistration(false);
            setUnregisteredEmail(null);
            setAuthError(null);
          } else {
            setUserProfile(null);
            setNeedsRegistration(true);
          }
          setLoading(false);
        },
        (error) => {
          const detail = formatFirebaseError(error);
          console.error('Failed to subscribe to user profile:', error);
          setAuthError(detail);
          toast.error(`Profile sync error: ${detail}`);
          setLoading(false);
        }
      );
    },
    [detachProfileListener]
  );

  const checkExistingProfile = useCallback(
    async (user: FirebaseUser) => {
      if (!db) return;
      detachProfileListener();
      setLoading(true);
      setAuthError(null);

      try {
        const userRef = doc(db, 'users', user.uid);
        const existingSnap = await getDoc(userRef);

        if (!existingSnap.exists()) {
          // Strict NO-BYPASS: never auto-create users/{uid} during session restore
          setUserProfile(null);
          setNeedsRegistration(true);
          setLoading(false);
          return;
        }

        attachProfileSubscription(user);
      } catch (error) {
        const detail = formatFirebaseError(error);
        console.error('Error reading user profile document:', error);
        setAuthError(detail);
        setLoading(false);
      }
    },
    [attachProfileSubscription, detachProfileListener]
  );

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (authFlowLockRef.current) return;

      setFirebaseUser(user);

      if (!user) {
        detachProfileListener();
        setUserProfile(null);
        setNeedsRegistration(false);
        setLoading(false);
        return;
      }

      await checkExistingProfile(user);
    });

    return () => {
      unsubscribeAuth();
      detachProfileListener();
    };
  }, [checkExistingProfile, detachProfileListener]);

  /**
   * Strict Login: ONLY allows accounts that already completed /register and exist in Firestore users/{uid}.
   * Unregistered Google accounts are immediately signed out and blocked.
   */
  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth || !db) {
      toast.error('Firebase credentials are missing. Configure .env.local first.');
      return false;
    }

    authFlowLockRef.current = true;
    setAuthError(null);
    setUnregisteredEmail(null);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const user = credential.user;
      const snap = await getDoc(doc(db, 'users', user.uid));

      if (!snap.exists()) {
        // Strict NO-BYPASS: revoke session immediately so unregistered users cannot enter via /login
        const email = user.email ?? 'This Google account';
        await firebaseSignOut(auth);
        setFirebaseUser(null);
        setUserProfile(null);
        setNeedsRegistration(false);
        setUnregisteredEmail(email);
        toast.error('Account not registered. Complete registration before signing in.');
        return false;
      }

      setFirebaseUser(user);
      attachProfileSubscription(user);
      toast.success('Authenticated with Google.');
      return true;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        return false;
      }
      const detail = formatFirebaseError(error);
      console.error('Google sign-in error:', error);
      setAuthError(detail);
      toast.error(`Sign-in failed: ${detail}`);
      return false;
    } finally {
      authFlowLockRef.current = false;
    }
  }, [attachProfileSubscription]);

  /**
   * Step 1 of Registration: Verify Google identity without granting app access.
   */
  const startGoogleRegistration = useCallback(async (): Promise<GoogleRegistrationStepResult> => {
    if (!isFirebaseConfigured || !auth || !db) {
      toast.error('Firebase credentials are missing.');
      return 'error';
    }

    authFlowLockRef.current = true;
    setAuthError(null);
    setUnregisteredEmail(null);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const user = credential.user;
      const snap = await getDoc(doc(db, 'users', user.uid));

      if (snap.exists()) {
        await firebaseSignOut(auth);
        setFirebaseUser(null);
        setUserProfile(null);
        setNeedsRegistration(false);
        toast.info('This Google account is already registered. Please sign in at /login.');
        return 'already_registered';
      }

      setFirebaseUser(user);
      setUserProfile(null);
      setNeedsRegistration(true);
      setLoading(false);
      return 'ready_to_register';
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        return 'cancelled';
      }
      const detail = formatFirebaseError(error);
      console.error('Google registration verification error:', error);
      setAuthError(detail);
      toast.error(`Verification failed: ${detail}`);
      return 'error';
    } finally {
      authFlowLockRef.current = false;
    }
  }, []);

  /**
   * Step 2 of Registration: Persist validated profile into Firestore users/{uid},
   * then sign out so the user explicitly logs in via /login.
   */
  const completeRegistration = useCallback(
    async (payload: RegistrationPayload): Promise<boolean> => {
      if (!auth?.currentUser || !db) {
        toast.error('Verify your Google account in Step 1 first.');
        return false;
      }

      authFlowLockRef.current = true;
      try {
        const user = auth.currentUser;
        const userRef = doc(db, 'users', user.uid);
        const existingSnap = await getDoc(userRef);

        if (existingSnap.exists()) {
          toast.info('Account is already registered. Proceed to login.');
          await firebaseSignOut(auth);
          setFirebaseUser(null);
          setUserProfile(null);
          setNeedsRegistration(false);
          return true;
        }

        await setDoc(userRef, {
          uid: user.uid,
          email: user.email ?? '',
          displayName: payload.displayName.trim(),
          photoURL: user.photoURL ?? '',
          role: 'user',
          membershipTier: 'basic',
          tenantId: null,
          phone: payload.phone.trim(),
          nik: payload.nik.trim(),
          kycStatus: 'unverified',
          kycDocs: [],
          isBlacklisted: false,
          createdAt: serverTimestamp(),
        });

        // Sign out after registration so the user completes explicit login at /login
        detachProfileListener();
        await firebaseSignOut(auth);
        setFirebaseUser(null);
        setUserProfile(null);
        setNeedsRegistration(false);
        setUnregisteredEmail(null);
        toast.success('Registration complete. Please sign in with Google to enter CameraRent.');
        return true;
      } catch (error) {
        const detail = formatFirebaseError(error);
        console.error('Complete registration error:', error);
        setAuthError(detail);
        toast.error(`Registration failed: ${detail}`);
        return false;
      } finally {
        authFlowLockRef.current = false;
      }
    },
    [detachProfileListener]
  );

  const retryProfileSync = useCallback(async () => {
    if (!auth?.currentUser) return;
    await checkExistingProfile(auth.currentUser);
  }, [checkExistingProfile]);

  const signOut = useCallback(async () => {
    if (!auth) return;
    try {
      detachProfileListener();
      await firebaseSignOut(auth);
      setFirebaseUser(null);
      setUserProfile(null);
      setNeedsRegistration(false);
      setAuthError(null);
      setUnregisteredEmail(null);
      useTenantStore.getState().resetSelection();
      toast.success('Signed out.');
    } catch (error) {
      console.error('Sign-out error:', error);
      toast.error('Failed to sign out.');
    }
  }, [detachProfileListener]);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      userProfile,
      loading,
      needsRegistration,
      authError,
      unregisteredEmail,
      isConfigured: isFirebaseConfigured,
      signInWithGoogle,
      startGoogleRegistration,
      completeRegistration,
      retryProfileSync,
      signOut,
    }),
    [
      firebaseUser,
      userProfile,
      loading,
      needsRegistration,
      authError,
      unregisteredEmail,
      signInWithGoogle,
      startGoogleRegistration,
      completeRegistration,
      retryProfileSync,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
