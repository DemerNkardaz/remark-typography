# @yalla/remark-typography

A Remark plugin that automatically applies typography rules to MDX files.
Handles smart quotes, punctuation correction, non-breaking spaces, chemical
notation, ruby annotations, and more — driven by the
[@yalla/typography-rules](https://github.com/DemerNkardaz/typography-rules)
rule engine.

Built on [@yalla/typography-core](https://github.com/DemerNkardaz/typography-core).
Designed specifically for MDX. Correct behaviour with plain Markdown (`.md`)
files is not guaranteed.

---

## Installation

```bash
npm i -D @yalla/remark-typography
```

> **Requires Node.js ≥ 24.0.0**

---

## Quick Start

`vite.config.ts`

```typescript
import remarkTypography from '@yalla/remark-typography';
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

All options come from `@yalla/typography-core`. See its documentation for the full reference.

| Option                | Type                   | Default | Description                                                                                    |
| --------------------- | ---------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `locale`              | `string`               | `'en'`  | Default locale used for typography rules                                                       |
| `initTypographyRules` | `boolean`              | `true`  | Automatically registers all built-in rules from `@yalla/typography-rules` on plugin init       |
| `initMarkupRules`     | `boolean`              | `false` | Automatically registers all built-in markup rules from `@yalla/typography-rules` on plugin init |
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

---

## Processing Pipeline

Each text node goes through two sequential phases:

**Phase 1 — String rules** (`replace`, `transform`, `function` rules returning `string`)

Text content is joined across sibling text nodes, wrapped with `protect()` to
shield URLs, emails, code spans, and other structured content from modification,
then all matching string rules are applied in weight order via `applyRules` from
`@yalla/typography-core`, and finally `unprotect()` restores the original protected spans.

**Phase 2 — Node rules** (`node` rules and `function` rules returning `Node[]`)

Text nodes that survived phase 1 are walked again. Rules that return a node
tree (e.g. `chemNotation`, `wrapWithTag`, `rubyText`) split text nodes into
mixed arrays of text and element nodes, which are spliced back into the parent's
children.

---

## Custom Plugins

Register additional rules using `@yalla/typography-rules` before passing the
plugin to `remarkTypography`.

`plugins/islenskaRules.ts`

```typescript
import { registerRule, newRule } from '@yalla/typography-rules';
import { smartQuotes } from '@yalla/typography-rules/functions';
import { PUNCTUATION } from '@yalla/typography-rules/glyphs';

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
import remarkTypography from '@yalla/remark-typography';
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

`remarkTypography` is itself built with `createTypographyPlugin` from `@yalla/typography-core`.
If you need a plugin with different defaults or additional options, use the same factory directly
instead of wrapping `remarkTypography`:

```typescript
import { createTypographyPlugin, type TypographyCoreOptions } from '@yalla/typography-core';
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

See [@yalla/typography-core](https://github.com/DemerNkardaz/typography-core) for full factory documentation.

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
import type { RemarkTypographyOptions } from '@yalla/remark-typography';
import type { TypographyCoreOptions, ResolvedCoreConfig } from '@yalla/typography-core';
```

| Type                      | Source                   | Description                         |
| ------------------------- | ------------------------ | ------------------------------------ |
| `RemarkTypographyOptions` | `@yalla/remark-typography` | Alias for `TypographyCoreOptions`   |
| `TypographyCoreOptions`   | `@yalla/typography-core`  | Base options interface              |
| `ResolvedCoreConfig`      | `@yalla/typography-core`  | Fully resolved config (all required) |
