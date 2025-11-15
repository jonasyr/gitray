import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SettingsDrawer } from './components/SettingsDrawer';
import { NewsDrawer } from './components/NewsDrawer';
import { InfoModal } from './components/InfoModal';
import { LandingPage } from './components/LandingPage';
import { DashboardPage } from './components/DashboardPage';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner@2.0.3';

type Page = 'landing' | 'dashboard';
type InfoType = 'what' | 'private' | 'local' | null;

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [infoModalType, setInfoModalType] = useState<InfoType>(null);
  const [hasUnreadNews, setHasUnreadNews] = useState(true);

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

  const handleAnalyze = (url: string, mode: string) => {
    toast.success('Analysis started!', {
      description: `Analyzing repository in ${mode} mode...`,
    });

    // Simulate analysis delay
    setTimeout(() => {
      setCurrentPage('dashboard');
      setIsSignedIn(true);
      toast.success('Analysis complete!', {
        description: 'Repository data has been processed.',
      });
    }, 1500);
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
      />

      <main className="flex-1">
        {currentPage === 'landing' && (
          <LandingPage
            onAnalyze={handleAnalyze}
            onInfoClick={handleInfoClick}
          />
        )}
        {currentPage === 'dashboard' && <DashboardPage />}
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
