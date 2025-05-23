import React, { useState } from 'react';
import RepoInput from '../components/RepoInput';
import CommitList from '../components/CommitList';
import ActivityHeatmap from '../components/ActivityHeatmap';
import { getRepositoryFullData } from '../services/api';
import { Commit } from '../../../../packages/shared-types/src';

const MainPage: React.FC = () => {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);

  const handleVisualize = async (inputRepoUrl: string) => {
    console.log('Visualizing:', inputRepoUrl);
    setRepoUrl(inputRepoUrl);
    setIsLoading(true);
    setError(null);
    
    try {
      // Use the optimized endpoint to fetch both commits and heatmap data at once
      const { commits } = await getRepositoryFullData(
        inputRepoUrl,
        'day'
      );

      setCommits(commits);
      setShowHeatmap(true); // Show heatmap by default after fetching
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setCommits([]);
      setShowHeatmap(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen flex flex-col text-white">
      {/* Header with Login/Signup Buttons */}
      <header className="w-full container mx-auto px-4 p-4 flex flex-wrap justify-end gap-2">
        <button className="bg-gray-700 hover:bg-gray-600 text-green-400 font-bold py-2 px-4 rounded-md">
          Login
        </button>
        <button className="bg-gray-700 hover:bg-gray-600 text-green-400 font-bold py-2 px-4 rounded-md">
          Signup
        </button>
      </header>

      {/* Main area */}
      <main className="w-full max-w-4xl mx-auto flex flex-col flex-grow space-y-8 px-4">
        <RepoInput onVisualize={handleVisualize} />

        {isLoading && (
          <div className="mt-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
            <p className="mt-2 text-gray-400">Loading repository data...</p>
          </div>
        )}

        {error && (
          <div className="mt-8 p-4 bg-red-900 border border-red-700 text-red-200 rounded-md">
            <p><strong>Error:</strong> {error}</p>
          </div>
        )}

        {!isLoading && !error && commits.length > 0 && (
          <>
            {/* Visualization selector */}
            <div className="flex flex-wrap gap-2 mt-6 mb-2 justify-center">
              <button
                className={`px-4 py-2 rounded-md font-medium ${
                  !showHeatmap ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                onClick={() => setShowHeatmap(false)}
              >
                Commit List
              </button>
              <button
                className={`px-4 py-2 rounded-md font-medium ${
                  showHeatmap ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                onClick={() => setShowHeatmap(true)}
              >
                Activity Heatmap
              </button>
            </div>
            
            {/* Show either commit list or heatmap based on selection */}
            {showHeatmap ? (
              <ActivityHeatmap repoUrl={repoUrl} commits={commits} />
            ) : (
              <CommitList commits={commits} />
            )}
          </>
        )}

        {!isLoading && !error && commits.length === 0 && (
          <div className="flex flex-wrap gap-4 mt-8 justify-center">
            <button className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md">
              Explanation 1
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md">
              Explanation 2
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md">
              Explanation 3
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full container mx-auto px-4 border-t border-gray-800 py-4 text-center text-gray-500 text-sm">
        <p>Nach dem runterscrollen:</p>
        <div>
          Links: Impressum; Datenschutzerklärung; "Über Uns"-Seite; created by "Namen von uns"
        </div>
      </footer>
    </div>
  );
};

export default MainPage;