import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Trophy, GitCommit, Plus, Minus } from 'lucide-react';
import { Progress } from './ui/progress';

const contributors = [
  {
    name: 'Sarah Chen',
    initials: 'SC',
    commits: 1247,
    additions: 45632,
    deletions: 12340,
    rank: 1,
    percentage: 35.8,
    badge: '🏆 Top Contributor',
    gradient: 'from-yellow-400 to-yellow-600',
  },
  {
    name: 'Marcus Johnson',
    initials: 'MJ',
    commits: 892,
    additions: 32145,
    deletions: 9876,
    rank: 2,
    percentage: 25.6,
    badge: '🥈 Core Team',
    gradient: 'from-gray-300 to-gray-500',
  },
  {
    name: 'Emma Rodriguez',
    initials: 'ER',
    commits: 654,
    additions: 24567,
    deletions: 7654,
    rank: 3,
    percentage: 18.8,
    badge: '🥉 Active',
    gradient: 'from-orange-400 to-orange-600',
  },
  {
    name: 'Alex Kim',
    initials: 'AK',
    commits: 423,
    additions: 15234,
    deletions: 4321,
    rank: 4,
    percentage: 12.1,
    badge: '⭐ Regular',
    gradient: 'from-primary to-secondary',
  },
  {
    name: 'Jordan Taylor',
    initials: 'JT',
    commits: 267,
    additions: 8932,
    deletions: 2345,
    rank: 5,
    percentage: 7.7,
    badge: '✨ Rising',
    gradient: 'from-purple-400 to-purple-600',
  },
];

const totalCommits = contributors.reduce((sum, c) => sum + c.commits, 0);

export function ContributionRanking() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-yellow-500/50">
          <CardHeader className="pb-3">
            <CardDescription>Top Contributor</CardDescription>
            <CardTitle className="text-lg">{contributors[0].name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{contributors[0].commits}</p>
            <p className="text-sm text-muted-foreground">commits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Contributors</CardDescription>
            <CardTitle className="text-2xl">24</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {contributors.length} shown
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Commits</CardDescription>
            <CardTitle className="text-2xl">
              {totalCommits.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Across all contributors
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Contribution Leaderboard
          </CardTitle>
          <CardDescription>
            Top contributors ranked by commits and code changes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {contributors.map((contributor, index) => (
            <div
              key={index}
              className="space-y-3 pb-4 border-b last:border-0 last:pb-0"
            >
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar
                    className={`h-12 w-12 border-2 ${index === 0 ? 'border-yellow-500' : 'border-muted'}`}
                  >
                    <AvatarFallback
                      className={`bg-gradient-to-br ${contributor.gradient} text-white`}
                    >
                      {contributor.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-background border-2 border-background flex items-center justify-center text-xs font-bold">
                    #{contributor.rank}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-semibold">{contributor.name}</p>
                    <Badge variant="secondary" className="text-xs">
                      {contributor.badge}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-2">
                    <div className="flex items-center gap-1">
                      <GitCommit className="h-3 w-3" />
                      <span>{contributor.commits} commits</span>
                    </div>
                    <div className="flex items-center gap-1 text-green-500">
                      <Plus className="h-3 w-3" />
                      <span>{contributor.additions.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1 text-red-500">
                      <Minus className="h-3 w-3" />
                      <span>{contributor.deletions.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Contribution</span>
                      <span>{contributor.percentage}%</span>
                    </div>
                    <Progress value={contributor.percentage} className="h-2" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
