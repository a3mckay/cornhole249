import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GameCard from '../components/GameCard';

const baseGame = {
  id: 1,
  game_type: '1v1',
  played_at: '2025-06-15T14:00:00Z',
  season: 2025,
  venue_name: "Andrew's Backyard",
  weather_json: JSON.stringify({ condition: 'Clear', temp_c: 25, wind_kph: 10, precipitation_mm: 0 }),
  participants: [
    { user_id: 1, team: 1, score: 21, is_winner: 1, display_name: 'Alice', nickname: 'Ace', avatar_url: 'https://x.com/a' },
    { user_id: 2, team: 2, score: 15, is_winner: 0, display_name: 'Bob', nickname: 'Big B', avatar_url: 'https://x.com/b' },
  ],
  latest_comment: { body: 'Nice game', display_name: 'Carol' },
};

describe('GameCard', () => {
  test('renders weather badge with correct condition', () => {
    render(<MemoryRouter><GameCard game={baseGame} /></MemoryRouter>);
    expect(screen.getByText(/Clear/)).toBeInTheDocument();
  });

  test('renders winner name with trophy', () => {
    render(<MemoryRouter><GameCard game={baseGame} /></MemoryRouter>);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('🏆')).toBeInTheDocument();
  });

  test('renders both team names', () => {
    render(<MemoryRouter><GameCard game={baseGame} /></MemoryRouter>);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('renders venue name', () => {
    render(<MemoryRouter><GameCard game={baseGame} /></MemoryRouter>);
    expect(screen.getByText(/Andrew's Backyard/)).toBeInTheDocument();
  });

  test('renders latest comment', () => {
    render(<MemoryRouter><GameCard game={baseGame} /></MemoryRouter>);
    expect(screen.getByText(/Nice game/)).toBeInTheDocument();
  });

  test('handles missing weather gracefully', () => {
    const game = { ...baseGame, weather_json: null, weather: null };
    render(<MemoryRouter><GameCard game={game} /></MemoryRouter>);
    // Should render without crashing
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
