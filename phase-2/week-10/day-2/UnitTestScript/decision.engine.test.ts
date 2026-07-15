import { DecisionEngine } from '../../../src/engine/decision.engine';
import { DetectorResult } from '../../../src/types';

describe('DecisionEngine', () => {
  const engine = new DecisionEngine();

  describe('resolveAction', () => {
    it('resolves to BLOCK when any detector fires BLOCK, even if others MASK or ALLOW', () => {
      const results: DetectorResult[] = [
        { detector: 'pii', triggered: true, action: 'MASK', findings: [] },
        { detector: 'secret', triggered: true, action: 'BLOCK', findings: [] },
        { detector: 'toxic', triggered: false, action: 'ALLOW', findings: [] }
      ];

      expect(engine.resolveAction(results)).toBe('BLOCK');
    });

    it('resolves to MASK when no BLOCK is present but at least one MASK is', () => {
      const results: DetectorResult[] = [
        { detector: 'pii', triggered: true, action: 'MASK', findings: [] },
        { detector: 'toxic', triggered: false, action: 'ALLOW', findings: [] }
      ];

      expect(engine.resolveAction(results)).toBe('MASK');
    });

    it('resolves to ALLOW when every detector allows', () => {
      const results: DetectorResult[] = [
        { detector: 'pii', triggered: false, action: 'ALLOW', findings: [] },
        { detector: 'toxic', triggered: false, action: 'ALLOW', findings: [] }
      ];

      expect(engine.resolveAction(results)).toBe('ALLOW');
    });

    it('resolves to ALLOW for an empty result set', () => {
      expect(engine.resolveAction([])).toBe('ALLOW');
    });
  });

  describe('applySanitization', () => {
    it('masks PII findings in the text', () => {
      const results: DetectorResult[] = [
        { detector: 'pii', triggered: true, action: 'MASK', findings: [] }
      ];

      const sanitized = engine.applySanitization('Contact john@gmail.com now', results);
      expect(sanitized).toBe('Contact [EMAIL_REDACTED] now');
    });

    it('leaves text untouched when no MASK detector triggered', () => {
      const results: DetectorResult[] = [
        { detector: 'pii', triggered: false, action: 'ALLOW', findings: [] }
      ];

      const sanitized = engine.applySanitization('Contact john@gmail.com now', results);
      expect(sanitized).toBe('Contact john@gmail.com now');
    });
  });

  describe('buildResponse', () => {
    it('omits sanitizedContent when the final action is BLOCK', () => {
      const results: DetectorResult[] = [
        { detector: 'secret', triggered: true, action: 'BLOCK', findings: [] }
      ];

      const response = engine.buildResponse('some secret text', results, Date.now());

      expect(response.action).toBe('BLOCK');
      expect(response.sanitizedContent).toBeUndefined();
      expect(response.originalContent).toBe('some secret text');
    });

    it('includes sanitized content when the final action is MASK', () => {
      const results: DetectorResult[] = [
        { detector: 'pii', triggered: true, action: 'MASK', findings: [] }
      ];

      const response = engine.buildResponse('Contact john@gmail.com', results, Date.now());

      expect(response.action).toBe('MASK');
      expect(response.sanitizedContent).toBe('Contact [EMAIL_REDACTED]');
    });

    it('populates metadata with a token estimate and timestamp', () => {
      const response = engine.buildResponse('hello world', [], Date.now());

      expect(response.metadata.tokenEstimate).toBe(Math.ceil('hello world'.length / 4));
      expect(response.metadata.timestamp).toEqual(expect.any(String));
      expect(response.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
