import React from 'react';
import { Commit } from '@gitray/shared-types';

interface CommitListProps {
  commits: Commit[];
}

const CommitList: React.FC<CommitListProps> = ({ commits }) => {
  if (commits.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mt-8">
      <h2 className="text-xl font-bold mb-4">Repository Commits</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-2 px-4 border-b text-left">SHA</th>
              <th className="py-2 px-4 border-b text-left">Date</th>
              <th className="py-2 px-4 border-b text-left">Author</th>
              <th className="py-2 px-4 border-b text-left">Message</th>
            </tr>
          </thead>
          <tbody>
            {commits.map((commit) => (
              <tr key={commit.sha} className="hover:bg-gray-50">
                <td className="py-2 px-4 border-b font-mono text-sm">
                  {commit.sha.substring(0, 7)}
                </td>
                <td className="py-2 px-4 border-b">
                  {new Date(commit.date).toLocaleDateString()}
                </td>
                <td className="py-2 px-4 border-b">
                  {commit.authorName}
                  <span className="text-gray-500 text-xs block">
                    {commit.authorEmail}
                  </span>
                </td>
                <td className="py-2 px-4 border-b">{commit.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CommitList;
