import { describe, expect, it } from 'vitest';
import {
  assertCanLeaveDone,
  assertCanMarkDone,
  assertDeveloperQualified,
  assertSkillsKnown,
  findMissingSkills,
} from '../../src/features/tasks/task.rules.js';
import { AppError } from '../../src/shared/errors.js';

const DESIGN = { id: 1, name: 'Design' };
const DATA = { id: 2, name: 'Data' };

function codeOf(check: () => void): string | undefined {
  try {
    check();
  } catch (error) {
    return error instanceof AppError ? error.code : 'not an AppError';
  }
  return undefined;
}

describe('findMissingSkills', () => {
  it('returns required skills the developer does not hold', () => {
    expect(findMissingSkills([DESIGN, DATA], [DATA])).toEqual(['Design']);
    expect(findMissingSkills([DESIGN, DATA], [DATA, DESIGN])).toEqual([]);
    expect(findMissingSkills([DESIGN], [])).toEqual(['Design']);
  });
});

describe('assignment rules', () => {
  it('requires every skill', () => {
    expect(codeOf(() => assertDeveloperQualified([DESIGN, DATA], [DESIGN]))).toBe(
      'DEVELOPER_MISSING_SKILLS',
    );
    expect(codeOf(() => assertDeveloperQualified([DESIGN], [DESIGN, DATA]))).toBeUndefined();
  });

  it('blocks only tasks whose skills are pending', () => {
    expect(codeOf(() => assertSkillsKnown('pending'))).toBe('TASK_SKILLS_PENDING');
    expect(codeOf(() => assertSkillsKnown('llm'))).toBeUndefined();
    expect(codeOf(() => assertSkillsKnown('user'))).toBeUndefined();
  });
});

describe('status rules', () => {
  it('blocks Done while any subtask is unfinished', () => {
    expect(codeOf(() => assertCanMarkDone([{ id: 1, title: 'Open' }]))).toBe('SUBTASKS_NOT_DONE');
    expect(codeOf(() => assertCanMarkDone([]))).toBeUndefined();
  });

  it('blocks reopening only under a Done parent', () => {
    expect(codeOf(() => assertCanLeaveDone('Done'))).toBe('PARENT_TASK_DONE');
    expect(codeOf(() => assertCanLeaveDone('To-do'))).toBeUndefined();
    expect(codeOf(() => assertCanLeaveDone(null))).toBeUndefined();
  });
});
