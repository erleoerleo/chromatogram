import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRef } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chromatogram, type ChromatogramHandle } from '../src/index.js';

// Vitest runs with the package directory as cwd; jsdom's import.meta.url is not a file URL.
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), '../core/test/fixtures', name)));

const fid = fixture('synthetic-fid.ch');
const fidLabels = fixture('synthetic-fid.prc');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<Chromatogram>', () => {
  it('renders an SVG with peak labels from file bytes', async () => {
    const onRender = vi.fn();
    const { container } = render(
      <Chromatogram data={fid} labels={fidLabels} timeRange={[2, 58]} onRender={onRender} />,
    );
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(container.textContent).toContain('SYNTHETIC-FID-1');
    expect(container.textContent).toContain('nC13');
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender.mock.calls[0][0].peaks.length).toBe(31);
  });

  it('gives each instance its own clip-path id', async () => {
    const { container } = render(
      <>
        <Chromatogram data={fid} />
        <Chromatogram data={fid} />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll('svg')).toHaveLength(2));
    const ids = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('accepts a URL and plots the requested ions of an .ms file', async () => {
    const ms = fixture('synthetic.ms');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(ms));
    const onRender = vi.fn();
    render(<Chromatogram data="/samples/synthetic.ms" ions="191" onRender={onRender} />);
    await waitFor(() => expect(onRender).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/samples/synthetic.ms', expect.anything());
    expect(onRender.mock.calls[0][0].trace.label).toBe('Ion Mass: 191');
    expect(onRender.mock.calls[0][0].dataFileName).toBe('synthetic.ms');
  });

  it('shows an error and calls onError for an unreadable file', async () => {
    const onError = vi.fn();
    render(<Chromatogram data={new Uint8Array([1, 0x39, 0, 0])} onError={onError} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Unsupported \.ch version '9'/);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('exposes the SVG and a download through the ref', async () => {
    const ref = createRef<ChromatogramHandle>();
    render(<Chromatogram ref={ref} data={fid} />);
    expect(ref.current!.getSvg()).toBeNull();
    expect(ref.current!.exportSvg()).toBe(false);
    await waitFor(() => expect(ref.current!.getSvg()).toMatch(/^<svg /));

    const blob = ref.current!.toSvgBlob()!;
    expect(blob.type).toBe('image/svg+xml');
    expect(await blob.text()).toContain('<?xml');

    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('SYNTHETIC-FID-1.svg');
    });
    act(() => {
      expect(ref.current!.exportSvg()).toBe(true);
    });
    expect(click).toHaveBeenCalledTimes(1);
  });
});
