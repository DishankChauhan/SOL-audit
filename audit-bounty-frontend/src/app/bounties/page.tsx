'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface IBounty {
  id: string;
  title: string;
  description: string;
  repoUrl: string;
  bountyAmount: number;
  status: 'open' | 'closed' | 'cancelled' | 'draft' | 'cancelling' | 'completing' | 'completed';
  submissionsCount: number;
  approvedCount: number;
  owner: {
    id: string;
    displayName: string;
    photoURL?: string;
  };
  deadline: string;
  createdAt: string;
  tags: string[];
  transactionHash?: string;
}

// Define the type for status colors
type StatusColorType = {
  [key: string]: {
    bg: string;
    text: string;
    label: string;
  }
};

export default function BountiesPage() {
  const { user } = useAuth();
  const [bounties, setBounties] = useState<IBounty[]>([]);
  const [filteredBounties, setFilteredBounties] = useState<IBounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const statusColors: StatusColorType = {
    open: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Open'
    },
    closed: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: 'Closed'
    },
    cancelled: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Cancelled'
    },
    draft: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Draft'
    },
    cancelling: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      label: 'Cancelling'
    },
    completing: {
      bg: 'bg-blue-100', 
      text: 'text-blue-800',
      label: 'Completing'
    },
    completed: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Completed'
    }
  };

  useEffect(() => {
    // Fetch bounties
    setLoading(true);
    
    const fetchBounties = async () => {
      try {
        // Create a query to get bounties from Firestore without filtering by status
        const bountiesCollection = collection(db, 'bounties');
        const bountiesSnapshot = await getDocs(bountiesCollection);
        
        if (bountiesSnapshot.empty) {
          console.log('No bounties found in Firestore');
          setBounties([]);
          setFilteredBounties([]);
          setLoading(false);
          return;
        }
        
        console.log('Found', bountiesSnapshot.size, 'bounties in Firestore');
        
        const fetchedBounties = bountiesSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Bounty data:', doc.id, data);
          
          // Normalize owner data structure
          let ownerData = {
            id: typeof data.owner === 'string' ? data.owner : '',
            displayName: data.ownerName || 'Unknown',
            photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.owner || 'unknown'}`
          };
          
          // Convert dates properly
          let createdAt = new Date().toISOString();
          let deadline = new Date().toISOString();
          
          try {
            if (data.createdAt) {
              if (data.createdAt.toDate) {
                createdAt = data.createdAt.toDate().toISOString();
              } else if (data.createdAt instanceof Date) {
                createdAt = data.createdAt.toISOString();
              } else if (typeof data.createdAt === 'number') {
                createdAt = new Date(data.createdAt).toISOString();
              }
            }
            
            if (data.deadline) {
              if (data.deadline.toDate) {
                deadline = data.deadline.toDate().toISOString();
              } else if (data.deadline instanceof Date) {
                deadline = data.deadline.toISOString();
              } else if (typeof data.deadline === 'number') {
                deadline = new Date(data.deadline).toISOString();
              }
            }
          } catch (e) {
            console.warn('Error parsing dates:', e);
          }
          
          return {
            id: doc.id,
            title: data.title || 'Unnamed Bounty',
            description: data.description || '',
            repoUrl: data.repoUrl || '',
            bountyAmount: data.amount || 0,
            status: data.status || 'draft', // Default to draft if status is missing
            submissionsCount: data.submissionCount || 0,
            approvedCount: data.approvedCount || 0,
            owner: ownerData,
            deadline: deadline,
            createdAt: createdAt,
            tags: data.tags || [],
            transactionHash: data.transactionHash
          };
        });
        
        console.log('Processed bounties:', fetchedBounties);
        
        // Skip dummy data if we have real bounties
        if (fetchedBounties.length > 0) {
          // Extract all unique tags
          const allTags = Array.from(new Set(fetchedBounties.flatMap(bounty => bounty.tags)));
          
          setBounties(fetchedBounties);
          setFilteredBounties(fetchedBounties);
          setAvailableTags(allTags);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error fetching bounties:', error);
        // Use dummy data as fallback
        const dummyBounties: IBounty[] = [
          {
            id: 'bounty1',
            title: 'Security Audit for Token Swap Contract',
            description: 'We need a comprehensive security audit for our token swap contract. The contract handles swapping between various SPL tokens and needs to be thoroughly audited for vulnerabilities.',
            repoUrl: 'https://github.com/example/token-swap',
            bountyAmount: 5,
            status: 'open',
            submissionsCount: 3,
            approvedCount: 1,
            owner: {
              id: 'owner1',
              displayName: 'DeFi Labs',
              photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=DeFiLabs'
            },
            deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
            tags: ['defi', 'token', 'swap', 'security']
          },
          {
            id: 'bounty2',
            title: 'NFT Marketplace Contract Audit',
            description: 'Looking for security vulnerabilities in our NFT marketplace smart contract. The contract handles listing, bidding, and purchasing of NFTs.',
            repoUrl: 'https://github.com/example/nft-marketplace',
            bountyAmount: 3.5,
            status: 'open',
            submissionsCount: 1,
            approvedCount: 0,
            owner: {
              id: 'owner2',
              displayName: 'NFT Studio',
              photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NFTStudio'
            },
            deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
            tags: ['nft', 'marketplace', 'security']
          },
          {
            id: 'bounty3',
            title: 'Staking Contract Vulnerability Assessment',
            description: 'Audit needed for our staking contract that allows users to stake tokens and earn rewards. Looking for potential security issues or optimizations.',
            repoUrl: 'https://github.com/example/staking-contract',
            bountyAmount: 2.5,
            status: 'closed',
            submissionsCount: 5,
            approvedCount: 2,
            owner: {
              id: 'owner3',
              displayName: 'Staking Protocol',
              photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=StakingProtocol'
            },
            deadline: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago (past deadline)
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
            tags: ['staking', 'defi', 'rewards']
          }
        ];
        
        const allTags = Array.from(new Set(dummyBounties.flatMap(bounty => bounty.tags)));
        
        setBounties(dummyBounties);
        setFilteredBounties(dummyBounties);
        setAvailableTags(allTags);
      } finally {
        setLoading(false);
      }
    };
    
    fetchBounties();
  }, []);

  useEffect(() => {
    // Apply filters and search
    let result = [...bounties];
    
    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(bounty => bounty.status === statusFilter);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        bounty => 
          bounty.title.toLowerCase().includes(query) || 
          bounty.description.toLowerCase().includes(query) ||
          bounty.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    // Filter by bounty amount
    if (minAmount) {
      result = result.filter(bounty => bounty.bountyAmount >= parseFloat(minAmount));
    }
    
    if (maxAmount) {
      result = result.filter(bounty => bounty.bountyAmount <= parseFloat(maxAmount));
    }
    
    // Filter by tags
    if (tagsFilter.length > 0) {
      result = result.filter(bounty => 
        tagsFilter.some(tag => bounty.tags.includes(tag))
      );
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'highest':
        result.sort((a, b) => b.bountyAmount - a.bountyAmount);
        break;
      case 'lowest':
        result.sort((a, b) => a.bountyAmount - b.bountyAmount);
        break;
      case 'deadline':
        result.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
        break;
      default:
        break;
    }
    
    setFilteredBounties(result);
  }, [bounties, searchQuery, statusFilter, sortBy, minAmount, maxAmount, tagsFilter]);

  const handleTagToggle = (tag: string) => {
    setTagsFilter(prev => 
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSortBy('newest');
    setMinAmount('');
    setMaxAmount('');
    setTagsFilter([]);
  };

  // Helper function to get status colors with fallback
  const getStatusColors = (status: string) => {
    return statusColors[status] || {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: status.charAt(0).toUpperCase() + status.slice(1)
    };
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              Security Bounties
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Find and submit security vulnerabilities to earn rewards
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            {user && (
              <Link
                href="/bounty/create"
                className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Create Bounty
              </Link>
            )}
          </div>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
          <div className="px-4 py-5 sm:p-6">
            <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-6">
                <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                  Search
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="text"
                    name="search"
                    id="search"
                    className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pr-10 sm:text-sm border-gray-300 rounded-md"
                    placeholder="Search by title, description, or tags"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="sort" className="block text-sm font-medium text-gray-700">
                  Sort By
                </label>
                <select
                  id="sort"
                  name="sort"
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Amount</option>
                  <option value="lowest">Lowest Amount</option>
                  <option value="deadline">Closest Deadline</option>
                </select>
              </div>

              <div className="sm:col-span-1">
                <label htmlFor="min-amount" className="block text-sm font-medium text-gray-700">
                  Min Amount (SOL)
                </label>
                <input
                  type="number"
                  name="min-amount"
                  id="min-amount"
                  min="0"
                  step="0.1"
                  className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>

              <div className="sm:col-span-1">
                <label htmlFor="max-amount" className="block text-sm font-medium text-gray-700">
                  Max Amount (SOL)
                </label>
                <input
                  type="number"
                  name="max-amount"
                  id="max-amount"
                  min="0"
                  step="0.1"
                  className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                />
              </div>

              <div className="sm:col-span-6">
                <label className="block text-sm font-medium text-gray-700">
                  Filter by Tags
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleTagToggle(tag)}
                      className={`inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium ${
                        tagsFilter.includes(tag)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-6 flex justify-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-6"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="flex justify-between">
                    <div className="h-6 bg-gray-200 rounded w-1/6"></div>
                    <div className="h-6 bg-gray-200 rounded w-1/6"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredBounties.length === 0 ? (
          <div className="text-center py-12 bg-white shadow overflow-hidden sm:rounded-lg">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">No bounties found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search or filter criteria
            </p>
            <div className="mt-6">
              <button
                onClick={resetFilters}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Clear Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredBounties.map((bounty) => (
              <div key={bounty.id} className="bg-white shadow overflow-hidden sm:rounded-lg hover:shadow-lg transition-shadow duration-200">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between mb-4">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mr-3">
                      <Link href={`/bounty/${bounty.id}`} className="hover:text-indigo-600">
                        {bounty.title}
                      </Link>
                    </h3>
                    <div className="flex items-center mt-2 sm:mt-0">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColors(bounty.status).bg} ${getStatusColors(bounty.status).text}`}>
                        {getStatusColors(bounty.status).label}
                      </span>
                      <span className="ml-3 text-sm font-medium text-gray-500">
                        {bounty.submissionsCount} submissions
                      </span>
                    </div>
                  </div>
                  
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {bounty.description}
                  </p>
                  
                  <div className="mt-4 flex flex-wrap items-center">
                    <div className="flex items-center mr-6">
                      {bounty.owner.photoURL && (
                        <img
                          className="h-6 w-6 rounded-full mr-2"
                          src={bounty.owner.photoURL}
                          alt={bounty.owner.displayName}
                        />
                      )}
                      <span className="text-sm text-gray-500">{bounty.owner.displayName}</span>
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-500 mr-6">
                      <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      {new Date(bounty.deadline) > new Date() ? (
                        <span>Ends {formatDistanceToNow(new Date(bounty.deadline), { addSuffix: true })}</span>
                      ) : (
                        <span className="text-red-500">Ended {formatDistanceToNow(new Date(bounty.deadline), { addSuffix: true })}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-500">
                      <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium text-gray-900">{bounty.bountyAmount} SOL</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex flex-wrap gap-2">
                    {bounty.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="mt-5 flex justify-between items-center">
                    <div className="text-sm">
                      {bounty.repoUrl ? (
                        <Link href={bounty.repoUrl} className="font-medium text-indigo-600 hover:text-indigo-500" target="_blank" rel="noopener noreferrer">
                          View Repository
                          <span className="ml-1">→</span>
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-400">No Repository</span>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      {user && bounty.status === 'open' && (
                        <Link
                          href={`/bounty/${bounty.id}/submit`}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          Submit Finding
                        </Link>
                      )}
                      <Link
                        href={`/bounty/${bounty.id}`}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
} 