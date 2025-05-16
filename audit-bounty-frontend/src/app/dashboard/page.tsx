'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {MainLayout} from '@/components/layout/MainLayout';
import Link from 'next/link';
import { Bounty, IBounty } from '@/services/bounty';
import { Submission, ISubmission } from '@/services/submission';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BountyCard } from '@/components/bounty/BountyCard';
import { SubmissionCard } from '@/components/submission/SubmissionCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [userBounties, setUserBounties] = useState<IBounty[]>([]);
  const [userSubmissions, setUserSubmissions] = useState<ISubmission[]>([]);
  const [stats, setStats] = useState({
    bountyCount: 0,
    totalBountyAmount: 0,
    submissionCount: 0,
    approvedCount: 0,
    earnedAmount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch user's bounties
        const bounties = await Bounty.getAll({ owner: user.uid, limit: 5 });
        setUserBounties(bounties);

        // Fetch user's submissions
        const submissions = await Submission.getByAuditor(user.uid, { limit: 5 });
        setUserSubmissions(submissions);

        // Fetch stats
        const bountyStats = await Bounty.getStats({ owner: user.uid });
        const submissionStats = await Submission.getStats({ auditor: user.uid });
        
        setStats({
          bountyCount: bountyStats.totalCount || 0,
          totalBountyAmount: bountyStats.totalAmount || 0,
          submissionCount: submissionStats.totalCount || 0,
          approvedCount: submissionStats.approvedCount || 0,
          earnedAmount: submissionStats.totalEarned || 0
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full mb-8" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Button asChild>
            <Link href="/bounty/create">Create New Bounty</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Your Bounties</CardTitle>
              <CardDescription>Bounties you've created</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.bountyCount}</p>
              <p className="text-sm text-muted-foreground">
                Total Value: {stats.totalBountyAmount} USDC
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Your Submissions</CardTitle>
              <CardDescription>Audit findings you've submitted</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.submissionCount}</p>
              <p className="text-sm text-muted-foreground">
                Approved: {stats.approvedCount} ({stats.submissionCount > 0 
                  ? Math.round((stats.approvedCount / stats.submissionCount) * 100) 
                  : 0}%)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Earnings</CardTitle>
              <CardDescription>Total amount earned from audits</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.earnedAmount} USDC</p>
              <p className="text-sm text-muted-foreground">
                From {stats.approvedCount} approved findings
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="bounties">Your Bounties</TabsTrigger>
            <TabsTrigger value="submissions">Your Submissions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex justify-between">
                    <span>Recent Bounties</span>
                    <Link href="/bounty/my" className="text-sm text-blue-600 hover:underline">
                      View All
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-28 w-full" />
                      ))}
                    </div>
                  ) : userBounties.length > 0 ? (
                    <div className="space-y-4">
                      {userBounties.slice(0, 3).map((bounty) => (
                        <BountyCard key={bounty.id} bounty={bounty} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-4 text-muted-foreground">
                      You haven't created any bounties yet.
                      <Link href="/bounty/create" className="block mt-2 text-blue-600 hover:underline">
                        Create your first bounty
                      </Link>
                    </p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex justify-between">
                    <span>Recent Submissions</span>
                    <Link href="/submission/my" className="text-sm text-blue-600 hover:underline">
                      View All
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-28 w-full" />
                      ))}
                    </div>
                  ) : userSubmissions.length > 0 ? (
                    <div className="space-y-4">
                      {userSubmissions.slice(0, 3).map((submission) => (
                        <SubmissionCard key={submission.id} submission={submission} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-4 text-muted-foreground">
                      You haven't submitted any findings yet.
                      <Link href="/bounty" className="block mt-2 text-blue-600 hover:underline">
                        Explore available bounties
                      </Link>
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="bounties">
            <div className="space-y-4">
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))
              ) : userBounties.length > 0 ? (
                <>
                  {userBounties.map((bounty) => (
                    <BountyCard key={bounty.id} bounty={bounty} />
                  ))}
                  {userBounties.length >= 5 && (
                    <div className="text-center mt-4">
                      <Button asChild>
                        <Link href="/bounty/my" className="btn-outline">View All Bounties</Link>
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="mb-4 text-muted-foreground">You haven't created any bounties yet.</p>
                  <Button asChild>
                    <Link href="/bounty/create">Create Your First Bounty</Link>
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="submissions">
            <div className="space-y-4">
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))
              ) : userSubmissions.length > 0 ? (
                <>
                  {userSubmissions.map((submission) => (
                    <SubmissionCard key={submission.id} submission={submission} />
                  ))}
                  {userSubmissions.length >= 5 && (
                    <div className="text-center mt-4">
                      <Button asChild>
                        <Link href="/submission/my" className="btn-outline">View All Submissions</Link>
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="mb-4 text-muted-foreground">You haven't submitted any findings yet.</p>
                  <Button asChild>
                    <Link href="/bounty">Explore Available Bounties</Link>
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
} 