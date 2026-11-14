#!/usr/bin/env python3
"""Map React Bits Pro blocks' hardcoded neutral palette onto app theme tokens.

The vendored blocks in src/components/react-bits ship with a fixed
neutral-* Tailwind palette (bg-white dark:bg-neutral-950, text-neutral-900
dark:text-neutral-100, ...). This script rewrites those class tokens to the
semantic --color-rb-* utilities defined in globals.css, so every block follows
the app's theme presets (default / brutalist / soft-pop / tangerine) and dark
mode instead of hardcoding one look.

Rules:
  * light+dark pairs collapse to one semantic utility (the variable already
    flips with the .dark class);
  * light-only tokens become the semantic utility directly;
  * dark-only tokens keep the dark: prefix with the semantic utility.
"""
from __future__ import annotations

import os
import re
import sys

DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src",
    "components",
    "react-bits",
)

# (pattern, replacement) — applied longest-first so /66 never eats /6 prefixes.
PAIRS = [
    # text
    ("text-neutral-900/66 dark:text-neutral-100/66", "text-rb-muted"),
    ("text-neutral-900/80 dark:text-neutral-100/80", "text-rb-fg/80"),
    ("text-neutral-900/40 dark:text-neutral-100/40", "text-rb-muted/60"),
    ("text-neutral-900/20 dark:text-neutral-100/20", "text-rb-muted"),
    ("text-neutral-900 dark:text-neutral-100", "text-rb-fg"),
    # canvas / surfaces
    ("bg-white dark:bg-neutral-950", "bg-rb-canvas"),
    ("bg-white dark:bg-neutral-900", "bg-rb-popover"),
    ("bg-neutral-50 dark:bg-neutral-900", "bg-rb-subtle"),
    ("bg-neutral-900/25 dark:bg-neutral-950/60", "bg-rb-overlay"),
    ("bg-neutral-900/40 dark:bg-neutral-100/40", "bg-rb-fg/40"),
    ("bg-neutral-900/30 dark:bg-neutral-100/30", "bg-rb-fg/30"),
    ("bg-neutral-900/80 dark:bg-neutral-100/80", "bg-rb-fg/80"),
    ("bg-neutral-900/16 dark:bg-neutral-100/16", "bg-rb-soft"),
    ("bg-neutral-900/9 dark:bg-neutral-100/9", "bg-rb-soft"),
    ("bg-neutral-900/8 dark:bg-neutral-100/8", "bg-rb-soft"),
    ("bg-neutral-900/7 dark:bg-neutral-100/7", "bg-rb-soft"),
    ("bg-neutral-900/5 dark:bg-neutral-100/5", "bg-rb-soft"),
    ("dark:from-neutral-100/3", ""),
    ("dark:to-neutral-100/3", ""),
    ("from-neutral-900/3", "from-rb-soft"),
    ("to-neutral-900/3", "to-rb-soft"),
    # borders
    ("border-neutral-900/50 dark:border-neutral-100/50", "border-rb-input"),
    ("border-neutral-900/40 dark:border-neutral-100/40", "border-rb-input"),
    ("border-neutral-900/32 dark:border-neutral-100/32", "border-rb-input"),
    ("border-neutral-900/20 dark:border-neutral-100/20", "border-rb-input"),
    ("border-neutral-900/12 dark:border-neutral-100/14", "border-rb-line"),
    ("border-neutral-900/10 dark:border-neutral-100/14", "border-rb-line"),
    ("border-neutral-900/8 dark:border-neutral-100/8", "border-rb-line"),
    ("hover:not-disabled:border-neutral-900/32 dark:hover:not-disabled:border-neutral-100/32", "hover:not-disabled:border-rb-input"),
    ("disabled:border-neutral-900/8 dark:disabled:border-neutral-100/8", "disabled:border-rb-line"),
    # hover / active / aria states
    ("hover:not-disabled:bg-neutral-900/5 dark:hover:not-disabled:bg-neutral-100/5", "hover:not-disabled:bg-rb-soft"),
    ("hover:not-disabled:bg-neutral-900/8", "hover:not-disabled:bg-rb-soft"),
    ("hover:bg-neutral-900/5 dark:hover:bg-neutral-100/5", "hover:bg-rb-soft"),
    ("active:bg-neutral-900/8 dark:active:bg-neutral-100/8", "active:bg-rb-soft"),
    ("aria-pressed:bg-neutral-900/9 dark:aria-pressed:bg-neutral-100/9", "aria-pressed:bg-rb-soft"),
    ("aria-pressed:bg-neutral-900/9 dark:aria-pressed:bg-neutral-100/16", "aria-pressed:bg-rb-soft"),
    ("aria-selected:bg-neutral-900/9 dark:aria-selected:bg-neutral-100/9", "aria-selected:bg-rb-soft"),
    ("aria-expanded:bg-neutral-900/5 dark:aria-expanded:bg-neutral-100/5", "aria-expanded:bg-rb-soft"),
    ("hover:text-neutral-900 dark:hover:text-neutral-100", "hover:text-rb-fg"),
    ("data-[highlighted]:bg-neutral-900/5 dark:data-[highlighted]:bg-neutral-100/5", "data-[highlighted]:bg-rb-soft"),
    ("focus-visible:bg-neutral-900/5 dark:focus-visible:bg-neutral-100/5", "focus-visible:bg-rb-soft"),
    ("focus-within:ring-neutral-900/8 dark:focus-within:ring-neutral-100/8", "focus-within:ring-rb-line"),
    ("ring-neutral-900/8 dark:ring-neutral-100/8", "ring-rb-line"),
    # shadows
    ("shadow-[0_1px_2px_-1px_rgb(0_0_0/0.12)] dark:shadow-[0_1px_2px_-1px_rgb(0_0_0/0.36)]", "shadow-rb-sm"),
    ("shadow-[0_12px_24px_-12px_rgb(0_0_0/0.2)] dark:shadow-[0_12px_24px_-12px_rgb(0_0_0/0.6)]", "shadow-rb-overlay"),
    ("shadow-[0_1px_2px_rgb(0_0_0/0.1)]", "shadow-rb-sm"),
    ("dark:shadow-[0_1px_2px_rgb(0_0_0/0.5)]", "dark:shadow-rb-sm"),
    ("shadow-[0_1px_2px_rgb(0_0_0/0.24)]", "shadow-rb-sm"),
    # chart ink (svg stroke/fill)
    ("stroke-neutral-900/5 dark:stroke-neutral-100/5", "stroke-rb-soft"),
    ("fill-neutral-900/5 dark:fill-neutral-100/5", "fill-rb-soft"),
    ("stroke-neutral-900 dark:stroke-neutral-100", "stroke-rb-fg"),
    ("fill-neutral-900 dark:fill-neutral-100", "fill-rb-fg"),
    ("fill-neutral-900 stroke-white stroke-2 dark:fill-neutral-100 dark:stroke-neutral-900", "fill-rb-fg stroke-rb-canvas stroke-2"),
    ("dark:stroke-neutral-900", ""),
    # row rules + edge fades
    ("divide-neutral-900/8 dark:divide-neutral-100/8", "divide-rb-line"),
    ("stroke-neutral-900/8 dark:stroke-neutral-100/8", "stroke-rb-line"),
    ("inset-ring-neutral-900/50 dark:inset-ring-neutral-100/50", "inset-ring-rb-input"),
    ("inset-ring-neutral-900/40 dark:inset-ring-neutral-100/40", "inset-ring-rb-input"),
    ("inset-ring-neutral-900", "inset-ring-rb-fg"),
    ("dark:inset-ring-neutral-100", ""),
    # switch-track rings that carry extra state prefixes (dark:hover:..., dark:disabled:...)
    ("inset-ring-neutral-100/40", "inset-ring-rb-input"),
    ("inset-ring-neutral-100", "inset-ring-rb-fg"),
    ("from-white", "from-rb-canvas"),
    ("dark:from-neutral-950", ""),
    ("dark:from-neutral-900", "dark:from-rb-popover"),
    ("shadow-[0_0_0_2px_white]", "shadow-[0_0_0_2px_var(--color-rb-canvas)]"),
    ("dark:shadow-[0_0_0_2px_var(--color-neutral-900)]", ""),
]

# Light-only tokens → semantic utility.
LIGHT = [
    ("text-neutral-900/66", "text-rb-muted"),
    ("text-neutral-900/80", "text-rb-fg/80"),
    ("text-neutral-900/40", "text-rb-muted/60"),
    ("text-neutral-900", "text-rb-fg"),
    ("bg-white", "bg-rb-canvas"),
    ("bg-neutral-50", "bg-rb-subtle"),
    ("bg-neutral-900/40", "bg-rb-fg/40"),
    ("bg-neutral-900/30", "bg-rb-fg/30"),
    ("bg-neutral-900/25", "bg-rb-overlay"),
    ("bg-neutral-900/16", "bg-rb-soft"),
    ("bg-neutral-900/9", "bg-rb-soft"),
    ("bg-neutral-900/8", "bg-rb-soft"),
    ("bg-neutral-900/7", "bg-rb-soft"),
    ("bg-neutral-900/5", "bg-rb-soft"),
    ("bg-neutral-900", "bg-rb-fg"),
    ("bg-neutral-700", "bg-rb-muted/60"),
    ("border-neutral-900/50", "border-rb-input"),
    ("border-neutral-900/40", "border-rb-input"),
    ("border-neutral-900/32", "border-rb-input"),
    ("border-neutral-900/20", "border-rb-input"),
    ("border-neutral-900/12", "border-rb-line"),
    ("border-neutral-900/10", "border-rb-line"),
    ("border-neutral-900/8", "border-rb-line"),
    ("border-neutral-900", "border-rb-line"),
    ("hover:border-neutral-900/32", "hover:border-rb-input"),
    ("hover:bg-neutral-900/5", "hover:bg-rb-soft"),
    ("hover:bg-neutral-900/8", "hover:bg-rb-soft"),
    ("active:bg-neutral-900/8", "active:bg-rb-soft"),
    ("aria-pressed:bg-neutral-900/9", "aria-pressed:bg-rb-soft"),
    ("aria-pressed:bg-neutral-900/16", "aria-pressed:bg-rb-soft"),
    ("aria-selected:bg-neutral-900/9", "aria-selected:bg-rb-soft"),
    ("aria-expanded:bg-neutral-900/5", "aria-expanded:bg-rb-soft"),
    ("data-[highlighted]:bg-neutral-900/5", "data-[highlighted]:bg-rb-soft"),
    ("focus-visible:bg-neutral-900/5", "focus-visible:bg-rb-soft"),
    ("hover:text-neutral-900", "hover:text-rb-fg"),
    ("focus-within:ring-neutral-900/8", "focus-within:ring-rb-line"),
    ("ring-neutral-900/8", "ring-rb-line"),
    ("placeholder:text-neutral-900/66", "placeholder:text-rb-muted"),
]

# Dark-only tokens → dark: semantic utility.
DARK = [
    ("text-neutral-100/66", "text-rb-muted"),
    ("text-neutral-100/80", "text-rb-fg/80"),
    ("text-neutral-100/40", "text-rb-muted/60"),
    ("text-neutral-100", "text-rb-fg"),
    ("dark:bg-neutral-950", "dark:bg-rb-canvas"),
    ("dark:bg-neutral-900", "dark:bg-rb-popover"),
    ("bg-neutral-100/40", "bg-rb-fg/40"),
    ("bg-neutral-100/30", "bg-rb-fg/30"),
    ("bg-neutral-100/16", "bg-rb-soft"),
    ("bg-neutral-100/9", "bg-rb-soft"),
    ("bg-neutral-100/8", "bg-rb-soft"),
    ("bg-neutral-100/7", "bg-rb-soft"),
    ("bg-neutral-100/5", "bg-rb-soft"),
    ("bg-neutral-100", "bg-rb-fg"),
    ("border-neutral-100/50", "border-rb-input"),
    ("border-neutral-100/40", "border-rb-input"),
    ("border-neutral-100/32", "border-rb-input"),
    ("border-neutral-100/20", "border-rb-input"),
    ("border-neutral-100/14", "border-rb-line"),
    ("border-neutral-100/8", "border-rb-line"),
    ("border-neutral-100", "border-rb-line"),
    ("hover:border-neutral-100/32", "hover:border-rb-input"),
    ("hover:bg-neutral-100/5", "hover:bg-rb-soft"),
    ("hover:bg-neutral-100/8", "hover:bg-rb-soft"),
    ("active:bg-neutral-100/8", "active:bg-rb-soft"),
    ("aria-pressed:bg-neutral-100/16", "aria-pressed:bg-rb-soft"),
    ("aria-pressed:bg-neutral-100/9", "aria-pressed:bg-rb-soft"),
    ("aria-selected:bg-neutral-100/9", "aria-selected:bg-rb-soft"),
    ("aria-expanded:bg-neutral-100/5", "aria-expanded:bg-rb-soft"),
    ("data-[highlighted]:bg-neutral-100/5", "data-[highlighted]:bg-rb-soft"),
    ("focus-visible:bg-neutral-100/5", "focus-visible:bg-rb-soft"),
    ("hover:text-neutral-100", "hover:text-rb-fg"),
    ("focus-within:ring-neutral-100/8", "focus-within:ring-rb-line"),
    ("ring-neutral-100/8", "ring-rb-line"),
    ("placeholder:text-neutral-100/66", "placeholder:text-rb-muted"),
    ("from-neutral-100/3", "from-rb-soft"),
    ("to-neutral-100/3", "to-rb-soft"),
]


def build_rules() -> list[tuple[str, str]]:
    rules: list[tuple[str, str]] = []
    for pattern, repl in PAIRS + LIGHT + DARK:
        rules.append((pattern, repl))
    # Longest pattern first so text-neutral-900/80 never matches inside
    # text-neutral-900/800-style longer tokens.
    rules.sort(key=lambda r: len(r[0]), reverse=True)
    return rules


def adapt(text: str) -> str:
    for pattern, repl in build_rules():
        text = text.replace(pattern, repl)
    # Collapse any double spaces left by removed dark: variants inside class strings.
    text = re.sub(r"(?<=[-\w\]:])( {2,})(?=[-\w\[])", " ", text)
    text = re.sub(r'"\s+', '"', text) if False else text
    return text


def main() -> int:
    changed = []
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(".tsx"):
            continue
        path = os.path.join(DIR, name)
        with open(path, encoding="utf-8") as fh:
            original = fh.read()
        adapted = adapt(original)
        if adapted != original:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(adapted)
            changed.append(name)
    print(f"adapted {len(changed)} files: {', '.join(changed)}")
    # Report leftovers for manual review.
    leftovers = {}
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(".tsx"):
            continue
        with open(os.path.join(DIR, name), encoding="utf-8") as fh:
            text = fh.read()
        hits = re.findall(r"(?:dark:)?(?:bg|text|border|from|to|ring|placeholder:|hover:[a-z-]+:|focus[a-z-]*:|aria-[a-z]+:|data-\[[^\]]+\]:)?neutral-\d+(?:/\d+)?", text)
        if hits:
            leftovers[name] = sorted(set(hits))
    for name, hits in leftovers.items():
        print(f"  leftover {name}: {hits}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
