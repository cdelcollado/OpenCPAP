import { afterEach, describe, expect, it, vi } from 'vitest';
import { installUpdate, markUpdateReady, resetUpdateStateForTests } from './update';

afterEach(() => resetUpdateStateForTests());

describe('update state', () => {
  it('does nothing to the user until a new version is downloaded', () => {
    const apply = vi.fn(async () => {});
    installUpdate();
    expect(apply).not.toHaveBeenCalled();
  });

  it('activates the waiting version with a reload when the user asks', () => {
    const apply = vi.fn(async () => {});
    markUpdateReady(apply);
    installUpdate();
    expect(apply).toHaveBeenCalledWith(true);
  });

  it('keeps the latest waiting version', () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    markUpdateReady(first);
    markUpdateReady(second);
    installUpdate();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(true);
  });
});
