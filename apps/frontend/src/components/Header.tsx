import { Menu, Bell } from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { RiveLogo } from './RiveLogo';

interface HeaderProps {
  isSignedIn: boolean;
  onMenuClick: () => void;
  onNewsClick: () => void;
  onSignOut?: () => void;
  onNavigateHome: () => void;
  showNews?: boolean;
  hasUnreadNews?: boolean;
  title?: string;
  theme?: 'light' | 'dark' | 'system';
}

export function Header({
  isSignedIn,
  onMenuClick,
  onNewsClick,
  onSignOut,
  onNavigateHome,
  showNews = false,
  hasUnreadNews = false,
  title,
  theme = 'dark',
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 md:h-16 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="h-9 w-9 md:h-10 md:w-10 hover:bg-accent/50 transition-all"
          >
            <Menu className="h-4 w-4 md:h-5 md:w-5" />
          </Button>

          <button
            onClick={onNavigateHome}
            className="flex items-center gap-2 group"
          >
            <RiveLogo
              size={40}
              interactive={true}
              theme={theme}
              className="md:w-10 md:h-10"
            />
            {title && (
              <span className="hidden md:block text-lg md:text-xl font-semibold">
                {title}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          {showNews && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewsClick}
                className="h-9 w-9 md:h-10 md:w-10 hover:bg-accent/50 transition-all"
              >
                <Bell className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
              {hasUnreadNews && (
                <Badge className="absolute -top-1 -right-1 h-2 w-2 p-0 bg-secondary border-0" />
              )}
            </div>
          )}

          {isSignedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 md:h-10 md:w-10 rounded-full p-0"
                >
                  <Avatar className="h-9 w-9 md:h-10 md:w-10">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm">
                      JD
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>Account Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={onSignOut}>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all text-xs md:text-sm"
            >
              <span className="hidden sm:inline">Sign in / Log in</span>
              <span className="sm:hidden">Sign in</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
