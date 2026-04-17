import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StandingsTable from '../components/StandingsTable';

const mockData = [
  {
    user_id: 1,
    display_name: 'Alice',
    nickname: 'Ace',
    avatar_url: 'https://example.com/a.svg',
    elo_rating: 1100,
    gp: 10,
    wins: 7,
    losses: 3,
    pts: 14,
    win_pct: 70.0,
    plus_minus: 45,
    streak: 'W2',
    last5: ['W', 'W', 'L', 'W', 'L'],
  },
  {
    user_id: 2,
    display_name: 'Bob',
    nickname: 'Big B',
    avatar_url: 'https://example.com/b.svg',
    elo_rating: 950,
    gp: 8,
    wins: 3,
    losses: 5,
    pts: 6,
    win_pct: 37.5,
    plus_minus: -20,
    streak: 'L1',
    last5: ['L', 'W', 'L', 'L', 'W'],
  },
];

function renderTable(data = mockData) {
  return render(
    <MemoryRouter>
      <StandingsTable data={data} type="1v1" />
    </MemoryRouter>
  );
}

describe('StandingsTable', () => {
  test('renders correct columns', () => {
    renderTable();
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('GP')).toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('Pts')).toBeInTheDocument();
    expect(screen.getByText('Win%')).toBeInTheDocument();
    expect(screen.getByText('+/-')).toBeInTheDocument();
    expect(screen.getByText('Streak')).toBeInTheDocument();
    expect(screen.getByText('Last 5')).toBeInTheDocument();
  });

  test('renders player names', () => {
    renderTable();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('sorting by Win% reorders rows', () => {
    renderTable();
    const winPctHeader = screen.getByText('Win%');
    // Default sort is by pts desc (Alice first)
    let rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Alice');

    // First click on Win% sorts desc — Alice (70%) still first
    fireEvent.click(winPctHeader);
    rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Alice');

    // Second click toggles to asc — Bob (37.5%) moves to top
    fireEvent.click(winPctHeader);
    rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Bob');
  });

  test('Last 5 dots render with correct count', () => {
    renderTable();
    const dotContainers = screen.getAllByTestId('last5-dots');
    expect(dotContainers).toHaveLength(2);
    // Alice has 5 results in last5
    const aliceDots = dotContainers[0].querySelectorAll('div');
    expect(aliceDots).toHaveLength(5);
  });

  test('renders empty state when no data', () => {
    renderTable([]);
    expect(screen.getByText(/No standings data yet/i)).toBeInTheDocument();
  });
});
