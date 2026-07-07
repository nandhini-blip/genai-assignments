import { FileDetector } from '../../../src/detectors/file.detector';

function mockFile(overrides: Partial<Express.Multer.File>): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'test.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 1024,
    buffer: Buffer.from(''),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides
  };
}

describe('FileDetector', () => {
  const detector = new FileDetector();

  it('allows a valid .csv file', () => {
    const file = mockFile({ originalname: 'test-cases.csv', mimetype: 'text/csv', size: 2048 });

    const result = detector.detect({}, file);

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
    expect(result.message).toBe('File is valid');
  });

  it('blocks a disallowed .exe extension', () => {
    const file = mockFile({
      originalname: 'report.exe',
      mimetype: 'application/x-msdownload',
      size: 1258291
    });

    const result = detector.detect({}, file);

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('BLOCK');
    expect(result.findings.some(f => f.type === 'invalid_extension')).toBe(true);
    expect(result.findings.some(f => f.type === 'invalid_mime_type')).toBe(true);
  });

  it('blocks a file exceeding the max size', () => {
    const file = mockFile({
      originalname: 'huge.csv',
      mimetype: 'text/csv',
      size: 10 * 1024 * 1024 // 10MB > 5MB limit
    });

    const result = detector.detect({}, file);

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('BLOCK');
    expect(result.findings.some(f => f.type === 'file_too_large')).toBe(true);
  });

  it('allows when no file is uploaded', () => {
    const result = detector.detect({}, undefined);

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('ALLOW');
    expect(result.message).toBe('No file uploaded');
  });
});
