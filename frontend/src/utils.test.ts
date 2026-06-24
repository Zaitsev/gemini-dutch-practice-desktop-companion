import { describe, it, expect } from 'vitest';
import { getCategoryByLevel, countCardsByCurrentCategory, isLikelyNetworkError } from './utils';

describe('Utils', () => {
  describe('getCategoryByLevel', () => {
    it('should return "again" for level 0', () => {
      expect(getCategoryByLevel(0)).toBe('again');
    });

    it('should return "again" for level 1', () => {
      expect(getCategoryByLevel(1)).toBe('again');
    });

    it('should return "hard" for level 2', () => {
      expect(getCategoryByLevel(2)).toBe('hard');
    });

    it('should return "hard" for level 3', () => {
      expect(getCategoryByLevel(3)).toBe('hard');
    });

    it('should return "good" for level 4', () => {
      expect(getCategoryByLevel(4)).toBe('good');
    });

    it('should return "good" for level 5', () => {
      expect(getCategoryByLevel(5)).toBe('good');
    });

    it('should return "easy" for level 6', () => {
      expect(getCategoryByLevel(6)).toBe('easy');
    });

    it('should return "easy" for level 7', () => {
      expect(getCategoryByLevel(7)).toBe('easy');
    });
  });

  describe('countCardsByCurrentCategory', () => {
    it('should return zero counts for empty array', () => {
      const result = countCardsByCurrentCategory([]);
      expect(result).toEqual({
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
      });
    });
  });

  describe('isLikelyNetworkError', () => {
    it('should detect common network failures', () => {
      expect(isLikelyNetworkError('dial tcp: i/o timeout')).toBe(true);
      expect(isLikelyNetworkError('client is offline')).toBe(true);
      expect(isLikelyNetworkError('connection refused by host')).toBe(true);
    });

    it('should not classify auth problems as network failures', () => {
      expect(isLikelyNetworkError('user not authenticated')).toBe(false);
      expect(isLikelyNetworkError('permission denied')).toBe(false);
    });
  });
});
