import { Navigate, type RouteObject } from 'react-router-dom';
import { TaskCreatePage } from '../features/tasks/pages/TaskCreatePage';
import { TaskListPage } from '../features/tasks/pages/TaskListPage';
import { AppLayout } from './AppLayout';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <TaskListPage /> },
      { path: '/tasks/new', element: <TaskCreatePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
