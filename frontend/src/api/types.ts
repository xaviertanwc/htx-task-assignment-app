export const TASK_STATUSES = ['To-do', 'In Progress', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Skill {
  id: number;
  name: string;
}

export interface Developer {
  id: number;
  name: string;
  skills: Skill[];
}

export interface Task {
  id: number;
  title: string;
  status: TaskStatus;
  parentTaskId: number | null;
  assignee: { id: number; name: string } | null;
  skills: Skill[];
  skillsSource: 'user' | 'llm';
  subtasks: Task[];
}

export interface NewTask {
  title: string;
  skillIds: number[];
  subtasks: NewTask[];
}

export interface TaskUpdate {
  status?: TaskStatus;
  assigneeId?: number | null;
}
