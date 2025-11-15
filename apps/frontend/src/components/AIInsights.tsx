import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Clock,
  BookOpen,
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Progress } from './ui/progress';

const projectInsights = {
  overallScore: 78,
  summary:
    'This Angular project shows good architectural patterns with some areas for improvement in code organization and testing coverage.',
  recommendations: [
    {
      category: 'Architecture',
      priority: 'high',
      title: 'Implement lazy loading for feature modules',
      description:
        'Several large modules are eagerly loaded, impacting initial bundle size. Consider implementing lazy loading for non-critical features.',
      impact: 'Could reduce initial load time by ~35%',
    },
    {
      category: 'Code Quality',
      priority: 'medium',
      title: 'Increase test coverage',
      description:
        'Current test coverage is at 62%. Focus on testing critical business logic in the authentication and payment modules.',
      impact: 'Improve code reliability and maintainability',
    },
    {
      category: 'Best Practices',
      priority: 'medium',
      title: 'Standardize component structure',
      description:
        'Some components use different organizational patterns. Follow Angular style guide consistently across all modules.',
      impact: 'Better code maintainability and team collaboration',
    },
    {
      category: 'Performance',
      priority: 'low',
      title: 'Optimize change detection',
      description:
        "Consider using OnPush strategy for components that don't require frequent updates.",
      impact: 'Reduce unnecessary re-renders by ~20%',
    },
  ],
};

const weeklyInsights = [
  {
    week: 'Week 47 (Nov 1-7)',
    commits: 34,
    highlights: [
      'Implemented new dashboard analytics feature',
      'Fixed 12 reported bugs in the authentication flow',
      'Refactored API service layer for better maintainability',
    ],
    keyMetrics: {
      linesAdded: 2340,
      linesRemoved: 876,
      filesChanged: 45,
    },
  },
  {
    week: 'Week 46 (Oct 25-31)',
    commits: 28,
    highlights: [
      'Added user profile customization options',
      'Upgraded dependencies to latest versions',
      'Improved error handling across the application',
    ],
    keyMetrics: {
      linesAdded: 1823,
      linesRemoved: 654,
      filesChanged: 38,
    },
  },
];

const monthlyTrends = {
  productivity: 82,
  codeQuality: 75,
  collaboration: 88,
};

export function AIInsights() {
  return (
    <div className="space-y-6">
      <Alert className="border-primary/50 bg-primary/5">
        <Sparkles className="h-4 w-4 text-primary" />
        <AlertDescription>
          AI-powered insights are generated based on your project's structure,
          commit history, and industry best practices.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">
            <Lightbulb className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="weekly">
            <Clock className="h-4 w-4 mr-2" />
            Weekly
          </TabsTrigger>
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-2" />
            Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Project Health Score
              </CardTitle>
              <CardDescription>
                Overall assessment of your project
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-bold">
                  {projectInsights.overallScore}
                </div>
                <div className="flex-1">
                  <Progress
                    value={projectInsights.overallScore}
                    className="h-3 mb-2"
                  />
                  <p className="text-sm text-muted-foreground">
                    {projectInsights.summary}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <CardDescription>
                AI-generated suggestions to improve your project
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectInsights.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className="space-y-3 pb-4 border-b last:border-0 last:pb-0"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        rec.priority === 'high'
                          ? 'bg-destructive/10'
                          : rec.priority === 'medium'
                            ? 'bg-yellow-500/10'
                            : 'bg-primary/10'
                      }`}
                    >
                      {rec.priority === 'high' ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Lightbulb className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            rec.priority === 'high'
                              ? 'destructive'
                              : rec.priority === 'medium'
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {rec.category}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {rec.priority} priority
                        </Badge>
                      </div>
                      <div>
                        <h4 className="font-medium">{rec.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {rec.description}
                        </p>
                        <p className="text-sm text-primary mt-2 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Impact: {rec.impact}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Weekly Development Summary
              </CardTitle>
              <CardDescription>
                Iterative summary of changes and progress
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {weeklyInsights.map((week, index) => (
                <div
                  key={index}
                  className="space-y-3 pb-6 border-b last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{week.week}</h4>
                    <Badge variant="secondary">{week.commits} commits</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        Lines Added
                      </p>
                      <p className="text-lg font-semibold text-green-500">
                        +{week.keyMetrics.linesAdded.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        Lines Removed
                      </p>
                      <p className="text-lg font-semibold text-red-500">
                        -{week.keyMetrics.linesRemoved.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        Files Changed
                      </p>
                      <p className="text-lg font-semibold">
                        {week.keyMetrics.filesChanged}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Highlights:</p>
                    <ul className="space-y-1">
                      {week.highlights.map((highlight, hIndex) => (
                        <li
                          key={hIndex}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full">
                View All Weekly Reports
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Trends</CardTitle>
              <CardDescription>
                Key performance indicators for the last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Team Productivity
                    </span>
                    <span className="text-sm font-semibold">
                      {monthlyTrends.productivity}%
                    </span>
                  </div>
                  <Progress
                    value={monthlyTrends.productivity}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    Based on commit frequency, code reviews, and task completion
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Code Quality</span>
                    <span className="text-sm font-semibold">
                      {monthlyTrends.codeQuality}%
                    </span>
                  </div>
                  <Progress value={monthlyTrends.codeQuality} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Measured by test coverage, code review feedback, and
                    refactoring efforts
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Team Collaboration
                    </span>
                    <span className="text-sm font-semibold">
                      {monthlyTrends.collaboration}%
                    </span>
                  </div>
                  <Progress
                    value={monthlyTrends.collaboration}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    Based on PR reviews, pair programming sessions, and code
                    contributions
                  </p>
                </div>
              </div>

              <Alert className="mt-6">
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  Your team's collaboration score has increased by 12% this
                  month. Keep up the great work!
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
