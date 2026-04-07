import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
  type: 'what' | 'private' | 'local' | null;
}

const infoContent = {
  what: {
    title: 'What is GitRay?',
    description:
      'GitRay is a powerful Git repository analytics tool that helps you understand your codebase better. It analyzes commit patterns, file distributions, contributor activity, and provides actionable insights to improve your development workflow. Simply paste a GitHub repository URL to get started.',
  },
  private: {
    title: 'Analyze a Private Repository',
    description:
      "To analyze private repositories, you'll need to provide a GitHub Personal Access Token. Go to Settings → Connections and add your token. GitRay securely uses this token to fetch repository data without storing your credentials. Your token is encrypted and only used for analysis purposes.",
  },
  local: {
    title: 'Analyze on a Local Server',
    description:
      'GitRay can be self-hosted on your local server for enhanced privacy and control. Clone the GitRay repository, configure your environment variables, and run the Docker container. This allows you to analyze private repositories without sharing data externally. Check our documentation for setup instructions.',
  },
};

export function InfoModal({ open, onClose, type }: InfoModalProps) {
  if (!type) return null;

  const content = infoContent[type];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription className="pt-4">
            {content.description}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
