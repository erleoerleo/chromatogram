import { describe, expect, it } from 'vitest';
import type { Peak } from '../src/model';
import { layoutLabels } from '../src/render/svg';
import { linearScale } from '../src/render/scale';

describe('layoutLabels', () => {
  it('stacks labels that would overlap and leaves distant ones alone', () => {
    const xs = linearScale(0, 100, 0, 1000);
    const ys = linearScale(0, 100, 500, 0);
    const item = (time: number, value: number, text: string) => ({ peak: {} as Peak, text, time, value });
    const placed = layoutLabels(
      [item(10, 20, 'AAAA'), item(10.05, 20, 'BBBB'), item(10.1, 20, 'CCCC'), item(50, 20, 'DDDD')],
      xs,
      ys,
      10,
    );
    const [a, b, c, d] = placed;
    expect(b.bottom).toBeLessThan(a.top);
    expect(c.bottom).toBeLessThan(b.top);
    expect(d.bottom).toBe(a.bottom);
  });
});
