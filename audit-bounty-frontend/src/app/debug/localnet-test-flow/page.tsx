'use client';

import { useState, useEffect } from 'react';
import { createLocalWallet, fundTestWallet, getWalletAddress, getTestWalletBalance } from '@/lib/solana/localWallet';
import { SolanaService } from '@/services/solana';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getCluster } from '@/lib/solana/config';
import { sendSignedTransactionToLocalnet } from '@/lib/solana/local-sender';

interface StatusUpdate {
  step: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  data?: any;
}

export default function LocalnetTestFlow() {
  const [isLocalnetRunning, setIsLocalnetRunning] = useState<boolean>(false);
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([]);
  const [bountyAddress, setBountyAddress] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [fundedWallets, setFundedWallets] = useState<Record<string, boolean>>({
    creator: false,
    auditor: false,
    validator: false
  });

  // Check if localnet is running
  useEffect(() => {
    async function checkLocalnet() {
      try {
        const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
        const version = await connection.getVersion();
        console.log('Connected to Solana localnet:', version);
        setIsLocalnetRunning(true);
        addStatusUpdate('localnet', 'success', `Connected to Solana localnet: ${version['solana-core']}`);
      } catch (error) {
        console.error('Failed to connect to localnet:', error);
        setIsLocalnetRunning(false);
        addStatusUpdate('localnet', 'error', 'Failed to connect to localnet. Make sure it is running with "solana-test-validator"');
      }
    }

    checkLocalnet();
  }, []);

  // Helper to add status updates
  const addStatusUpdate = (step: string, status: 'pending' | 'success' | 'error', message: string, data?: any) => {
    setStatusUpdates(prev => [
      ...prev,
      { step, status, message, data }
    ]);
  };

  // Fund test wallets
  const handleFundWallets = async () => {
    try {
      addStatusUpdate('funding', 'pending', 'Funding test wallets with SOL...');
      
      // Fund creator with 5 SOL
      await fundTestWallet('creator', 5);
      
      // Verify the creator wallet was funded
      const creatorBalance = await getTestWalletBalance('creator');
      if (creatorBalance < 1) {
        addStatusUpdate('funding', 'error', `Creator wallet funding failed. Balance: ${creatorBalance} SOL. Check if the localnet validator is running and responding to airdrop requests.`);
        return;
      }
      
      setFundedWallets(prev => ({ ...prev, creator: true }));
      
      // Fund auditor with 2 SOL
      await fundTestWallet('auditor', 2);
      const auditorBalance = await getTestWalletBalance('auditor');
      setFundedWallets(prev => ({ ...prev, auditor: auditorBalance >= 1 }));
      
      // Fund validator with 2 SOL
      await fundTestWallet('validator', 2);
      const validatorBalance = await getTestWalletBalance('validator');
      setFundedWallets(prev => ({ ...prev, validator: validatorBalance >= 1 }));
      
      const totalFunded = creatorBalance + auditorBalance + validatorBalance;
      
      addStatusUpdate('funding', 'success', `All test wallets funded successfully with total ${totalFunded.toFixed(2)} SOL`);
      
      // Log wallet addresses for reference
      console.log('Funded wallets:');
      console.log('Creator:', getWalletAddress('creator'), `(${creatorBalance} SOL)`);
      console.log('Auditor:', getWalletAddress('auditor'), `(${auditorBalance} SOL)`);
      console.log('Validator:', getWalletAddress('validator'), `(${validatorBalance} SOL)`);
      
    } catch (error) {
      console.error('Error funding wallets:', error);
      addStatusUpdate('funding', 'error', `Error funding wallets: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Create a bounty with creator wallet
  const handleCreateBounty = async () => {
    try {
      addStatusUpdate('createBounty', 'pending', 'Creating bounty using creator wallet...');

      // First check if the creator wallet is funded
      const creatorBalance = await getTestWalletBalance('creator');
      if (creatorBalance < 1) {
        addStatusUpdate('createBounty', 'error', `Creator wallet doesn't have enough SOL (${creatorBalance} SOL). Please fund the wallet first.`);
        return;
      }

      // Get the creator wallet
      const creatorWallet = createLocalWallet('creator');
      
      // Calculate deadline (7 days from now)
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7);
      
      // Log transaction details
      if (creatorWallet.publicKey) {
        console.log('Creating bounty with wallet:', creatorWallet.publicKey.toString());
      }
      console.log('Current SOL balance:', creatorBalance);
      
      // Create bounty with the local wallet
      const result = await SolanaService.initializeBounty(
        creatorWallet,
        {
          title: "Test Bounty",
          description: "This is a test bounty created for localnet testing",
          repoUrl: "https://github.com/test/repo",
          amount: 1, // 1 SOL
          deadline: deadline,
          tags: ["test", "localnet"],
          skipFirebaseCreation: true // Skip creating in Firebase
        }
      );
      
      console.log('Bounty created:', result);
      setBountyAddress(result.bountyAddress);
      addStatusUpdate('createBounty', 'success', `Bounty created successfully with 1 SOL`, {
        bountyAddress: result.bountyAddress,
        txSignature: result.txSignature
      });
    } catch (error) {
      console.error('Error creating bounty:', error);
      
      // Provide more detailed error message
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("Attempt to debit an account but found no record of a prior credit")) {
        errorMessage = "Creator wallet doesn't have enough SOL. Make sure you've funded it first by clicking 'Fund Test Wallets'";
      }
      
      addStatusUpdate('createBounty', 'error', `Error creating bounty: ${errorMessage}`);
    }
  };

  // Submit audit work with auditor wallet
  const handleSubmitWork = async () => {
    if (!bountyAddress) {
      addStatusUpdate('submitWork', 'error', 'No bounty address available. Create a bounty first.');
      return;
    }

    try {
      addStatusUpdate('submitWork', 'pending', 'Submitting audit work using auditor wallet...');

      // Get the auditor wallet
      const auditorWallet = createLocalWallet('auditor');
      
      // Generate a unique submission ID
      const generatedSubmissionId = `submission_${Date.now()}`;
      setSubmissionId(generatedSubmissionId);
      
      // Submit work
      const result = await SolanaService.submitAuditWork(
        auditorWallet,
        bountyAddress,
        {
          description: "Found a critical vulnerability in the contract",
          ipfsHash: "QmTestHash123456789", // Mock IPFS hash
          severity: 1 // Critical severity - changed from 0 to 1 since the contract requires 1-5
        }
      );
      
      console.log('Submission result:', result);
      addStatusUpdate('submitWork', 'success', `Audit work submitted successfully`, {
        submissionId: generatedSubmissionId,
        submissionAddress: result.submissionAddress,
        txSignature: result.txSignature
      });
    } catch (error) {
      console.error('Error submitting work:', error);
      
      // Provide more detailed error message
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("invalid instruction data")) {
        errorMessage = "Invalid instruction data error. This might be due to a serialization issue with the borsh encoding.";
      } else if (errorMessage.includes("Attempt to debit an account but found no record of a prior credit")) {
        errorMessage = "Auditor wallet doesn't have enough SOL. Make sure you've funded it by clicking 'Fund Test Wallets'";
      }
      
      addStatusUpdate('submitWork', 'error', `Error submitting work: ${errorMessage}`);
    }
  };

  // Approve submission with creator wallet
  const handleApproveSubmission = async () => {
    if (!bountyAddress || !submissionId) {
      addStatusUpdate('approveSubmission', 'error', 'Missing bounty address or submission ID');
      return;
    }

    try {
      addStatusUpdate('approveSubmission', 'pending', 'Approving submission using creator wallet...');

      // Get the creator wallet
      const creatorWallet = createLocalWallet('creator');
      
      // Get the auditor wallet address
      const auditorAddress = getWalletAddress('auditor');
      
      // Approve the submission
      const result = await SolanaService.approveSubmission(
        creatorWallet,
        bountyAddress,
        auditorAddress,
        submissionId
      );
      
      console.log('Approval result:', result);
      
      if (result.status === 'success') {
        addStatusUpdate('approveSubmission', 'success', `Submission approved successfully. The auditor is now authorized to claim the reward.`, {
          txSignature: result.txSignature
        });
      } else {
        addStatusUpdate('approveSubmission', 'error', `Error approving submission: ${result.message}`);
      }
    } catch (error) {
      console.error('Error approving submission:', error);
      addStatusUpdate('approveSubmission', 'error', `Error approving submission: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Claim bounty with auditor wallet
  const handleClaimBounty = async () => {
    if (!bountyAddress) {
      addStatusUpdate('claimBounty', 'error', 'No bounty address available');
      return;
    }

    try {
      addStatusUpdate('claimBounty', 'pending', 'Claiming bounty using auditor wallet...');

      // Get the auditor wallet
      const auditorWallet = createLocalWallet('auditor');
      
      // Claim the bounty
      const result = await SolanaService.claimBounty(
        auditorWallet,
        bountyAddress
      );
      
      console.log('Claim result:', result);
      
      if (result.status === 'success') {
        addStatusUpdate('claimBounty', 'success', `Bounty claimed successfully! The funds have been transferred to the auditor's wallet.`, {
          signature: result.signature
        });
      } else {
        addStatusUpdate('claimBounty', 'error', `Error claiming bounty: ${result.message}`);
      }
    } catch (error) {
      console.error('Error claiming bounty:', error);
      addStatusUpdate('claimBounty', 'error', `Error claiming bounty: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Reset the test flow
  const handleReset = () => {
    setBountyAddress(null);
    setSubmissionId(null);
    setStatusUpdates([]);
    setFundedWallets({
      creator: false,
      auditor: false,
      validator: false
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Localnet Bounty Test Flow</h1>
      
      <div className="bg-blue-50 p-4 mb-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Network Status</h2>
        {isLocalnetRunning ? (
          <p className="text-green-600">✅ Connected to Solana localnet at {process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899'}</p>
        ) : (
          <p className="text-red-600">❌ Not connected to localnet. Make sure solana-test-validator is running.</p>
        )}
        <p className="text-sm text-gray-700 mt-2">This tool uses local wallet signing to test the complete bounty flow on localnet. All transactions happen within the local validator.</p>
      </div>
      
      <div className="flex flex-wrap gap-4 mb-8">
        <button
          onClick={handleFundWallets}
          disabled={!isLocalnetRunning || Object.values(fundedWallets).every(v => v)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          1. Fund Test Wallets
        </button>
        
        <button
          onClick={handleCreateBounty}
          disabled={!isLocalnetRunning || !fundedWallets.creator}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          2. Create Bounty
        </button>
        
        <button
          onClick={handleSubmitWork}
          disabled={!isLocalnetRunning || !bountyAddress || !fundedWallets.auditor}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
        >
          3. Submit Audit Work
        </button>
        
        <button
          onClick={handleApproveSubmission}
          disabled={!isLocalnetRunning || !submissionId || !fundedWallets.creator}
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-400"
        >
          4. Approve Submission
        </button>
        
        <button
          onClick={handleClaimBounty}
          disabled={!isLocalnetRunning || !bountyAddress || !submissionId}
          className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:bg-gray-400"
        >
          5. Claim Bounty
        </button>
        
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Reset
        </button>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Wallet Addresses</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white shadow rounded p-4">
            <h3 className="font-medium">Creator Wallet</h3>
            <p className="text-sm font-mono mt-1 break-all">{getWalletAddress('creator')}</p>
            <p className="text-xs mt-2">{fundedWallets.creator ? '✅ Funded' : '❌ Not funded'}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="font-medium">Auditor Wallet</h3>
            <p className="text-sm font-mono mt-1 break-all">{getWalletAddress('auditor')}</p>
            <p className="text-xs mt-2">{fundedWallets.auditor ? '✅ Funded' : '❌ Not funded'}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="font-medium">Validator Wallet</h3>
            <p className="text-sm font-mono mt-1 break-all">{getWalletAddress('validator')}</p>
            <p className="text-xs mt-2">{fundedWallets.validator ? '✅ Funded' : '❌ Not funded'}</p>
          </div>
        </div>
      </div>
      
      {statusUpdates.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Status Updates</h2>
          <div className="space-y-4">
            {statusUpdates.map((update, index) => (
              <div 
                key={index} 
                className={`p-4 rounded-lg ${
                  update.status === 'success' ? 'bg-green-50 border-l-4 border-green-500' : 
                  update.status === 'error' ? 'bg-red-50 border-l-4 border-red-500' : 
                  'bg-yellow-50 border-l-4 border-yellow-500'
                }`}
              >
                <div className="flex items-center">
                  <span className={`inline-block w-8 h-8 rounded-full mr-2 flex items-center justify-center ${
                    update.status === 'success' ? 'bg-green-500' : 
                    update.status === 'error' ? 'bg-red-500' : 
                    'bg-yellow-500'
                  } text-white`}>
                    {update.status === 'success' ? '✓' : update.status === 'error' ? '✗' : '...'}
                  </span>
                  <h3 className="font-medium">{update.step.charAt(0).toUpperCase() + update.step.slice(1)}</h3>
                </div>
                <p className="ml-10 mt-1">{update.message}</p>
                {update.data && (
                  <pre className="ml-10 mt-2 bg-gray-100 p-2 rounded text-xs overflow-auto">
                    {JSON.stringify(update.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 