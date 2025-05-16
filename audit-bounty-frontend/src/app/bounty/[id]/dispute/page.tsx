'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface ISubmission {
  id: string;
  bountyId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected';
  pocUrl?: string;
  fixUrl?: string;
}

export default function DisputeFormPage() {
  const { id } = useParams(); // Bounty ID
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('submissionId');
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [submission, setSubmission] = useState<ISubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    reason: '',
    evidence: ''
  });
  
  const [formErrors, setFormErrors] = useState({
    reason: '',
    evidence: ''
  });

  useEffect(() => {
    // Redirect if not logged in
    if (!authLoading && !user) {
      router.push(`/login?redirect=/bounty/${id}/dispute?submissionId=${submissionId}`);
      return;
    }

    if (!submissionId) {
      setError('Submission ID is required');
      setLoading(false);
      return;
    }

    // Fetch submission data
    const fetchSubmission = async () => {
      try {
        setLoading(true);
        
        // Import Firestore modules
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');
        
        // Get the submission document
        const submissionRef = doc(db, 'submissions', submissionId);
        const submissionSnapshot = await getDoc(submissionRef);
        
        if (!submissionSnapshot.exists()) {
          setError('Submission not found');
          setLoading(false);
          return;
        }
        
        const data = submissionSnapshot.data();
        const submissionData: ISubmission = {
          id: submissionSnapshot.id,
          bountyId: data.bountyId,
          title: data.title || '',
          description: data.description || '',
          severity: data.severity || 'medium',
          status: data.status || 'pending',
          pocUrl: data.pocUrl,
          fixUrl: data.fixUrl
        };
        
        // Check if this is the auditor's submission
        if (data.auditor !== user?.uid) {
          setError('You can only dispute your own submissions');
          setLoading(false);
          return;
        }
        
        // Check if submission is rejected (only rejected submissions can be disputed)
        if (data.status !== 'rejected') {
          setError('Only rejected submissions can be disputed');
          setLoading(false);
          return;
        }
        
        setSubmission(submissionData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching submission:', error);
        setError('Failed to load submission details');
        setLoading(false);
      }
    };
    
    fetchSubmission();
  }, [id, submissionId, user, authLoading, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Clear error when user starts typing
    if (formErrors[name as keyof typeof formErrors]) {
      setFormErrors({
        ...formErrors,
        [name]: ''
      });
    }
  };

  const validateForm = () => {
    let isValid = true;
    const newErrors = { ...formErrors };
    
    if (!formData.reason.trim()) {
      newErrors.reason = 'Reason is required';
      isValid = false;
    } else if (formData.reason.trim().length < 20) {
      newErrors.reason = 'Reason should be at least 20 characters';
      isValid = false;
    }
    
    setFormErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      // Import Firestore modules
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase/config');
      
      // Create the dispute in Firestore
      await addDoc(collection(db, 'disputes'), {
        submissionId: submission?.id,
        auditorId: user?.uid,
        bountyId: id,
        reason: formData.reason,
        evidence: formData.evidence,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      // Redirect to bounty page after successful submission
      router.push(`/bounty/${id}`);
    } catch (err) {
      console.error('Error creating dispute:', err);
      setError('Failed to submit dispute. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-6"></div>
            <div className="h-64 bg-gray-200 rounded w-full mb-4"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !submission) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-white">Error</h2>
            <p className="mt-2 text-gray-400">{error || 'Submission not found'}</p>
            <div className="mt-6">
              <Link
                href={`/bounty/${id}`}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Back to Bounty
              </Link>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
              Dispute Submission
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              For submission: <span className="font-medium">{submission.title}</span>
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href={`/bounty/${id}`}
              className="inline-flex items-center px-4 py-2 border border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-200 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Bounty
            </Link>
          </div>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                  Reason for Dispute *
                </label>
                <div className="mt-1">
                  <textarea
                    name="reason"
                    id="reason"
                    rows={5}
                    value={formData.reason}
                    onChange={handleInputChange}
                    className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${formErrors.reason ? 'border-red-300' : ''}`}
                    placeholder="Explain why you believe this submission should not have been rejected."
                    disabled={submitting}
                  ></textarea>
                  {formErrors.reason && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.reason}</p>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Be specific about why you think the rejection was incorrect. This will be reviewed by the dispute DAO.
                </p>
              </div>

              <div>
                <label htmlFor="evidence" className="block text-sm font-medium text-gray-700">
                  Additional Evidence (Optional)
                </label>
                <div className="mt-1">
                  <textarea
                    name="evidence"
                    id="evidence"
                    rows={3}
                    value={formData.evidence}
                    onChange={handleInputChange}
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    placeholder="Provide any additional evidence or context to support your dispute."
                    disabled={submitting}
                  ></textarea>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Include any additional information that might help the dispute DAO understand your position.
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-end">
                  <Link
                    href={`/bounty/${id}`}
                    className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {submitting ? 'Submitting...' : 'Submit Dispute'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </MainLayout>
  );
} 