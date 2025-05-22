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
    <div className="bg-gray-900 min-h-screen flex flex-col items-center text-white">
      {/* Header with Login/Signup Buttons */}
      <header className="w-full p-4 flex justify-end space-x-2">
        <button className="bg-gray-700 hover:bg-gray-600 text-green-400 font-bold py-2 px-4 rounded-md">
          Login
        </button>
        <button className="bg-gray-700 hover:bg-gray-600 text-green-400 font-bold py-2 px-4 rounded-md">
          Signup
        </button>
      </header>

      {/* Main area */}
      <div className="flex flex-col items-center justify-center flex-grow space-y-8 w-full max-w-6xl px-4">
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
            <div className="flex space-x-2 mt-6 mb-2">
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
              <ActivityHeatmap repoUrl={repoUrl} />
            ) : (
              <CommitList commits={commits} />
            )}
          </>
        )}

        {!isLoading && !error && commits.length === 0 && !error && (
          <div className="flex space-x-4 mt-8">
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
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-gray-800 py-4 text-center text-gray-500 text-sm">
        <p>Nach dem runterscrollen:</p>
        <div>
          Links: Impressum; Datenschutzerklärung; "Über Uns"-Seite; created by "Namen von uns"
        </div>
      </footer>
    </div>
  );
};

export default MainPage;