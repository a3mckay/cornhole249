import React from 'react';
import { render, screen } from '@testing-library/react';
import AchievementBadge from '../components/AchievementBadge';

const earnedAchievement = {
  key: 'win_streak_3',
  label: 'On Fire',
  description: 'Won 3 games in a row',
  icon: '🔥',
  earned: true,
  earned_at: '2025-06-01T12:00:00Z',
};

const lockedAchievement = {
  key: 'century',
  label: 'Century',
  description: 'Played 100 games',
  icon: '💯',
  earned: false,
  earned_at: null,
};

describe('AchievementBadge', () => {
  test('earned achievement renders with full color (not locked class)', () => {
    const { container } = render(<AchievementBadge achievement={earnedAchievement} />);
    const badge = container.querySelector('.achievement-badge');
    expect(badge).not.toHaveClass('locked');
  });

  test('locked achievement renders with locked class (greyed out)', () => {
    const { container } = render(<AchievementBadge achievement={lockedAchievement} />);
    const badge = container.querySelector('.achievement-badge');
    expect(badge).toHaveClass('locked');
  });

  test('renders icon', () => {
    render(<AchievementBadge achievement={earnedAchievement} />);
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });
});
