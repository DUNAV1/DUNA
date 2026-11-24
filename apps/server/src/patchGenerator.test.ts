import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createPatchDiff,
  hasRedactionMarker,
  isPatchCandidateSafe,
  normalizePatchContent
} from './patchGenerator.js';

describe('human-reviewed patch helpers', () => {
  it('creates a compact diff with removed and added lines and surrounding context', () => {
    const diff = createPatchDiff(
      'src/example.ts',
      'const before = 1;\nconst oldValue = 2;\nconst after = 3;\n',
      'const before = 1;\nconst newValue = 4;\nconst after = 3;\n'
    );

    assert.match(diff, /^--- a\/src\/example\.ts/m);
    assert.match(diff, /^\+\+\+ b\/src\/example\.ts/m);
    assert.match(diff, /^-const oldValue = 2;$/m);
    assert.match(diff, /^\+const newValue = 4;$/m);
    assert.match(diff, /^ const before = 1;$/m);
  });

  it('preserves CRLF line endings when preparing approved replacement text', () => {
    const original = 'one\r\ntwo\r\n';
    const proposed = normalizePatchContent(original, 'one\nthree\n');
    assert.equal(proposed, 'one\r\nthree\r\n');
  });

  it('rejects redacted originals and recognizes redaction markers', () => {
    assert.equal(isPatchCandidateSafe('src/app.ts', 'const value = 1;', 0), true);
    assert.equal(isPatchCandidateSafe('package-lock.json', '{}', 0), false);
    assert.equal(isPatchCandidateSafe('src/app.ts', 'const apiKey = "[REDACTED]";', 0), false);
    assert.equal(isPatchCandidateSafe('src/app.ts', 'const value = 1;', 1), false);
    assert.equal(hasRedactionMarker('token: [REDACTED API KEY]'), true);
    assert.equal(hasRedactionMarker('normal source text'), false);
  });

  it('makes an unchanged proposal explicit', () => {
    assert.match(createPatchDiff('src/a.ts', 'same\n', 'same\n'), /no textual changes/);
  });
});
