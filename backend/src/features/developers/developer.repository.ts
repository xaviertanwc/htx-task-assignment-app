import type { Queryable } from '../../db/database.js';
import type { TaskStatus } from '../tasks/task.schemas.js';

export interface Developer {
  id: number;
  name: string;
  skills: { id: number; name: string }[];
  tasks: { id: number; title: string; status: TaskStatus }[];
}

export interface DeveloperRepository {
  findAll(): Promise<Developer[]>;
  findById(id: number): Promise<Developer | undefined>;
}

const SELECT_DEVELOPERS = `
  SELECT
    d.id,
    d.name,
    COALESCE((
      SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.id)
      FROM developer_skills ds JOIN skills s ON s.id = ds.skill_id
      WHERE ds.developer_id = d.id
    ), '[]') AS skills,
    COALESCE((
      SELECT json_agg(json_build_object('id', t.id, 'title', t.title, 'status', t.status) ORDER BY t.id)
      FROM tasks t
      WHERE t.assignee_id = d.id
    ), '[]') AS tasks
  FROM developers d
`;

export function createDeveloperRepository(db: Queryable): DeveloperRepository {
  return {
    async findAll() {
      const { rows } = await db.query<Developer>(`${SELECT_DEVELOPERS} ORDER BY d.id`);
      return rows;
    },
    async findById(id) {
      const { rows } = await db.query<Developer>(`${SELECT_DEVELOPERS} WHERE d.id = $1`, [id]);
      return rows[0];
    },
  };
}
