import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-text">
      <TopBar />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar />
        <main className="w-full max-w-[1500px] flex-1 p-7">{children}</main>
      </div>
    </div>
  );
}
