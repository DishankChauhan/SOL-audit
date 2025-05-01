import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { IBounty } from '@/services/bounty';
import { ReactElement, JSXElementConstructor, ReactNode, ReactPortal, Key } from 'react';

interface BountyCardProps {
  bounty: IBounty;
}

const statusColors = {
  draft: 'bg-zinc-500 hover:bg-zinc-600',
  open: 'bg-green-500 hover:bg-green-600',
  closed: 'bg-blue-500 hover:bg-blue-600',
  completed: 'bg-purple-500 hover:bg-purple-600'
};

export function BountyCard({ bounty }: BountyCardProps) {
  const deadline = typeof bounty.deadline === 'string' || typeof bounty.deadline === 'number'
    ? new Date(bounty.deadline)
    : bounty.deadline;
  
  const timeUntilDeadline = formatDistanceToNow(deadline, { addSuffix: true });
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <Link 
              href={`/bounty/${bounty.id}`}
              className="text-lg font-medium hover:underline"
            >
              {bounty.title}
            </Link>
            <CardDescription>
              Posted by {bounty.ownerName || (typeof bounty.owner === 'object' && (bounty.owner as any).displayName) || 'Anonymous'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge className={statusColors[bounty.status as keyof typeof statusColors]}>
              {bounty.status.charAt(0).toUpperCase() + bounty.status.slice(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm line-clamp-2 mb-2">{bounty.description}</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {bounty.tags?.map((tag: string, index: number) => (
            <Badge key={index} className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        
        {/* Add Solana Explorer Link if transaction hash is available */}
        {bounty.transactionHash && (
          <div className="mt-1 text-xs">
            <Link 
              href={`https://explorer.solana.com/tx/${bounty.transactionHash}?cluster=devnet`}
              target="_blank"
              className="text-blue-500 hover:underline flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View on Solana Explorer
            </Link>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between bg-muted/30 pt-2">
        <div className="text-sm">
          <span className="font-medium">{bounty.amount || bounty.bountyAmount} {bounty.tokenMint || 'SOL'}</span>
          <span className="mx-2">•</span>
          <span>Deadline {timeUntilDeadline}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {bounty.submissionCount || bounty.submissionsCount || 0} submissions ({bounty.approvedCount || 0} approved)
        </div>
      </CardFooter>
    </Card>
  );
} 