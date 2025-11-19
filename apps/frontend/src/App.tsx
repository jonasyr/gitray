import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SettingsDrawer } from './components/SettingsDrawer';
import { NewsDrawer } from './components/NewsDrawer';
import { InfoModal } from './components/InfoModal';
import { LandingPage } from './components/LandingPage';
import { DashboardPage } from './components/DashboardPage';
import { RiveLoader } from './components/RiveLoader';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { getRepositoryFullData } from './services/api';
import { Commit, CommitHeatmapData } from '@gitray/shared-types';

type Page = 'landing' | 'dashboard';
type InfoType = 'what' | 'private' | 'local' | null;

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [infoModalType, setInfoModalType] = useState<InfoType>(null);
  const [hasUnreadNews, setHasUnreadNews] = useState(true);

  // State for repository data
  const [commits, setCommits] = useState<Commit[]>([]);
  const [heatmapData, setHeatmapData] = useState<CommitHeatmapData | null>(
    null
  );
  const [repoUrl, setRepoUrl] = useState<string>('');

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  const handleAnalyze = async (url: string, mode: string) => {
    setIsLoading(true);
    toast.info('Analysis started!', {
      description: `Analyzing repository in ${mode} mode...`,
    });

    try {
      // Fetch real data from backend
      console.log('Calling API with URL:', url);
      const data = await getRepositoryFullData(url, 'day');
      console.log('API response:', data);

      // Store the fetched data in state
      setCommits(data.commits);
      setHeatmapData(data.heatmapData);
      setRepoUrl(url);

      // Navigate to dashboard
      setCurrentPage('dashboard');
      setIsSignedIn(true);
      setIsLoading(false);

      toast.success('Analysis complete!', {
        description: `Successfully analyzed ${data.commits.length} commits.`,
      });
    } catch (error) {
      setIsLoading(false);
      console.error('Analysis error details:', error);
      toast.error('Analysis failed', {
        description:
          error instanceof Error
            ? error.message
            : 'Failed to analyze repository',
      });
    }
  };

  const handleSignOut = () => {
    setIsSignedIn(false);
    setCurrentPage('landing');
    toast.info('Signed out successfully');
  };

  const handleNavigateHome = () => {
    setCurrentPage('landing');
  };

  const handleInfoClick = (type: 'what' | 'private' | 'local') => {
    setInfoModalType(type);
  };

  const handleNewsClick = () => {
    setNewsOpen(true);
    setHasUnreadNews(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header
        isSignedIn={isSignedIn}
        onMenuClick={() => setSettingsOpen(true)}
        onNewsClick={handleNewsClick}
        onSignOut={handleSignOut}
        onNavigateHome={handleNavigateHome}
        showNews={currentPage === 'dashboard'}
        hasUnreadNews={hasUnreadNews}
        title={currentPage === 'dashboard' ? 'GitRay' : undefined}
        theme={theme}
      />

      <main className="flex-1">
        {isLoading ? (
          <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
            <RiveLoader
              size={150}
              message="Analyzing repository..."
              theme={theme}
            />
          </div>
        ) : (
          <>
            {currentPage === 'landing' && (
              <LandingPage
                onAnalyze={handleAnalyze}
                onInfoClick={handleInfoClick}
              />
            )}
            {currentPage === 'dashboard' && (
              <DashboardPage
                commits={commits}
                heatmapData={heatmapData}
                repoUrl={repoUrl}
              />
            )}
          </>
        )}
      </main>

      <Footer />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
      />

      <NewsDrawer open={newsOpen} onClose={() => setNewsOpen(false)} />

      <InfoModal
        open={infoModalType !== null}
        onClose={() => setInfoModalType(null)}
        type={infoModalType}
      />

      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'bg-card border-border',
            title: 'text-foreground',
            description: 'text-muted-foreground',
          },
        }}
      />
    </div>
  );
}
