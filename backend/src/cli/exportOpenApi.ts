import { writeFileSync } from 'node:fs';
import { openApiDocument } from '../http/openapi.js';

writeFileSync('openapi.json', `${JSON.stringify(openApiDocument, null, 2)}\n`);
console.log('Wrote openapi.json');
