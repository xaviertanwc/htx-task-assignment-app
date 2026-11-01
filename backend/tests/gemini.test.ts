import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGeminiSkillIdentifier, parseAnswer } from '../src/llm/geminiSkillIdentifier.js';
import { SkillIdentificationError } from '../src/llm/skillIdentifier.js';

const SKILLS = ['Frontend', 'Backend'];

interface GeminiRequest {
  contents: { parts: { text: string }[] }[];
  generationConfig: { responseMimeType: string; responseSchema: unknown };
}

describe('parseAnswer', () => {
  it('orders answers by index and drops skills outside the catalogue', () => {
    const text = JSON.stringify([
      { index: 1, skills: ['Backend', 'Backend', 'Cooking'] },
      { index: 0, skills: ['Frontend'] },
    ]);
    expect(parseAnswer(text, 2, SKILLS)).toEqual([['Frontend'], ['Backend']]);
  });

  it.each([
    ['not JSON', 'nope'],
    ['missing text', undefined],
    ['the wrong shape', '{"skills": []}'],
    ['a title with no answer', '[{"index": 0, "skills": ["Frontend"]}]'],
    [
      'only unknown skills',
      '[{"index": 0, "skills": ["Cooking"]}, {"index": 1, "skills": ["Backend"]}]',
    ],
  ])('rejects %s', (_name, text) => {
    expect(() => parseAnswer(text, 2, SKILLS)).toThrow();
  });
});

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

    await expect(identifier().identify(['Upload a picture'], SKILLS)).resolves.toEqual([
      ['Frontend', 'Backend'],
    ]);

    const { url, body } = requests[0]!;
    expect(url).toContain('test-model:generateContent');
    expect(body.contents[0]!.parts[0]!.text).toContain('Upload a picture');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(JSON.stringify(body.generationConfig.responseSchema)).toContain('Frontend');
  });

  it('retries after a transient failure and an invalid answer', async () => {
    responses = [
      { status: 503, body: { error: { code: 503, message: 'overloaded' } } },
      modelReply('not json'),
      modelReply('[{"index": 0, "skills": ["Backend"]}]'),
    ];
    await expect(identifier().identify(['Audit logs'], SKILLS)).resolves.toEqual([['Backend']]);
    expect(requests).toHaveLength(3);
  });

  it('gives up with SkillIdentificationError after three attempts', async () => {
    await expect(identifier().identify(['Audit logs'], SKILLS)).rejects.toBeInstanceOf(
      SkillIdentificationError,
    );
    expect(requests).toHaveLength(3);
  });
});
