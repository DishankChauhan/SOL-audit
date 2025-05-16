'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function AlertDialogExample() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  
  const handleContinue = () => {
    setResult('You clicked continue!');
    setOpen(false);
  };
  
  const handleCancel = () => {
    setResult('You clicked cancel!');
    setOpen(false);
  };
  
  return (
    <div className="flex flex-col items-center space-y-4">
      <h2 className="text-2xl font-bold">Alert Dialog Examples</h2>
      
      {/* Basic Alert Dialog */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline">Open Basic Alert Dialog</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account
              and remove your data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Controlled Alert Dialog */}
      <div className="space-y-2">
        <Button onClick={() => setOpen(true)}>Open Controlled Alert Dialog</Button>
        
        {result && (
          <div className="p-2 bg-gray-100 rounded-md">
            <p className="text-sm">Result: {result}</p>
            <Button variant="outline" size="sm" onClick={() => setResult(null)} className="mt-2">
              Clear
            </Button>
          </div>
        )}
        
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Bounty</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Are you sure you want to delete this bounty?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleContinue}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      
      {/* Custom Styling */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Open Custom Styled Alert</Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="border-red-500">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Critical Action</AlertDialogTitle>
            <AlertDialogDescription>
              This is a critical action that will affect your account permanently.
              Please read carefully before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-3 bg-red-50 rounded-md my-3">
            <p className="text-sm text-red-800">
              Warning: This operation cannot be reversed once confirmed.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700">
              I Understand, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 