#!/usr/bin/env python3
"""
Pretendard 를 unicode-range 조각으로 나눈다.

## 왜

원본 `PretendardVariable.woff2` 는 2,057,688 B 다. woff2 는 이미 압축본이라 그
2.0MB 가 그대로 회선에 나가고, `next/font/local` 은 그걸 **모든 라우트에서
preload** 한다. 한글 몇 줄짜리 로그인 화면도 2MB 를 받는다. 비교하면 이 앱에서
가장 무거운 라우트(에디터)의 JS 전체가 694kB(gzip)다.

용량의 대부분은 한글 음절 11,172자다(전체 음절만 남겨도 1.76MB). 그래서 정적
서브셋으로는 해결되지 않고, **쓰는 글자만 받게** 잘라야 한다.

## 어떻게 자르는가

흔한 방식은 코드포인트 순서로 N등분하는 것인데, 한글은 초성별로 블록이 흩어져
있어서 "로그인" 세 글자가 서로 다른 조각에 들어간다. 그러면 조각을 잘게 낼수록
요청만 늘고 받는 총량은 안 줄어든다.

대신 **이 앱이 실제로 쓰는 글자**를 한 조각으로 모은다. 저장소의 모든 소스에서
한글 음절을 긁으면 700자 남짓이고, 그게 UI 문자열 전체를 덮는다. 나머지 음절은
사용자가 입력한 글(프로젝트 이름·장면 설명)에서만 나오므로 범위별 조각으로 두고
필요할 때만 받게 한다.

결과: 랜딩·로그인·가입·대시보드 껍데기는 base + ui = 약 191kB 만 받는다.

## 실행

    python3 -m venv .venv && .venv/bin/pip install 'fonttools[woff]' brotli
    .venv/bin/python scripts/build-fonts.py

산출물은 저장소에 커밋한다 — 빌드에 파이썬 의존성을 들이지 않기 위해서다.
폰트를 교체할 때만 다시 돌리면 된다.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "apps/web/public/fonts/PretendardVariable.woff2"
OUT_DIR = ROOT / "apps/web/public/fonts/pretendard"
CSS_OUT = ROOT / "apps/web/app/pretendard.css"

HANGUL_FIRST, HANGUL_LAST = 0xAC00, 0xD7A3
# 사용자 입력용 나머지 음절을 몇 조각으로 나눌지. 조각당 약 110kB 다.
REST_CHUNKS = 16

# 한글 음절을 제외한 나머지. 항상 받는다.
BASE_RANGES = [
    "U+0000-00FF",  # 라틴 기본 + 라틴-1
    "U+0131",
    "U+0152-0153",
    "U+2000-206F",  # 일반 문장부호(줄임표·대시·따옴표)
    "U+20A9",  # ₩
    "U+20AC",  # €
    "U+2122",  # ™
    "U+2190-21FF",  # 화살표
    "U+2212",  # −
    "U+25A0-25FF",  # 도형
    "U+3000-303F",  # CJK 문장부호
    "U+1100-11FF",  # 한글 자모
    "U+3130-318F",  # 한글 호환 자모(ㄱ, ㅏ …)
    "U+FF00-FFEF",  # 전각
    "U+FEFF",
    "U+FFFD",
]

# 폰트를 긁을 소스. 여기 없는 글자는 사용자 입력으로 보고 rest 조각에 둔다.
SCAN_SUFFIXES = (".ts", ".tsx", ".css", ".md")


def ui_syllables() -> set[str]:
    """저장소 소스에 실제로 등장하는 한글 음절."""
    files = subprocess.run(
        ["git", "ls-files", "apps/web", "packages", "docs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    found: set[str] = set()
    for name in files:
        if not name.endswith(SCAN_SUFFIXES):
            continue
        try:
            text = (ROOT / name).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        found.update(ch for ch in text if HANGUL_FIRST <= ord(ch) <= HANGUL_LAST)
    return found


def to_ranges(codepoints: list[int]) -> str:
    """정렬된 코드포인트를 `U+AC00-AC03,U+AC10` 형태로 압축한다."""
    out: list[str] = []
    start = prev = codepoints[0]
    for cp in codepoints[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        out.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
        start = prev = cp
    out.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
    return ",".join(out)


def subset(unicodes: str, out_name: str) -> int:
    out = OUT_DIR / out_name
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(SOURCE),
            f"--output-file={out}",
            "--flavor=woff2",
            "--layout-features=*",
            # 가변 폰트 축(weight 45~920)을 유지해야 한다. 떨어뜨리면 굵기가 전부 같아진다.
            "--drop-tables=",
            f"--unicodes={unicodes}",
        ],
        check=True,
        capture_output=True,
    )
    return out.stat().st_size


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"원본이 없습니다: {SOURCE}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.woff2"):
        stale.unlink()

    faces: list[tuple[str, str, int]] = []  # (파일명, unicode-range, 크기)

    base_size = subset(",".join(BASE_RANGES), "base.woff2")
    faces.append(("base.woff2", ",".join(BASE_RANGES), base_size))

    ui = sorted(ord(c) for c in ui_syllables())
    if ui:
        ui_range = to_ranges(ui)
        faces.append(("ui.woff2", ui_range, subset(ui_range, "ui.woff2")))

    rest = [cp for cp in range(HANGUL_FIRST, HANGUL_LAST + 1) if cp not in set(ui)]
    per = -(-len(rest) // REST_CHUNKS)
    for i in range(0, len(rest), per):
        chunk = rest[i : i + per]
        name = f"kr-{i // per:02d}.woff2"
        rng = to_ranges(chunk)
        faces.append((name, rng, subset(rng, name)))

    css = [
        "/*",
        " * 자동 생성 — `python3 scripts/build-fonts.py`. 손으로 고치지 말 것.",
        " *",
        " * 조각을 나눈 이유와 나누는 기준은 그 스크립트의 docstring 에 있다.",
        " * 요약: 원본 한 벌은 2.0MB 이고 모든 라우트가 preload 한다. 앱이 실제로",
        " * 쓰는 글자(ui)와 사용자 입력용 나머지(kr-*)를 갈라, 대부분의 화면이",
        " * base + ui 만 받게 한다.",
        " */",
    ]
    for name, rng, _ in faces:
        css += [
            "@font-face {",
            "  font-family: 'Pretendard';",
            "  font-style: normal;",
            "  font-weight: 45 920;",
            "  font-display: swap;",
            f"  src: url('/fonts/pretendard/{name}') format('woff2');",
            f"  unicode-range: {rng};",
            "}",
        ]
    CSS_OUT.write_text("\n".join(css) + "\n", encoding="utf-8")

    total = sum(size for _, _, size in faces)
    always = sum(size for name, _, size in faces if name in ("base.woff2", "ui.woff2"))
    print(f"조각 {len(faces)}개, 합계 {total:,} B (원본 {SOURCE.stat().st_size:,} B)")
    print(f"UI 문자열만 있는 화면이 받는 양: {always:,} B")


if __name__ == "__main__":
    main()
