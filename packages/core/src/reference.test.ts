import { describe, expect, it } from 'vitest';
import { ahiReference, deviceFamily, leakReference, odi4Reference, usageReference } from './reference';
import { summarizeNight } from './nights';
import type { SessionLite } from './nights';

describe('deviceFamily', () => {
  it('maps the manufacturer strings of the loaders', () => {
    expect(deviceFamily('Philips Respironics')).toBe('philips');
    expect(deviceFamily('ResMed')).toBe('resmed');
  });
  it('treats demo, unknown and missing manufacturers as other', () => {
    expect(deviceFamily('Demo')).toBe('other');
    expect(deviceFamily(undefined)).toBe('other');
  });
});

describe('AHI and ODI4 bands', () => {
  it('puts the boundaries on the expected side', () => {
    expect(ahiReference(4.99)).toBe('good');
    expect(ahiReference(5)).toBe('warn');
    expect(ahiReference(14.99)).toBe('warn');
    expect(ahiReference(15)).toBe('bad');
    expect(odi4Reference(4.9)).toBe('good');
    expect(odi4Reference(5)).toBe('warn');
    expect(odi4Reference(15)).toBe('bad');
  });
  it('has no state without a value', () => {
    expect(ahiReference(undefined)).toBeUndefined();
    expect(ahiReference(NaN)).toBeUndefined();
    expect(odi4Reference(undefined)).toBeUndefined();
  });
});

describe('usage', () => {
  it('is within range from 4 hours', () => {
    expect(usageReference(4)).toBe('good');
    expect(usageReference(3.99)).toBe('warn');
    expect(usageReference(undefined)).toBeUndefined();
  });
});

describe('leak (70th percentile)', () => {
  it('uses ResMed seal rule: below 24 L/min is within range', () => {
    expect(leakReference(23.9, 'resmed')).toBe('good');
    expect(leakReference(24, 'resmed')).toBe('bad');
  });
  it('uses the Philips band: 30 to 50 within range, attention to 60, out of range above 60', () => {
    expect(leakReference(29.9, 'philips')).toBe('warn');
    expect(leakReference(30, 'philips')).toBe('good');
    expect(leakReference(40, 'philips')).toBe('good');
    expect(leakReference(50, 'philips')).toBe('good');
    expect(leakReference(50.1, 'philips')).toBe('warn');
    expect(leakReference(60, 'philips')).toBe('warn');
    expect(leakReference(60.1, 'philips')).toBe('bad');
  });
  it('has no state for unknown families or without a value', () => {
    expect(leakReference(40, 'other')).toBeUndefined();
    expect(leakReference(undefined, 'resmed')).toBeUndefined();
  });
});

describe('night summary carries the manufacturer', () => {
  const START = Date.UTC(2026, 2, 5, 23);
  const session = (manufacturer: string): SessionLite => ({
    device: { manufacturer, model: 'x', serial: 'S' }, id: 1, start: START, end: START + 3600_000, clock: 'device-local',
    slices: [{ start: START, end: START + 3600_000, status: 'mask-on' }], settings: {}, events: [], statistics: [],
  });
  it('takes it from the first session', () => {
    expect(summarizeNight('2026-03-05', [session('ResMed')]).manufacturer).toBe('ResMed');
  });
});
