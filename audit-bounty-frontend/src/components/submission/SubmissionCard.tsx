import { format } from 'date-fns';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { ISubmission } from '@/services/submission';

interface SubmissionCardProps {
  submission: ISubmission;
}

const severityColors = {
  critical: 'bg-red-500 hover:bg-red-600',
  high: 'bg-orange-500 hover:bg-orange-600',
  medium: 'bg-yellow-500 hover:bg-yellow-600',
  low: 'bg-blue-500 hover:bg-blue-600',
  informational: 'bg-green-500 hover:bg-green-600'
};

const statusColors = {
  pending: 'bg-yellow-500 hover:bg-yellow-600',
  approved: 'bg-green-500 hover:bg-green-600',
  rejected: 'bg-red-500 hover:bg-red-600'
};

export function SubmissionCard({ submission }: SubmissionCardProps) {
  const createdAt = submission.createdAt instanceof Date 
    ? submission.createdAt 
    : submission.createdAt.toDate();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <Link 
              href={`/submission/${submission.id}`}
              className="text-lg font-medium hover:underline"
            >
              {submission.bountyTitle || `Submission for Bounty #${submission.bountyId.substring(0, 8)}`}
            </Link>
            <p className="text-sm text-muted-foreground">
              Submitted {format(createdAt, 'MMM d, yyyy')}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge className={severityColors[submission.severity]}>
              {submission.severity.charAt(0).toUpperCase() + submission.severity.slice(1)}
            </Badge>
            <Badge className={statusColors[submission.status]}>
              {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm line-clamp-2">{submission.description}</p>
      </CardContent>
      <CardFooter className="flex justify-between bg-muted/30 pt-2">
        <div className="text-sm">
          {submission.status === 'approved' && submission.payoutAmount ? (
            <span className="font-medium">Payout: {submission.payoutAmount} USDC</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {submission.pocUrl && (
            <Link 
              href={submission.pocUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              View PoC
            </Link>
          )}
          {submission.fixUrl && (
            <Link 
              href={submission.fixUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              View Fix
            </Link>
          )}
        </div>
      </CardFooter>
    </Card>
  );
} 