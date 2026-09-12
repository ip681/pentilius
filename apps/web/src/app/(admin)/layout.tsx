import '../globals.css';

// A separate Next.js root layout (its own <html>/<body>) from the player
// app's (player)/[locale] tree — see next.config-adjacent middleware.ts
// comment on why godmaster sits outside the locale routing entirely. No
// next-intl, no player auth, nothing shared with the game itself.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-text">{children}</body>
    </html>
  );
}
