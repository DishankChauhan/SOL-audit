'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  User, 
  GoogleAuthProvider, 
  GithubAuthProvider,
  signInWithPopup, 
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { useWallet } from '@solana/wallet-adapter-react';
import { validateWalletAddress } from '@/lib/utils';
import { SolanaService } from '@/services/solana';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userRole: 'creator' | 'contributor' | 'moderator' | null;
  linkedWallet: string | null;
  walletLinkDate: Date | null;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  linkWalletAddress: (address: string) => Promise<void>;
  unlinkWallet: () => Promise<void>;
  updateUserProfile: (profileData: Partial<UserProfile>) => Promise<void>;
}

interface UserProfile {
  email: string;
  name: string;
  role: 'creator' | 'contributor' | 'moderator';
  walletAddress: string | null;
  walletLinkDate?: Date | null;
  bio?: string;
  website?: string;
  github?: string;
  twitter?: string;
  skills?: string[];
  createdAt: Date;
  updatedAt?: Date;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthContextProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'creator' | 'contributor' | 'moderator' | null>(null);
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);
  const [walletLinkDate, setWalletLinkDate] = useState<Date | null>(null);
  const { publicKey, signMessage } = useWallet();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);
      
      if (authUser) {
        setUser(authUser);
        
        // Get user data from Firestore
        const userDocRef = doc(db, 'users', authUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData.role);
          setLinkedWallet(userData.walletAddress || null);
          setWalletLinkDate(userData.walletLinkDate ? new Date(userData.walletLinkDate.toDate()) : null);
        } else {
          // Create new user document
          await setDoc(userDocRef, {
            email: authUser.email,
            name: authUser.displayName,
            role: 'contributor', // Default role
            createdAt: serverTimestamp(),
            walletAddress: null,
            walletLinkDate: null,
          });
          setUserRole('contributor');
        }
      } else {
        setUser(null);
        setUserRole(null);
        setLinkedWallet(null);
        setWalletLinkDate(null);
      }
      
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGithub = async () => {
    try {
      setLoading(true);
      const provider = new GithubAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Github:', error);
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Error signing in with email:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (email: string, password: string) => {
    try {
      setLoading(true);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Error registering with email:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await signOut(auth);
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setLoading(false);
    }
  };

  const linkWalletAddress = async (address: string) => {
    if (!user) throw new Error('User not authenticated');
    
    // If address is empty string, we're unlinking
    if (address === '') {
      return unlinkWallet();
    }
    
    // Validate wallet address
    if (!validateWalletAddress(address)) {
      throw new Error('Invalid wallet address format');
    }
    
    try {
      // Check if wallet is already linked to another account
      const usersCollection = collection(db, 'users');
      const walletQuery = query(usersCollection, where('walletAddress', '==', address));
      const querySnapshot = await getDocs(walletQuery);
      
      if (!querySnapshot.empty && querySnapshot.docs[0].id !== user.uid) {
        throw new Error('This wallet is already linked to another account');
      }
      
      // Update user document
      const userDocRef = doc(db, 'users', user.uid);
      const now = new Date();
      
      await updateDoc(userDocRef, { 
        walletAddress: address,
        walletLinkDate: now,
        updatedAt: serverTimestamp()
      });
      
      setLinkedWallet(address);
      setWalletLinkDate(now);
      
    } catch (error) {
      console.error('Error linking wallet:', error);
      throw error;
    }
  };

  const unlinkWallet = async () => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      await updateDoc(userDocRef, { 
        walletAddress: null,
        walletLinkDate: null,
        updatedAt: serverTimestamp()
      });
      
      setLinkedWallet(null);
      setWalletLinkDate(null);
      
    } catch (error) {
      console.error('Error unlinking wallet:', error);
      throw error;
    }
  };

  const updateUserProfile = async (profileData: Partial<UserProfile>) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      // Add updatedAt timestamp
      const dataWithTimestamp = {
        ...profileData,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(userDocRef, dataWithTimestamp);
      
      // Update local state if role is changed
      if (profileData.role) {
        setUserRole(profileData.role);
      }
      
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    userRole,
    linkedWallet,
    walletLinkDate,
    signInWithGoogle,
    signInWithGithub,
    signInWithEmail,
    registerWithEmail,
    logout,
    linkWalletAddress,
    unlinkWallet,
    updateUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthContextProvider');
  }
  return context;
}; 