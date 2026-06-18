# @nkardaz/remark-typography

A Remark plugin that automatically applies typography rules to MDX files.
Handles smart quotes, punctuation correction, non-breaking spaces, chemical
notation, ruby annotations, and more — driven by the
[@nkardaz/typography-rules](https://github.com/DemerNkardaz/typography-rules)
rule engine.

Built on [@nkardaz/typography-core](https://github.com/DemerNkardaz/typography-core).
Designed specifically for MDX. Correct behaviour with plain Markdown (`.md`)
files is not guaranteed.

---

## Installation

```bash
npm i -D @nkardaz/remark-typography
```

> **Requires Node.js ≥ 24.0.0**

---

## Family of @nkardaz typography packages

<!-- prettier-ignore -->
| Package | Type | Details |
| ------- | ---- | ------- |
| [Typography Rules](https://github.com/DemerNkardaz/typography-rules) | Rules engine | [![](https://img.shields.io/npm/v/%40nkardaz%2Ftypography-rules?logo=npm&labelColor=cb0000&color=fdfdfd)](https://www.npmjs.com/package/%40nkardaz%2Ftypography-rules) ![](https://img.shields.io/npm/dm/%40nkardaz%2Ftypography-rules?label=%F0%9F%A1%87&labelColor=cb0000&color=fdfdfd) ![](https://img.shields.io/npm/last-update/%40nkardaz%2Ftypography-rules?label=%F0%9F%A1%85&labelColor=cb0000&color=fdfdfd) |
| [Typography Core](https://github.com/DemerNkardaz/typography-core) | Core | [![](https://img.shields.io/npm/v/%40nkardaz%2Ftypography-core?logo=npm&labelColor=cb0000&color=fdfdfd)](https://www.npmjs.com/package/%40nkardaz%2Ftypography-core) ![](https://img.shields.io/npm/dm/%40nkardaz%2Ftypography-core?label=%F0%9F%A1%87&labelColor=cb0000&color=fdfdfd) ![](https://img.shields.io/npm/last-update/%40nkardaz%2Ftypography-core?label=%F0%9F%A1%85&labelColor=cb0000&color=fdfdfd) |
| **Adapters** | | |
| [Remark Typography](https://github.com/DemerNkardaz/remark-typography) | Remark adapter | [![](https://img.shields.io/npm/v/%40nkardaz%2Fremark-typography?logo=npm&labelColor=cb0000&color=fdfdfd)](https://www.npmjs.com/package/%40nkardaz%2Fremark-typography) ![](https://img.shields.io/npm/dm/%40nkardaz%2Fremark-typography?label=%F0%9F%A1%87&labelColor=cb0000&color=fdfdfd) ![](https://img.shields.io/npm/last-update/%40nkardaz%2Fremark-typography?label=%F0%9F%A1%85&labelColor=cb0000&color=fdfdfd) |
| [Rehype Typography](https://github.com/DemerNkardaz/rehype-typography) | Rehype adapter | [![](https://img.shields.io/badge/Coming-Soon%E2%80%A6-0?labelColor=fee036&color=fdfdfd)]() |
| [Obsidian Typography](https://github.com/DemerNkardaz/obsidian-typography) | Obsidian adapter | [![](https://img.shields.io/badge/Coming-Soon%E2%80%A6-0?labelColor=fee036&color=fdfdfd)]() |
| [Vanilla Typography](https://github.com/DemerNkardaz/vanilla-typography) | HTML5 adapter | [![](https://img.shields.io/badge/Coming-Soon%E2%80%A6-0?labelColor=fee036&color=fdfdfd)]() |
| **Plugins** | | |
| [Preview Typography](https://github.com/DemerNkardaz/obsidian-preview-typography) | Obsidian plugin | [![](https://img.shields.io/badge/Coming-Soon%E2%80%A6-0?labelColor=fee036&color=fdfdfd)]() |

---

## Quick Start

`vite.config.ts`

```typescript
import remarkTypography from '@nkardaz/remark-typography';
import remarkFrontmatter from 'remark-frontmatter';

export default {
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        jsxImportSource: 'vue',
        remarkPlugins: [
          remarkFrontmatter,
          [
            remarkTypography,
            {
              locale: 'en',
            },
          ],
        ],
      }),
    },
  ],
};
```

---

## Options

```typescript
export type RemarkTypographyOptions = TypographyCoreOptions;
```

All options come from `@nkardaz/typography-core`. See its documentation for the full reference.

| Option                | Type                   | Default | Description                                                                                    |
| --------------------- | ---------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `locale`              | `string`               | `'en'`  | Default locale used for typography rules                                                       |
| `initTypographyRules` | `boolean`              | `true`  | Automatically registers all built-in rules from `@nkardaz/typography-rules` on plugin init       |
| `initMarkupRules`     | `boolean`              | `false` | Automatically registers all built-in markup rules from `@nkardaz/typography-rules` on plugin init |
| `plugins`             | `(() => () => void)[]` | `[]`    | Custom rule plugins to register before processing. Each plugin is a factory returning a thunk  |
| `logs`                | `boolean`              | `false` | Enables console warnings for missing locale rules and rule errors during processing            |

---

## Locale Resolution

The active locale is resolved in the following order of priority for each processed node:

1. **Per-node attribute** — `lang`, `language`, or `locale` on a JSX element
2. **Frontmatter key** — `locale`, `lang`, or `language` in the file's YAML frontmatter
3. **Plugin option** — `locale` passed to `remarkTypography()`
4. **Fallback** — `'en'`

### Per-file locale (frontmatter)

Supported frontmatter keys in order of priority: `locale` → `lang` → `language`.

```mdx
---
locale: ru
---

Текст на русском языке…
```

> `remark-frontmatter` must be placed before `remarkTypography` in
> `remarkPlugins` for frontmatter locale detection to work.

### Per-node locale (JSX attribute)

Any JSX element can declare a locale via `lang`, `language`, or `locale`
attribute. Typography rules for that locale are applied only to text within
that element.

```mdx
<p lang="de">Ein schönes "Beispiel"</p>
```

---

## Excluded Node Types

The following node types are never processed — their content is passed through unchanged:

| Node type    | Reason                                      |
| ------------ | ------------------------------------------- |
| `code`       | Fenced code blocks                          |
| `inlineCode` | Inline code spans                           |
| `math`       | Block math (remark-math)                    |
| `inlineMath` | Inline math (remark-math)                   |
| `html`       | Raw HTML blocks                             |
| `yaml`       | YAML frontmatter (consumed for locale only) |
| `toml`       | TOML frontmatter                            |

Any node can also be excluded programmatically by setting `skipTypography: true`
on its `data` object:

```typescript
// inside a remark plugin or unified transform
node.data = { ...node.data, skipTypography: true };
```

---

## Processing Pipeline

Each text node goes through two sequential phases:

**Phase 1 — String rules** (`replace`, `transform`, `function` rules returning `string`)

Text content is joined across sibling text nodes, wrapped with `protect()` to
shield URLs, emails, code spans, and other structured content from modification,
then all matching string rules are applied in weight order via `applyRules` from
`@nkardaz/typography-core`, and finally `unprotect()` restores the original protected spans.

**Phase 2 — Node rules** (`node` rules and `function` rules returning `Node[]`)

Text nodes that survived phase 1 are walked again. Rules that return a node
tree (e.g. `chemNotation`, `wrapWithTag`, `rubyText`) split text nodes into
mixed arrays of text and element nodes, which are spliced back into the parent's
children.

Both phases are applied per locale context. When a JSX element declares a `lang`, `language`, or `locale` attribute, a new locale context is pushed for that element's subtree before either phase runs — and popped on exit. Text inside `<p lang="ru">` goes through both phases with Russian rules, even if the surrounding file uses a different locale. See [Locale Resolution](#locale-resolution) for the full priority order.

---

## Custom Plugins

Register additional rules using `@nkardaz/typography-rules` before passing the
plugin to `remarkTypography`.

`plugins/islenskaRules.ts`

```typescript
import { registerRule, newRule } from '@nkardaz/typography-rules';
import { smartQuotes } from '@nkardaz/typography-rules/functions';
import { PUNCTUATION } from '@nkardaz/typography-rules/glyphs';

export default function islenskaRules() {
  return () => {
    registerRule(
      'is',
      newRule('/islenska/typography/quotes', smartQuotes, [
        {
          outer: [
            PUNCTUATION.is.leftSided.outerQuoteOpen,
            PUNCTUATION.is.rightSided.outerQuoteClose,
          ],
          inner: [
            PUNCTUATION.is.leftSided.innerQuoteOpen,
            PUNCTUATION.is.rightSided.innerQuoteClose,
          ],
        },
      ], 100)
    );

    registerRule('is',
      newRule('/islenska/numbers/1', /\b1\b/g, 'einn'),
      newRule('/islenska/numbers/2', /\b2\b/g, 'tveir'),
      newRule('/islenska/numbers/10', /\b10\b/g, 'tíu'),
    );
  };
}
```

`vite.config.ts`

```typescript
import remarkTypography from '@nkardaz/remark-typography';
import islenskaRules from './plugins/islenskaRules';

export default {
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [
          [remarkTypography, { plugins: [islenskaRules], locale: 'is' }],
        ],
      }),
    },
  ],
};
```

---

## Building a Derived Plugin

`remarkTypography` is itself built with `createTypographyPlugin` from `@nkardaz/typography-core`.
If you need a plugin with different defaults or additional options, use the same factory directly
instead of wrapping `remarkTypography`:

```typescript
import { createTypographyPlugin, type TypographyCoreOptions } from '@nkardaz/typography-core';
import { myRules } from './rules';

interface MyPluginOptions extends TypographyCoreOptions {
  strictMode?: boolean;
}

export const myTypographyPlugin = createTypographyPlugin<MyPluginOptions, Root>({
  defaultOptions: {
    locale: 'de',
    plugins: [myRules],
  },
  createHandler: (config) => (tree: Root) => {
    // your MDX/remark AST traversal
  },
});
```

See [@nkardaz/typography-core](https://github.com/DemerNkardaz/typography-core) for full factory documentation.

---

## Plugin Order

### Place `remark-typography` AFTER these plugins

| Plugin                                          | Reason                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `remark-frontmatter`                            | Isolates YAML/TOML frontmatter and exposes it for locale detection                              |
| `remark-mdx-frontmatter`                        | Same — exports frontmatter as named exports                                                      |
| `remark-gfm`                                    | Adds tables, strikethrough, task lists, autolinks — typography must see the final node structure |
| `remark-math`                                   | Introduces `math` / `inlineMath` nodes — must exist before typography skips them                |
| `remark-directive`                              | Adds container/leaf/inline directive nodes before typography processes remaining text            |
| `remark-github`                                 | Resolves mentions, issue refs, and commit links into nodes                                       |
| `remark-footnotes` / `remark-gfm` (footnotes)  | Footnote nodes must be created before text inside them is processed                             |
| `remark-extract-toc` / `remark-toc`            | TOC is built from headings — headings must exist in the tree first                              |
| `remark-emoji`                                  | Converts `:emoji:` shortcodes to Unicode — run before so output is not re-processed             |
| `remark-breaks`                                 | Converts soft breaks to `<br>` — structural change should precede text transformation           |
| `remark-unwrap-images`                          | Moves image nodes up — structural, must precede text passes                                     |
| `remark-mdx`                                   | Parses MDX expressions and JSX nodes — their text content must be in the tree first             |

### Place `remark-typography` BEFORE these plugins

| Plugin                                  | Reason                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `remark-reading-time`                   | Counts words over text nodes — should see the final transformed text            |
| `remark-reading-time-export`            | Re-exports the reading time value — must come after the count is done           |
| `remark-stringify`                      | Serializes the tree back to Markdown — must see final text                      |
| `remark-rehype`                         | Converts mdast → hast for HTML pipeline — carries final text values into rehype |
| `remark-mdx-export` / custom exporters  | Export text content as JS variables — must reflect final typography             |

### Order does not matter relative to these plugins

| Plugin                           | Reason                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `remark-slug` / `rehype-slug`    | Operates on `id` generation from heading text — runs in rehype, separate pipeline      |
| `remark-code-titles`             | Parses code block meta strings, never touches text nodes                               |
| `remark-prism` / `remark-shiki` | Syntax highlighting — operates on code node values, which are excluded from typography |
| `remark-attr`                    | Parses inline attribute syntax `{.class}` — structural only, no text node mutation     |

---

## TypeScript

```typescript
import type { RemarkTypographyOptions } from '@nkardaz/remark-typography';
import type { TypographyCoreOptions, ResolvedCoreConfig } from '@nkardaz/typography-core';
```

| Type                      | Source                   | Description                         |
| ------------------------- | ------------------------ | ------------------------------------ |
| `RemarkTypographyOptions` | `@nkardaz/remark-typography` | Alias for `TypographyCoreOptions`   |
| `TypographyCoreOptions`   | `@nkardaz/typography-core`  | Base options interface              |
| `ResolvedCoreConfig`      | `@nkardaz/typography-core`  | Fully resolved config (all required) |
