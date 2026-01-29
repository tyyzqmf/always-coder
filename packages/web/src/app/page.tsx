import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-terminal-blue via-terminal-magenta to-terminal-cyan bg-clip-text text-transparent">
          Always Coder
        </h1>
        <p className="text-xl text-terminal-fg/70 mb-8">
          Remote AI Coding Agent Control
        </p>

        <div className="space-y-4">
          <Link
            href="/scan"
            className="block w-full py-4 px-6 bg-terminal-blue hover:bg-terminal-blue/80 text-white rounded-lg font-medium transition-colors"
          >
            📱 Scan QR Code to Connect
          </Link>

          <div className="text-terminal-fg/50 text-sm">or</div>

          <Link
            href="/join"
            className="block w-full py-4 px-6 bg-terminal-black/50 hover:bg-terminal-black/70 border border-terminal-fg/20 text-terminal-fg rounded-lg font-medium transition-colors"
          >
            ⌨️ Enter Session ID Manually
          </Link>
        </div>

        <div className="mt-12 text-sm text-terminal-fg/40">
          <p>Start a session on your computer with:</p>
          <code className="block mt-2 p-3 bg-terminal-black/50 rounded-lg font-mono">
            always claude
          </code>
        </div>
      </div>
    </main>
  );
}
