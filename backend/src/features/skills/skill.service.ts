import { notFound } from '../../shared/errors.js';
import type { Skill, SkillRepository } from './skill.repository.js';

export interface SkillService {
  list(): Promise<Skill[]>;
  get(id: number): Promise<Skill>;
}

export function createSkillService(skills: SkillRepository): SkillService {
  return {
    list: () => skills.findAll(),
    async get(id) {
      const skill = await skills.findById(id);
      if (!skill) throw notFound('Skill', id);
      return skill;
    },
  };
}
