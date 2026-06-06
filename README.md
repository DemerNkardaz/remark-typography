# @yalla/remark-typography

@yalla/remark-typography is a Remark plugin that automatically applies
typography rules to your MDX files. This includes replacing straight quotes with
smart quotes, adjusting punctuation, adding non-breaking spaces, and more.

This plugin is specifically designed for MDX files. Proper functionality with
standard Markdown (MD) files is not guaranteed.

### Key Features

- **Configuration:** You can set localization rules globally (in
  `vite.config.ts`), for a specific file (via Frontmatter), or locally for an
  individual node.
- **Extensibility:** Use `@yalla/typography-rules` to define your own custom
  text processing rules.
- **Integration:** The plugin is simple to set up within your Remark pipeline
  and supports the execution order required for correct document structure
  processing.

## Usage

```bash
npm i -D @yalla/remark-typography
```

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
          // other remark plugins
          [
            remarkTypography,
            {
              plugins: [
                /* supplemental plugins */
              ],
              locale: 'ru',
            },
          ],
          // other remark plugins
        ],
      }),
    },
  ],
};
```

### Per-file locale override

You can override the locale for a specific file via frontmatter. Supported keys
in order of priority: `locale`, `lang`, `language`.

```mdx
---
locale: ru
---

Текст на русском языке…
```

### Per-node locale override

You can override the locale for a specific node via inline attribute syntax.

```mdx
<p lang="is">Þessi texti er íslenska: 1, 2, 3, "10"</p>
// Result: Þessi texti er íslenska: einn, tveir, þrír, „tíu“

// Note: “is” not a built-in locale, see next “@yalla/typography-rules” section
with example.
```

> `remark-frontmatter` must be placed before `remarkTypography` in
> `remarkPlugins` for per-file locale override to work.

### Options

| Option    | Type                   | Default | Description                                       |
| --------- | ---------------------- | ------- | ------------------------------------------------- |
| `locale`  | `string`               | `'en'`  | Locale to use for typography rules                |
| `plugins` | `(() => () => void)[]` | `[]`    | Custom rule plugins to register before processing |

## [@yalla/typography-rules](https://github.com/DemerNkardaz/typography-rules)

If you want to customize awailable typography rules, use
`@yalla/typography-rules` and configure your own `<plugin>.ts` file. Example:

`plugins/islenskaRules.ts`

```typescript
import { registerRule, newRule, smartQuotes } from '@yalla/typography-rules';
import { PUNCTUATION } from '@yalla/typography-rules/glyphs';

export default function islenskaRules() {
  return () => {
    registerRule(
      'is', // Íslenska ISO-639-1 code
      newRule(
        smartQuotes, // Built-in function for handle quotes
        [
          // Args[] for the rule if it is a function
          {
            // Using of built-in glyphs definition for Íslenska quotes
            outer: [
              // „“
              PUNCTUATION.is.leftSided.outerQuoteOpen,
              PUNCTUATION.is.rightSided.outerQuoteClose,
            ],
            inner: [
              // ‚‘
              PUNCTUATION.is.leftSided.innerQuoteOpen,
              PUNCTUATION.is.rightSided.innerQuoteClose,
            ],
          },
        ],
        100 // Weight, the higher number, the later the rule is applied, default: 0
      )
    );
    // You can register multiple rules for the same locale
    registerRule('is', [
      newRule(/\b1\b/g, 'einn'),
      newRule(/\b2\b/g, 'tveir'),
      newRule(/\b3\b/g, 'þrír'),
      newRule(/\b4\b/g, 'fjórir'),
      newRule(/\b5\b/g, 'fimm'),
      newRule(/\b6\b/g, 'sex'),
      newRule(/\b7\b/g, 'sjö'),
      newRule(/\b8\b/g, 'átta'),
      newRule(/\b9\b/g, 'níu'),
      newRule(/\b10\b/g, 'tíu'),
    ]);
  };
}
```

`vite.config.ts`

```typescript
// vite.config.ts
import remarkTypography from '@yalla/remark-typography';
import islenskaRules from './plugins/customRules';

export default {
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        jsxImportSource: 'vue',
        remarkPlugins: [
          // other remark plugins
          [
            remarkTypography,
            {
              plugins: [islenskaRules],
              locale: 'is',
            },
          ],
          // other remark plugins
        ],
      }),
    },
  ],
};
```

## Plugin Order

`@yalla/remark-typography` must be placed **after** plugins that modify or
introduce text nodes, and **before** plugins that consume the final text
content.

### Place remark-typography AFTER these plugins

These plugins must run first so their output is visible to remark-typography, or
so their content is already isolated from the text stream before typography
rules are applied.

| Plugin                                        | Reason                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `remark-frontmatter`                          | Isolates YAML/TOML frontmatter from the text stream                                              |
| `remark-mdx-frontmatter`                      | Same — exports frontmatter as named exports                                                      |
| `remark-gfm`                                  | Adds tables, strikethrough, task lists, autolinks — typography must see the final node structure |
| `remark-math`                                 | Introduces `math` / `inlineMath` nodes — typography skips them, but they must exist first        |
| `remark-directive`                            | Adds container/leaf/inline directive nodes before typography processes remaining text            |
| `remark-github`                               | Resolves mentions, issue refs, and commit links into nodes                                       |
| `remark-footnotes` / `remark-gfm` (footnotes) | Footnote nodes must be created before text inside them is processed                              |
| `remark-extract-toc` / `remark-toc`           | TOC is built from headings — headings must exist in the tree first                               |
| `remark-emoji`                                | Converts `:emoji:` shortcodes to Unicode — run before so output is not re-processed              |
| `remark-breaks`                               | Converts soft breaks to `<br>` — structural change should precede text transformation            |
| `remark-unwrap-images`                        | Moves image nodes up — structural, must precede text passes                                      |
| `remark-mdx`                                  | Parses MDX expressions and JSX nodes — their text content must be in the tree first              |

### Place remark-typography BEFORE these plugins

These plugins consume or export the final text content, so typography must have
already applied its transformations.

| Plugin                                 | Reason                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `remark-reading-time`                  | Counts words over text nodes — should see the final transformed text            |
| `remark-reading-time-export`           | Re-exports the reading time value — must come after the count is done           |
| `remark-stringify`                     | Serializes the tree back to a Markdown string — must see final text             |
| `remark-rehype`                        | Converts mdast → hast for HTML pipeline — carries final text values into rehype |
| `remark-mdx-export` / custom exporters | Export text content as JS variables — must reflect final typography             |

### Order does not matter relative to these plugins

| Plugin                          | Reason                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `remark-slug` / `rehype-slug`   | Operates on `id` generation from heading text — runs in rehype, separate pipeline      |
| `remark-code-titles`            | Parses code block meta strings, never touches text nodes                               |
| `remark-prism` / `remark-shiki` | Syntax highlighting — operates on code node values, which are excluded from typography |
| `remark-attr`                   | Parses inline attribute syntax `{.class}` — structural only, no text node mutation     |
