'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiPaths } from '@comicai/types';
import { Topbar } from '@/components/shell/app-shell';
import { SampleImage } from '@/components/landing/sample-image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { FooterLinks } from '@/components/shell/footer-links';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    api(ApiPaths.me)
      .then(() => router.replace('/dashboard'))
      .catch(() => {});
  }, [router]);

  return (
    <div className="min-h-dvh">
      <Topbar />
      <main>
        {/* Hero */}
        <div className="hero-ambient overflow-hidden">
          <section className="mx-auto grid max-w-[1440px] items-center gap-12 px-6 py-16 lg:grid-cols-[minmax(0,592px)_minmax(0,1fr)] lg:py-24 heroBleed:pr-0">
            <div className="flex flex-col items-start gap-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-caption font-medium text-primary-strong">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                캐릭터 일관성을 지키는 AI 만화 도구
              </span>
              <h1 className="text-display-md font-bold sm:text-display-lg lg:text-display-xl">
                누구나
                <br />
                만화 작가가
                <br />될 수 있다
              </h1>
              <p className="max-w-lg text-body-lg text-muted-foreground [text-wrap:pretty]">
                캐릭터와 그림체를 한 번 등록하면 모든 컷에 같은 인물이 나옵니다. 장면을 문장으로
                쓰면 AI가 그림을 그립니다.
              </p>
              <div className="mt-1 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="h-12 px-7 text-body-lg">
                  <Link href="/signup">시작하기</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-input/60 px-7 text-body-lg"
                >
                  <Link href="/login">로그인</Link>
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-xl shadow-2xl shadow-foreground/25 heroBleed:rounded-r-none dark:shadow-black/60 dark:ring-1 dark:ring-border">
                <SampleImage
                  id="hero-02"
                  alt="교실 창가에 앉아 밖을 바라보는 인물"
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  priority="lcp"
                  className="block aspect-[3/2] w-full object-cover lg:aspect-auto lg:h-[496px]"
                />
              </div>
              <div className="absolute -bottom-8 -left-6 hidden w-52 overflow-hidden rounded-xl border-[5px] border-background shadow-xl shadow-foreground/30 lg:-left-16 lg:block dark:border-[hsl(240_3.7%_18%)] dark:shadow-black/70">
                <SampleImage
                  id="grid-02"
                  alt="복도에서 손을 흔드는 인물"
                  sizes="208px"
                  priority="eager"
                  className="block h-[268px] w-full object-cover"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Gallery */}
        <section className="border-y border-border bg-muted/50">
          <div className="mx-auto max-w-[1440px] px-6 py-16 lg:py-20">
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="mb-2.5 text-display-md font-bold">장면이 바뀌어도, 같은 사람</h2>
                <p className="max-w-2xl text-body-sm text-muted-foreground [text-wrap:pretty]">
                  캐릭터 설정을 한 번 적어두고 배경과 장면만 바꿔가며 생성했습니다. 얼굴도,
                  옷차림도, 그림체도 흔들리지 않습니다.
                </p>
              </div>
              <span className="shrink-0 text-caption text-muted-foreground sm:pb-1">
                모두 ComicAI로 생성한 결과물입니다.
              </span>
            </div>

            <div className="grid auto-rows-[132px] grid-cols-2 gap-2.5 lg:auto-rows-[172px] lg:grid-cols-4 lg:gap-3.5">
              <GalleryTile
                id="hero-01"
                alt="노을 지는 옥상 난간에 기대선 인물"
                className="col-span-2 lg:row-span-2"
                sizes="(min-width: 1488px) 689px, (min-width: 1024px) 46vw, 100vw"
              />
              <GalleryTile
                id="grid-06"
                alt="밤 육교에서 야경을 내려다보는 인물"
                className="row-span-2"
                sizes="(min-width: 1488px) 338px, (min-width: 1024px) 23vw, 50vw"
              />
              <GalleryTile
                id="grid-04"
                alt="도서관에서 졸고 있는 인물"
                className="row-span-2"
                sizes="(min-width: 1488px) 338px, (min-width: 1024px) 23vw, 50vw"
              />
              <GalleryTile
                id="grid-05"
                alt="여름 축제 골목의 인물"
                sizes="(min-width: 1488px) 338px, (min-width: 1024px) 23vw, 50vw"
              />
              <GalleryTile
                id="grid-01"
                alt="벚꽃 흩날리는 등굣길"
                sizes="(min-width: 1488px) 338px, (min-width: 1024px) 23vw, 50vw"
              />
              <GalleryTile
                id="grid-03"
                alt="비 오는 거리에서 우산을 든 인물"
                className="col-span-2"
                sizes="(min-width: 1488px) 689px, (min-width: 1024px) 46vw, 100vw"
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[1440px] px-6 py-16 lg:py-24">
          <h2 className="mb-2 text-display-md font-bold">세 단계면 됩니다</h2>
          <p className="mb-11 text-body-sm text-muted-foreground">
            그림 실력 대신 이야기만 준비하면 됩니다.
          </p>
          <div className="grid gap-4 lg:grid-cols-3 lg:gap-8">
            <Step n="1" title="캐릭터와 그림체 등록">
              이름, 생김새, 옷차림을 한 번 적어두면 프로젝트 전체에서 다시 씁니다. 배경과 세계관도
              같은 방식입니다.
            </Step>
            <Step n="2" title="컷에 장면 쓰기">
              문장 안에서 <span className="font-medium text-primary-strong">@</span>로 등장인물과
              배경을 부르면, AI가 누구를 어디에 그릴지 압니다.
            </Step>
            <Step n="3" title="이미지 생성">
              마음에 들 때까지 다시 생성하고, 이전 생성 결과도 그대로 남습니다. 완성한 페이지는
              PNG·JPG로 내보냅니다.
            </Step>
          </div>
        </section>

        {/* 알아두실 점 */}
        <section className="mx-auto max-w-[1440px] px-6 pb-16 lg:pb-24">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/60 p-6 sm:flex-row sm:items-start sm:gap-5 sm:p-8">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-2">
              <h3 className="text-title-md font-bold">알아두실 점</h3>
              <p className="max-w-3xl text-body-sm text-muted-foreground [text-wrap:pretty]">
                그림은 외부 AI 서비스를 거쳐 만들어집니다. 비용이 들기 때문에 계정마다 하루 생성
                횟수에 상한이 있고, 같은 문장이어도 결과는 매번 조금씩 다릅니다. 만드신 작품은 다른
                사용자에게 보이지 않습니다.
              </p>
            </div>
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-6 text-caption text-muted-foreground">
            <span>© 2026 ComicAI</span>
            <FooterLinks />
          </div>
        </footer>
      </main>
    </div>
  );
}

function GalleryTile({
  id,
  alt,
  sizes,
  className,
}: {
  id: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  return (
    <SampleImage
      id={id}
      alt={alt}
      sizes={sizes}
      className={cn('block h-full w-full rounded-xl object-cover', className)}
    />
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-7">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/[0.12] text-body-sm font-bold text-primary-strong">
        {n}
      </span>
      <h3 className="mt-1 text-title-md font-bold">{title}</h3>
      <p className="text-body-sm text-muted-foreground [text-wrap:pretty]">{children}</p>
    </div>
  );
}
