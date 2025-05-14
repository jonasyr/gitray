import React from 'react';
import RepoInput from '../components/RepoInput';

const MainPage: React.FC = () => {
  const handleVisualize = (repoUrl: string) => {
    console.log('Visualizing:', repoUrl);
    // Hier kommt die Logik zur Visualisierung des Repositories hin
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
      <div className="flex flex-col items-center justify-center flex-grow space-y-8">
        <RepoInput onVisualize={handleVisualize} />

        {/* Erklärungs-Buttons */}
        <div className="flex space-x-4">
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