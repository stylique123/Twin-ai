# Design tools

| Tool | What it does |
|---|---|
| `measure.js` | `node measure.js <url> <width> '<steps JSON>' '<target JS or PAGE>' <out>`: opens a board or app page, runs the click steps, saves a screenshot of the target plus the computed styles of every visible element inside it (`<out>.json`). |
| `diff.py` | `python3 -I diff.py board.png app.png out.png`: side-by-side board / app / difference image, and the % of pixels that differ. |
| `overflow.js` | `node overflow.js <url> [out]`: checks all target widths (375–1920) for sideways overflow and text under 12px. |
| `board2tsx.py` | `python3 -I board2tsx.py <board> <Component> <out.tsx> [--phone 1]`: compiles a board's markup into a React component one for one (inline styles become Tailwind arbitrary-value classes). See the docstring for exactly what it changes. |

Serve the boards with `python3 -m http.server 8000` from `design-handoff/`.
