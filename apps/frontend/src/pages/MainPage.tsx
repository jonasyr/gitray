import React, { useState } from 'react';
import RepoInput from '../components/RepoInput';
import CommitList from '../components/CommitList';
import { getWorkspaceCommits } from '../services/api';
import { Commit } from '../../../../packages/shared-types/src';

const MainPage: React.FC = () => {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleVisualize = async (repoUrl: string) => {
    console.log('Visualizing:', repoUrl);
    setIsLoading(true);
    setError(null);
    
    try {
      const fetchedCommits = await getWorkspaceCommits(repoUrl);
      setCommits(fetchedCommits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setCommits([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white h-screen flex flex-col items-center">
      {/* Header mit Login/Signup Buttons */}
      <header className="w-full p-4 flex justify-end space-x-2">
        <button className="bg-gray-200 hover:bg-gray-300 text-green-700 font-bold py-2 px-4 rounded-md">
          Login
        </button>
        <button className="bg-gray-200 hover:bg-gray-300 text-green-700 font-bold py-2 px-4 rounded-md">
          Signup
        </button>
      </header>

      {/* Hauptbereich */}
      <div className="flex flex-col items-center justify-center flex-grow space-y-8 w-full max-w-6xl px-4">
        <RepoInput onVisualize={handleVisualize} />

        {isLoading && (
          <div className="mt-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading repository data...</p>
          </div>
        )}

        {error && (
          <div className="mt-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
            <p><strong>Error:</strong> {error}</p>
          </div>
        )}

        {!isLoading && !error && commits.length > 0 && (
          <CommitList commits={commits} />
        )}

        {!isLoading && !error && commits.length === 0 && !error && (
          <div className="flex space-x-4 mt-8">
            <button className="bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-4 rounded-md">
              Explanation 1
            </button>
            <button className="bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-4 rounded-md">
              Explanation 2
            </button>
            <button className="bg-blue-200 hover:bg-blue-300 text-black font-bold py-2 px-4 rounded-md">
              Explanation 3
            </button>
          </div>
        )}
      </div>

      {/* Footer-Bereich */}
      <footer className="w-full border-t border-gray-200 py-4 text-center text-gray-500 text-sm">
        <p>Nach dem runterscrollen:</p>
        <div>
          Links: Impressum; Datenschutzerklärung; "Über Uns"-Seite; created by "Namen von uns"
        </div>
      </footer>
    </div>
  );
};

export default MainPage;