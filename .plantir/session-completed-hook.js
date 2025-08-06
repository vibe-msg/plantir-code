import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

writeFileSync(resolve(__dirname, 'session_hook_completed.txt'), `session_hook_completed`)

process.exit(0)
