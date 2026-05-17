import type { ReactNode } from "react";

export interface AppShellProps {
  sidebar: ReactNode;
  main: ReactNode;
  inspector?: ReactNode;
}

export function AppShell({ sidebar, main, inspector }: AppShellProps) {
  return (
    <div className="fy-shell">
      <aside className="fy-shell__sidebar" aria-label="Primary navigation">
        {sidebar}
      </aside>
      <main className="fy-shell__main">{main}</main>
      {inspector ? (
        <aside className="fy-shell__inspector" aria-label="Inspector">
          {inspector}
        </aside>
      ) : null}
    </div>
  );
}

export default AppShell;
