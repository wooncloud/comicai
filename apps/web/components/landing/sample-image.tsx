import samples from '@/public/samples/manifest.json';
import { cn } from '@/lib/cn';

/** scripts/optimize-landing-samples.ts 가 쓰는 매니페스트 항목. 필드가 바뀌면 여기도 바꾼다. */
interface SampleEntry {
  id: string;
  w: number;
  h: number;
  srcSet: { w: number; file: string }[];
  blur: string;
}

const BY_ID = new Map((samples as SampleEntry[]).map((s) => [s.id, s]));

interface Props {
  id: string;
  alt: string;
  /** 뷰포트별 렌더 폭. srcSet 중 어느 파일을 받을지 브라우저가 이걸로 고른다. */
  sizes: string;
  className?: string;
  /** LCP 대상(히어로)만 'lcp'. 첫 화면에 보이지만 LCP 는 아니면 'eager'. */
  priority?: 'lcp' | 'eager';
}

/**
 * 사전 생성된 반응형 WebP 세트를 그대로 쓰는 이미지.
 *
 * next/image 를 쓰지 않는 이유: 런타임 이미지 최적화는 web 컨테이너에 sharp 를
 * 요구하는데 apps/web 의존성에 없다(현재 next/image 사용처는 최적화를 건너뛰는
 * brush.svg 뿐). 대신 scripts/optimize-landing-samples.ts 가 빌드 전에 만들어 둔
 * srcSet 과 LQIP 를 사용한다. 앱의 다른 이미지 7곳도 모두 순수 <img> 다.
 */
export function SampleImage({ id, alt, sizes, className, priority }: Props) {
  const s = BY_ID.get(id);
  if (!s) return null;

  return (
    // next/image 대신 <img> — 위 주석 참고. @next/next/no-img-element 경고는 의도된 것이다.
    <img
      src={s.srcSet[s.srcSet.length - 1]!.file}
      srcSet={s.srcSet.map((v) => `${v.file} ${v.w}w`).join(', ')}
      sizes={sizes}
      width={s.w}
      height={s.h}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      // fetchPriority 는 LCP 한 장에만. 여러 장에 주면 서로 대역폭을 뺏는다.
      fetchPriority={priority === 'lcp' ? 'high' : undefined}
      className={cn(className)}
      // 디코딩 전까지 저해상도 미리보기를 깔아 레이아웃이 비어 보이지 않게 한다.
      style={{
        backgroundImage: `url("${s.blur}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    />
  );
}
