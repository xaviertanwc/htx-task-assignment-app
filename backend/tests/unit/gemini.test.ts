import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGeminiSkillIdentifier } from '../../src/llm/gemini.js';
import { SkillIdentificationError } from '../../src/llm/skillIdentifier.js';

const SKILLS = ['Frontend', 'Backend'];
const OPTIONS = SKILLS.map((name) => ({ name, description: `${name} work` }));

interface GeminiRequest {
  contents: { parts: { text: string }[] }[];
  generationConfig: { responseMimeType: string; responseSchema: unknown };
}

describe('createGeminiSkillIdentifier', () => {
  let server: Server;
  let baseUrl: string;
  let responses: { status: number; body: unknown }[];
  let requests: { url: string; body: GeminiRequest }[];

  const modelReply = (text: string) => ({
    status: 200,
    body: { candidates: [{ content: { role: 'model', parts: [{ text }] } }] },
  });

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        requests.push({ url: req.url ?? '', body: JSON.parse(raw) });
        const next = responses.shift() ?? { status: 500, body: {} };
        res.writeHead(next.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(next.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    responses = [];
    requests = [];
  });

  const identifier = () =>
    createGeminiSkillIdentifier({ apiKey: 'test', model: 'test-model', baseUrl, backoffMs: 1 });

  it('sends the titles with a constrained schema and returns parsed skills', async () => {
    responses = [modelReply('[{"index": 0, "skills": ["Frontend", "Backend"]}]')];

    await expect(identifier().identify(['Upload a picture'], OPTIONS)).resolves.toEqual([
      ['Frontend', 'Backend'],
    ]);

    const { url, body } = requests[0]!;
    expect(url).toContain('test-model:generateContent');
    expect(body.contents[0]!.parts[0]!.text).toContain('Upload a picture');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(JSON.stringify(body.generationConfig.responseSchema)).toContain('Frontend');
    expect(body.contents[0]!.parts[0]!.text).toContain('Frontend work');
  });

  it('retries after a transient failure and an invalid answer', async () => {
    responses = [
      { status: 503, body: { error: { code: 503, message: 'overloaded' } } },
      modelReply('not json'),
      modelReply('[{"index": 0, "skills": ["Backend"]}]'),
    ];
    await expect(identifier().identify(['Audit logs'], OPTIONS)).resolves.toEqual([['Backend']]);
    expect(requests).toHaveLength(3);
  });

  it('retries a partial answer, then returns it, leaving unresolved titles empty', async () => {
    const partial = modelReply('[{"index": 0, "skills": ["Backend"]}, {"index": 1, "skills": []}]');
    responses = [partial, partial, partial];
    await expect(identifier().identify(['Clear', 'Unclear'], OPTIONS)).resolves.toEqual([
      ['Backend'],
      [],
    ]);
    expect(requests).toHaveLength(3);
  });

  it('does not include the API key in errors', async () => {
    const rejected = createGeminiSkillIdentifier({
      apiKey: 'secret-key-value',
      model: 'test-model',
      baseUrl,
      backoffMs: 1,
    }).identify(['Audit logs'], OPTIONS);
    const error = await rejected.then(
      () => undefined,
      (caught: Error) => caught,
    );
    expect(`${error?.message} ${String(error?.cause)}`).not.toContain('secret-key-value');
  });

  it('gives up with SkillIdentificationError after three attempts', async () => {
    await expect(identifier().identify(['Audit logs'], OPTIONS)).rejects.toBeInstanceOf(
      SkillIdentificationError,
    );
    expect(requests).toHaveLength(3);
  });
});
