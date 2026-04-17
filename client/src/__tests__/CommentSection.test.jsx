import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import CommentSection from '../components/CommentSection';

// Mock api
vi.mock('../api', () => ({
  commentsApi: {
    post: vi.fn().mockResolvedValue({
      id: 99,
      body: 'Test comment',
      display_name: 'Alice',
      nickname: 'Ace',
      avatar_url: 'https://x.com/a',
      created_at: new Date().toISOString(),
      user_id: 1,
    }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

// Mock useAuth
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, display_name: 'Alice', nickname: 'Ace', avatar_url: 'https://x.com/a', is_admin: false },
  }),
}));

describe('CommentSection', () => {
  test('submit button is disabled when input is empty', () => {
    render(<CommentSection gameId={1} comments={[]} />);
    const submitBtn = screen.getByTestId('comment-submit');
    expect(submitBtn).toBeDisabled();
  });

  test('submit button enabled when input has text', async () => {
    render(<CommentSection gameId={1} comments={[]} />);
    const input = screen.getByTestId('comment-input');
    await userEvent.type(input, 'Nice game!');
    expect(screen.getByTestId('comment-submit')).not.toBeDisabled();
  });

  test('shows character count', async () => {
    render(<CommentSection gameId={1} comments={[]} />);
    const input = screen.getByTestId('comment-input');
    await userEvent.type(input, 'Hello');
    expect(screen.getByTestId('char-count')).toHaveTextContent('5/500');
  });

  test('calls POST on submit', async () => {
    const { commentsApi } = await import('../api');
    render(<CommentSection gameId={42} comments={[]} />);
    const input = screen.getByTestId('comment-input');
    await userEvent.type(input, 'Trash talk!');
    await userEvent.click(screen.getByTestId('comment-submit'));
    await waitFor(() => {
      expect(commentsApi.post).toHaveBeenCalledWith(42, 'Trash talk!');
    });
  });

  test('renders existing comments', () => {
    const comments = [
      { id: 1, body: 'Great shot!', display_name: 'Bob', nickname: 'Big B', avatar_url: 'https://x.com/b', created_at: new Date().toISOString(), user_id: 2 },
    ];
    render(<CommentSection gameId={1} comments={comments} />);
    expect(screen.getByText('Great shot!')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('clears input after successful submit', async () => {
    render(<CommentSection gameId={1} comments={[]} />);
    const input = screen.getByTestId('comment-input');
    await userEvent.type(input, 'Some comment');
    await userEvent.click(screen.getByTestId('comment-submit'));
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });
});
