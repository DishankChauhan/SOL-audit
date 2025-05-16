'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

export function Header() {
  const { user, userRole, loading, logout } = useAuth();
  const { connected } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isModeratorRole, setIsModeratorRole] = useState(false);

  useEffect(() => {
    // Check if user has moderator role directly from Firestore
    const checkModeratorRole = async () => {
      if (!user) {
        setIsModeratorRole(false);
        return;
      }

      try {
        // Import Firestore modules
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');
        
        // Get the user document
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setIsModeratorRole(userData.role === 'moderator');
        } else {
          setIsModeratorRole(false);
        }
      } catch (error) {
        console.error('Error checking moderator role:', error);
        setIsModeratorRole(false);
      }
    };

    checkModeratorRole();
  }, [user]);

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-indigo-700">Sol Audit</span>
            </Link>
            <nav className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link href="/" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                Home
              </Link>
              <Link href="/bounties" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                Browse Bounties
              </Link>
              {user && (
                <Link href="/dashboard" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Dashboard
                </Link>
              )}
              {user && userRole === 'creator' && (
                <Link href="/bounty/create" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Create Bounty
                </Link>
              )}
              {user && isModeratorRole && (
                <Link href="/disputes" className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Dispute DAO
                </Link>
              )}
            </nav>
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center gap-4">
            {!loading && (
              <>
                {user ? (
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-gray-700">
                      {user.displayName || user.email}
                    </div>
                    <button
                      onClick={logout}
                      className="bg-white px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Logout
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    className="bg-indigo-600 px-3 py-1.5 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Login
                  </Link>
                )}
                <div className="ml-3 relative">
                  <WalletMultiButton />
                </div>
              </>
            )}
          </div>
          <div className="-mr-2 flex items-center sm:hidden">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            >
              <span className="sr-only">Open main menu</span>
              {menuOpen ? (
                <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden">
          <div className="pt-2 pb-3 space-y-1">
            <Link href="/" className="bg-indigo-50 border-indigo-500 text-indigo-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium">
              Home
            </Link>
            <Link href="/bounties" className="border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium">
              Browse Bounties
            </Link>
            {user && (
              <Link href="/dashboard" className="border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium">
                Dashboard
              </Link>
            )}
            {user && userRole === 'creator' && (
              <Link href="/bounty/create" className="border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium">
                Create Bounty
              </Link>
            )}
            {user && userRole === 'moderator' && (
              <Link href="/disputes" className="border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 border-l-4 text-base font-medium">
                Dispute DAO
              </Link>
            )}
          </div>
          {!loading && (
            <div className="pt-4 pb-3 border-t border-gray-200">
              {user ? (
                <div className="flex items-center px-4 gap-4">
                  <div className="text-base font-medium text-gray-800">
                    {user.displayName || user.email}
                  </div>
                  <button
                    onClick={logout}
                    className="bg-white px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center px-4">
                  <Link
                    href="/login"
                    className="bg-indigo-600 px-3 py-1.5 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Login
                  </Link>
                </div>
              )}
              <div className="mt-3 px-2">
                <WalletMultiButton />
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
} 