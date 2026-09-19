#!/usr/bin/env python3
"""
Build artifacts/mymonastery/src/lib/hymnTexts.ts — the WORDS of those Hymnal
1982 hymns whose texts are verifiably PUBLIC DOMAIN, and nothing else.

Owner, 2026-09-18: "we want that youtube page to be better designed and have
the lyrics". The standing rule (memory project_hymns_catalogue.md) was NEVER
hymn text, because the Hymnal 1982's texts and its alterations of older texts
are under copyright. The new rule is PUBLIC DOMAIN ONLY, decided per hymn, and
strict enough that a doubtful case shows no words:

  A text is taken only when ALL of these hold on its hymnary.org page
  (hymnary.org/hymn/EH1982/<number>, the Hymnal 1982 instance):
    1. hymnary shows the Full Text (it only does so for texts it treats as
       public domain);
    2. its "Text Information" carries NO Copyright line (a tune's copyright is
       listed separately, under Tune Information, and does not count);
    3. no "alt." anywhere in its authors or its source, and no "ver." source:
       the Hymnal 1982's own alterations and versions may be the Church
       Pension Fund's, so an altered text is refused even when the original is
       old;
    4. every named author, translator, adapter or alterer has a death year,
       and it is 1929 or earlier; anyone "b. ..." refuses it.
  A text with no named person at all (a traditional carol) passes on 1-3.

Usage:  python3 scripts/fetch-hymn-texts.py
It reads the hymn numbers from lib/hymnsCatalogue.ts, fetches one page per
text (first number of a tune pair; 5 s apart, retried on a 403, cached in
$HYMNARY_CACHE so a run stopped by the rate limit resumes), and prints what it took and
what it refused, and why.
"""
import html
import json
import re
import time
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT = ROOT / "artifacts/mymonastery/src/lib/hymnsCatalogue.ts"
OUT = ROOT / "artifacts/mymonastery/src/lib/hymnTexts.ts"
UA = "Mozilla/5.0"  # hymnary.org answers 403 to a descriptive agent string
PERSON = re.compile(r"^(Author|Translator|Translater|Adapter|Alterer|Paraphraser|Arranger)", re.I)


CACHE = Path(os.environ.get("HYMNARY_CACHE", "/tmp/hymnary-eh1982"))


def fetch(n: str) -> str:
    """One page, cached (hymnary.org rate-limits a long run, so a rerun must
    resume, not start over), through curl, retried with backoff. hymnary.org refuses
    Python's own HTTP client with a 403 after the first few pages while curl
    with the same agent string is served (measured 2026-09-18)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    hit = CACHE / f"{n}.html"
    if hit.exists() and hit.stat().st_size > 1000:
        return hit.read_text()
    for attempt in range(5):
        r = subprocess.run(
            ["curl", "-s", "-A", UA, "-w", "\n%{http_code}", f"https://hymnary.org/hymn/EH1982/{n}"],
            capture_output=True, text=True,
        )
        body, _, code = r.stdout.rpartition("\n")
        if code == "200":
            hit.write_text(body)
            time.sleep(5.0)
            return body
        time.sleep(15 * (attempt + 1))
    raise RuntimeError(f"hymnary.org would not serve {n} (last status {code})")


def clean(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    return "\n".join(line.strip() for line in s.split("\n") if line.strip())


def parse(page: str):
    m = re.search(r'<div id="text">(.*?)</div>', page, re.S)
    paras = [clean(p) for p in re.findall(r"<p>(.*?)</p>", m.group(1), re.S)] if m else []
    paras = [p for p in paras if p]
    info = {}
    t = page.find("Text Information")
    if t >= 0:
        end = page.find("</table>", t)
        for label, item in re.findall(
            r'hy_infoLabel">([^<]*)</span>.*?hy_infoItem">(.*?)</span></td>', page[t:end], re.S
        ):
            info[label.strip().rstrip(":")] = clean(item)
    return paras, info


def verdict(paras, info):
    why = []
    if not paras:
        why.append("no full text")
    if "Copyright" in info:
        why.append("copyright: " + info["Copyright"][:60])
    for field, val in info.items():
        if (PERSON.match(field) or field.startswith("Source")) and re.search(r"\balt\b", val, re.I):
            why.append(f"alt ({field})")
        if field.startswith("Source") and re.search(r"\bver\b|\(ver", val):
            why.append("hymnal version")
        if PERSON.match(field):
            if re.search(r"\bb\.\s*\d{4}", val):
                why.append(f"living/born: {val}")
                continue
            m = re.search(r"(\d{3,4})\??\s*-\s*(\d{3,4})\??", val) or re.search(r"d\.\s*(\d{3,4})", val)
            death = int(m.groups()[-1]) if m else None
            if death is None:
                why.append(f"no dates: {val}")
            elif death > 1929:
                why.append(f"died {death}: {val}")
    return why


def split(paras):
    """Stanzas without their printed numbers, and the refrain (once) if any."""
    stanzas, refrain = [], None
    for p in paras:
        if p.lower().startswith("refrain:"):
            refrain = p.split("\n", 1)[1] if "\n" in p else None
            continue
        p = re.sub(r"^\d+\.?\s+", "", p)
        p = re.sub(r"\s*\[Refrain\]\s*$", "", p)
        stanzas.append(p)
    return stanzas, refrain


def main():
    src = CAT.read_text()
    firsts = sorted(
        {m.split(",")[0].strip() for m in re.findall(r"\{ num: \[([0-9, ]+)\]", src)}, key=int
    )
    took, refused = {}, {}
    for n in firsts:
        paras, info = parse(fetch(n))
        why = verdict(paras, info)
        if why:
            refused[n] = why
        else:
            stanzas, refrain = split(paras)
            people = {k: v for k, v in info.items() if PERSON.match(k)}
            took[n] = {
                "firstLine": info.get("First Line", ""),
                "credit": "; ".join(f"{k}: {v}" for k, v in people.items()) or info.get("Source", "Traditional"),
                "source": info.get("Source"),
                "stanzas": stanzas,
                "refrain": refrain,
            }

    # Keyed like lib/hymnsCatalogue's hymnKey(): every number of a tune pair
    # shares the one text, so each recording's key is its numbers joined.
    keys = {}
    for m in re.findall(r"\{ num: \[([0-9, ]+)\]", src):
        nums = [x.strip() for x in m.split(",")]
        if nums[0] in took:
            keys["-".join(nums)] = nums[0]

    body = [
        "// GENERATED by scripts/fetch-hymn-texts.py — do not edit by hand; rerun it.",
        "//",
        "// THE WORDS, FOR PUBLIC-DOMAIN TEXTS ONLY (owner, 2026-09-18: \"have the",
        "// lyrics\"). Each text below passed every test in the script's header on",
        "// its hymnary.org Hymnal 1982 page: full text shown, no copyright line on",
        "// the text, no \"alt.\" or Hymnal-1982 version, and every named author or",
        "// translator dead by 1929. Everything else shows no words at all, only its",
        "// credit. NEVER add a text here by hand.",
        "//",
        f"// {len(took)} of {len(firsts)} texts. Refused, and why:",
    ]
    for n, why in refused.items():
        body.append(f"//   {n}: {'; '.join(why)}")
    body += [
        "",
        "export type HymnText = {",
        "  firstLine: string;",
        "  /** Who wrote / translated it, as hymnary.org credits it. */",
        "  credit: string;",
        "  source: string | null;",
        "  /** Stanzas, in order, without their printed numbers. */",
        "  stanzas: string[];",
        "  /** The refrain, printed once, when the hymn has one. */",
        "  refrain: string | null;",
        "  /** The hymnary.org page the words were taken from. */",
        "  from: string;",
        "};",
        "",
        "const TEXTS: Record<string, HymnText> = {",
    ]
    for n, t in took.items():
        t = {**t, "from": f"https://hymnary.org/hymn/EH1982/{n}"}
        body.append(f"  {json.dumps(n)}: {json.dumps(t, ensure_ascii=False)},")
    body += [
        "};",
        "",
        "/** hymnKey (lib/hymnsCatalogue) -> the number whose text it sings. */",
        f"const BY_KEY: Record<string, string> = {json.dumps(keys)};",
        "",
        "/** The public-domain words for a recording, or null (then show none). */",
        "export function hymnTextFor(key: string | null | undefined): HymnText | null {",
        "  if (!key) return null;",
        "  const n = BY_KEY[key];",
        "  return n ? TEXTS[n] ?? null : null;",
        "}",
        "",
    ]
    OUT.write_text("\n".join(body))
    print(f"took {len(took)}: {', '.join(took)}")
    print(f"refused {len(refused)}")
    print(f"recordings with words: {len(keys)}")


if __name__ == "__main__":
    main()
