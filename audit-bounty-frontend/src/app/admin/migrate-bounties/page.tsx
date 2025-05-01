'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { doc, getDoc, updateDoc, collection, query, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// Old and new program IDs
const OLD_PROGRAM_ID = '3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh';
const NEW_PROGRAM_ID = 'Gd2hEeEPdvPN7bPdbkthPZHxsaRNTJWxcpp2pwRWBw4R';

export default function MigrateBounties() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [bounties, setBounties] = useState<any[]>([]);
  const [migratedBounties, setMigratedBounties] = useState<{
    id: string;
    title: string;
    oldBountyAddress: string;
    newBountyAddress: string;
  }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          setIsAdmin(userDoc.data()?.isAdmin === true);
        } catch (error) {
          console.error("Error checking admin status:", error);
          setIsAdmin(false);
        }
      }
    };

    checkAdmin();
  }, [user]);

  // Fetch all bounties
  const fetchBounties = async () => {
    try {
      setError(null);
      setStatusMessage('Fetching bounties...');
      
      const bountiesRef = collection(db, 'bounties');
      const q = query(bountiesRef);
      const querySnapshot = await getDocs(q);
      
      const bountiesList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setBounties(bountiesList);
      setStatusMessage(`Found ${bountiesList.length} bounties.`);
    } catch (error) {
      console.error("Error fetching bounties:", error);
      setError(`Failed to fetch bounties: ${error instanceof Error ? error.message : String(error)}`);
      setStatusMessage(null);
    }
  };

  // Calculate new PDAs based on the bounty data
  const calculateNewPdas = (bounty: any) => {
    try {
      if (!bounty.customSeed || !bounty.creatorAddress) {
        return { error: 'Missing required seed or creator address' };
      }

      const seedBuffer = new TextEncoder().encode(bounty.customSeed);
      const creatorBuffer = new PublicKey(bounty.creatorAddress).toBuffer();
      
      // Calculate new PDAs
      const newProgramId = new PublicKey(NEW_PROGRAM_ID);
      const [newBountyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), creatorBuffer, seedBuffer],
        newProgramId
      );

      const [newVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), newBountyPda.toBuffer()],
        newProgramId
      );

      return {
        newBountyPda: newBountyPda.toString(),
        newVaultPda: newVaultPda.toString()
      };
    } catch (error) {
      console.error("Error calculating PDAs:", error);
      return { error: `Failed to calculate PDAs: ${error instanceof Error ? error.message : String(error)}` };
    }
  };

  // Migrate a single bounty
  const migrateBounty = async (bounty: any) => {
    try {
      if (!bounty.id) {
        throw new Error('Bounty ID is missing');
      }

      // Calculate new PDAs
      const pdaResult = calculateNewPdas(bounty);
      if ('error' in pdaResult) {
        throw new Error(pdaResult.error);
      }

      // Update the bounty in Firebase
      const bountyRef = doc(db, 'bounties', bounty.id);
      await updateDoc(bountyRef, {
        bountyAddress: pdaResult.newBountyPda,
        vaultAddress: pdaResult.newVaultPda,
        programId: NEW_PROGRAM_ID,
        migratedAt: new Date().toISOString(),
        previousBountyAddress: bounty.bountyAddress,
        previousVaultAddress: bounty.vaultAddress
      });

      return {
        id: bounty.id,
        title: bounty.title,
        oldBountyAddress: bounty.bountyAddress,
        newBountyAddress: pdaResult.newBountyPda
      };
    } catch (error) {
      console.error(`Error migrating bounty ${bounty.id}:`, error);
      throw error;
    }
  };

  // Migrate all bounties
  const migrateAllBounties = async () => {
    if (isMigrating) return;
    
    setIsMigrating(true);
    setError(null);
    setStatusMessage('Starting migration...');
    setMigratedBounties([]);
    
    try {
      const migrated = [];
      
      for (let i = 0; i < bounties.length; i++) {
        const bounty = bounties[i];
        setStatusMessage(`Migrating bounty ${i + 1}/${bounties.length}: ${bounty.title}`);
        
        try {
          const result = await migrateBounty(bounty);
          migrated.push(result);
          setMigratedBounties([...migrated]);
        } catch (error) {
          console.error(`Error migrating bounty ${bounty.id}:`, error);
        }
      }
      
      setStatusMessage(`Migration completed. ${migrated.length}/${bounties.length} bounties migrated.`);
    } catch (error) {
      console.error("Error during migration:", error);
      setError(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsMigrating(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="container mx-auto p-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Loading...</h1>
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="container mx-auto p-4 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Access Denied</h1>
          <p>You must be an admin to access this page.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Migrate Bounties to New Program ID</h1>
        
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Program IDs</h2>
          <div className="space-y-2">
            <p><strong>Old Program ID:</strong> {OLD_PROGRAM_ID}</p>
            <p><strong>New Program ID:</strong> {NEW_PROGRAM_ID}</p>
          </div>
        </div>
        
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Migration Controls</h2>
          
          <div className="space-y-4">
            <button
              onClick={fetchBounties}
              disabled={isMigrating}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Fetch Bounties
            </button>
            
            {bounties.length > 0 && (
              <button
                onClick={migrateAllBounties}
                disabled={isMigrating}
                className="ml-4 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isMigrating ? 'Migrating...' : 'Migrate All Bounties'}
              </button>
            )}
          </div>
          
          {statusMessage && (
            <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-md">
              {statusMessage}
            </div>
          )}
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-800 rounded-md">
              {error}
            </div>
          )}
        </div>
        
        {bounties.length > 0 && (
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Bounties ({bounties.length})</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Creator
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bounties.map((bounty) => (
                    <tr key={bounty.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {bounty.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {bounty.creatorName || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {migratedBounties.some(mb => mb.id === bounty.id) ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Migrated
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {migratedBounties.length > 0 && (
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Migration Results</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Old Bounty Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      New Bounty Address
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {migratedBounties.map((bounty) => (
                    <tr key={bounty.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {bounty.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="font-mono text-xs">{bounty.oldBountyAddress}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="font-mono text-xs">{bounty.newBountyAddress}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
} 