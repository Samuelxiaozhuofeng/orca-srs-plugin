[**Orca API Documentation**](../README.md) / [types](README.md) / UI & Layout Types

# UI & Layout Types

Types, interfaces, and components for panels, layouts, context menus, themes, and notifications.


### `orca.components`

##### components

> **components**: `object`

Pre-built UI components from Orca that can be used in plugin development.
These components follow Orca's design system and provide consistent UI patterns.

###### AliasEditor()

> **AliasEditor**: (`props`) => `Element`

Provides an editor interface for managing aliases/tags, including adding/removing aliases,
formatting options, template selection, and inclusion relationships.

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"left"` \| `"top"` \| `"center"` \| `"bottom"` \| `"right"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"left"` \| `"top"` \| `"bottom"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Edit aliases for a block
<orca.components.AliasEditor
  blockId={123}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Edit Alias
    </orca.components.Button>
  )}
</orca.components.AliasEditor>

// With custom container
<orca.components.AliasEditor
  blockId={456}
  container={containerRef}
>
  {(open) => (
    <span onClick={open}>Configure Tag Settings</span>
  )}
</orca.components.AliasEditor>
```

###### Block()

> **Block**: (`props`) => `Element`

Renders a block with all its content and children

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Render a regular block
<orca.components.Block
  panelId="main-panel"
  blockId={123}
  blockLevel={0}
  indentLevel={0}
/>
```

###### BlockBreadcrumb()

> **BlockBreadcrumb**: (`props`) => `Element`

Renders a breadcrumb trail for a block's ancestors

###### Parameters

###### props

###### blockId

`number`

###### className?

`string`

###### style?

`CSSProperties`

###### Returns

`Element`

###### Example

```tsx
// Basic usage
<orca.components.BlockBreadcrumb blockId={123} />

// With custom styles
<orca.components.BlockBreadcrumb
  blockId={456}
  className="custom-breadcrumb"
  style={{ marginBottom: '10px' }}
/>
```

###### BlockCaption()

> **BlockCaption**: (`props`) => `Element`

Displays an editable caption input for a block.
The caption is saved automatically when the input loses focus.
Only renders when a caption value is present.

###### Parameters

###### props

###### blockId

`number`

The ID of the block to display/edit the caption for

###### cap?

`string`

The caption text to display

###### panelId

`string`

The ID of the panel containing the block

###### Returns

`Element`

###### Example

```tsx
const { BlockCaption } = orca.components;
// Basic usage in a custom block renderer
<BlockCaption
  panelId="main-panel"
  blockId={123}
  cap="My Caption"
/>
```

###### BlockChildren()

> **BlockChildren**: (`props`) => `Element`

Renders a block's children

###### Parameters

###### props

###### blockId?

`number`

###### blockLevel

`number`

###### indentLevel

`number`

###### panelId

`string`

###### renderingMode?

[`BlockRenderingMode`](#blockrenderingmode)

###### Returns

`Element`

###### Example

```tsx
// Standard usage
<orca.components.BlockChildren
  blockId={123}
  panelId="main-panel"
  blockLevel={1}
  indentLevel={1}
/>

// Using simplified rendering mode
<orca.components.BlockChildren
  blockId={456}
  panelId="panel-2"
  blockLevel={2}
  indentLevel={3}
  renderingMode="simple"
/>
```

###### BlockPreviewPopup()

> **BlockPreviewPopup**: (`props`) => `Element`

Renders a block preview popup.

The popup is typically opened by hovering the child element, but it can also be
controlled with `visible`. `interactive` enables the editor-like preview mode,
`customQuery` / `expandQueryRoot` customize the preview content source.

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
<BlockPreviewPopup blockId={123}>
  <a href="#block-123">Block Reference</a>
</BlockPreviewPopup>

<BlockPreviewPopup
  blockId={456}
  delay={500}
  interactive
  className="custom-preview"
  onClose={() => console.log("Preview closing")}
>
  <span>Hover me for block preview</span>
</BlockPreviewPopup>

<BlockPreviewPopup
  blockId={789}
  visible={isPreviewOpen}
  onClosed={() => setPreviewOpen(false)}
>
  <button>Show Preview</button>
</BlockPreviewPopup>
```

###### BlockSelect()

> **BlockSelect**: (`props`) => `Element`

Provides block selection functionality

###### Parameters

###### props

`object` & `Omit`\<[`SelectProps`](#selectprops), `"options"` \| `"selected"` \| `"filter"` \| `"filterPlaceholder"` \| `"filterFunction"` \| `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Block selection
<orca.components.BlockSelect
  mode="block"
  selected={[123, 456]}
  onChange={async (selected) => {
    console.log("Selected blocks:", selected);
  }}
/>

// Reference selection with scope restriction
<orca.components.BlockSelect
  mode="ref"
  scope="project-blocks"
  selected={[789]}
  onChange={handleSelectionChange}
/>
```

###### BlockShell()

> **BlockShell**: (`props`) => `Element`

Core component for block rendering with common UI elements.
It provides the standard block structure including the handle, folding caret, tags, and back-references.

###### Parameters

###### props

###### blockId

`number`

The unique database ID of the block

###### blockLevel

`number`

The depth level of the block in the tree (0 for root)

###### childrenJsx

`ReactNode`

The rendered children blocks

###### contentAttrs?

`Record`\<`string`, `any`\>

Additional HTML attributes for the content container

###### contentClassName?

`string`

CSS class name for the content container

###### contentJsx

`ReactNode`

The main content to render inside the block

###### contentStyle?

`CSSProperties`

Inline styles for the content container

###### contentTag?

`any`

The HTML tag to use for the content container (defaults to "div")

###### droppable?

`boolean`

Whether other blocks can be dropped onto this block (defaults to true)

###### editable?

`boolean`

Whether the block content is editable (defaults to true)

###### indentLevel

`number`

The visual indentation level

###### initiallyCollapsed?

`boolean`

Whether the block should be collapsed by default

###### mirrorId?

`number`

Optional ID if this block is a mirror of another block

###### panelId

`string`

The ID of the panel containing this block

###### renderingMode?

[`BlockRenderingMode`](#blockrenderingmode)

The mode to use for rendering ("normal", "simple", etc.)

###### reprAttrs?

`Record`\<`string`, `any`\>

Additional HTML attributes for the representation container

###### reprClassName?

`string`

CSS class name for the representation container

###### reprStyle?

`CSSProperties`

Inline styles for the representation container

###### rndId

`string`

A unique identifier for this specific rendering instance

###### selfFoldable?

`boolean`

Whether the block can be folded even if it has no children (defaults to false)

###### Returns

`Element`

###### Example

```tsx
// Basic text block
<orca.components.BlockShell
  panelId="main-panel"
  blockId={123}
  rndId="unique-rand-id"
  blockLevel={0}
  indentLevel={0}
  reprClassName="orca-repr-text"
  contentJsx={<div>This is text content</div>}
  childrenJsx={<ChildrenComponent />}
/>

// Code block example
<orca.components.BlockShell
  panelId="code-panel"
  blockId={456}
  rndId="code-rand-id"
  blockLevel={1}
  indentLevel={2}
  reprClassName="orca-repr-code"
  contentClassName="orca-repr-code-content"
  contentAttrs={{ contentEditable: false }}
  contentJsx={<CodeEditor />}
  childrenJsx={childrenBlocks}
/>
```

###### Breadcrumb()

> **Breadcrumb**: (`props`) => `Element`

Renders a generic breadcrumb navigation

###### Parameters

###### props

###### className?

`string`

###### items

`ReactNode`[]

###### style?

`CSSProperties`

###### Returns

`Element`

###### Example

```tsx
// Simple breadcrumb
<orca.components.Breadcrumb
  items={["Home", "Projects", "Document"]}
/>

// Breadcrumb with links and icons
<orca.components.Breadcrumb
  items={[
    <a href="#home">Home <i className="ti ti-home" /></a>,
    <a href="#projects">Projects</a>,
    "Current Document"
  ]}
  className="custom-breadcrumb"
/>
```

###### Button()

> **Button**: (`props`) => `Element`

Standard button component with multiple variants

###### Parameters

###### props

`any`

###### Returns

`Element`

###### Example

```tsx
// Basic button
<orca.components.Button variant="solid" onClick={handleClick}>
  Save
</orca.components.Button>

// Dangerous action button
<orca.components.Button variant="dangerous" onClick={handleDelete}>
  <i className="ti ti-trash" /> Delete
</orca.components.Button>

// Outline button with disabled state
<orca.components.Button variant="outline" disabled={true}>
  Edit
</orca.components.Button>

// Simple icon button
<orca.components.Button variant="plain" onClick={handleRefresh}>
  <i className="ti ti-refresh" />
</orca.components.Button>
```

###### Checkbox()

> **Checkbox**: (`props`) => `Element`

Checkbox form element

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLSpanElement`\>, `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic checkbox
<orca.components.Checkbox
  checked={isChecked}
  onChange={({ checked }) => setIsChecked(checked)}
/>

// Disabled checkbox
<orca.components.Checkbox checked={true} disabled={true} />

// Indeterminate state checkbox
<orca.components.Checkbox
  indeterminate={true}
  onChange={handleSelectionChange}
/>
```

###### CompositionInput()

> **CompositionInput**: (`props`) => `Element`

Input that handles IME composition events properly

###### Parameters

###### props

`any`

###### Returns

`Element`

###### Example

```tsx
// Basic input
<orca.components.CompositionInput
  placeholder="Enter text"
  value={inputValue}
  onChange={(e) => setInputValue(e.target.value)}
/>

// Input with prefix and suffix
<orca.components.CompositionInput
  pre={<i className="ti ti-search" />}
  post={<Button onClick={clearInput}>Clear</Button>}
  placeholder="Search..."
/>

// Input with validation error
<orca.components.CompositionInput
  value={email}
  onChange={handleEmailChange}
  error={emailError ? <span className="error">{emailError}</span> : null}
/>
```

###### CompositionTextArea()

> **CompositionTextArea**: (`props`) => `Element`

Textarea that handles IME composition events properly

###### Parameters

###### props

`any`

###### Returns

`Element`

###### Example

```tsx
// Basic multiline text input
<orca.components.CompositionTextArea
  placeholder="Enter multiline text"
  value={textValue}
  onChange={(e) => setTextValue(e.target.value)}
/>

// Set rows and auto-grow
<orca.components.CompositionTextArea
  rows={5}
  style={{ minHeight: '100px' }}
  placeholder="Enter notes..."
/>
```

###### ConfirmBox()

> **ConfirmBox**: (`props`) => `Element`

Displays a confirmation dialog

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"left"` \| `"top"` \| `"center"` \| `"bottom"` \| `"right"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"left"` \| `"top"` \| `"bottom"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic confirmation dialog
<orca.components.ConfirmBox
  text="Are you sure you want to delete this item?"
  onConfirm={(e, close) => {
    deleteItem();
    close();
  }}
>
  {(open) => (
    <orca.components.Button variant="dangerous" onClick={open}>
      Delete
    </orca.components.Button>
  )}
</orca.components.ConfirmBox>

// Confirmation dialog with state
<orca.components.ConfirmBox
  text="Are you sure you want to move this block?"
  onConfirm={(e, close, state) => {
    moveBlock(state.blockId, state.destination);
    close();
  }}
>
  {(open) => (
    <orca.components.Button
      variant="soft"
      onClick={(e) => open(e, { blockId: 123, destination: 'section-1' })}
    >
      Move
    </orca.components.Button>
  )}
</orca.components.ConfirmBox>
```

###### ContextMenu()

> **ContextMenu**: (`props`) => `Element`

Creates a context menu attached to an element

###### Parameters

###### props

[`ContextMenuProps`](#contextmenuprops)

###### Returns

`Element`

###### Example

```tsx
// Basic context menu
<orca.components.ContextMenu
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText
        title="Edit"
        onClick={() => { editItem(); close(); }}
      />
      <orca.components.MenuText
        title="Delete"
        dangerous={true}
        onClick={() => { deleteItem(); close(); }}
      />
    </orca.components.Menu>
  )}
>
  {(open) => (
    <div onContextMenu={open}>Right-click here to show the menu</div>
  )}
</orca.components.ContextMenu>

// Custom position and alignment menu
<orca.components.ContextMenu
  placement="horizontal"
  alignment="top"
  defaultPlacement="right"
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText title="Option 1" onClick={close} />
      <orca.components.MenuText title="Option 2" onClick={close} />
    </orca.components.Menu>
  )}
>
  {(open) => (
    <orca.components.Button variant="soft" onClick={open}>
      Show Menu
    </orca.components.Button>
  )}
</orca.components.ContextMenu>
```

###### DatePicker()

> **DatePicker**: (`props`) => `Element`

Calendar date picker

###### Parameters

###### props

###### alignment?

`"left"` \| `"center"` \| `"right"`

###### className?

`string`

###### menuContainer?

`RefObject`\<`HTMLElement`\>

###### mode?

`"date"` \| `"time"` \| `"datetime"`

###### onChange

(`v`) => `void` \| `Promise`\<`void`\>

###### onClose?

() => `void` \| `Promise`\<`void`\>

###### onClosed?

() => `void` \| `Promise`\<`void`\>

###### range?

`boolean`

###### rect?

`DOMRect`

###### refElement?

`RefObject`\<`HTMLElement`\>

###### style?

`CSSProperties`

###### value

`Date` \| \[`Date`, `Date`\]

###### visible?

`boolean`

###### Returns

`Element`

###### Example

```tsx
// Basic date picker
const [date, setDate] = useState(new Date());
<orca.components.DatePicker
  value={date}
  onChange={(newDate) => setDate(newDate)}
/>

// Date-time picker
<orca.components.DatePicker
  mode="datetime"
  value={dateTime}
  onChange={handleDateTimeChange}
/>

// Date range picker
const [dateRange, setDateRange] = useState([new Date(), new Date(Date.now() + 86400000)]);
<orca.components.DatePicker
  range={true}
  value={dateRange}
  onChange={(newRange) => setDateRange(newRange)}
/>
```

###### HoverContextMenu()

> **HoverContextMenu**: (`props`) => `Element`

Context menu that appears on hover

###### Parameters

###### props

`object` & `Omit`\<[`ContextMenuProps`](#contextmenuprops), `"children"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic hover menu
<orca.components.HoverContextMenu
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText
        title="View"
        preIcon="ti ti-eye"
        onClick={close}
      />
      <orca.components.MenuText
        title="Edit"
        preIcon="ti ti-pencil"
        onClick={close}
      />
    </orca.components.Menu>
  )}
>
  <div className="hoverable-element">Hover to show menu</div>
</orca.components.HoverContextMenu>

// Custom positioned hover menu
<orca.components.HoverContextMenu
  placement="horizontal"
  defaultPlacement="right"
  menu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText
        title="View Details"
        preIcon="ti ti-info-circle"
        onClick={() => { viewDetails(); close(); }}
      />
    </orca.components.Menu>
  )}
>
  <i className="ti ti-info-circle" />
</orca.components.HoverContextMenu>
```

###### Image()

> **Image**: (`props`) => `Element`

Image component with loading states

###### Parameters

###### props

`HTMLAttributes`\<`HTMLImageElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic image
<orca.components.Image
  src="/path/to/image.jpg"
  alt="Description"
/>

// Styled image
<orca.components.Image
  src="/path/to/image.png"
  alt="Logo"
  className="profile-image"
  style={{ width: 100, height: 100, borderRadius: '50%' }}
/>

// Handle loading events
<orca.components.Image
  src="/path/to/large-image.jpg"
  alt="Large Image"
  onLoad={() => setImageLoaded(true)}
  onError={() => handleImageError()}
/>
```

###### Input()

> **Input**: (`props`) => `Element`

Standard text input component

###### Parameters

###### props

`any`

###### Returns

`Element`

###### Example

```tsx
// Basic input field
<orca.components.Input
  placeholder="Enter text"
  value={inputValue}
  onChange={(e) => setInputValue(e.target.value)}
/>

// Input field with prefix and suffix
<orca.components.Input
  pre={<i className="ti ti-user" />}
  post={<orca.components.Button variant="plain">Clear</orca.components.Button>}
  placeholder="Username"
/>

// Input field with error message
<orca.components.Input
  value={email}
  onChange={handleEmailChange}
  error={emailError ? "Please enter a valid email address" : undefined}
/>
```

###### InputBox()

> **InputBox**: (`props`) => `Element`

Input dialog with label and actions

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"left"` \| `"top"` \| `"center"` \| `"bottom"` \| `"right"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"left"` \| `"top"` \| `"bottom"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic input dialog
<orca.components.InputBox
  label="Enter name"
  defaultValue="Default value"
  onConfirm={(value, e, close) => {
    if (value) {
      saveName(value);
      close();
    }
  }}
>
  {(open) => (
    <orca.components.Button variant="soft" onClick={open}>
      Edit Name
    </orca.components.Button>
  )}
</orca.components.InputBox>

// Input dialog with validation
<orca.components.InputBox
  label="Enter URL"
  error={urlError}
  onConfirm={(url, e, close) => {
    if (isValidUrl(url)) {
      addUrl(url);
      close();
    } else {
      setUrlError("Please enter a valid URL");
    }
  }}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Add Link
    </orca.components.Button>
  )}
</orca.components.InputBox>
```

###### LoadMore()

> **LoadMore**: (`props`) => `Element`

Component for loading more items in paginated lists

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic Load More component
<orca.components.LoadMore
  onLoadMore={async () => {
    await fetchMoreItems();
  }}
/>

// Custom message and debounce time
<orca.components.LoadMore
  message="Loading more results..."
  debounceTime={500}
  onLoadMore={loadMoreResults}
  className="custom-load-more"
/>
```

###### MemoizedViews()

> **MemoizedViews**: (`props`) => `Element`

Efficient view container for switching between components

###### Parameters

###### props

###### active

`string`

###### className?

`string`

###### name

`string`

###### orientation?

`"vertical"` \| `"horizontal"`

###### style?

`CSSProperties`

###### views

\{\[`key`: `string`\]: `ReactElement`\<`any`, `string` \| `JSXElementConstructor`\<`any`\>\>; \}

###### Returns

`Element`

###### Example

```tsx
// Basic view switching container
<orca.components.MemoizedViews
  name="main-views"
  active="details"
  views={{
    "list": <ListView items={items} />,
    "details": <DetailsView itemId={123} />,
    "settings": <SettingsView />
  }}
/>

// Horizontally arranged views
<orca.components.MemoizedViews
  name="side-views"
  active={currentTab}
  orientation="horizontal"
  className="side-panel"
  views={{
    "info": <InfoPanel />,
    "history": <HistoryPanel />,
    "comments": <CommentsPanel />
  }}
/>
```

###### Menu()

> **Menu**: (`props`) => `Element`

Standard menu container

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic menu
<orca.components.Menu>
  <orca.components.MenuText title="Option 1" onClick={() => handleOption(1)} />
  <orca.components.MenuText title="Option 2" onClick={() => handleOption(2)} />
  <orca.components.MenuSeparator />
  <orca.components.MenuText
    title="Exit"
    dangerous={true}
    onClick={() => handleExit(0)}
  />
</orca.components.Menu>

// Menu with keyboard navigation enabled
<orca.components.Menu
  keyboardNav={true}
  navDirection="both"
  onKeyboardNav={(el) => scrollToElement(el)}
  className="keyboard-nav-menu"
>
  <orca.components.MenuTitle title="Actions" />
  <orca.components.MenuText title="Edit" onClick={() => handleEdit(123)} />
  <orca.components.MenuText title="Copy" onClick={() => handleCopy(456)} />
  <orca.components.MenuText title="Delete" onClick={() => handleDelete(789)} />
</orca.components.Menu>
```

###### MenuItem()

> **MenuItem**: (`props`) => `Element`

Menu item component

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic menu item
<orca.components.MenuItem
  jsx={<div>Option 1</div>}
  onClick={() => handleOption(1)}
/>

// Menu item with nested content
<orca.components.MenuItem
  jsx={<div className="menu-item-header">Display Settings</div>}
  onClick={() => handleSettingsClick(123)}
>
  <div className="submenu">
    <div>Theme: {currentTheme}</div>
    <div>Font Size: {fontSize}</div>
  </div>
</orca.components.MenuItem>

// Menu item with custom styles
<orca.components.MenuItem
  jsx={<div className="icon-item"><i className="ti ti-user"/> User</div>}
  className="highlighted-item"
  style={{ fontWeight: 'bold' }}
  onClick={() => handleUserClick(456)}
/>
```

###### MenuSeparator()

> **MenuSeparator**: (`props`) => `Element`

Visual separator for menus

###### Parameters

###### props

###### Returns

`Element`

###### Example

```tsx
// Add a separator between menu items
<orca.components.Menu>
  <orca.components.MenuText title="Edit" onClick={() => handleEdit(123)} />
  <orca.components.MenuText title="Copy" onClick={() => handleCopy(456)} />
  <orca.components.MenuSeparator />
  <orca.components.MenuText
    title="Delete"
    dangerous={true}
    onClick={() => handleDelete(789)}
  />
</orca.components.Menu>
```

###### MenuText()

> **MenuText**: (`props`) => `Element`

Text-based menu item

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLDivElement`\>, `"contextMenu"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic text menu item
<orca.components.MenuText
  title="Save Document"
  onClick={handleSave}
/>

// Menu item with icon and shortcut
<orca.components.MenuText
  title="Copy"
  preIcon="ti ti-copy"
  shortcut="⌘C"
  onClick={handleCopy}
/>

// Menu item with subtitle
<orca.components.MenuText
  title="Export as PDF"
  subtitle="Export the current document as a PDF file"
  preIcon="ti ti-file-export"
  onClick={handleExport}
/>

// Disabled menu item
<orca.components.MenuText
  title="Delete"
  preIcon="ti ti-trash"
  dangerous={true}
  disabled={!hasSelection}
  onClick={handleDelete}
/>

// Menu item with context menu
<orca.components.MenuText
  title="Share"
  preIcon="ti ti-share"
  contextMenu={(close) => (
    <orca.components.Menu>
      <orca.components.MenuText title="Copy Link" onClick={() => { copyLink(); close(); }} />
      <orca.components.MenuText title="Send Email" onClick={() => { sendEmail(); close(); }} />
    </orca.components.Menu>
  )}
/>
```

###### MenuTitle()

> **MenuTitle**: (`props`) => `Element`

Menu section title

###### Parameters

###### props

###### className?

`string`

###### info?

`ReactNode`

###### style?

`CSSProperties`

###### title

`string`

###### Returns

`Element`

###### Example

```tsx
// Basic menu title
<orca.components.Menu>
  <orca.components.MenuTitle title="File Operations" />
  <orca.components.MenuText title="New" onClick={handleNew} />
  <orca.components.MenuText title="Open" onClick={handleOpen} />
  <orca.components.MenuSeparator />
  <orca.components.MenuTitle title="Edit Operations" />
  <orca.components.MenuText title="Copy" onClick={handleCopy} />
  <orca.components.MenuText title="Paste" onClick={handlePaste} />
</orca.components.Menu>

// Menu title with additional info
<orca.components.Menu>
  <orca.components.MenuTitle
    title="Recent Documents"
    info={<span className="count">{recentDocs.length}</span>}
  />
  {recentDocs.map(doc => (
    <orca.components.MenuText
      key={doc.id}
      title={doc.name}
      onClick={() => openDoc(doc.id)}
    />
  ))}
</orca.components.Menu>
```

###### ModalOverlay()

> **ModalOverlay**: (`props`) => `Element`

Full-screen modal overlay

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic modal
const [isVisible, setIsVisible] = useState(false);
<orca.components.Button onClick={() => setIsVisible(true)}>
  Open Modal
</orca.components.Button>

<orca.components.ModalOverlay
  visible={isVisible}
  canClose={true}
  onClose={() => setIsVisible(false)}
>
  <div className="modal-content">
    <h2>Modal Title</h2>
    <p>This is the content of the modal...</p>
    <orca.components.Button onClick={() => setIsVisible(false)}>
      Close
    </orca.components.Button>
  </div>
</orca.components.ModalOverlay>

// Modal with blur effect
<orca.components.ModalOverlay
  visible={isImportant}
  blurred={true}
  canClose={false}
  className="important-modal"
>
  <div className="confirmation-dialog">
    <h3>Important Action Confirmation</h3>
    <p>Are you sure you want to proceed? This action cannot be undone.</p>
    <div className="actions">
      <orca.components.Button variant="outline" onClick={handleCancel}>
        Cancel
      </orca.components.Button>
      <orca.components.Button variant="dangerous" onClick={handleConfirm}>
        Confirm
      </orca.components.Button>
    </div>
  </div>
</orca.components.ModalOverlay>
```

###### Popup()

> **Popup**: (`props`) => `Element`

Popup panel attached to an element.

The popup is positioned automatically relative to a target `refElement` (or explicit
`rect`) and can be constrained by an optional `boundary` element. You can also provide
`relativePosition` to explicitly set `top/left/bottom/right` CSS strings. The popup
supports vertical and horizontal placement, alignment, offsets, and boundary
adjustments (via `boundary*Offset` props). When `replacement` is enabled (default),
the popup observes size changes and updates placement automatically.

Default values: `placement: "vertical"`, `defaultPlacement: "bottom"`,
`alignment: "center"`, `offset: 4`, `crossOffset: 0`, `replacement: true`.

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic popup panel
const [isVisible, setIsVisible] = useState(false);
const buttonRef = useRef(null);

<orca.components.Button
  ref={buttonRef}
  onClick={() => setIsVisible(true)}
>
  Show Popup
</orca.components.Button>

<orca.components.Popup
  refElement={buttonRef}
  visible={isVisible}
  onClose={() => setIsVisible(false)}
>
  <div className="popup-content">
    <p>This is the popup content</p>
  </div>
</orca.components.Popup>

// Custom positioned and aligned popup panel
<orca.components.Popup
  refElement={anchorRef}
  visible={showPopup}
  placement="horizontal"
  defaultPlacement="right"
  alignment="center"
  offset={10}
  onClose={closePopup}
  className="custom-popup"
>
  <div className="info-card">
    <h3>Details</h3>
    <p>Here is more detailed content...</p>
  </div>
</orca.components.Popup>
```

###### QueryConditionsBuilder()

> **QueryConditionsBuilder**: (`props`) => `Element`

A visual builder for creating and editing complex query conditions.
It provides a user interface for constructing nested AND/OR logic, property filters,
and other query criteria.

###### Parameters

###### props

###### onChange

(`newQuery`) => `void`

Callback fired when the query conditions are modified.

###### value

[`QueryDescription2`](#querydescription2)

The current query description object representing the conditions.

###### Returns

`Element`

###### Example

```tsx
const [query, setQuery] = useState<QueryDescription2>({
  type: "and",
  conditions: []
});

<orca.components.QueryConditionsBuilder
  value={query}
  onChange={(newQuery) => setQuery(newQuery)}
/>
```

###### Segmented()

> **Segmented**: (`props`) => `Element`

Segmented control for selecting from options

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLDivElement`\>, `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic segmented control
const [selected, setSelected] = useState("list");
<orca.components.Segmented
  selected={selected}
  options={[
    { value: "list", label: "List" },
    { value: "grid", label: "Grid" },
    { value: "table", label: "Table" }
  ]}
  onChange={(value) => setSelected(value)}
/>

// Segmented control with custom JSX
<orca.components.Segmented
  selected={viewMode}
  options={[
    { value: "day", jsx: <i className="ti ti-calendar-day" /> },
    { value: "week", jsx: <i className="ti ti-calendar-week" /> },
    { value: "month", jsx: <i className="ti ti-calendar-month" /> }
  ]}
  onChange={setViewMode}
  className="calendar-mode-selector"
/>
```

###### Select()

> **Select**: (`props`) => `Element`

Dropdown select component

###### Parameters

###### props

[`SelectProps`](#selectprops)

###### Returns

`Element`

###### Example

```tsx
// Basic dropdown selector
const [selected, setSelected] = useState(["option1"]);
<orca.components.Select
  selected={selected}
  options={[
    { value: "option1", label: "Option 1" },
    { value: "option2", label: "Option 2" },
    { value: "option3", label: "Option 3" }
  ]}
  onChange={(newSelected) => setSelected(newSelected)}
/>

// Multi-select dropdown with filtering
<orca.components.Select
  selected={selectedTags}
  options={availableTags}
  multiSelection={true}
  filter={true}
  filterPlaceholder="Search tags..."
  placeholder="Select tags"
  onChange={handleTagsChange}
/>

// Grouped dropdown selector
<orca.components.Select
  selected={[selectedLanguage]}
  options={[
    { value: "js", label: "JavaScript", group: "Frontend" },
    { value: "ts", label: "TypeScript", group: "Frontend" },
    { value: "py", label: "Python", group: "Backend" },
    { value: "go", label: "Golang", group: "Backend" }
  ]}
  pre={<i className="ti ti-code" />}
  alignment="left"
  width="200px"
  onChange={(selected) => setSelectedLanguage(selected[0])}
/>
```

###### Skeleton()

> **Skeleton**: (`props`) => `Element`

Loading placeholder

###### Parameters

###### props

###### Returns

`Element`

###### Example

```tsx
// Basic loading placeholder
<div className="loading-container">
  <orca.components.Skeleton />
</div>

// Layout during content loading
<div className="content-card">
  <div className="header">
    {isLoading ? <orca.components.Skeleton /> : <h2>{title}</h2>}
  </div>
  <div className="body">
    {isLoading ? (
      <>
        <orca.components.Skeleton />
        <orca.components.Skeleton />
        <orca.components.Skeleton />
      </>
    ) : (
      <p>{content}</p>
    )}
  </div>
</div>
```

###### Switch()

> **Switch**: (`props`) => `Element`

Toggle switch component

###### Parameters

###### props

`object` & `Omit`\<`HTMLAttributes`\<`HTMLButtonElement`\>, `"onChange"`\>

###### Returns

`Element`

###### Example

```tsx
// Basic switch
const [isOn, setIsOn] = useState(false);
<orca.components.Switch
  on={isOn}
  onChange={(newValue) => setIsOn(newValue)}
/>

// Read-only switch
<orca.components.Switch
  on={featureEnabled}
  readonly={true}
/>

// Unset state switch
<orca.components.Switch
  unset={true}
  onChange={handleInheritedSetting}
/>

// Switch with label
<div className="setting-row">
  <label>Enable Notifications</label>
  <orca.components.Switch
    on={notificationsEnabled}
    onChange={toggleNotifications}
  />
</div>
```

###### Table()

> **Table**: (`props`) => `Element`

Data table component

###### Parameters

###### props

`object` & `HTMLAttributes`\<`HTMLDivElement`\>

###### Returns

`Element`

###### Example

```tsx
// Basic data table
<orca.components.Table
  columns={[
    { name: "Name", icon: "ti ti-file" },
    { name: "Size", icon: "ti ti-ruler" },
    { name: "Modified Date", icon: "ti ti-calendar" }
  ]}
  items={files}
  initialColumnSizes="2fr 1fr 1fr"
  rowRenderer={(item, className, index) => (
    <tr key={item.id} className={className}>
      <td>{item.name}</td>
      <td>{item.size}</td>
      <td>{item.modifiedDate}</td>
    </tr>
  )}
/>

// Table with pinned column and resizable columns
<orca.components.Table
  columns={[
    { name: "ID" },
    { name: "Product Name" },
    { name: "Price" },
    { name: "Stock" }
  ]}
  items={products}
  initialColumnSizes="80px 2fr 1fr 1fr"
  pinColumn={true}
  onColumnResize={handleColumnResize}
  className="products-table"
  rowRenderer={(product, className, index) => (
    <tr key={product.id} className={className} onClick={() => selectProduct(product.id)}>
      <td>{product.id}</td>
      <td>{product.name}</td>
      <td>{formatCurrency(product.price)}</td>
      <td>{product.stock}</td>
    </tr>
  )}
/>
```

###### TagPopup()

> **TagPopup**: (`props`) => `Element`

Provides a popup menu for tag selection and creation.
Allows users to search, select existing tags, or create new ones.

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"left"` \| `"top"` \| `"center"` \| `"bottom"` \| `"right"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"left"` \| `"top"` \| `"bottom"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic usage
<orca.components.TagPopup
  blockId={123}
  closeMenu={() => setMenuVisible(false)}
  onTagClick={(tag) => console.log(`Selected tag: ${tag}`)}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Add Tag
    </orca.components.Button>
  )}
</orca.components.TagPopup>

// Custom placeholder text
<orca.components.TagPopup
  blockId={456}
  closeMenu={handleClose}
  onTagClick={handleTagSelect}
  placeholder="Search or create a new tag..."
  container={containerRef}
>
  {(open) => (
    <span onClick={open}>Manage Tags</span>
  )}
</orca.components.TagPopup>
```

###### TagPropsEditor()

> **TagPropsEditor**: (`props`) => `Element`

Provides an editor interface for managing and configuring tag properties.
Allows users to add, edit, and delete tag properties, set property types and values.

###### Parameters

###### props

`object` & `Partial`\<\{ `alignment?`: `"left"` \| `"top"` \| `"center"` \| `"bottom"` \| `"right"`; `allowBeyondContainer?`: `boolean`; `children`: (`openMenu`, `closeMenu`) => `ReactNode`; `className?`: `string`; `container?`: `RefObject`\<`HTMLElement`\>; `crossOffset?`: `number`; `defaultPlacement?`: `"left"` \| `"top"` \| `"bottom"` \| `"right"`; `escapeToClose?`: `boolean`; `keyboardNav?`: `boolean`; `menu`: (`close`, `state?`) => `ReactNode`; `menuAttr?`: `Record`\<`string`, `any`\>; `navDirection?`: `"vertical"` \| `"both"`; `noPointerLogic?`: `boolean`; `offset?`: `number`; `onClosed?`: () => `void`; `onOpened?`: () => `void`; `placement?`: `"vertical"` \| `"horizontal"`; `style?`: `CSSProperties`; \}\>

###### Returns

`Element`

###### Example

```tsx
// Basic usage
<orca.components.TagPropsEditor
  blockId={123}
>
  {(open) => (
    <orca.components.Button variant="outline" onClick={open}>
      Edit Tag Properties
    </orca.components.Button>
  )}
</orca.components.TagPropsEditor>

// With custom container
<orca.components.TagPropsEditor
  blockId={456}
  container={containerRef}
>
  {(open) => (
    <span onClick={open}>Configure Properties</span>
  )}
</orca.components.TagPropsEditor>

// Combined with other components
<div className="tag-controls">
  <orca.components.TagPropsEditor blockId={789}>
    {(open) => (
      <orca.components.Button
        variant="plain"
        onClick={open}
        className="property-button"
      >
        <i className="ti ti-settings" />
      </orca.components.Button>
    )}
  </orca.components.TagPropsEditor>
</div>
```

###### Tooltip()

> **Tooltip**: (`props`) => `Element`

Tooltip component

###### Parameters

###### props

###### alignment?

`"left"` \| `"top"` \| `"center"` \| `"bottom"` \| `"right"`

###### allowBeyondContainer?

`boolean`

###### children

`ReactElement`

###### defaultPlacement?

`"left"` \| `"top"` \| `"bottom"` \| `"right"`

###### delay?

`number`

###### image?

`string`

###### modifier?

`"shift"` \| `"ctrl"` \| `"alt"` \| `"meta"`

###### placement?

`"vertical"` \| `"horizontal"`

###### shortcut?

`string`

###### text

`ReactNode`

###### Returns

`Element`

###### Example

```tsx
// Basic text tooltip
<orca.components.Tooltip text="Delete this item">
  <button><i className="ti ti-trash" /></button>
</orca.components.Tooltip>

// Tooltip with shortcut
<orca.components.Tooltip
  text="Save document"
  shortcut="⌘S"
  defaultPlacement="bottom"
>
  <orca.components.Button variant="solid">
    <i className="ti ti-device-floppy" />
  </orca.components.Button>
</orca.components.Tooltip>

// Tooltip with image preview
<orca.components.Tooltip
  text="View original image"
  image="/path/to/preview.jpg"
  placement="horizontal"
  alignment="top"
  delay={500}
>
  <div className="thumbnail">
    <img src="/path/to/thumbnail.jpg" alt="Thumbnail" />
  </div>
</orca.components.Tooltip>
```

###### Example

```tsx
import * as React from "react"

function MyPluginUI() {
  const Button = orca.components.Button
  return (
    <Button
      variant="solid"
      onClick={() => console.log("Clicked!")}>
      Click Me
    </Button>
  )
}
```


### `orca.contexts`

##### contexts

> **contexts**: `object`

React contexts exposed for use in plugins.

###### BlockEditorContext

> **BlockEditorContext**: `Context`\<\{ `active`: `boolean`; `editor`: `RefObject`\<`HTMLDivElement`\>; `panelId`: `string`; `rootBlockId`: `number`; \}\>

Block editor context for accessing the current block editor instance.

This React context provides access to the currently focused block editor's
DOM references, panel identity and active state. It is
useful for plugins that need to interact with the editor directly, such as
custom UI overlays, toolbars, or editor extensions.

###### Example

```tsx
const { useContext } = window.React
const { useSnapshot } = window.Valtio

const BlockEditorContext = orca.contexts.BlockEditorContext

function MyEditorPlugin() {
  const editorCtx = useContext(BlockEditorContext)

  const { editor, panelId, rootBlockId } = editorCtx
  const { active } = useSnapshot(editorCtx)

  // Use editor ref to position overlays relative to the editor

  return active ? (
    <div>Editing block {rootBlockId} in panel {panelId}</div>
  ) : null
}
```

###### ImageViewerContext

> **ImageViewerContext**: `object`

Image viewer context for displaying images in a modal viewer.

###### Example

```tsx
const ImageViewerContext = orca.contexts.ImageViewerContext
const { viewImages } = React.useContext(ImageViewerContext)

const onImageClick = (e) => {
  viewImages(["https://example.com/image.png"], e.currentTarget)
}
```

###### ImageViewerContext.viewImages()

> **viewImages**(`images`, `thumbnail`, `options?`): `void`

Opens the image viewer to display a list of images.

###### Parameters

###### images

`string`[]

An array of image URLs to display in the viewer.

###### thumbnail

`HTMLImageElement`

The source image element used for transition animation.

###### options?

Optional viewer configuration such as initial rotation.

###### initialRotation?

`number`

###### Returns

`void`

###### ZContext

> **ZContext**: `Context`\<`number`\>

Z-index context for managing hierarchical stacking order of UI elements.

This React context provides the current z-index value for components that
need to establish their own stacking contexts (e.g., popups, tooltips,
maximized overlays). Components that render into portals or elevated
layers should consume this context and offset their z-index from the
provided value to ensure proper stacking order.

###### Example

```tsx
import { useContext } from "react"

const ZContext = orca.contexts.ZContext

function MyPopup() {
  const zIndex = useContext(ZContext)

  return (
    <div style={{ zIndex: zIndex + 10 }}>
      Popup content
    </div>
  )
}
```


### `orca.headbar`

##### headbar

> **headbar**: `object`

Headbar API for registering custom buttons in the application's header bar.

###### registerHeadbarButton()

> **registerHeadbarButton**(`id`, `render`): `void`

Registers a custom button in the Orca headbar.

###### Parameters

###### id

`string`

A unique identifier for the button

###### render

() => `ReactElement`

A function that returns a React element to render

###### Returns

`void`

###### Example

```tsx
orca.headbar.registerHeadbarButton("myplugin.settingsButton", () => (
  <orca.components.Button
    variant="plain"
    onClick={() => orca.commands.invokeCommand("myplugin.openSettings")}
  >
    <i className="ti ti-settings-filled" />
  </orca.components.Button>
))
```

###### unregisterHeadbarButton()

> **unregisterHeadbarButton**(`id`): `void`

Unregisters a previously registered headbar button.

###### Parameters

###### id

`string`

The identifier of the button to unregister

###### Returns

`void`

###### Example

```ts
// When unloading the plugin
orca.headbar.unregisterHeadbarButton("myplugin.settingsButton")
```

###### Example

```ts
// Register a custom button in the headbar
orca.headbar.registerHeadbarButton("myplugin.syncButton", () => (
  <orca.components.Button
    variant="plain"
    onClick={() => syncData()}
  >
    <i className="ti ti-refresh" />
  </orca.components.Button>
))
```


### `orca.panels`

##### panels

> **panels**: `object`

Panel renderer API, used to register custom panel types.
Panels are the main views in the application (e.g., journal panel, block panel).

###### registerPanel()

> **registerPanel**(`type`, `renderer`): `void`

Registers a custom panel renderer.

###### Parameters

###### type

`string`

The type identifier for the panel (e.g., "myplugin.customPanel")

###### renderer

`any`

The React component that renders the panel

###### Returns

`void`

###### Example

```ts
import TimelinePanel from "./TimelinePanel"

orca.panels.registerPanel(
  "myplugin.timeline",
  TimelinePanel
)
```

###### unregisterPanel()

> **unregisterPanel**(`type`): `void`

Unregisters a previously registered panel renderer.

###### Parameters

###### type

`string`

The type identifier of the panel renderer to remove

###### Returns

`void`

###### Example

```ts
orca.panels.unregisterPanel("myplugin.timeline")
```

###### Example

```ts
import CustomPanel from "./CustomPanel"

orca.panels.registerPanel(
  "myplugin.customPanel",
  CustomPanel
)
```


### `orca.themes`

##### themes

> **themes**: `object`

Theme management API, used to register, unregister, and manage visual themes.

###### injectCSS()

> **injectCSS**(`css`, `role`): `void`

将 CSS 字符串注入到文档头部，并指定一个角色标识。

###### Parameters

###### css

`string`

要注入的 CSS 字符串。

###### role

`string`

样式元素的角色标识，用于后续删除。

###### Returns

`void`

###### injectCSSResource()

> **injectCSSResource**(`url`, `role`): `void`

Injects a CSS resource into the application.
Useful for adding styles that are not part of a theme but are needed by a plugin.

###### Parameters

###### url

`string`

The URL or path to the CSS resource

###### role

`string`

A unique identifier for the resource to allow for later removal

###### Returns

`void`

###### Example

```ts
orca.themes.injectCSSResource("styles/my-plugin-styles.css", "my-plugin-ui")
```

###### register()

> **register**(`pluginName`, `themeName`, `themeFileName`): `void`

Registers a theme with Orca.

###### Parameters

###### pluginName

`string`

The name of the plugin registering the theme

###### themeName

`string`

The display name of the theme

###### themeFileName

`string`

The file path to the theme CSS file (relative to plugin directory)

###### Returns

`void`

###### Example

```ts
orca.themes.register("my-plugin", "Dark Ocean", "themes/dark-ocean.css")
```

###### removeCSS()

> **removeCSS**(`role`): `void`

从文档中删除所有具有指定角色标识的样式元素。

###### Parameters

###### role

`string`

要删除的样式元素的角色标识。

###### Returns

`void`

###### removeCSSResources()

> **removeCSSResources**(`role`): `void`

Removes previously injected CSS resources with the specified role.

###### Parameters

###### role

`string`

The role identifier of the CSS resources to remove

###### Returns

`void`

###### Example

```ts
orca.themes.removeCSSResources("my-plugin-ui")
```

###### unregister()

> **unregister**(`themeName`): `void`

Unregisters a theme.

###### Parameters

###### themeName

`string`

The name of the theme to unregister

###### Returns

`void`

###### Example

```ts
orca.themes.unregister("Dark Ocean")
```

###### Example

```ts
// Register a theme from a plugin
orca.themes.register("my-plugin", "Dark Ocean", "themes/dark-ocean.css")
```


***

### ColumnPanel

Represents a panel container that arranges its children in a column.
Used for vertical panel layouts.

#### Properties

##### children

> **children**: ([`RowPanel`](#rowpanel) \| [`ViewPanel`](#viewpanel))[]

Child panels contained within this column

##### direction

> **direction**: `"column"`

Specifies that children are arranged vertically

##### id

> **id**: `string`

Unique identifier for the column panel

##### width

> **width**: `number`

Width of the column panel in pixels

***


***

### Notification

Represents a notification displayed to the user.
Notifications provide feedback about operations or important information.

#### Properties

##### action()?

> `optional` **action**: () => `void` \| `Promise`\<`void`\>

Optional action callback that can be triggered from the notification

###### Returns

`void` \| `Promise`\<`void`\>

##### id

> **id**: `number`

Unique identifier for the notification

##### message

> **message**: `string`

Main message content of the notification

##### title?

> `optional` **title**: `string`

Optional title text for the notification

##### type

> **type**: `"info"` \| `"success"` \| `"warn"` \| `"error"`

Type of notification that determines its visual appearance and severity

***


***

### PanelHistory

Represents an entry in the panel navigation history.
Used to implement back/forward navigation between panel states.

#### Properties

##### activePanel

> **activePanel**: `string`

ID of the panel that was active at this history point

##### view

> **view**: `string`

The view type that was displayed

##### viewArgs?

> `optional` **viewArgs**: `Record`\<`string`, `any`\>

Arguments for the view at this history point

***


***

### PanelLayouts

Configuration for saved panel layouts.
Allows users to save and restore different workspace arrangements.

#### Properties

##### default

> **default**: `string`

The key of the default layout to use

##### layouts

> **layouts**: `Record`\<`string`, \{ `activePanel`: `string`; `panels`: [`RowPanel`](#rowpanel); \}\>

Map of named layouts with their panel configurations

***


***

### RowPanel

Represents a panel container that arranges its children in a row.
Used for horizontal panel layouts.

#### Properties

##### children

> **children**: ([`ViewPanel`](#viewpanel) \| [`ColumnPanel`](#columnpanel))[]

Child panels contained within this row

##### direction

> **direction**: `"row"`

Specifies that children are arranged horizontally

##### height

> **height**: `number`

Height of the row panel in pixels

##### id

> **id**: `string`

Unique identifier for the row panel

***


***

### SelectOption

A single option item for the Select component

#### Properties

##### color?

> `optional` **color**: `string`

Background color for the option label (e.g., "#ff6600")

##### icon?

> `optional` **icon**: `string`

Icon class (e.g., "ti ti-folder") or emoji string

##### label?

> `optional` **label**: `string`

Display label shown in the dropdown and button

##### onClick()?

> `optional` **onClick**: (`e`) => `void` \| `Promise`\<`void`\>

Click handler attached to the selected chip (multi-selection mode only)

###### Parameters

###### e

`MouseEvent`

###### Returns

`void` \| `Promise`\<`void`\>

##### pinyin?

> `optional` **pinyin**: `string`

Pinyin representation for Chinese text filtering

##### render()?

> `optional` **render**: (`closeMenu`, `icon?`, `color?`, `label?`, `value?`, `selected?`, `onClick?`) => `ReactElement`\<`any`, `string` \| `JSXElementConstructor`\<`any`\>\>

Custom render function for the option item in the dropdown.
Return `null` to skip this option (useful for non-selectable separators/headings).

###### Parameters

###### closeMenu

() => `void`

###### icon?

`string`

###### color?

`string`

###### label?

`string`

###### value?

`string`

###### selected?

`boolean`

###### onClick?

(`e`) => `void` \| `Promise`\<`void`\>

###### Returns

`ReactElement`\<`any`, `string` \| `JSXElementConstructor`\<`any`\>\>

##### renderSelected()?

> `optional` **renderSelected**: (`closeMenu`, `icon?`, `color?`, `label?`, `value?`, `onClick?`) => `ReactElement`

Custom render function for the selected value chip (multi-selection mode only).
When set, this replaces the default coloured-chip display for this option.

###### Parameters

###### closeMenu

() => `void`

###### icon?

`string`

###### color?

`string`

###### label?

`string`

###### value?

`string`

###### onClick?

(`e`) => `void` \| `Promise`\<`void`\>

###### Returns

`ReactElement`

##### value?

> `optional` **value**: `string`

Unique value identifying this option

***


***

### SelectProps

Props for the Select dropdown component

#### Properties

##### alignment?

> `optional` **alignment**: `"left"` \| `"center"` \| `"right"`

Popup alignment relative to the button

##### buttonClassName?

> `optional` **buttonClassName**: `string`

Class name for the trigger button

##### disabled?

> `optional` **disabled**: `boolean`

Disable the select

##### filter?

> `optional` **filter**: `boolean`

Show a search input to filter options

##### filterFunction()?

> `optional` **filterFunction**: (`keyword`, `options?`) => [`SelectOption`](#selectoption)[] \| `Promise`\<[`SelectOption`](#selectoption)[]\>

Custom filter function.
Receives the keyword and the full option list, returns filtered options.
When omitted, a default label/pinyin substring match is used.

###### Parameters

###### keyword

`string`

###### options?

[`SelectOption`](#selectoption)[]

###### Returns

[`SelectOption`](#selectoption)[] \| `Promise`\<[`SelectOption`](#selectoption)[]\>

##### filterPlaceholder?

> `optional` **filterPlaceholder**: `string`

Placeholder for the filter input

##### filterPost?

> `optional` **filterPost**: `ReactElement`

Element appended after the filter input

##### formatter()?

> `optional` **formatter**: (`value`) => `string`

Formats a selected value into a display string when the value has no matching option

###### Parameters

###### value

`string`

###### Returns

`string`

##### menuAttrs?

> `optional` **menuAttrs**: `Record`\<`string`, `any`\>

Additional attributes forwarded to the Menu component

##### menuClassName?

> `optional` **menuClassName**: `string`

Class name for the dropdown menu

##### menuContainer?

> `optional` **menuContainer**: `RefObject`\<`HTMLElement`\>

Scrolling container ref for the popup

##### multiSelection?

> `optional` **multiSelection**: `boolean`

Allow selecting multiple values

##### onChange()?

> `optional` **onChange**: (`selected`, `filterKeyword?`) => `void` \| `Promise`\<`void`\>

Called when selection changes; second argument is the current filter keyword if filtering is active

###### Parameters

###### selected

`string`[]

###### filterKeyword?

`string`

###### Returns

`void` \| `Promise`\<`void`\>

##### options

> **options**: [`SelectOption`](#selectoption)[]

Available options

##### placeholder?

> `optional` **placeholder**: `string`

Placeholder text when nothing is selected

##### pre?

> `optional` **pre**: `ReactElement`

Element prepended inside the select button

##### readOnly?

> `optional` **readOnly**: `boolean`

Show the select in read-only mode (button click does nothing)

##### selected

> **selected**: `string`[]

Currently selected values

##### width?

> `optional` **width**: `string` \| `number`

Minimum width of the select button and dropdown

##### withClear?

> `optional` **withClear**: `boolean`

Show a "Clear selection(s)" action at the bottom of the dropdown

***


***

### ViewPanel

Represents a view panel that displays content (journal or block).
These are the leaf panels in the panel hierarchy that actually render content.

#### Properties

##### height?

> `optional` **height**: `number`

Optional height of the panel in pixels

##### id

> **id**: `string`

Unique identifier for the view panel

##### locked?

> `optional` **locked**: `boolean`

Whether the panel is locked and cannot be closed or resized

##### view

> **view**: `string`

Type of view displayed in this panel (journal or block)

##### viewArgs

> **viewArgs**: `Record`\<`string`, `any`\>

Arguments for the view, such as blockId for block views or date for journal views

##### viewState

> **viewState**: `Record`\<`string`, `any`\>

State of the view, used to preserve UI state like scroll position or editor selections

##### wide?

> `optional` **wide**: `boolean`

Whether the panel should take up extra space when available

##### width?

> `optional` **width**: `number`

Optional width of the panel in pixels

## Type Aliases


***

### PanelProps

> **PanelProps** = `object`

Properties for rendering a panel component.

***


***

### PanelView

> **PanelView** = `string`

Types of views that can be displayed in a panel.
Currently supports journal view (for displaying daily notes) and block view (for displaying block content).

***

