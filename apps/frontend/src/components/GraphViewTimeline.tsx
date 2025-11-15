import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  GitBranch,
  GitMerge,
  GitCommit,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
} from 'lucide-react';
import { Slider } from './ui/slider';
import { useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';

const branches = [
  { name: 'main', color: '#5B9A8B', commits: 247, active: true },
  { name: 'develop', color: '#FFA69E', commits: 183, active: true },
  { name: 'feature/analytics', color: '#FAE3B4', commits: 42, active: true },
  { name: 'hotfix/auth', color: '#2E073F', commits: 12, active: false },
];

const timelineEvents = [
  {
    type: 'commit',
    branch: 'main',
    message: 'feat: Add user authentication',
    author: 'Sarah C.',
    date: '2 hours ago',
    hash: 'a3f4c21',
  },
  {
    type: 'merge',
    branch: 'main',
    from: 'develop',
    message: 'Merge develop into main',
    author: 'Marcus J.',
    date: '5 hours ago',
    hash: 'b7e8d92',
  },
  {
    type: 'commit',
    branch: 'feature/analytics',
    message: 'fix: Chart rendering issue',
    author: 'Emma R.',
    date: '1 day ago',
    hash: 'c9f1a34',
  },
  {
    type: 'commit',
    branch: 'develop',
    message: 'refactor: Code cleanup',
    author: 'Alex K.',
    date: '2 days ago',
    hash: 'd2b5e67',
  },
];

export function GraphViewTimeline() {
  const [playing, setPlaying] = useState(false);
  const [timelinePosition, setTimelinePosition] = useState([50]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {branches.map((branch, index) => (
          <Card
            key={index}
            className={branch.active ? 'border-primary/50' : ''}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: branch.color }}
                />
                <CardDescription className="truncate">
                  {branch.name}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{branch.commits}</p>
              <p className="text-xs text-muted-foreground">commits</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Network Graph Timeline
              </CardTitle>
              <CardDescription>
                Visual representation of branches, commits, and merges
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visual Timeline Graph */}
          <div className="relative h-64 bg-muted/30 rounded-lg p-4 overflow-hidden">
            <svg width="100%" height="100%" className="absolute inset-0">
              {/* Main branch line */}
              <line
                x1="10%"
                y1="50%"
                x2="90%"
                y2="50%"
                stroke="#5B9A8B"
                strokeWidth="3"
              />

              {/* Develop branch line */}
              <line
                x1="20%"
                y1="50%"
                x2="20%"
                y2="30%"
                stroke="#FFA69E"
                strokeWidth="2"
              />
              <line
                x1="20%"
                y1="30%"
                x2="70%"
                y2="30%"
                stroke="#FFA69E"
                strokeWidth="2"
              />
              <line
                x1="70%"
                y1="30%"
                x2="70%"
                y2="50%"
                stroke="#FFA69E"
                strokeWidth="2"
              />

              {/* Feature branch line */}
              <line
                x1="40%"
                y1="30%"
                x2="40%"
                y2="15%"
                stroke="#FAE3B4"
                strokeWidth="2"
              />
              <line
                x1="40%"
                y1="15%"
                x2="60%"
                y2="15%"
                stroke="#FAE3B4"
                strokeWidth="2"
              />
              <line
                x1="60%"
                y1="15%"
                x2="60%"
                y2="30%"
                stroke="#FAE3B4"
                strokeWidth="2"
              />

              {/* Commit dots */}
              <circle cx="10%" cy="50%" r="5" fill="#5B9A8B" />
              <circle cx="30%" cy="50%" r="5" fill="#5B9A8B" />
              <circle cx="50%" cy="50%" r="5" fill="#5B9A8B" />
              <circle
                cx="70%"
                cy="50%"
                r="6"
                fill="#5B9A8B"
                stroke="#FFA69E"
                strokeWidth="2"
              />
              <circle cx="90%" cy="50%" r="5" fill="#5B9A8B" />

              <circle cx="25%" cy="30%" r="4" fill="#FFA69E" />
              <circle cx="45%" cy="30%" r="4" fill="#FFA69E" />
              <circle
                cx="60%"
                cy="30%"
                r="5"
                fill="#FFA69E"
                stroke="#FAE3B4"
                strokeWidth="2"
              />

              <circle cx="45%" cy="15%" r="4" fill="#FAE3B4" />
              <circle cx="55%" cy="15%" r="4" fill="#FAE3B4" />
            </svg>
          </div>

          {/* Playback Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPlaying(!playing)}
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button variant="outline" size="icon">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <Slider
                  value={timelinePosition}
                  onValueChange={setTimelinePosition}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
              <span className="text-sm text-muted-foreground min-w-[60px] text-right">
                {timelinePosition[0]}%
              </span>
            </div>
          </div>

          {/* Recent Events */}
          <div className="space-y-3 pt-4 border-t">
            <p className="font-medium">Recent Activity</p>
            {timelineEvents.map((event, index) => (
              <HoverCard key={index}>
                <HoverCardTrigger asChild>
                  <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <div
                      className={`p-2 rounded-full ${event.type === 'merge' ? 'bg-primary/10' : 'bg-muted'}`}
                    >
                      {event.type === 'merge' ? (
                        <GitMerge className="h-4 w-4 text-primary" />
                      ) : (
                        <GitCommit className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {event.branch}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {event.date}
                        </span>
                      </div>
                      <p className="text-sm truncate">{event.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        by {event.author} · {event.hash}
                      </p>
                    </div>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={
                          event.type === 'merge' ? 'default' : 'secondary'
                        }
                      >
                        {event.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {event.hash}
                      </span>
                    </div>
                    <p className="font-medium">{event.message}</p>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{event.author}</span>
                      <span>{event.date}</span>
                    </div>
                    {event.type === 'merge' && (
                      <p className="text-sm text-muted-foreground pt-2 border-t">
                        Merged {event.from} → {event.branch}
                      </p>
                    )}
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
