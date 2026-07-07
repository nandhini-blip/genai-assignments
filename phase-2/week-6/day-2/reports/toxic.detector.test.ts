import { ToxicDetector } from '../../../src/detectors/toxic.detector';

describe('ToxicDetector', () => {
  const detector = new ToxicDetector();

  it('blocks on a high-severity threat', () => {
    const result = detector.detect({ text: 'i will kill this project' });

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('BLOCK');
    expect(result.findings[0]).toEqual(expect.objectContaining({ type: 'threats', severity: 'high' }));
  });

  it('blocks when both high and medium severity findings are present', () => {
    const result = detector.detect({
      text: 'I will kill this project and you are stupid for suggesting it'
    });

    expect(result.action).toBe('BLOCK');
    const types = result.findings.map(f => f.type);
    expect(types).toContain('threats');
    expect(types).toContain('harassment');
  });

  it('allows low-severity profanity while still reporting it as triggered', () => {
    const result = detector.detect({ text: 'This is damn annoying' });

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('ALLOW');
    expect(result.message).toMatch(/allowed/i);
  });

  it('returns ALLOW with no findings for clean text', () => {
    const result = detector.detect({ text: 'Write me a test case for login' });

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
    expect(result.findings).toHaveLength(0);
  });
});
