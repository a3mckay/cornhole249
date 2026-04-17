import React from 'react';
import { render, screen } from '@testing-library/react';
import OddsBar from '../components/OddsBar';

const mockOdds = {
  team1_pct: 62,
  team2_pct: 38,
  confidence: 'High',
  explanation: 'Jordan holds a strong Elo edge (1187 vs 1043).',
  h2h_games: 14,
  elo_team1: 1187,
  elo_team2: 1043,
};

describe('OddsBar', () => {
  test('renders two percentage bars summing to 100', () => {
    render(<OddsBar odds={mockOdds} team1Label="Alice" team2Label="Bob" />);
    const t1 = screen.getByTestId('team1-pct');
    const t2 = screen.getByTestId('team2-pct');
    const pct1 = parseInt(t1.style.width);
    const pct2 = parseInt(t2.style.width);
    expect(pct1 + pct2).toBe(100);
  });

  test('shows confidence label', () => {
    render(<OddsBar odds={mockOdds} team1Label="Alice" team2Label="Bob" />);
    expect(screen.getByTestId('confidence-label')).toHaveTextContent('High Confidence');
  });

  test('shows team labels', () => {
    render(<OddsBar odds={mockOdds} team1Label="Alice" team2Label="Bob" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('shows explanation text', () => {
    render(<OddsBar odds={mockOdds} team1Label="Alice" team2Label="Bob" />);
    expect(screen.getByText(/Elo edge/)).toBeInTheDocument();
  });

  test('renders null gracefully', () => {
    const { container } = render(<OddsBar odds={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('Medium confidence label renders correctly', () => {
    render(<OddsBar odds={{ ...mockOdds, confidence: 'Medium' }} />);
    expect(screen.getByTestId('confidence-label')).toHaveTextContent('Medium Confidence');
  });

  test('Estimated confidence label renders correctly', () => {
    render(<OddsBar odds={{ ...mockOdds, confidence: 'Estimated' }} />);
    expect(screen.getByTestId('confidence-label')).toHaveTextContent('Estimated');
  });
});
