import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/ToastProvider';

function Harness({ onResult }) {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.error('Sync failed: boom')}>fail</button>
      <button onClick={() => toast.success('Saved')}>ok</button>
      <button
        onClick={async () => {
          const answer = await toast.confirm({ title: 'Delete workspace?', message: 'Gone for good.' });
          onResult?.(answer);
        }}
      >
        destroy
      </button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('surfaces errors instead of swallowing them', async () => {
    render(<ToastProvider><Harness /></ToastProvider>);

    fireEvent.click(screen.getByText('fail'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sync failed: boom');
  });

  it('dismisses a toast on close', async () => {
    render(<ToastProvider><Harness /></ToastProvider>);

    fireEvent.click(screen.getByText('ok'));
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/dismiss notification/i));
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument());
  });

  it('confirm resolves false on cancel and true on confirm', async () => {
    const onResult = vi.fn();
    render(<ToastProvider><Harness onResult={onResult} /></ToastProvider>);

    fireEvent.click(screen.getByText('destroy'));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete workspace?');

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));

    fireEvent.click(screen.getByText('destroy'));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('useToast is a no-op outside a provider', () => {
    // Components are rendered standalone in several existing suites.
    expect(() => render(<Harness />)).not.toThrow();
  });
});
