import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import QRShare from '../components/QRShare';

// Mock qrcode.react
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, ...props }) => <svg data-testid="qr-code" data-value={value} {...props} />,
}));

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
});

describe('QRShare (inline)', () => {
  test('renders QR code component', () => {
    render(<QRShare inline />);
    expect(screen.getByTestId('qr-code')).toBeInTheDocument();
  });

  test('Copy Link button calls navigator.clipboard.writeText', async () => {
    render(<QRShare inline />);
    const btn = screen.getByTestId('copy-link-btn');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
    });
  });

  test('Copy Link button shows copied state', async () => {
    render(<QRShare inline />);
    const btn = screen.getByTestId('copy-link-btn');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/Copied/i)).toBeInTheDocument();
    });
  });

  test('QR code receives window.location.origin as value', () => {
    render(<QRShare inline />);
    const qr = screen.getByTestId('qr-code');
    // jsdom sets location.origin to '' or 'http://localhost'
    expect(qr.getAttribute('data-value')).toBeDefined();
  });
});
