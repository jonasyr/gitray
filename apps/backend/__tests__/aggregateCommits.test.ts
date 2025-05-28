import { gitService } from '../src/services/gitService';

interface Commit {
  sha: string;
  message: string;
  date: string;
  authorName: string;
  authorEmail: string;
}

describe('aggregateCommitsByTime', () => {
  test('returns 365 buckets with correct counts', async () => {
    // Arrange
    const commits: Commit[] = [
      {
        sha: 'a',
        message: 'msg',
        date: '2023-06-01T12:00:00Z',
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
      },
      {
        sha: 'b',
        message: 'msg',
        date: '2023-06-01T13:00:00Z',
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
      },
      {
        sha: 'c',
        message: 'msg',
        date: '2023-06-02T10:00:00Z',
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
      },
    ];

    // Act
    const result = await gitService.aggregateCommitsByTime(commits, {
      fromDate: '2023-01-01',
      toDate: '2023-12-31',
    });

    // Assert
    expect(result.data).toHaveLength(365);
    const first = result.data.find((b) => b.periodStart === '2023-06-01');
    const second = result.data.find((b) => b.periodStart === '2023-06-02');
    expect(first?.commitCount).toBe(2);
    expect(second?.commitCount).toBe(1);
    expect(result.metadata?.totalCommits).toBe(3);
  });
});
