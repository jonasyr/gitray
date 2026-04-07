import { ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

interface NewsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const newsItems = [
  {
    version: 'v2.0',
    title: 'Major Update: AI Insights & Premium Features',
    description:
      'Introducing AI-powered project analysis, weekly summaries, and comprehensive premium features including multi-language support (8 languages available).',
    date: 'Just now',
  },
  {
    version: 'v2.0',
    title: 'New: Advanced Analytics Tab',
    description:
      'Access Code Churn Analysis, File Type Distribution, Graph View Timeline with playback, and Git Diff viewer all in one place.',
    date: 'Just now',
  },
  {
    version: 'v2.0',
    title: 'Enhanced: Contribution Ranking',
    description:
      'See detailed contributor leaderboards with commit counts, code changes, and achievement badges on the Overview tab.',
    date: 'Just now',
  },
  {
    version: 'v1.9',
    title: 'Private repo tokens',
    description:
      'You can now add tokens to Connections to analyze private repositories securely.',
    date: '2 days ago',
  },
  {
    version: 'v1.8',
    title: 'New: File Distribution chart',
    description:
      "Visualize your repository's file types and language distribution with our new chart.",
    date: '1 week ago',
  },
];

export function NewsDrawer({ open, onClose }: NewsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-6 flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>What's New</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6 overflow-y-auto flex-1 pr-2">
          {newsItems.map((item, index) => (
            <div
              key={index}
              className="space-y-2 pb-6 border-b border-border last:border-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                      {item.version}
                    </span>
                  </div>
                  <h4 className="mt-2">{item.title}</h4>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
              <p className="text-xs text-muted-foreground">{item.date}</p>
            </div>
          ))}

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => window.open('#', '_blank')}
          >
            View Full Changelog
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
