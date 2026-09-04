-- 렌더 잡을 컷에 묶는다(cascade).
--
-- 왜: render_jobs.panel_id 에 FK 가 없어서, 컷을 지우면 panels 행만 사라지고 그 컷의
-- 잡 수십 건이 영구히 남았다. 프로젝트 삭제도 마찬가지다 — cascade 가 pages→panels 에서
-- 끝난다. 저장소에 renderJob.delete/deleteMany 호출이 **한 건도 없으므로**, 이 cascade
-- 말고는 잡을 수거하는 경로가 아예 없다.
--
-- 남은 행은 조회할 방법도 없다. 컷이 없으니 history/currentRenderId 로도 닿지 못하고,
-- 각 행이 가리키는 S3 오브젝트도 함께 미아가 된다.

-- FK 를 붙이려면 이미 생긴 고아를 먼저 치워야 한다. 여기서 지우는 행은 정의상
-- 어느 컷에도 속하지 않아 앱에서 도달할 수 없는 행이다.
--
-- 주의: 이 행들이 가리키던 S3 오브젝트(projects/_/renders/*)는 이 시점 이후로 되짚을
-- 근거가 사라진다. 지금 버킷에 남아 있는 그 미아들은 이 마이그레이션이 청소하지 않는다 —
-- 필요하면 배포 전에 render_jobs 를 백업해 두고 한 번 훑어야 한다. 앞으로 생기는 것은
-- 삭제 경로의 deleteByPrefix 가 처리한다.
DO $$
DECLARE orphans bigint;
BEGIN
  SELECT count(*) INTO orphans
  FROM "render_jobs" rj
  WHERE NOT EXISTS (SELECT 1 FROM "panels" p WHERE p."id" = rj."panel_id");

  IF orphans > 0 THEN
    RAISE NOTICE '고아 render_jobs % 건을 삭제합니다 (속한 컷이 이미 삭제됨).', orphans;
  END IF;
END $$;

DELETE FROM "render_jobs" rj
WHERE NOT EXISTS (SELECT 1 FROM "panels" p WHERE p."id" = rj."panel_id");

ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_panel_id_fkey"
    FOREIGN KEY ("panel_id") REFERENCES "panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
