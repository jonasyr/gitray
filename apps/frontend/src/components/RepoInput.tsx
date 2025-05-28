import React, { useState } from 'react';

// Simple input + button for submitting a repository URL

interface RepoInputProps {
  onVisualize: (repoUrl: string) => void;
}

const RepoInput: React.FC<RepoInputProps> = ({ onVisualize }) => {
  const [repoUrl, setRepoUrl] = useState<string>(
    // Placeholder text shown on first render
    'https://github.com/username/Repository'
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRepoUrl(event.target.value);
  };

  const handleVisualizeClick = () => {
    // Bubble the entered repo URL up to the parent component
    onVisualize(repoUrl);
  };

  return (
    <div className="flex items-center justify-center space-x-4">
      <input
        type="text"
        className="w-96 px-4 py-2 border border-gray-300 rounded-md text-gray-500"
        value={repoUrl}
        onChange={handleInputChange}
        onFocus={() => {
          if (repoUrl === 'https://github.com/username/Repository') {
            setRepoUrl('');
          }
        }}
        onBlur={() => {
          if (repoUrl === '') {
            setRepoUrl('https://github.com/username/Repository');
          }
        }}
      />
      <button
        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md"
        onClick={handleVisualizeClick}
      >
        Visualize
      </button>
    </div>
  );
};

export default RepoInput;
