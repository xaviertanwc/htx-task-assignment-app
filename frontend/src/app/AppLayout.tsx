import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function AppLayout() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);

  // Client-side navigation doesn't move focus, so screen reader users wouldn't know it happened.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    main.current?.querySelector('h1')?.focus();
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
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
      <main id="main" className="container" ref={main}>
        <Outlet />
      </main>
    </>
  );
}
