import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAllowedProjectPath,
  prepareProjectFiles,
  PROJECT_FILE_LIMITS
} from './projectIntelligence.js';

describe('project file safety filters', () => {
  it('accepts normal source/config files and rejects sensitive or generated paths', () => {
    assert.equal(isAllowedProjectPath('src/main.ts'), true);
    assert.equal(isAllowedProjectPath('package.json'), true);
    assert.equal(isAllowedProjectPath('README.md'), true);
    assert.equal(isAllowedProjectPath('.env'), false);
    assert.equal(isAllowedProjectPath('.env.local'), false);
    assert.equal(isAllowedProjectPath('../../outside.ts'), false);
    assert.equal(isAllowedProjectPath('node_modules/pkg/index.js'), false);
    assert.equal(isAllowedProjectPath('.git/config'), false);
    assert.equal(isAllowedProjectPath('keys/release.jks'), false);
    assert.equal(isAllowedProjectPath('images/logo.png'), false);
  });

  it('redacts common API tokens and credential assignments before model context is built', () => {
    const token = 'ghp_123456789012345678901234567890';
    const result = prepareProjectFiles([{
      path: 'src/config.ts',
      content: `export const apiKey = "sk-123456789012345678901234";\nexport const token = "${token}";`
    }]);

    assert.equal(result.files.length, 1);
    assert.equal(result.redactedCount >= 2, true);
    assert.equal(result.files[0].content.includes('123456789012345678901234'), false);
    assert.equal(result.files[0].content.includes(token), false);
  });

  it('enforces per-file and total context size limits', () => {
    const oversized = 'x'.repeat(PROJECT_FILE_LIMITS.maxFileChars + 1);
    const largeFiles = Array.from({ length: 8 }, (_, index) => ({
      path: `src/large-${index}.ts`,
      content: 'y'.repeat(PROJECT_FILE_LIMITS.maxFileChars)
    }));
    const result = prepareProjectFiles([
      { path: 'src/oversized.ts', content: oversized },
      ...largeFiles,
      { path: 'src/too-much.ts', content: 'z'.repeat(5_000) },
      { path: 'src/final.ts', content: 'f'.repeat(4_000) },
      { path: 'src/extra.ts', content: 'const extra = true;' }
    ]);

    assert.equal(result.files.length, 9);
    assert.equal(result.files[0].path, 'src/large-0.ts');
    assert.equal(result.files.at(-1)?.path, 'src/final.ts');
    assert.equal(result.skippedCount, 3);
    assert.equal(result.totalChars, PROJECT_FILE_LIMITS.maxTotalChars);
  });
});
