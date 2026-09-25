/**
 * 서버에서 찍는 한국 시각.
 *
 * **브라우저에서 찍는 곳은 이걸 쓸 필요가 없다.** `toLocaleString('ko-KR')` 이면
 * 브라우저의 ICU 가 "2026년 9월 25일 오후 9시" 를 제대로 만든다.
 *
 * 문제는 **서버 컴포넌트**다(`app/health/page.tsx`). Node 의 ICU 는 같은 요청에
 * `2026년 9월 25일 PM 9:00` 을 돌려준다 — 날짜는 한국어인데 오전/오후만 영어로
 * 남는다. 컨테이너 이미지의 ICU 판본에 따라 결과가 갈리는 것이라, 배포된 뒤에야
 * 보이는 종류의 어긋남이다. 그래서 조립을 직접 한다.
 *
 * 시간대도 직접 준다. 컨테이너 TZ 는 UTC 라, 그냥 두면 9시간 어긋난 시각을
 * "기준" 이라고 내민다.
 */
const SEOUL = 'Asia/Seoul';

export function formatKoreanDateTime(date: Date, timeZone: string = SEOUL): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  // hour12:false 는 자정을 '24' 로 주는 ICU 가 있다(h24 주기). 0~23 으로 맞춘다.
  const hour24 = Number(get('hour')) % 24;
  const meridiem = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${get('year')}년 ${get('month')}월 ${get('day')}일 ${meridiem} ${hour12}:${get('minute')}`;
}
