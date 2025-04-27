'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface IDispute {
  id: string;
  submissionId: string;
  bountyId: string;
  auditorId: string;
  auditorName: string;
  bountyTitle: string;
  submissionTitle: string;
  reason: string;
  evidence?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function DisputesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [disputes, setDisputes] = useState<IDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  useEffect(() => {
    // Redirect if not logged in
    if (!authLoading && !user) {
      router.push('/login?redirect=/disputes');
      return;
    }

    // Check if user is a moderator
    const checkModerator = async () => {
      try {
        // Import Firestore modules
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');
        
        // Get the user document
        const userRef = doc(db, 'users', user!.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists() || userSnap.data().role !== 'moderator') {
          router.push('/');
          return;
        }
        
        // Fetch disputes
        fetchDisputes();
      } catch (error) {
        console.error('Error checking moderator status:', error);
        router.push('/');
      }
    };
    
    const fetchDisputes = async () => {
      try {
        setLoading(true);
        
        // Import Firestore modules
        const { collection, query, where, orderBy, getDocs, doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');
        
        // Create the query based on status filter
        let disputesQuery = query(
          collection(db, 'disputes'),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc')
        );
        
        const disputesSnap = await getDocs(disputesQuery);
        
        // Get additional data for each dispute
        const disputesWithDetails = await Promise.all(
          disputesSnap.docs.map(async (docSnap) => {
            const data = docSnap.data();
            
            // Get bounty title
            const bountyRef = doc(db, 'bounties', data.bountyId);
            const bountySnapshot = await getDoc(bountyRef);
            const bountyTitle = bountySnapshot.exists() ? bountySnapshot.data().title : 'Unknown Bounty';
            
            // Get submission title
            const submissionRef = doc(db, 'submissions', data.submissionId);
            const submissionSnapshot = await getDoc(submissionRef);
            const submissionTitle = submissionSnapshot.exists() ? submissionSnapshot.data().title : 'Unknown Submission';
            
            // Get auditor name
            const auditorRef = doc(db, 'users', data.auditorId);
            const auditorSnapshot = await getDoc(auditorRef);
            const auditorName = auditorSnapshot.exists() ? auditorSnapshot.data().displayName : 'Unknown Auditor';
            
            return {
              id: docSnap.id,
              submissionId: data.submissionId,
              bountyId: data.bountyId,
              auditorId: data.auditorId,
              auditorName,
              bountyTitle,
              submissionTitle,
              reason: data.reason,
              evidence: data.evidence,
              status: data.status,
              createdAt: data.createdAt ? new Date(data.createdAt.toDate()).toISOString() : new Date().toISOString()
            };
          })
        );
        
        setDisputes(disputesWithDetails);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching disputes:', error);
        setError('Failed to load disputes');
        setLoading(false);
      }
    };
    
    if (user) {
      checkModerator();
    }
  }, [user, authLoading, router, statusFilter]);

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
  };
  
  const handleResolveDispute = async (disputeId: string, resolution: 'approved' | 'rejected') => {
    try {
      // Import Firestore modules
      const { doc, updateDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase/config');
      
      // Update the dispute
      const disputeRef = doc(db, 'disputes', disputeId);
      await updateDoc(disputeRef, {
        status: resolution,
        resolvedById: user?.uid,
        resolvedAt: serverTimestamp(),
        resolution
      });
      
      // Get the submission ID from the dispute
      const disputeSnap = await getDoc(disputeRef);
      if (!disputeSnap.exists()) {
        throw new Error('Dispute not found');
      }
      
      const disputeData = disputeSnap.data();
      const submissionId = disputeData.submissionId;
      
      // Update the submission status based on resolution
      const submissionRef = doc(db, 'submissions', submissionId);
      await updateDoc(submissionRef, {
        status: resolution === 'approved' ? 'approved' : 'rejected',
        updatedAt: serverTimestamp()
      });
      
      // Refresh the disputes list
      setDisputes(disputes.filter(d => d.id !== disputeId));
    } catch (error) {
      console.error('Error resolving dispute:', error);
      alert('Failed to resolve dispute. Please try again.');
    }
  };

  if (loading || authLoading) {
    return (
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-6"></div>
            <div className="h-64 bg-gray-200 rounded w-full mb-4"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
              Dispute DAO Dashboard
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Review and vote on submission disputes
            </p>
          </div>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
          <div className="px-4 py-5 sm:p-6">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Filter Disputes</h3>
              </div>
            </div>
            <div className="mt-4 flex space-x-2">
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  statusFilter === 'pending'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => handleStatusFilterChange('pending')}
              >
                Pending
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  statusFilter === 'approved'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => handleStatusFilterChange('approved')}
              >
                Approved
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  statusFilter === 'rejected'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => handleStatusFilterChange('rejected')}
              >
                Rejected
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {disputes.length === 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-12 sm:px-6 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">No {statusFilter} disputes</h3>
              <p className="mt-2 text-sm text-gray-500">
                There are no disputes with status '{statusFilter}' at the moment.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <ul className="divide-y divide-gray-200">
              {disputes.map((dispute) => (
                <li key={dispute.id} className="px-4 py-5 sm:px-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                    <div className="mb-4 sm:mb-0">
                      <h4 className="text-lg font-medium text-gray-900">
                        <Link 
                          href={`/bounty/${dispute.bountyId}/submission/${dispute.submissionId}`}
                          className="hover:underline"
                        >
                          {dispute.submissionTitle}
                        </Link>
                      </h4>
                      <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:mt-0 sm:space-x-6">
                        <div className="mt-2 flex items-center text-sm text-gray-500">
                          <span>Bounty: </span>
                          <Link
                            href={`/bounty/${dispute.bountyId}`}
                            className="ml-1 text-indigo-600 hover:text-indigo-900"
                          >
                            {dispute.bountyTitle}
                          </Link>
                        </div>
                        <div className="mt-2 flex items-center text-sm text-gray-500">
                          <span>Auditor: </span>
                          <span className="ml-1">{dispute.auditorName}</span>
                        </div>
                      </div>
                    </div>
                    
                    {statusFilter === 'pending' && (
                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleResolveDispute(dispute.id, 'approved')}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleResolveDispute(dispute.id, 'rejected')}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4">
                    <h5 className="text-sm font-medium text-gray-900">Reason for Dispute</h5>
                    <p className="mt-1 text-sm text-gray-600">{dispute.reason}</p>
                  </div>
                  
                  {dispute.evidence && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium text-gray-900">Additional Evidence</h5>
                      <p className="mt-1 text-sm text-gray-600">{dispute.evidence}</p>
                    </div>
                  )}
                  
                  <div className="mt-4 text-sm">
                    <Link
                      href={`/bounty/${dispute.bountyId}/submission/${dispute.submissionId}`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      View Full Submission →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </MainLayout>
  );
} 