# Perseus mark — how the PNGs are made

The mark is a green letter P raised off a black rounded plate, from the Claude
Design handoff (`Perseus project icon model`). It ships as a **static PNG**,
not as a live 3D canvas: three.js alone would eat the whole client budget for
an image that is never bigger than 48px.

`render.html` rebuilds that model with three.js, lights it, trims the
transparent margin and emits every size we need. `shoot.mjs` drives it through
headless Edge and writes the files beside itself.

## Running it

```sh
npm i puppeteer-core          # not a project dependency — install ad hoc
node scripts/icon/shoot.mjs
```

Needs network access: three.js loads from unpkg through the page's import map.
`EDGE` and `ICON_DIR` are overridable by environment variable; the defaults
point at the Windows Edge binary and at this directory. Any Chromium build
works.

## The two variants

`render.html` renders both variants from the handoff and names the output
`<variant>-<size>.png`.

| Variant   | Difference                            | View        |
| --------- | ------------------------------------- | ----------- |
| `mark`    | thin halo ring, stroke `0.090`        | ¾ turn      |
| `favicon` | no halo, fatter stroke `0.105`        | straight on |

The halo and the thinner stroke both disappear below ~32px, which is why the
favicon drops them. The favicon is also rendered head-on: any turn costs
counter width, and the open counter is what tells a 16px P from a 16px D.

## Where the output goes

| Rendered file      | Destination                   | Used for                       |
| ------------------ | ----------------------------- | ------------------------------ |
| `mark-s144.png`    | `src/assets/perseus-mark.png` | header mark (static import)    |
| `favicon-s256.png` | `src/app/icon.png`            | favicon (Next file convention) |
| `favicon-s180.png` | `src/app/apple-icon.png`      | iOS home screen                |

Copy those three, then delete the rest — the renders are build output, not
sources. `mark-s32.png` and `favicon-s32.png` exist only to eyeball legibility
at tab size before you install anything.

The header mark is imported from `src/assets` rather than served from
`public/`, so the filename carries a content hash — otherwise Next's image
optimizer keeps serving the previous render after the file changes.

## Deviations from the handoff prototype

The prototype lit the model with a hemisphere light, a key and a warm fill, and
no environment map; `render.html` keeps all of that. It adds one green rim
light the prototype did not have: the plate is near-black and so is the page
behind it, so without a rim the silhouette dissolves into the background.
