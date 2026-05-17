-- Project: 대표 그림체(default style) 지정용 FK 컬럼 (애플리케이션 레벨로만 정합성 관리)
ALTER TABLE "projects" ADD COLUMN "default_style_id" TEXT;

-- Panel: 패널별 그림체 override
ALTER TABLE "panels" ADD COLUMN "style_id" TEXT;
