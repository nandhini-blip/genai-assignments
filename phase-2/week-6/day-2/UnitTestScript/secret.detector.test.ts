import { SecretDetector } from '../../../src/detectors/secret.detector';

describe('SecretDetector', () => {
  const detector = new SecretDetector();

  it('detects an OpenAI-style key and blocks', () => {
    const result = detector.detect({
      text: 'Use this key: sk-abc123XYZ456abc123XYZ456abc123XY to call the API'
    });

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('BLOCK');
    expect(result.message).toMatch(/blocked/i);
    expect(result.findings[0].type).toBe('openai_key');
  });

  it('truncates the secret value in findings instead of exposing it in full', () => {
    const result = detector.detect({
      text: 'token: sk-abc123XYZ456abc123XYZ456abc123XY'
    });

    expect(result.findings[0].value).toMatch(/^sk-abc\*+$/);
    expect(result.findings[0].value).not.toContain('456');
  });

  it('detects a GitHub token', () => {
    const result = detector.detect({
      text: 'export GH_TOKEN=ghp_1234567890abcdef1234567890abcdef1234'
    });

    expect(result.triggered).toBe(true);
    expect(result.findings.some(f => f.type === 'github_token')).toBe(true);
  });

  it('returns ALLOW for text with no secrets', () => {
    const result = detector.detect({ text: 'Write me a test case for login' });

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
  });
});
