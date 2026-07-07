import { CiiDetector } from '../../../src/detectors/cii.detector';

describe('CiiDetector', () => {
  const detector = new CiiDetector();

  it('detects a project codename keyword', () => {
    const result = detector.detect({ text: 'The project-phoenix roadmap is due Friday' });

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('MASK');
    expect(result.findings.some(f => f.type === 'project_codename')).toBe(true);
  });

  it('detects an internal URL pattern', () => {
    const result = detector.detect({ text: 'See https://intranet.testleaf.com for details' });

    expect(result.triggered).toBe(true);
    expect(result.findings.some(f => f.type === 'internal_url')).toBe(true);
  });

  it('returns ALLOW for clean text', () => {
    const result = detector.detect({ text: 'Write me a test case for login' });

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
  });

  it('mask() redacts keyword and pattern matches', () => {
    const masked = detector.mask('project-titan uses https://internal.acme.com');
    expect(masked).toContain('[PROJECT_CODENAME_REDACTED]');
    expect(masked).toContain('[INTERNAL_URL_REDACTED]');
  });
});
