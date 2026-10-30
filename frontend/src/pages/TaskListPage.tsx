import { Link } from 'react-router-dom';
import { useDevelopers, useTasks } from '../api/queries';
import { ErrorBanner } from '../components/ErrorBanner';
import { TaskRows } from '../components/TaskRows';

export function TaskListPage() {
  const tasks = useTasks();
  const developers = useDevelopers();

  return (
    <>
      <div className="page-header">
        <h1>Tasks</h1>
        <Link className="button button-primary" to="/tasks/new">
          Create Task
        </Link>
      </div>

      {(tasks.isPending || developers.isPending) && <p className="muted">Loading tasks…</p>}
      {(tasks.isError || developers.isError) && (
        <ErrorBanner message="Tasks could not be loaded. Check that the backend is running, then refresh." />
      )}
      {tasks.data && developers.data && tasks.data.length === 0 && (
        <p className="empty">
          No tasks yet. <Link to="/tasks/new">Create the first one.</Link>
        </p>
      )}
      {tasks.data && developers.data && tasks.data.length > 0 && (
        <table className="task-table">
          <thead>
            <tr>
              <th scope="col">Task Title</th>
              <th scope="col">Skills</th>
              <th scope="col">Status</th>
              <th scope="col">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {tasks.data.map((task) => (
              <TaskRows key={task.id} task={task} developers={developers.data} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
