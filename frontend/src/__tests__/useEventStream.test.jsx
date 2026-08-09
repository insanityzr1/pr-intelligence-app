import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useEventStream } from '../hooks/useEventStream';

/** Minimal EventSource stand-in; jsdom has none. */
class MockEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    MockEventSource.instances.push(this);
  }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  removeEventListener(name, fn) {
    this.listeners[name] = (this.listeners[name] || []).filter(f => f !== fn);
  }
  close() { this.closed = true; }
  emit(name, data) {
    (this.listeners[name] || []).forEach(fn => fn({ data: JSON.stringify(data) }));
  }
  emitRaw(name, raw) {
    (this.listeners[name] || []).forEach(fn => fn({ data: raw }));
  }
}

function Harness({ onPrs }) {
  const { connected } = useEventStream({ prs_updated: onPrs });
  return <div data-testid="state">{connected ? 'live' : 'offline'}</div>;
}

describe('useEventStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    global.EventSource = MockEventSource;
  });
  afterEach(() => { delete global.EventSource; });

  it('connects and reports live state', async () => {
    render(<Harness onPrs={vi.fn()} />);
    const source = MockEventSource.instances[0];
    expect(source.url).toBe('/api/events');

    act(() => source.onopen());
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('live'));
  });

  it('dispatches parsed events to the matching handler', async () => {
    const onPrs = vi.fn();
    render(<Harness onPrs={onPrs} />);

    act(() => MockEventSource.instances[0].emit('prs_updated', { repo_name: 'acme/alpha', changed: 3 }));
    expect(onPrs).toHaveBeenCalledWith({ repo_name: 'acme/alpha', changed: 3 });
  });

  it('ignores malformed frames rather than throwing', () => {
    const onPrs = vi.fn();
    render(<Harness onPrs={onPrs} />);

    // Keep-alive comments and truncated frames must not break the stream.
    expect(() =>
      act(() => MockEventSource.instances[0].emitRaw('prs_updated', 'not json'))
    ).not.toThrow();
    expect(onPrs).toHaveBeenCalledWith({});
  });

  it('closes the connection on unmount', () => {
    const { unmount } = render(<Harness onPrs={vi.fn()} />);
    const source = MockEventSource.instances[0];
    unmount();
    expect(source.closed).toBe(true);
  });

  it('goes offline and retries after an error', async () => {
    vi.useFakeTimers();
    try {
      render(<Harness onPrs={vi.fn()} />);
      const first = MockEventSource.instances[0];

      act(() => { first.onopen(); });
      act(() => { first.onerror(); });
      expect(first.closed).toBe(true);

      act(() => { vi.advanceTimersByTime(1100); });
      expect(MockEventSource.instances.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
