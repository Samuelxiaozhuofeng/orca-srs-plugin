[**Orca API Documentation**](../README.md)

***

[Orca API Documentation](../modules.md) / Custom Renderers

# Introduction

Custom renderers in Orca Note provide a flexible way to define how content is displayed and interacted with. By creating your own renderers, you can extend the default behavior of the Orca Note editor to suit specific use cases or integrate with custom workflows. This guide will walk you through the process of creating, configuring, and using custom renderers in your plugins.

Whether you're building a specialized editor or enhancing the user experience, custom renderers offer the tools you need to take full control of the rendering process.

# Types of Renderers

In Orca Note, there are two types of renderers: block renderers and inline renderers.

- **Block Renderers**: These are used for elements that occupy their own block of space, such as headings, images, and tables. Block renderers define the structure and layout of these larger components.

- **Inline Renderers**: These are used for elements that exist within a line of text, such as bold, underline, and highlights. Inline renderers handle the styling and behavior of these smaller, text-level components.

# Relationship Between Renderers and Converters

Each renderer, whether it is a block renderer or an inline renderer, must have a corresponding converter to handle the transformation of its content into plain text. These converters, often referred to as "plain converters," ensure that the content rendered by the editor can be accurately converted into a plain text format.

- **Block Renderers and Converters**: For every block renderer, there should be a matching block converter that defines how the block-level content is serialized into plain text. For example, a heading block renderer would have a converter that extracts the heading text and formats it appropriately for plain text output.

- **Inline Renderers and Converters**: Similarly, inline renderers require corresponding inline converters to process text-level elements. For instance, a bold inline renderer would have a converter that removes the styling and outputs the raw text.

By maintaining this relationship between renderers and converters, Orca Note ensures that all content can be seamlessly transformed between its rendered and plain text representations, supporting both rich editing experiences and text-based workflows.

# Implementing a Block Renderer

To implement a block renderer in Orca Note, you need to define a React component that adheres to the renderer's expected structure and behavior. Below is an example of creating a custom block renderer for an image block.

## Example: Image Block Renderer

```tsx
// CustomImageBlockRenderer.tsx
import type { Block, DbId } from "./orca.d.ts"

const { useRef, useMemo } = window.React
const { useSnapshot } = window.Valtio
const { BlockShell, BlockChildren } = orca.components

type Props = {
  panelId: string
  blockId: DbId
  rndId: string
  blockLevel: number
  indentLevel: number
  mirrorId?: DbId
  initiallyCollapsed?: boolean
  renderingMode?: "normal" | "simple" | "simple-children"
  src: string
}

export default function CustomImageBlockRenderer({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  initiallyCollapsed,
  renderingMode,
  src, // received from _repr
}: Props) {
  const { blocks } = useSnapshot(orca.state)
  const block = blocks[mirrorId ?? blockId]

  const childrenBlocks = useMemo(
    () => (
      <BlockChildren
        blockId={blockId}
        panelId={panelId}
        blockLevel={blockLevel}
        indentLevel={indentLevel}
        renderingMode={renderingMode}
      />
    ),
    [
      blockId,
      panelId,
      blockLevel,
      indentLevel,
      renderingMode,
    ],
  )

  return (
    <BlockShell
      panelId={panelId}
      blockId={blockId}
      rndId={rndId}
      mirrorId={mirrorId}
      blockLevel={blockLevel}
      indentLevel={indentLevel}
      initiallyCollapsed={initiallyCollapsed}
      renderingMode={renderingMode}
      reprClassName="myplugin-repr-image"
      contentClassName="myplugin-repr-image-content"
      contentAttrs={{ contentEditable: false }}
      contentJsx={<img src={src} />}
      childrenJsx={childrenBlocks}
    />
  )
}
```

### Key Points

1. **Props**: The renderer receives various props such as `panelId`, `blockId` and `src`. These are used to configure the block's behavior and appearance.

2. **BlockShell**: The `BlockShell` component wraps the custom renderer, providing essential functionality like drag-and-drop support and rendering children blocks.

3. **Content**: The `contentJsx` property defines the main content of the block. In this case, it includes an image.

4. **Children Blocks**: If the block has nested children, they are rendered using the `BlockChildren` component.

5. **Styling**: You can define custom CSS classes (e.g., `myplugin-repr-image`, `myplugin-repr-image-content`) to style the block.

By following this structure, you can create custom block renderers tailored to your specific requirements. Once implemented, register the renderer in your plugin to make it available in Orca Note.

## Registering the Custom Block Renderer

To make the `CustomImageBlockRenderer` available in Orca Note, you need to register it using the `orca.renderers.registerBlock` method. Below is an example of how to register the custom block renderer:

```ts
// register.ts
import CustomImageBlockRenderer from "./CustomImage"

export default function register() {
  orca.renderers.registerBlock(
    "myplugin.image",
    false,
    CustomImageBlockRenderer,
    { assetFields: ["src"] },
  )
}
```

### Key Points

1. **Block Type**: The first argument, `"myplugin.image"`, specifies the type of block this renderer handles. This should be unique across all registered renderers.

2. **Editable Flag**: The second argument, `true`, indicates whether the block is editable as text. Setting this to `false` prevents users to interact with the block's content.

3. **Renderer Component**: The third argument is the `CustomImageBlockRenderer` component you created earlier. This component defines how the block is rendered.

4. **Asset Fields**: The `assetFields` option, `{ assetFields: ["src"] }`, specifies the asset fields used by the renderer. These fields are potentialy used to fetch files from the `assets` folder, such as the image file in this case. It is meant to be used to help collect information when cleaning unused asset files.

There are other options beside `assetFields` that you can use, see `registerBlock` for details.

Once registered, the `CustomImageBlockRenderer` can be used in Orca Note to render custom image blocks. Ensure that the block type and asset fields align with the expected structure defined in your plugin.

## Creating a Block of the Registered Type

After registering the `CustomImageBlockRenderer`, you can create a block of this type programmatically by setting one block's `_repr` property's type to `"myplugin.image"` and pass every argument it requires.

```ts
// createImageBlock.ts
import type { DbId, CursorData } from "./orca.d.ts"

export async function createImageBlock(cursor: CursorData, src: string) {
  const block = orca.state.blocks[cursor?.anchor?.blockId]
  if (!block) return null

  const newBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    cursor,
    block,
    "after",
    null,
    // _repr
    { type: "myplugin.image", src },
  )

  return newBlockId
}
```

### Key Points

- **Block Type in `_repr`**: The `_repr` property of a block specifies its type and the parameters required by the renderer. For example, setting `_repr.type` to `"myplugin.image"` and including a `src` field allows the renderer to identify the block type and render it accordingly.

- **Renderer Parameters**: The renderer uses the parameters provided in `_repr` to customize the block's appearance and behavior. In the case of the `CustomImageBlockRenderer`, the `src` parameter is used to display the image.

- **Dynamic Creation**: By programmatically setting the `_repr` property, you can dynamically create blocks of the registered type, ensuring they are rendered with the appropriate custom renderer.

- **Integration**: This approach allows seamless integration of custom block types into Orca Note, enabling developers to extend the editor's functionality with minimal effort.

# Implementing an Inline Renderer

To implement an inline renderer in Orca Note, you need to create a React component that will define how inline content is displayed within text. Inline renderers are used for elements that exist within a line of text, such as links, formatted text, or special inline components. Below is an example of creating a custom inline renderer for a math expression.

## Example: Math Inline Renderer

```tsx
// CustomMathInlineRenderer.tsx
const { useRef, useEffect } = window.React

export default function CustomMathInlineRenderer({
  blockId,
  data,
  index,
}: {
  blockId: string
  data: ContentFragment
  index: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (ref.current) {
      renderMathExpression(ref.current, data.v)
    }
  }, [data.v])

  return (
    <span ref={ref} className="orca-inline myplugin-inline-math">
      {data.v}
    </span>
  )
}

function renderMathExpression(element: HTMLElement, expression: string) {
  // Example: Render math using a library like KaTeX
  // katex.render(expression, element, { throwOnError: false })
}
```

### Key Points

1. **Props**: The renderer receives `blockId`, `data`, and `index` as props. The `data` prop contains the data of the inline fragment.
2. **Styling**: The output element must have a `orca-inline` class by convention.

## Registering the Custom Inline Renderer

To make the custom inline renderer available in Orca Note, you need to register it using the `orca.renderers.registerInline` method. Below is an example of how to register the custom math inline renderer:

```ts
// register.ts
import CustomMathInlineRenderer from "./CustomMathInlineRenderer"

export default function register() {
  orca.renderers.registerInline(
    "myplugin.math",
    false,
    CustomMathInlineRenderer,
  )
}
```

### Key Points

1. **Inline Type**: The first argument, `"myplugin.math"`, specifies the type of inline this renderer handles. This should be unique across all registered inline renderers.

2. **Editable Flag**: The second argument, `false`, indicates whether the inline content is editable. Setting this to `false` makes the inline element not contenteditable.

3. **Renderer Component**: The third argument is the `CustomMathInlineRenderer` component you created earlier. This component defines how the inline content is rendered.

Once registered, the `CustomMathInlineRenderer` can be used in Orca Note to render custom math expressions within text. You can create content fragments with the type `"myplugin.math"` to use this renderer.

## Using Inline Renderers in Text

After registering your inline renderer, you can use it by creating content fragments with the appropriate type. This can be done programmatically when inserting content into a block:

```ts
// insertMathExpression.ts
import type { CursorData } from "./orca.d.ts"

export async function insertMathExpression(
  cursor: CursorData,
  expression: string,
) {
  if (!cursor) return

  // Create a math fragment
  const mathFragment = { t: "myplugin.math", v: expression }

  // Insert the fragment at the cursor position
  await orca.commands.invokeEditorCommand(
    "core.editor.insertFragments",
    cursor,
    [mathFragment],
  )
}
```

### Key Points

1. **Fragment Type**: The `t` property of the fragment should match the type you registered with `orca.renderers.registerInline`.

2. **Fragment Value**: The `v` property contains the actual content to be rendered (in this case, the math expression).

3. **Insertion**: Use the `core.editor.insertFragments` command to insert the custom inline fragment at the cursor position.

4. **Integration**: This approach allows your custom inline renderers to be seamlessly integrated into the text editing experience.

By following these steps, you can extend Orca Note's inline rendering capabilities with custom components tailored to your specific needs.
