import type { Queryable } from '../../db/database.js';

export interface Skill {
  id: number;
  name: string;
  description: string;
}

export interface SkillRepository {
  findAll(): Promise<Skill[]>;
  findById(id: number): Promise<Skill | undefined>;
}

export function createSkillRepository(db: Queryable): SkillRepository {
  return {
    async findAll() {
      const { rows } = await db.query<Skill>(
        'SELECT id, name, description FROM skills ORDER BY id',
      );
      return rows;
    },
    async findById(id) {
      const { rows } = await db.query<Skill>(
        'SELECT id, name, description FROM skills WHERE id = $1',
        [id],
      );
      return rows[0];
    },
  };
}
