/**
 * 법적 문서의 개정일.
 *
 * page.tsx 가 아니라 여기 두는 이유: Next 는 페이지 파일에서 default·metadata 등
 * 정해진 것 외의 export 를 허용하지 않는다(빌드가 타입 에러로 막힌다).
 *
 * 문서를 고칠 때마다 올린다. 나중에 재동의를 받아야 할 때, 사용자의
 * `termsAgreedAt` 과 이 값을 비교해 대상을 가려낸다.
 */
export const TERMS_UPDATED_AT = '2026-09-04';
export const PRIVACY_UPDATED_AT = '2026-09-04';
