import { TokenDetector } from '../../../src/detectors/token.detector';

describe('TokenDetector', () => {
  const detector = new TokenDetector();

  it('allows text within the model limit', () => {
    const result = detector.detect({ text: 'Write me a test case for login', model: 'gpt-4' });

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
    expect(result.message).toMatch(/within limit/i);
  });

  it('blocks text exceeding the model limit', () => {
    const longText = 'lorem ipsum '.repeat(1400); // ~16.8KB -> ~4200 tokens > 4096 for gpt-3.5-turbo
    const result = detector.detect({ text: longText, model: 'gpt-3.5-turbo' });

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('BLOCK');
    expect(result.findings[0].type).toBe('token_limit_exceeded');
    expect(result.message).toMatch(/exceeded/i);
  });

  it('falls back to the default model config when model is unknown', () => {
    const result = detector.detect({ text: 'short text', model: 'some-unknown-model' });

    expect(result.action).toBe('ALLOW');
    expect(result.message).toMatch(/4096/); // default model maxTokens
  });

  it('respects per-model limits (gpt-4-turbo allows much larger payloads)', () => {
    const longText = 'lorem ipsum '.repeat(1400);
    const result = detector.detect({ text: longText, model: 'gpt-4-turbo' });

    expect(result.action).toBe('ALLOW');
  });
});
