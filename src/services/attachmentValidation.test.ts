import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from './attachmentValidation';

describe('runtime-independent UTF-8 byte lengths', () => {
  it.each(['', 'ASCII', 'școală', '文書', '🗃️', '\ud800', '\udfff', '\ud800A', '\ud800\ud800\udfff'])(
    'matches UTF-8 replacement semantics for %j',
    value => {
      expect(utf8ByteLength(value)).toBe(new TextEncoder().encode(value).byteLength);
    },
  );
});
