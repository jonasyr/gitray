import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface LandingPageProps {
  onAnalyze: (url: string, mode: string) => void;
  onInfoClick: (type: 'what' | 'private' | 'local') => void;
}

export function LandingPage({ onAnalyze, onInfoClick }: LandingPageProps) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('main');

  const handleAnalyze = () => {
    if (url.trim()) {
      onAnalyze(url, mode);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-3xl space-y-8 md:space-y-12 py-8 md:py-12">
        {/* Hero Wordmark */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl md:text-7xl lg:text-8xl tracking-tight bg-gradient-to-br from-primary via-primary to-secondary bg-clip-text text-transparent font-bold">
            GitRay
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
            Powerful analytics for your Git repositories. Understand your
            codebase like never before.
          </p>
        </div>

        {/* Input Section */}
        <div className="space-y-4 md:space-y-6 bg-card rounded-2xl p-6 md:p-8 shadow-lg border border-border hover:shadow-xl transition-shadow">
          <div className="space-y-2">
            <Label htmlFor="repo-url" className="text-sm md:text-base">
              Repository URL
            </Label>
            <Input
              id="repo-url"
              type="url"
              placeholder="https://github.com/org/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 md:h-14 text-base md:text-lg border-2 focus:border-primary transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAnalyze();
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mode" className="text-sm md:text-base">
              Select Branch
            </Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="mode" className="h-10 md:h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">Main</SelectItem>
                <SelectItem value="...">...</SelectItem>
                <SelectItem value="...">...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleAnalyze}
            className="w-full h-12 md:h-14 text-base md:text-lg group relative overflow-hidden"
            size="lg"
            disabled={!url.trim()}
          >
            <span className="relative z-10 flex items-center justify-center">
              Analyze Repository
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
          </Button>
        </div>

        {/* Helper Chips */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => onInfoClick('what')}
            className="rounded-full shadow-sm hover:shadow-md transition-all"
          >
            What is GitRay?
          </Button>
          <Button
            variant="outline"
            onClick={() => onInfoClick('private')}
            className="rounded-full shadow-sm hover:shadow-md transition-all"
          >
            Analyze a private Repo?
          </Button>
          <Button
            variant="outline"
            onClick={() => onInfoClick('local')}
            className="rounded-full shadow-sm hover:shadow-md transition-all"
          >
            Analyze on a local Server?
          </Button>
        </div>
      </div>
    </div>
  );
}
