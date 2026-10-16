const fs = require('fs');
const { execSync } = require('child_process');

const SENSITIVE_PATTERNS = [
  /GROQ_API_KEY\s*=\s*['"][^'"]+['"]/,
  /NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*['"][^'"]+['"]/,
  /UPSTASH_REDIS_REST_TOKEN\s*=\s*['"][^'"]+['"]/,
  /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY\s*=\s*['"][^'"]+['"]/,
  // Google API keys (Firebase, Maps, ...) always start with "AIza" and are 39 characters long.
  /AIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----\s*[A-Za-z0-9+/=\n]{40,}/
];

// Files that hold credentials by nature; refuse them by name before reading anything.
const FORBIDDEN_FILE_NAMES = [
  /(^|\/)google-services\.json$/,
  /(^|\/)GoogleService-Info\.plist$/,
  /service-account.*\.json$/i,
  /firebase-adminsdk.*\.json$/i
];

try {
  // Get staged files
  const files = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.trim() && fs.existsSync(f));

  let hasSecrets = false;

  for (const file of files) {
    if (FORBIDDEN_FILE_NAMES.some(re => re.test(file))) {
      console.error(`
🚨 FATAL ERROR: ${file} must never be committed (credentials). It is git-ignored; use git rm --cached.`);
      hasSecrets = true;
      continue;
    }
    if (file === 'scripts/check-secrets.js') continue; // Skip itself
    // Templates hold placeholders on purpose (including in sibling projects).
    if (file.endsWith('.env.example') || file === '.env.local' || file === '.env' || file.endsWith('.md')) continue;
    
    const content = fs.readFileSync(file, 'utf-8');
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(content)) {
        console.error(`\n🚨 FATAL ERROR: Potential secret detected in staged file: ${file}`);
        console.error(`Pattern matched: ${pattern}`);
        hasSecrets = true;
      }
    }
  }

  if (hasSecrets) {
    console.error('\nCommit rejected due to potential secrets. Please remove them and try again.\n');
    process.exit(1);
  }
} catch (error) {
  console.error('Error running check-secrets.js:', error);
  process.exit(1);
}
