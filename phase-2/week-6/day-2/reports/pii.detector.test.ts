import { PiiDetector } from '../../../src/detectors/pii.detector';

describe('PiiDetector', () => {
  const detector = new PiiDetector();

  it('detects and masks an email address', () => {
    const result = detector.detect({ text: 'My email is john.doe@gmail.com' });

    expect(result.detector).toBe('pii');
    expect(result.triggered).toBe(true);
    expect(result.action).toBe('MASK');
    expect(result.findings).toEqual([
      expect.objectContaining({ type: 'email', value: 'john.doe@gmail.com', masked: '[EMAIL_REDACTED]' })
    ]);
  });

  it('detects multiple PII types in the same text', () => {
    const result = detector.detect({
      text: 'My email is john.doe@gmail.com and my Aadhaar is 2345 6789 0123'
    });

    const types = result.findings.map(f => f.type);
    expect(types).toContain('email');
    expect(types).toContain('aadhaar');
  });

  it('returns ALLOW with no findings for clean text', () => {
    const result = detector.detect({ text: 'Write me a test case for login functionality' });

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
    expect(result.findings).toHaveLength(0);
  });

  it('treats an empty/missing text as clean', () => {
    const result = detector.detect({});

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
  });

  it('mask() redacts PII in place', () => {
    const masked = detector.mask('Contact me at jane@company.com');
    expect(masked).toBe('Contact me at [EMAIL_REDACTED]');
  });
});
