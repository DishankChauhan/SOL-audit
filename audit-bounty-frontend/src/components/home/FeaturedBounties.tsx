'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { formatDistanceToNow } from 'date-fns';

// Define type for a bounty
interface Bounty {
  id: string;
  title: string;
  owner: string;
  ownerName: string;
  description: string;
  bountyAmount: number;
  deadline: Date;
  tags: string[];
  submissionsCount: number;
  status: 'open' | 'closed' | 'disputed';
}

export function FeaturedBounties() {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBounties = async () => {
      try {
        // Create a query to get the top 3 open bounties with the highest reward
        const bountiesQuery = query(
          collection(db, 'bounties'),
          where('status', '==', 'open'),
          orderBy('bountyAmount', 'desc'),
          limit(3)
        );

        const snapshot = await getDocs(bountiesQuery);
        const fetchedBounties: Bounty[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            owner: data.owner,
            ownerName: data.ownerName,
            description: data.description,
            bountyAmount: data.bountyAmount,
            deadline: data.deadline.toDate(),
            tags: data.tags || [],
            submissionsCount: data.submissionsCount || 0,
            status: data.status,
          };
        });

        setBounties(fetchedBounties);
      } catch (error) {
        console.error('Error fetching featured bounties:', error);
        // Use sample data if we can't fetch from Firestore
        setBounties(sampleBounties);
      } finally {
        setLoading(false);
      }
    };

    fetchBounties();
  }, []);

  // Fallback to sample data if no bounties are fetched
  if (bounties.length === 0 && !loading) {
    setBounties(sampleBounties);
  }

  return (
    <div className="mt-6 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {loading ? (
        // Show loading skeleton
        Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="bg-white rounded-lg shadow-md animate-pulse">
            <div className="h-40 bg-gray-200 rounded-t-lg"></div>
            <div className="p-5 space-y-3">
              <div className="h-6 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
            </div>
          </div>
        ))
      ) : (
        // Show actual bounties
        bounties.map((bounty) => (
          <div key={bounty.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                  {bounty.title}
                </h3>
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  {bounty.status}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-2">by {bounty.ownerName}</p>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {bounty.description}
              </p>
              
              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-4">
                {bounty.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 text-xs rounded-full bg-indigo-50 text-indigo-700">
                    {tag}
                  </span>
                ))}
              </div>
              
              <div className="flex justify-between items-center mt-4 text-sm">
                <div className="text-gray-700">
                  <span className="font-semibold text-indigo-600">${bounty.bountyAmount.toLocaleString()}</span>
                </div>
                <div className="text-gray-500">
                  {formatDistanceToNow(bounty.deadline, { addSuffix: true })}
                </div>
              </div>
              
              <div className="mt-4">
                <Link 
                  href={`/bounty/${bounty.id}`}
                  className="block w-full text-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  View Details
                </Link>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Sample data to use when Firestore data isn't available
const sampleBounties: Bounty[] = [
  {
    id: '1',
    title: 'Smart Contract Audit for DeFi Protocol',
    owner: 'user123',
    ownerName: 'SolanaDefiLending',
    description: 'Comprehensive audit of our lending protocol built on Solana. Looking for critical vulnerabilities in our smart contracts.',
    bountyAmount: 5000,
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    tags: ['solana', 'defi', 'smart-contract'],
    submissionsCount: 3,
    status: 'open',
  },
  {
    id: '2',
    title: 'NFT Marketplace Security Review',
    owner: 'user456',
    ownerName: 'SolanaNFTMarketplace',
    description: 'Looking for security experts to audit our NFT marketplace. Focus on transaction and escrow mechanisms.',
    bountyAmount: 3000,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    tags: ['nft', 'marketplace', 'security'],
    submissionsCount: 1,
    status: 'open',
  },
  {
    id: '3',
    title: 'Governance Contract Audit',
    owner: 'user789',
    ownerName: 'SolanaDAOGovernance',
    description: 'Audit required for our DAO governance contracts. Special attention to proposal and voting mechanisms.',
    bountyAmount: 4000,
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    tags: ['dao', 'governance', 'voting'],
    submissionsCount: 0,
    status: 'open',
  },
]; 