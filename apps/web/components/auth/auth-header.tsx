import Image from 'next/image';
import Link from 'next/link';

export function AuthHeader() {
  return (
    <Link
      href="/"
      className="mb-10 inline-flex items-center gap-2 text-title-md font-semibold text-foreground hover:opacity-80"
    >
      <Image src="/brush.svg" alt="" width={28} height={28} priority />
      ComicAI
    </Link>
  );
}
