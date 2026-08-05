[**Orca API Documentation**](../README.md) / [types](README.md) / Block Types

# Block Data Types

Types and interfaces related to blocks, block properties, references, and content fragments.


***

### Block

Core block data structure that represents a single note, section, or other content unit.
Blocks are the primary building blocks of content in Orca.

#### Properties

##### aliases

> **aliases**: `string`[]

Array of aliases (alternative names) for the block

##### backRefs

> **backRefs**: [`BlockRef`](#blockref)[]

Array of incoming references from other blocks to this block

##### children

> **children**: `number`[]

Array of child block IDs

##### content?

> `optional` **content**: [`ContentFragment`](#contentfragment)[]

Optional array of content fragments for rich text content

##### created

> **created**: `Date`

Timestamp when the block was created

##### id

> **id**: `number`

Unique identifier for the block

##### left?

> `optional` **left**: `number`

ID of the block to the left in the content flow, used for ordering siblings

##### modified

> **modified**: `Date`

Timestamp when the block was last modified

##### parent?

> `optional` **parent**: `number`

ID of the parent block, if any

##### properties

> **properties**: [`BlockProperty`](#blockproperty)[]

Array of named properties attached to the block

##### refs

> **refs**: [`BlockRef`](#blockref)[]

Array of outgoing references from this block to other blocks

##### text?

> `optional` **text**: `string`

Optional plain text content, used along with the content array

***


***

### BlockCustomQuery

Configuration for custom queries (used in block previews primarily).

#### Properties

##### extraSql?

> `optional` **extraSql**: `string`

Optional extra SQL to append to the query defined in `q`

##### q

> **q**: [`QueryDescription2`](#querydescription2)

The query description

***


***

### BlockMoveOptions

Options passed to `core.editor.moveBlocks` for fine-grained control over the move operation.

#### Properties

##### autoMatchType?

> `optional` **autoMatchType**: `boolean`

If `true`, the moved blocks' type (repr) is automatically adjusted to match
the target parent or sibling (e.g., converting a text block to a list item
when moving into a list).

##### extraMoves?

> `optional` **extraMoves**: \[`number`[], `number`, `"before"` \| `"after"` \| `"firstChild"` \| `"lastChild"`\][]

Additional move operations that are performed atomically alongside the
primary move. Each entry is a tuple of:
`[blockIds, refBlockId, position]`.

- `blockIds`: The blocks to move.
- `refBlockId`: The reference block (or `null` for root-level).
- `position`: Where to place the blocks relative to `refBlockId`.

***


***

### BlockProperty

Represents a named property attached to a block.
Properties can store metadata and structured data associated with blocks.

#### Properties

##### name

> **name**: `string`

Name of the property

##### pos?

> `optional` **pos**: `number`

Optional position for visual ordering of properties

##### type

> **type**: `number`

Type code for the property (determines how the value is interpreted)

##### typeArgs?

> `optional` **typeArgs**: `any`

Optional arguments specific to the property type

##### value?

> `optional` **value**: `any`

The property value

***


***

### BlockRef

Represents a reference from one block to another.
References create connections between different blocks in the knowledge graph.

#### Properties

##### alias?

> `optional` **alias**: `string`

Optional alias name used for the reference

##### data?

> `optional` **data**: [`BlockProperty`](#blockproperty)[]

Optional additional properties for the reference

##### from

> **from**: `number`

ID of the block containing the reference

##### id

> **id**: `number`

Unique identifier for the reference

##### to

> **to**: `number`

ID of the block being referenced

##### type

> **type**: `number`

Type code for the reference

***


***

### IdContent

Simple structure containing a block ID and its content.
Used when only ID and content are needed without full block metadata.

#### Properties

##### content

> **content**: [`ContentFragment`](#contentfragment)[]

The block's content fragments, or null if no content

##### id

> **id**: `number`

The block ID

***


***

### BlockForConversion

> **BlockForConversion** = `object`

Simplified block structure used when converting blocks to other formats.

#### Properties

##### children?

> `optional` **children**: [`DbId`](#dbid)[]

IDs of child blocks

##### content?

> `optional` **content**: [`ContentFragment`](#contentfragment)[]

Content fragments in the block

***


***

### BlockRefData

> **BlockRefData** = `Pick`\<[`BlockProperty`](#blockproperty), `"name"` \| `"type"` \| `"value"`\>

Simplified type for block reference data.

***


***

### BlockRenderingMode

> **BlockRenderingMode** = `"normal"` \| `"simple"` \| `"simple-children"`

Block rendering modes

***


***

### ContentFragment

> **ContentFragment** = `object`

Represents a fragment of rich text content within a block.
Different fragment types allow for various content formats like text, links, code, etc.

#### Indexable

\[`key`: `string`\]: `any`

Additional properties can be included based on content type

#### Properties

##### f?

> `optional` **f**: `string`

Optional formatting information

##### fa?

> `optional` **fa**: `Record`\<`string`, `any`\>

Optional formatting arguments

##### t

> **t**: `string`

The type of content fragment (e.g., "text", "code", "link")

##### v

> **v**: `any`

The value of the content fragment

***


***

### Repr

> **Repr** = `object`

Represents a block's structure and type information.
Used by converters and renderers to determine how to handle a block.

#### Indexable

\[`key`: `string`\]: `any`

Additional properties specific to the block type

#### Properties

##### type

> **type**: `string`

The type of the block (e.g., "text", "code", "heading")

***

