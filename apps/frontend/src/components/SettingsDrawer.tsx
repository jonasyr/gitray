import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useState } from 'react';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
}

export function SettingsDrawer({
  open,
  onClose,
  theme,
  onThemeChange,
}: SettingsDrawerProps) {
  const [language, setLanguage] = useState('english');

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="general" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-6">
            <div className="space-y-4">
              <h3>General Settings</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="language">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English (Default)</SelectItem>
                      <SelectItem value="german">Deutsch</SelectItem>
                      <SelectItem value="french">Français</SelectItem>
                      <SelectItem value="spanish">Español</SelectItem>
                      <SelectItem value="portuguese">Português</SelectItem>
                      <SelectItem value="mandarin">中文</SelectItem>
                      <SelectItem value="japanese">日本語</SelectItem>
                      <SelectItem value="russian">Русский</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose your preferred display language
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-analyze on paste</Label>
                    <p className="text-sm text-muted-foreground">
                      Start analysis automatically when pasting a URL
                    </p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when analysis completes
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable export features</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow exporting visualizations and reports
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6 mt-6">
            <div className="space-y-4">
              <h3>Theme</h3>
              <RadioGroup value={theme} onValueChange={onThemeChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light">Light</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark">Dark</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="system" id="system" />
                  <Label htmlFor="system">System</Label>
                </div>
              </RadioGroup>
            </div>
          </TabsContent>

          <TabsContent value="account" className="space-y-6 mt-6">
            <div className="space-y-4">
              <h3>Account Information</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    defaultValue="john.doe@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="username"
                    defaultValue="johndoe"
                  />
                </div>
                <Button className="w-full">Save Changes</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="connections" className="space-y-6 mt-6">
            <div className="space-y-4">
              <h3>API Connections</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="github-token">GitHub Token</Label>
                  <Input
                    id="github-token"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required for private repositories
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-token">AI API Token</Label>
                  <Input
                    id="ai-token"
                    type="password"
                    placeholder="sk-xxxxxxxxxxxx"
                  />
                  <p className="text-xs text-muted-foreground">
                    For enhanced AI-powered insights
                  </p>
                </div>
                <Button className="w-full">Save Tokens</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
