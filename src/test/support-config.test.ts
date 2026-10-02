import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { DEFAULT_SUPPORT, safeSupportUrl, validateSupport } from '@/features/support/config';
describe('Support Member config boundary', () => {
  it('accepts existing settings and Telegram admin changes', () => {
    const c = structuredClone(DEFAULT_SUPPORT); c.links[0].url = 'https://t.me/Mityangho'; c.links[0].platform = 'telegram';
    expect(validateSupport(c)).toEqual(c);
  });
  it('rejects script URLs and embedded credentials', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com', 'not-a-url']) expect(safeSupportUrl(url)).toBeNull();
    const c=structuredClone(DEFAULT_SUPPORT);c.links[0].url='javascript:alert(1)';expect(() => validateSupport(c)).toThrow();
  });
  it('rejects duplicate IDs, excessive links and malformed booleans', () => {
    const c=structuredClone(DEFAULT_SUPPORT);c.links.push({...c.links[0]});expect(() => validateSupport(c)).toThrow();
    expect(() => validateSupport({...DEFAULT_SUPPORT, links:Array(21).fill(DEFAULT_SUPPORT.links[0])})).toThrow();
    expect(() => validateSupport({...DEFAULT_SUPPORT, bubble_enabled:'yes'})).toThrow();
  });
  it('allows disabling all support without restoring default links', () => {
    expect(validateSupport({...DEFAULT_SUPPORT, links:[], banner_enabled:false,bubble_enabled:false}).links).toEqual([]);
  });
});
