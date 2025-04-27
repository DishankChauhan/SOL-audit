'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface SubmissionVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  action: 'approve' | 'reject' | 'claim';
  isProcessing: boolean;
  error?: string | null;
  reviewComment?: string;
  onReviewCommentChange?: (comment: string) => void;
}

export function SubmissionVerificationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  action,
  isProcessing,
  error,
  reviewComment,
  onReviewCommentChange
}: SubmissionVerificationDialogProps) {
  if (!isOpen) return null;
  
  const actionColors = {
    approve: {
      primary: 'bg-green-600 hover:bg-green-700',
      icon: <CheckCircle className="h-5 w-5 mr-2" />,
      label: 'Approve'
    },
    reject: {
      primary: 'bg-red-600 hover:bg-red-700',
      icon: <XCircle className="h-5 w-5 mr-2" />,
      label: 'Reject'
    },
    claim: {
      primary: 'bg-blue-600 hover:bg-blue-700',
      icon: <CheckCircle className="h-5 w-5 mr-2" />,
      label: 'Claim'
    }
  };
  
  const handleConfirm = async () => {
    await onConfirm();
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <Card className="max-w-md w-full mx-4">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 mb-4">{description}</p>
          
          {onReviewCommentChange && (
            <div className="mt-4">
              <label htmlFor="comment" className="block text-sm font-medium text-gray-700">
                Review Comment
              </label>
              <textarea
                id="comment"
                name="comment"
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Provide a detailed reason for your decision..."
                value={reviewComment || ''}
                onChange={(e) => onReviewCommentChange(e.target.value)}
                disabled={isProcessing}
              />
            </div>
          )}
          
          {error && (
            <div className="mt-4 text-sm text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <button
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${actionColors[action].primary} focus:outline-none focus:ring-2 focus:ring-offset-2`}
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                {actionColors[action].icon}
                <span>{actionColors[action].label}</span>
              </>
            )}
          </button>
        </CardFooter>
      </Card>
    </div>
  );
} 