'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { MainLayout } from '@/components/layout/MainLayout';

// Old and new program IDs
const OLD_PROGRAM_ID = '3K6VQ96CqESYiVT5kqPy6BU7ZDQbkZhVU4K5Bas7r9eh';
const NEW_PROGRAM_ID = 'Gd2hEeEPdvPN7bPdbkthPZHxsaRNTJWxcpp2pwRWBw4R';

export default function PdaChecker() {
  const [creatorWallet, setCreatorWallet] = useState('');
  const [bountyTitle, setBountyTitle] = useState('');
  const [oldBountyPda, setOldBountyPda] = useState('');
  const [oldVaultPda, setOldVaultPda] = useState('');
  const [newBountyPda, setNewBountyPda] = useState('');
  const [newVaultPda, setNewVaultPda] = useState('');
  const [seed, setSeed] = useState('');

  const calculatePdas = () => {
    if (!creatorWallet || !bountyTitle) return;

    try {
      // Clean the title to generate the seed (same logic as in initialize route)
      const cleanTitle = bountyTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
      const customSeed = cleanTitle.substring(0, Math.min(cleanTitle.length, 8));
      const seedBuffer = new TextEncoder().encode(customSeed);
      setSeed(customSeed);

      // Calculate old PDAs
      const oldProgramId = new PublicKey(OLD_PROGRAM_ID);
      const [oldBounty] = PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new PublicKey(creatorWallet).toBuffer(), seedBuffer],
        oldProgramId
      );
      setOldBountyPda(oldBounty.toString());

      const [oldVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), oldBounty.toBuffer()],
        oldProgramId
      );
      setOldVaultPda(oldVault.toString());

      // Calculate new PDAs
      const newProgramId = new PublicKey(NEW_PROGRAM_ID);
      const [newBounty] = PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new PublicKey(creatorWallet).toBuffer(), seedBuffer],
        newProgramId
      );
      setNewBountyPda(newBounty.toString());

      const [newVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), newBounty.toBuffer()],
        newProgramId
      );
      setNewVaultPda(newVault.toString());
    } catch (error) {
      console.error("Error calculating PDAs:", error);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">PDA Migration Checker</h1>
        <p className="mb-4 text-gray-600">
          This tool helps verify how PDAs change after migrating to a new program ID.
        </p>

        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Program IDs</h2>
          <div className="space-y-2">
            <p><strong>Old Program ID:</strong> {OLD_PROGRAM_ID}</p>
            <p><strong>New Program ID:</strong> {NEW_PROGRAM_ID}</p>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Check PDAs</h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="creator-wallet" className="block text-sm font-medium text-gray-700">
                Creator Wallet Address
              </label>
              <input
                id="creator-wallet"
                type="text"
                value={creatorWallet}
                onChange={(e) => setCreatorWallet(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Enter wallet address"
              />
            </div>
            
            <div>
              <label htmlFor="bounty-title" className="block text-sm font-medium text-gray-700">
                Bounty Title
              </label>
              <input
                id="bounty-title"
                type="text"
                value={bountyTitle}
                onChange={(e) => setBountyTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Enter bounty title"
              />
              <p className="mt-1 text-xs text-gray-500">
                The title is used to generate a seed for PDAs
              </p>
            </div>
            
            <button
              onClick={calculatePdas}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Calculate PDAs
            </button>
          </div>
        </div>

        {seed && (
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Results</h2>
            
            <div className="space-y-4">
              <div>
                <p><strong>Seed Used:</strong> "{seed}"</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-gray-50">
                  <h3 className="font-semibold mb-2">Old Program PDAs</h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Bounty PDA:</p>
                      <p className="text-xs font-mono break-all bg-gray-100 p-2 rounded">{oldBountyPda}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Vault PDA:</p>
                      <p className="text-xs font-mono break-all bg-gray-100 p-2 rounded">{oldVaultPda}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-gray-50">
                  <h3 className="font-semibold mb-2">New Program PDAs</h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Bounty PDA:</p>
                      <p className="text-xs font-mono break-all bg-gray-100 p-2 rounded">{newBountyPda}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Vault PDA:</p>
                      <p className="text-xs font-mono break-all bg-gray-100 p-2 rounded">{newVaultPda}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
} 