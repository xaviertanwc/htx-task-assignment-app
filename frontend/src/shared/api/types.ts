import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type Task = Schemas['Task'];
export type TaskInput = Schemas['TaskInput'];
export type TaskUpdate = Schemas['TaskUpdate'];
export type TaskStatus = Schemas['TaskStatus'];
export type Developer = Schemas['Developer'];
export type Skill = Schemas['Skill'];
export type SkillSummary = Schemas['SkillSummary'];
