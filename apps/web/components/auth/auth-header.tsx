import Link from 'next/link';

export function AuthHeader() {
  return (
    <Link
      href="/"
      className="mb-10 inline-block text-title-md font-semibold text-foreground hover:opacity-80"
    >
      ComicAI
    </Link>
  );
}
