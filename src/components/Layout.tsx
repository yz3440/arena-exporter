import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-arena-border bg-arena-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <h1 className="text-[15px] tracking-tight">
            <span className="font-bold">Are.na</span>
            <span className="text-arena-text-muted ml-1">Exporter</span>
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8 flex-1 w-full overflow-x-hidden">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-arena-border py-4 space-y-1">
        <p className="text-center text-[12px] text-arena-text-muted">
          Everything runs locally in your browser. Data is stored in{" "}
          <a href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API" target="_blank" rel="noopener noreferrer" className="underline hover:text-arena-text">IndexedDB</a>
          {" "}and never sent to any server.
        </p>
        <p className="text-center text-[12px] text-arena-text-muted">
          Made by <a href="https://yufengzhao.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-arena-text">Yufeng Zhao</a>
          {" · "}
          Source code on <a href="https://github.com/yz3440/arena-exporter" target="_blank" rel="noopener noreferrer" className="underline hover:text-arena-text">GitHub</a>
        </p>
      </footer>
    </div>
  );
}
