import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { TaskCreatePage } from './pages/TaskCreatePage';
import { TaskListPage } from './pages/TaskListPage';

export function App() {
  return (
    <>
      <header className="app-header">
        <div className="container app-header-inner">
          <span className="app-name">Task Assignment</span>
          <nav aria-label="Main">
            <NavLink to="/" end>
              Tasks
            </NavLink>
            <NavLink to="/tasks/new">Create</NavLink>
          </nav>
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<TaskListPage />} />
          <Route path="/tasks/new" element={<TaskCreatePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
