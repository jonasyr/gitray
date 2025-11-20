import { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  Users,
  GitBranch,
  Calendar,
  TrendingUp,
  AlertCircle,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Alert, AlertDescription } from './ui/alert';
import { CommitHeatmap } from './CommitHeatmap';
import { FileDistributionChart } from './FileDistributionChart';
import { ActivityChart } from './ActivityChart';
import { ContributionRanking } from './ContributionRanking';
import { CodeChurnChart } from './CodeChurnChart';
import { FileTypeList } from './FileTypeList';
import { GraphViewTimeline } from './GraphViewTimeline';
import { GitDiffViewer } from './GitDiffViewer';
import { AIInsights } from './AIInsights';
import { PremiumFeatures } from './PremiumFeatures';
import {
  Commit,
  CommitHeatmapData,
  FileTypeDistribution,
  CodeChurnAnalysis,
} from '@gitray/shared-types';
import { getFileAnalysis, getCodeChurn } from '../services/api';

// Mock data for fallback
const mockRepoData = {
  name: 'analytics-pro',
  owner: 'Octo Org',
  created: '2019-06-14',
  age: '5.7y',
  lastCommit: '2 days ago',
  totalCommits: 3482,
  contributors: 24,
};

const contributors = [
  { name: 'John Doe', initials: 'JD' },
  { name: 'Jane Smith', initials: 'JS' },
  { name: 'Mike Johnson', initials: 'MJ' },
  { name: 'Sarah Williams', initials: 'SW' },
  { name: 'Tom Brown', initials: 'TB' },
];

interface DashboardPageProps {
  commits: Commit[];
  heatmapData: CommitHeatmapData | null;
  repoUrl: string;
}

export function DashboardPage({
  commits,
  heatmapData,
  repoUrl,
}: DashboardPageProps) {
  const [fileDistribution, setFileDistribution] =
    useState<FileTypeDistribution | null>(null);
  const [churnData, setChurnData] = useState<CodeChurnAnalysis | null>(null);
  const [heatmapMonths, setHeatmapMonths] = useState<3 | 6 | 12>(12);

  // Fetch file analysis and churn data when repoUrl changes
  useEffect(() => {
    if (repoUrl) {
      // Fetch file analysis
      getFileAnalysis(repoUrl)
        .then((data) => {
          setFileDistribution(data);
        })
        .catch((error) => {
          console.error('Failed to fetch file analysis:', error);
        });

      // Fetch code churn analysis
      getCodeChurn(repoUrl)
        .then((data) => {
          console.log('Fetched churn data:', data);
          setChurnData(data);
        })
        .catch((error) => {
          console.error('Failed to fetch code churn:', error);
          setChurnData(null);
        });
    }
  }, [repoUrl]);

  // Calculate peak activity times from commits
  const peakActivity = useMemo(() => {
    if (!commits || commits.length === 0) {
      return {
        mostActiveDay: 'Wednesday',
        avgCommitsPerDay: 12,
        peakMonth: 'October 2024',
        peakMonthCommits: 247,
        currentStreak: 14,
      };
    }

    // Calculate most active day of week
    const dayCount: Record<string, number> = {};
    const monthCount: Record<string, number> = {};
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    commits.forEach((commit) => {
      const date = new Date(commit.date);
      const dayName = days[date.getDay()];
      const monthYear = date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });

      dayCount[dayName] = (dayCount[dayName] || 0) + 1;
      monthCount[monthYear] = (monthCount[monthYear] || 0) + 1;
    });

    const mostActiveDay = Object.entries(dayCount).sort(
      (a, b) => b[1] - a[1]
    )[0];
    const peakMonth = Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0];

    // Calculate streak (simplified - consecutive days with commits)
    const sortedDates = commits
      .map((c) => new Date(c.date).toDateString())
      .sort();
    let streak = 1;
    let currentStreak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      if (sortedDates[i] !== sortedDates[i - 1]) {
        const date1 = new Date(sortedDates[i]);
        const date2 = new Date(sortedDates[i - 1]);
        const diffDays = Math.abs(
          (date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 1) {
          currentStreak++;
        } else {
          streak = Math.max(streak, currentStreak);
          currentStreak = 1;
        }
      }
    }
    streak = Math.max(streak, currentStreak);

    return {
      mostActiveDay: mostActiveDay?.[0] || 'Wednesday',
      avgCommitsPerDay: Math.round(
        (mostActiveDay?.[1] || 12) / (commits.length / 7)
      ),
      peakMonth: peakMonth?.[0] || 'October 2024',
      peakMonthCommits: peakMonth?.[1] || 247,
      currentStreak: streak,
    };
  }, [commits]);

  // Filter commits based on selected time period
  const filteredCommits = useMemo(() => {
    if (!commits || commits.length === 0) return [];

    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setMonth(now.getMonth() - heatmapMonths);

    return commits.filter((commit) => new Date(commit.date) >= cutoffDate);
  }, [commits, heatmapMonths]);

  // Extract repo info from URL or use mock data
  const urlParts = repoUrl ? repoUrl.split('/').filter(Boolean) : [];
  const repoName =
    urlParts[urlParts.length - 1]?.replace('.git', '') || mockRepoData.name;
  const repoOwner = urlParts[urlParts.length - 2] || mockRepoData.owner;

  const repoData = {
    name: repoName,
    owner: repoOwner,
    totalCommits: commits.length || mockRepoData.totalCommits,
    lastCommit: commits[0]?.date
      ? new Date(commits[0].date).toLocaleDateString()
      : mockRepoData.lastCommit,
    contributors: mockRepoData.contributors, // Will calculate from commits later
    created: mockRepoData.created, // Will need from backend
    age: mockRepoData.age, // Will calculate
  };
  return (
    <div className="container px-4 md:px-8 py-6 md:py-8 space-y-6 md:space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
            <GitBranch className="h-5 w-5 md:h-6 md:w-6 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl md:text-2xl">
              {repoData.owner}/{repoData.name}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Repository Analytics
            </p>
          </div>
        </div>

        <Alert className="border-primary/50 bg-primary/5">
          <AlertCircle className="h-4 w-4 text-primary" />
          <AlertDescription>
            Analysis complete. Data last updated {repoData.lastCommit}.
          </AlertDescription>
        </Alert>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex md:grid w-auto md:w-full grid-cols-5 h-auto min-w-max">
            <TabsTrigger value="overview" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
              <span className="sm:hidden">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Heatmap</span>
              <span className="sm:hidden">Heat</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">AI Insights</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
            <TabsTrigger value="paid" className="gap-2">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Premium</span>
              <span className="sm:hidden">Pro</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 md:space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {/* Repo Summary Card */}
            <Card className="md:col-span-2 lg:row-span-2 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">
                  Repository Summary
                </CardTitle>
                <CardDescription className="text-sm">
                  Key metrics and information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Repository</p>
                    <p className="font-semibold">{repoData.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Owner</p>
                    <p className="font-semibold">{repoData.owner}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-semibold">{repoData.created}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Age</p>
                    <p className="font-semibold">{repoData.age}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Last Commit</p>
                    <p className="font-semibold">{repoData.lastCommit}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Total Commits
                    </p>
                    <p className="font-semibold">
                      {repoData.totalCommits.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Contributors
                    </p>
                    <p className="font-semibold">{repoData.contributors}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
                      Active
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contributors Card */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Contributors
                </CardTitle>
                <CardDescription>
                  Top {contributors.length} contributors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contributors.map((contributor, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xs">
                          {contributor.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{contributor.name}</span>
                    </div>
                  ))}
                  <Button variant="ghost" className="w-full mt-2" size="sm">
                    View all {repoData.contributors} contributors
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* File Distribution Card */}
            <Card className="md:col-span-2 lg:col-span-1">
              <CardHeader>
                <CardTitle>File Distribution</CardTitle>
                <CardDescription>Languages by percentage</CardDescription>
              </CardHeader>
              <CardContent>
                <FileDistributionChart fileDistribution={fileDistribution} />
              </CardContent>
            </Card>

            {/* Activity Snapshot Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Activity Snapshot</CardTitle>
                <CardDescription>Commits over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityChart commits={commits} />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <ContributionRanking />
          </motion.div>
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Commit Heatmap</CardTitle>
                  <CardDescription>
                    Activity patterns over time with filters
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={heatmapMonths === 3 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setHeatmapMonths(3)}
                  >
                    Last 3 months
                  </Button>
                  <Button
                    variant={heatmapMonths === 6 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setHeatmapMonths(6)}
                  >
                    Last 6 months
                  </Button>
                  <Button
                    variant={heatmapMonths === 12 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setHeatmapMonths(12)}
                  >
                    Last 12 months
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <CommitHeatmap
                commits={filteredCommits}
                heatmapData={heatmapData || undefined}
              />

              <div className="pt-6 border-t">
                <h4 className="font-medium mb-4">Peak Activity Times</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground mb-1">
                        Most Active Day
                      </p>
                      <p className="text-xl font-semibold">
                        {peakActivity.mostActiveDay}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Avg. {peakActivity.avgCommitsPerDay} commits
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground mb-1">
                        Peak Month
                      </p>
                      <p className="text-xl font-semibold">
                        {peakActivity.peakMonth}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {peakActivity.peakMonthCommits} total commits
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground mb-1">
                        Current Streak
                      </p>
                      <p className="text-xl font-semibold">
                        {peakActivity.currentStreak} days
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Keep it up!
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Tabs defaultValue="churn" className="space-y-6">
            <TabsList>
              <TabsTrigger value="churn">Code Churn</TabsTrigger>
              <TabsTrigger value="files">File Types</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="diff">Git Diff</TabsTrigger>
            </TabsList>

            <TabsContent value="churn">
              <CodeChurnChart churnData={churnData} />
            </TabsContent>

            <TabsContent value="files">
              <FileTypeList fileDistribution={fileDistribution} />
            </TabsContent>

            <TabsContent value="timeline">
              <GraphViewTimeline />
            </TabsContent>

            <TabsContent value="diff">
              <GitDiffViewer />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <AIInsights />
        </TabsContent>

        <TabsContent value="paid" className="space-y-6">
          <PremiumFeatures />
        </TabsContent>
      </Tabs>
    </div>
  );
}
