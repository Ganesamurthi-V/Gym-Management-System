const fs = require('fs');
const { execSync } = require('child_process');

const SENSITIVE_PATTERNS = [
  /GROQ_API_KEY\s*=\s*['"][^'"]+['"]/,
  /NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*['"][^'"]+['"]/,
  /UPSTASH_REDIS_REST_TOKEN\s*=\s*['"][^'"]+['"]/,
  /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY\s*=\s*['"][^'"]+['"]/
];

try {
  // Get staged files
  const files = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.trim() && fs.existsSync(f));

  let hasSecrets = false;

  for (const file of files) {
    if (file === 'scripts/check-secrets.js') continue; // Skip itself
    if (file === '.env.example' || file === '.env.local' || file === '.env' || file === 'README.md' || file.endsWith('.md')) continue;
    
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
