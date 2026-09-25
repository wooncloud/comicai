import type { z, ZodTypeAny } from 'zod';

/**
 * body DTO 클래스를 Zod 스키마에서 만든다 — `class CreateDto extends ZodBody(Schema) {}`.
 *
 * 예전에는 클래스 필드를 스키마와 따로 손으로 적었다(서른일곱 벌). 스키마에 필드가 늘어도
 * 클래스는 그대로라 컴파일러가 못 잡는다 — 말풍선 DTO 는 스키마에 대사(`text`·`textStyle`)가
 * 생긴 뒤에도 그 필드가 없었다. 타입은 스키마에서 파생하고, `ZodValidationPipe` 가 읽는
 * `zodSchema` 는 상속된 static 으로 그대로 보인다. 클래스 이름(`…Dto`)도 그대로다.
 */
export function ZodBody<S extends ZodTypeAny>(schema: S) {
  class Body {
    static zodSchema = schema;
  }
  return Body as unknown as { new (): z.infer<S>; zodSchema: S };
}
