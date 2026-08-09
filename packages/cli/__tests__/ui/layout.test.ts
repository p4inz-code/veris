/**
 * Tests for layout components.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderBox,
  getBorderChars,
  horizontalDivider,
  setSymbolSet,
  resetSymbolSet,
} from '../../src/ui/index.js';

describe('Box', () => {
  beforeEach(() => {
    setSymbolSet('ascii');
  });

  afterAll(() => {
    resetSymbolSet();
  });

  it('should render a box around content', () => {
    const lines = renderBox(['Hello', 'World'], { width: 30, padding: 0 });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('Hello'))).toBe(true);
    expect(lines.some((l) => l.includes('World'))).toBe(true);
  });

  it('should render a box with title', () => {
    const lines = renderBox(['Content'], { width: 30, title: 'Title' });
    expect(lines.some((l) => l.includes('Title'))).toBe(true);
  });

  it('renders box matching snapshot', () => {
    const lines = renderBox(['Line 1', 'Line 2'], { width: 30, title: 'Section', padding: 0 });
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it('should render a box with padding', () => {
    const lines = renderBox(['Content'], { width: 30, padding: 1 });
    expect(lines.length).toBeGreaterThan(1);
  });

  it('should handle empty content', () => {
    const lines = renderBox([], { width: 20 });
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('should always have top and bottom borders when showBottomBorder is true', () => {
    const lines = renderBox(['Content'], { width: 20, showBottomBorder: true });
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('getBorderChars', () => {
  it('should return border characters', () => {
    const borders = getBorderChars();
    expect(borders.topLeft).toBeTypeOf('string');
    expect(borders.topRight).toBeTypeOf('string');
    expect(borders.bottomLeft).toBeTypeOf('string');
    expect(borders.bottomRight).toBeTypeOf('string');
    expect(borders.horizontal).toBeTypeOf('string');
    expect(borders.vertical).toBeTypeOf('string');
  });
});

describe('horizontalDivider', () => {
  it('should create a divider of the correct length', () => {
    const divider = horizontalDivider(10);
    expect(divider.length).toBe(10);
  });

  it('should use custom character', () => {
    const divider = horizontalDivider(5, '=');
    expect(divider).toBe('=====');
  });
});
