import { notFound } from '../../shared/errors.js';
import type { Developer, DeveloperRepository } from './developer.repository.js';

export interface DeveloperService {
  list(): Promise<Developer[]>;
  get(id: number): Promise<Developer>;
}

export function createDeveloperService(developers: DeveloperRepository): DeveloperService {
  return {
    list: () => developers.findAll(),
    async get(id) {
      const developer = await developers.findById(id);
      if (!developer) throw notFound('Developer', id);
      return developer;
    },
  };
}
