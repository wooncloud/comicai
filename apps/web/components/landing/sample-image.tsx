import samples from '@/public/samples/manifest.json';

interface SampleEntry {
  id: string;
  w: number;
  h: number;
  ratio: number;
  srcSet: { w: number; file: string }[];
  blur: string;
}

const BY_ID = new Map((samples as SampleEntry[]).map((s) => [s.id, s]));

export type SampleId = (typeof samples)[number]['id'];

interface Props {
  id: string;
  alt: string;
  /** 뷰포트별 렌더 폭. srcSet 중 어느 파일을 받을지 브라우저가 이걸로 고른다. */
  sizes: string;
  className?: string;
  /** LCP 대상(히어로)만 true. 나머지는 lazy. */
  priority?: boolean;
}

/**
 * 사전 생성된 반응형 WebP 세트를 그대로 쓰는 이미지.
 *
 * next/image 를 쓰지 않는 이유: 런타임 이미지 최적화는 web 컨테이너에 sharp 를
 * 요구하는데 apps/web 의존성에 없다(현재 next/image 사용처는 최적화를 건너뛰는
 * brush.svg 뿐). 대신 scripts/optimize-landing-samples.ts 가 빌드 전에 만들어 둔
 * srcSet 과 LQIP 를 사용한다.
 */
export function SampleImage({ id, alt, sizes, className, priority = false }: Props) {
  const s = BY_ID.get(id);
  if (!s) return null;

  return (
    // next/image 대신 <img>: 런타임 최적화 대신 빌드 전에 생성한 srcSet 을 쓴다(위 주석 참고).
    // @next/next/no-img-element 경고는 의도된 것 — 루트 eslint 에는 Next 플러그인이
    // 없어 disable 주석을 달면 오히려 "규칙 없음" 에러가 나므로 달지 않는다.
    <img
      src={s.srcSet[s.srcSet.length - 1]!.file}
      srcSet={s.srcSet.map((v) => `${v.file} ${v.w}w`).join(', ')}
      sizes={sizes}
      width={s.w}
      height={s.h}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding={priority ? 'sync' : 'async'}
      className={className}
      // 디코딩 전까지 저해상도 미리보기를 깔아 레이아웃이 비어 보이지 않게 한다.
      style={{
        backgroundImage: `url("${s.blur}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    />
  );
}
