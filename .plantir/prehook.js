import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

writeFileSync(resolve(__dirname, 'hook_completed.txt'), `hook_completed
sessionID: ${process.env.SESSION_ID}
text: ${process.env.TEXT}`)

process.exit(0)