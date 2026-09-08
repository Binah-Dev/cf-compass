# Shared lobby appearance rework (local candidate)

## Contract

- One global surface controller covers the problem workbench, training, study plan,
  review, analytics, contest replay, contest center, templates, and data center.
- UI transparency is 0–100: 100 removes panel backgrounds, gradients, shadows and
  blur, without fading text or disabling controls. Existing saved `panelOpacity`
  remains opacity (the inverse) so old values do not silently change meaning.
- A workbench panel has one backing layer. Its previous 96% opaque wrapper made
  inner transparency ineffective; hover no longer reintroduces that backing.
- Explicit panel blur, shadow, and global background dimming controls are separate
  from image brightness, clarity and scale. Major surfaces blur once, not per row.
- Presets: balanced (45% transparent), focus (10%), showcase (100%, no dimmer).
  Numeric entry, individual reset and one remembered custom preset are supported.
- Presets do not replace material selection, crop, favorites, rotation or page
  wallpaper assignments. The remembered custom preset includes current scale.
- Live appearance preview is isolated from persisted study settings. Done saves
  appearance keys only; cancel, outside click, X and Escape discard the preview.
  File imports/removals are separate explicit actions, not rolled back by Cancel.
- Settings/read dialogs retain readable surfaces. The appearance drawer does not
  dim the scene being adjusted. Full transparency is an exhibition option, not a
  guarantee of readable contrast on every user image.
- Duplicate panel captions and the panel-picker menu are removed. Accessible move/expand buttons sit in the corner without reserving an extra title row.

## Reference and boundaries

The reference is [shalldie's background extension](https://github.com/shalldie/vscode-background):
separate background display, size, position and carousel settings. This rework
uses CF Compass's existing React/Electron boundary, not VS Code file injection,
arbitrary CSS execution, or a new remote image service.

Local user materials are copied into ignored, isolated QA profiles only. They
are not distributed with source or a release. Installed user data is untouched.
This rework ships in the complete v4.1.1 release; published v4.1.0 assets remain unchanged.

## Validation

The three decorative accents now share a consistent token system: ice blue,
soft mint, and warm rose. Button labels use dark ink over lighter gradients;
CF rating and verdict colors are not re-themed. Theme changes leave wallpaper
selection, brightness, transparency and layout intact. Each theme retains the
100% transparent endpoint. Settings offer labelled, keyboard-accessible swatches.

`node scripts/qa-appearance-controls.cjs` checks inverse legacy values, 0/50/100
endpoints, hover, retained text opacity, preview non-persistence, cancel, presets,
custom-preset persistence, cold restart and removal of the panel menu. It audits large
background colors AND gradient images across the main pages at full transparency.
Optional `CF_COMPASS_QA_WALLPAPER` copies a local image into that isolated profile
and generates balanced/focus/showcase screenshots. Empty fixture pages do not
establish coverage of every populated or expanded detail state.

`node scripts/verify-v41.cjs` runs the unit/service groups; `--ui` includes the new
appearance checks alongside existing layout, typography, template and contest QA.
Typography's intentional-save action now uses Done; X means discard.
