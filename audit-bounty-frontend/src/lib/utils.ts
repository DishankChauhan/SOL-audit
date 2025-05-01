import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function validateWalletAddress(address: string): boolean {
  // Basic validation for Solana wallet addresses
  return /^[A-HJ-NP-Za-km-z1-9]{32,44}$/.test(address);
}

export function formatDate(date: Date | string): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function truncateAddress(address: string, length = 4): string {
  if (!address) return '';
  return `${address.substring(0, length)}...${address.substring(address.length - length)}`;
}

export function calculateTimeRemaining(deadline: Date | string): string {
  const now = new Date();
  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline;
  
  const diffTime = deadlineDate.getTime() - now.getTime();
  
  if (diffTime <= 0) {
    return 'Expired';
  }
  
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} left`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} left`;
  } else {
    return 'Less than an hour left';
  }
}
