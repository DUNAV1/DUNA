export type IncomingProjectFile = {
  path: string;
  content: string;
};

export type PreparedProjectFile = IncomingProjectFile;

export const PROJECT_FILE_LIMITS = {
  maxFiles: 120,
  maxFileChars: 12_000,
  maxTotalChars: 100_000
} as const;

const BLOCKED_SEGMENTS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output',
  '.venv', 'venv', '__pycache__', 'vendor', 'target', 'out', '.ssh', '.aws', '.azure',
  '.config', '.idea', '.vscode', 'secrets', 'credentials'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx', '.html', '.css',
  '.scss', '.sass', '.less', '.py', '.go', '.rs', '.java', '.kt', '.kts', '.cs', '.php',
  '.rb', '.swift', '.sh', '.ps1', '.yml', '.yaml', '.toml', '.xml', '.sql', '.graphql',
  '.gql', '.prisma', '.vue', '.svelte', '.astro', '.dart', '.ex', '.exs', '.erl', '.hrl',
  '.scala', '.clj', '.cljs', '.fs', '.fsx', '.vb', '.c', '.h', '.cc', '.cpp', '.hpp',
  '.txt', '.gradle', '.properties', '.ini', '.conf', '.cfg', '.proto', '.ipynb'
]);

const ALLOWED_SPECIAL_NAMES = new Set([
  'dockerfile', 'makefile', 'cmakelists.txt', 'procfile', 'gemfile', 'rakefile',
  'justfile', '.gitignore', '.gitattributes', '.editorconfig', '.nvmrc', '.node-version'
]);

const BLOCKED_SPECIAL_NAMES = new Set([
  '.npmrc', '.pypirc', '.netrc', '.dockerconfigjson', 'id_rsa', 'id_ed25519',
  'credentials', 'credential', 'service-account.json'
]);

export function isAllowedProjectPath(inputPath: string): boolean {
  if (!inputPath || inputPath.length > 260 || inputPath.includes('\\')) return false;
  const normalized = inputPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return false;

  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return false;
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part.toLowerCase()))) return false;

  const fileName = (parts.at(-1) ?? '').toLowerCase();
  if (!fileName || fileName.startsWith('.env')) return false;
  if (BLOCKED_SPECIAL_NAMES.has(fileName)) return false;
  if (/^(id_(rsa|ed25519)|.*credentials.*|.*secret.*|.*service.?account.*)$/i.test(fileName)) return false;
  if (/\.(pem|key|p12|pfx|keystore|jks|der)$/i.test(fileName)) return false;

  if (ALLOWED_SPECIAL_NAMES.has(fileName)) return true;
  const extension = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '';
  return ALLOWED_EXTENSIONS.has(extension);
}

function hasBinaryControlCharacters(content: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(content);
}

export function redactSensitiveValues(input: string): { content: string; redactedCount: number } {
  let content = input;
  let redactedCount = 0;

  const replaceAndCount = (pattern: RegExp, replacement: string) => {
    const matches = content.match(pattern);
    if (matches) redactedCount += matches.length;
    content = content.replace(pattern, replacement);
  };

  replaceAndCount(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED PRIVATE KEY]'
  );
  replaceAndCount(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED API KEY]');
  replaceAndCount(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED GITHUB TOKEN]');
  replaceAndCount(/\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/g, '[REDACTED PAYMENT KEY]');
  replaceAndCount(/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[REDACTED GOOGLE API KEY]');
  replaceAndCount(/\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g, '[REDACTED SLACK TOKEN]');
  replaceAndCount(/\bBearer\s+[A-Za-z0-9._~+\/-]{16,}=?/gi, 'Bearer [REDACTED TOKEN]');
  replaceAndCount(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED AWS ACCESS KEY]');
  replaceAndCount(
    /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret)\b\s*[:=]\s*)(["']?)[^\s"'`,;]{8,}(["']?)/gi,
    '$1[REDACTED]'
  );
  replaceAndCount(/(https?:\/\/[^:/\s]+:)[^@/\s]+(@)/gi, '$1[REDACTED]$2');

  return { content, redactedCount };
}

export function prepareProjectFiles(files: IncomingProjectFile[]): {
  files: PreparedProjectFile[];
  skippedCount: number;
  redactedCount: number;
  totalChars: number;
} {
  const prepared: PreparedProjectFile[] = [];
  let skippedCount = 0;
  let redactedCount = 0;
  let totalChars = 0;

  for (const file of files) {
    if (prepared.length >= PROJECT_FILE_LIMITS.maxFiles) {
      skippedCount += 1;
      continue;
    }
    if (!isAllowedProjectPath(file.path) || file.content.length > PROJECT_FILE_LIMITS.maxFileChars || hasBinaryControlCharacters(file.content)) {
      skippedCount += 1;
      continue;
    }

    const sanitized = redactSensitiveValues(file.content);
    if (totalChars + sanitized.content.length > PROJECT_FILE_LIMITS.maxTotalChars) {
      skippedCount += 1;
      continue;
    }

    prepared.push({ path: file.path, content: sanitized.content });
    totalChars += sanitized.content.length;
    redactedCount += sanitized.redactedCount;
  }

  return { files: prepared, skippedCount, redactedCount, totalChars };
}
