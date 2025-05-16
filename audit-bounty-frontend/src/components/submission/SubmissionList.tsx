import { useState } from 'react';
import { SubmissionCard } from './SubmissionCard';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ISubmission } from '@/services/submission';

interface SubmissionListProps {
  submissions: ISubmission[];
  loading?: boolean;
  emptyMessage?: string;
  showFilters?: boolean;
}

export function SubmissionList({ 
  submissions, 
  loading = false, 
  emptyMessage = "No submissions found", 
  showFilters = true 
}: SubmissionListProps) {
  const [filters, setFilters] = useState({
    status: '',
    severity: '',
    search: ''
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const filteredSubmissions = submissions.filter(submission => {
    // Filter by status
    if (filters.status && submission.status !== filters.status) {
      return false;
    }
    
    // Filter by severity
    if (filters.severity && submission.severity !== filters.severity) {
      return false;
    }
    
    // Filter by search term
    if (filters.search && !submission.description.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="w-full md:w-1/3">
            <Input
              placeholder="Search submissions..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full"
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(value) => handleFilterChange('status', value)}
            placeholder="Filter by status"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' }
            ]}
            className="w-full md:w-auto"
          />
          <Select
            value={filters.severity}
            onValueChange={(value) => handleFilterChange('severity', value)}
            placeholder="Filter by severity"
            options={[
              { value: '', label: 'All severities' },
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
              { value: 'informational', label: 'Informational' }
            ]}
            className="w-full md:w-auto"
          />
        </div>
      )}

      {filteredSubmissions.length === 0 ? (
        <div className="text-center py-8 border rounded-lg">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSubmissions.map((submission) => (
            <SubmissionCard key={submission.id} submission={submission} />
          ))}
        </div>
      )}
    </div>
  );
} 