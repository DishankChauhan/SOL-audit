'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function DialogExample() {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="flex flex-col items-center space-y-4">
      <h2 className="text-2xl font-bold">Dialog Component Example</h2>
      
      {/* Basic Dialog with Trigger */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open Basic Dialog</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Basic Dialog</DialogTitle>
            <DialogDescription>
              This is a basic dialog that uses the Radix UI Dialog primitive.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>Dialog content goes here. You can add any elements you want.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => console.log('Cancel clicked')}>Cancel</Button>
            <Button onClick={() => console.log('Save clicked')}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Controlled Dialog */}
      <Button onClick={() => setOpen(true)}>Open Controlled Dialog</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Controlled Dialog</DialogTitle>
            <DialogDescription>
              This dialog is controlled with React state.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>You can programmatically control this dialog's open state.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              console.log('Confirm clicked');
              setOpen(false);
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog with Form */}
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open Form Dialog</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Form Dialog</DialogTitle>
            <DialogDescription>
              Fill out this form and submit.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <form className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium leading-none">
                  Name
                </label>
                <input
                  id="name"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Enter your name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium leading-none">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Enter your email"
                />
              </div>
            </form>
          </div>
          <DialogFooter>
            <Button type="submit">Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 