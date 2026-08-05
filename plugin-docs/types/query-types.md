[**Orca API Documentation**](../README.md) / [types](README.md) / Query Types

# Query & Database Types

Types and interfaces for block querying, journal searches, tag filters, and AST query conditions.


***

### QueryBlock

Query condition that matches blocks according their properties.

#### Properties

##### created?

> `optional` **created**: `object`

Whether to match blocks with a specific creation date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### hasAliases?

> `optional` **hasAliases**: `boolean`

Whether to match blocks with aliases

##### hasBackRefs?

> `optional` **hasBackRefs**: `boolean`

Whether to match blocks with back references

##### hasChild?

> `optional` **hasChild**: `boolean`

Whether to match blocks with a child

##### hasParent?

> `optional` **hasParent**: `boolean`

Whether to match blocks with a parent

##### hasTags?

> `optional` **hasTags**: `boolean`

Whether to match blocks with tags

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `9`

Kind identifier for block queries (9)

##### modified?

> `optional` **modified**: `object`

Whether to match blocks with a specific modification date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### types?

> `optional` **types**: `object`

The block types to match or not match

###### op?

> `optional` **op**: `5` \| `6`

###### value?

> `optional` **value**: `string`[]

***


***

### QueryBlock2

Query condition that matches blocks according their properties.

#### Properties

##### backRefs?

> `optional` **backRefs**: `object`

Whether to match blocks with a specific number of back references

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `number`

##### created?

> `optional` **created**: `object`

Whether to match blocks with a specific creation date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### hasAliases?

> `optional` **hasAliases**: `boolean`

Whether to match blocks with aliases

##### hasChild?

> `optional` **hasChild**: `boolean`

Whether to match blocks with a child

##### hasContent?

> `optional` **hasContent**: `boolean`

Whether to match blocks with content

##### hasParent?

> `optional` **hasParent**: `boolean`

Whether to match blocks with a parent

##### hasRefs?

> `optional` **hasRefs**: `boolean`

Whether to match blocks with outgoing references

##### hasTags?

> `optional` **hasTags**: `boolean`

Whether to match blocks with tags

##### kind

> **kind**: `9`

Kind identifier for block queries (9)

##### modified?

> `optional` **modified**: `object`

Whether to match blocks with a specific modification date

###### op?

> `optional` **op**: `1` \| `2` \| `7` \| `8` \| `9` \| `10`

###### value?

> `optional` **value**: `Date` \| [`QueryJournalDate`](#queryjournaldate)

##### types?

> `optional` **types**: `object`

The block types to match or not match

###### op?

> `optional` **op**: `5` \| `6`

###### value?

> `optional` **value**: `string`[]

***


***

### QueryBlockMatch2

Query condition that matches specific blocks by their ID.

#### Properties

##### blockId?

> `optional` **blockId**: `number`

ID of the specific block to match

##### kind

> **kind**: `12`

Kind identifier for block match queries (12)

***


***

### QueryDescription

Describes a query for searching and filtering blocks.
Used to construct complex queries that can combine multiple conditions.

#### Properties

##### asCalendar?

> `optional` **asCalendar**: `object`

Calendar view configuration if results should be displayed in calendar format

###### end

> **end**: `Date`

End date for the calendar range

###### field

> **field**: `"created"` \| `"modified"` \| `"journal"`

Field to use for calendar date (created/modified/journal date)

###### start

> **start**: `Date`

Start date for the calendar range

##### asTable?

> `optional` **asTable**: `boolean`

Whether to format results as a table

##### excludeId?

> `optional` **excludeId**: `number`

Optional block ID to exclude from results

##### group?

> `optional` **group**: `string`

Specifies which group to return results for

##### groupBy?

> `optional` **groupBy**: `string`

Field to group results by

##### page?

> `optional` **page**: `number`

For paginated results, the page number (0-based)

##### pageSize?

> `optional` **pageSize**: `number`

For paginated results, the number of items per page

##### q?

> `optional` **q**: [`QueryGroup`](#querygroup)

The main query group with conditions

##### sort?

> `optional` **sort**: [`QuerySort`](#querysort)[]

Array of sort specifications for ordering results

##### stats?

> `optional` **stats**: [`QueryStat`](#querystat)[]

Statistical calculations to perform on results

##### tagName?

> `optional` **tagName**: `string`

Filters results to blocks with a specific tag

***


***

### QueryDescription2

Describes a query for searching and filtering blocks.
Used to construct complex queries that can combine multiple conditions.

#### Properties

##### asCalendar?

> `optional` **asCalendar**: `object`

Calendar view configuration if results should be displayed in calendar format

###### end

> **end**: `Date`

End date for the calendar range

###### field

> **field**: `"created"` \| `"modified"` \| `"journal"`

Field to use for calendar date (created/modified/journal date)

###### start

> **start**: `Date`

Start date for the calendar range

##### asTable?

> `optional` **asTable**: `boolean`

Whether to format results as a table

##### excludeId?

> `optional` **excludeId**: `number`

Optional block ID to exclude from results

##### group?

> `optional` **group**: `string`

Specifies which group to return results for

##### groupBy?

> `optional` **groupBy**: `string`

Field to group results by

##### page?

> `optional` **page**: `number`

For paginated results, the page number (0-based)

##### pageSize?

> `optional` **pageSize**: `number`

For paginated results, the number of items per page

##### q?

> `optional` **q**: [`QueryGroup2`](#querygroup2)

The main query group with conditions

##### randomSeed?

> `optional` **randomSeed**: `number`

Random seed for stable random sorting across pagination

##### referenceDate?

> `optional` **referenceDate**: `number`

The reference date for relative dates (Unix timestamp)

##### sort?

> `optional` **sort**: [`QuerySort`](#querysort)[]

Array of sort specifications for ordering results

##### stats?

> `optional` **stats**: [`QueryStat`](#querystat)[]

Statistical calculations to perform on results

##### tagName?

> `optional` **tagName**: `string`

Filters results to blocks with a specific tag

##### useReferenceDate?

> `optional` **useReferenceDate**: `boolean`

Whether to use the current page's date as the reference for relative dates

***


***

### QueryFormat2

Query condition that matches content fragments with specific format.

#### Properties

##### f

> **f**: `string`

The format identifier (e.g., 'b', 'i', 'c')

##### fa?

> `optional` **fa**: `Record`\<`string`, `any`\>

The format attributes for precise matching

##### kind

> **kind**: `13`

Kind identifier for format queries (13)

***


***

### QueryGroup

A group of query conditions combined with a logical operator.
Used to create complex queries with multiple conditions.

#### Properties

##### conditions

> **conditions**: [`QueryItem`](#queryitem)[]

Array of conditions within this group

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `1` \| `2`

Kind of group: 1 for AND, 2 for OR

##### subConditions?

> `optional` **subConditions**: [`QueryGroup`](#querygroup)

Optional conditions that apply to descendant blocks

***


***

### QueryGroup2

A group of query conditions combined with a logical operator.
Used to create complex queries with multiple conditions.

#### Properties

##### conditions

> **conditions**: [`QueryItem2`](#queryitem2)[]

Array of conditions within this group

##### kind

> **kind**: `100` \| `101` \| `102` \| `103` \| `104` \| `105` \| `106`

Kind of group: self/ancestor/descendant/chain

##### negate?

> `optional` **negate**: `boolean`

Whether to negate the conditions in this group

***


***

### QueryJournal

Query condition that matches journal blocks in a date range.

#### Properties

##### end

> **end**: [`QueryJournalDate`](#queryjournaldate)

End date for the journal range

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `3`

Kind identifier for journal queries (3)

##### start

> **start**: [`QueryJournalDate`](#queryjournaldate)

Start date for the journal range

***


***

### QueryJournal2

Query condition that matches journal blocks in a date range.

#### Properties

##### end

> **end**: [`QueryJournalDate`](#queryjournaldate)

End date for the journal range

##### kind

> **kind**: `3`

Kind identifier for journal queries (3)

##### start

> **start**: [`QueryJournalDate`](#queryjournaldate)

Start date for the journal range

***


***

### QueryJournalDate

Represents a date specification for journal queries.
Can be relative (e.g., "2 days ago") or absolute.

#### Properties

##### t

> **t**: `1` \| `2`

Type of date: 1 for relative, 2 for full/absolute date

##### u?

> `optional` **u**: `"s"` \| `"m"` \| `"h"` \| `"d"` \| `"w"` \| `"M"` \| `"y"`

For relative dates, the unit (s=seconds, m=minutes, h=hours, d=days, w=weeks, M=months, y=years)

##### v?

> `optional` **v**: `number`

For relative dates, the numeric value (e.g., 2 in "2 days ago")

***


***

### QueryNoRef

Query condition that matches blocks not referencing a specific block.

#### Properties

##### blockId

> **blockId**: `number`

ID of the block that should not be referenced

##### kind

> **kind**: `7`

Kind identifier for no-reference queries (7)

***


***

### QueryNoTag

Query condition that matches blocks without a specific tag.

#### Properties

##### kind

> **kind**: `5`

Kind identifier for no-tag queries (5)

##### name

> **name**: `string`

The tag name that should not be present

***


***

### QueryRef

Query condition that matches blocks referencing a specific block.

#### Properties

##### blockId

> **blockId**: `number`

ID of the block that should be referenced

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `6`

Kind identifier for reference queries (6)

***


***

### QueryRef2

Query condition that matches blocks referencing a specific block.

#### Properties

##### blockId?

> `optional` **blockId**: `number`

ID of the block that should be referenced

##### kind

> **kind**: `6`

Kind identifier for reference queries (6)

##### selfOnly?

> `optional` **selfOnly**: `boolean`

Only show direct references, not references to included tags

***


***

### QueryTag

Query condition that matches blocks with a specific tag.
Can also match based on tag properties.

#### Properties

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `4`

Kind identifier for tag queries (4)

##### name

> **name**: `string`

The tag name to match

##### properties?

> `optional` **properties**: [`QueryTagProperty`](#querytagproperty)[]

Optional property conditions for the tag

***


***

### QueryTag2

Query condition that matches blocks with a specific tag.
Can also match based on tag properties.

#### Properties

##### kind

> **kind**: `4`

Kind identifier for tag queries (4)

##### name

> **name**: `string`

The tag name to match

##### properties?

> `optional` **properties**: [`QueryTagProperty`](#querytagproperty)[]

Optional property conditions for the tag

##### selfOnly?

> `optional` **selfOnly**: `boolean`

Only show direct tag references, not references to included tags

***


***

### QueryTagProperty

Condition for querying tag properties with specific values.

#### Properties

##### name

> **name**: `string`

Name of the tag property

##### op?

> `optional` **op**: `1` \| `2` \| `3` \| `4` \| `5` \| `6` \| `7` \| `8` \| `9` \| `10` \| `11` \| `12`

Operation to perform (equals, not equals, etc.)

##### type?

> `optional` **type**: `number`

Optional type code for the property

##### typeArgs?

> `optional` **typeArgs**: `any`

Optional type arguments

##### value?

> `optional` **value**: `any`

Value to compare against

***


***

### QueryTask

Query condition that matches task blocks

#### Properties

##### completed?

> `optional` **completed**: `boolean`

Whether the task is completed

##### kind

> **kind**: `11`

Kind identifier for task queries (11)

***


***

### QueryText

Query condition that matches blocks containing specific text.

#### Properties

##### includeDescendants?

> `optional` **includeDescendants**: `boolean`

Whether to include descendant blocks in results

##### kind

> **kind**: `8`

Kind identifier for text queries (8)

##### raw?

> `optional` **raw**: `boolean`

Whether to perform raw text search (no stemming/normalization)

##### text

> **text**: `string`

The text to search for

***


***

### QueryText2

Query condition that matches blocks containing specific text.

#### Properties

##### kind

> **kind**: `8`

Kind identifier for text queries (8)

##### raw?

> `optional` **raw**: `boolean`

Whether to perform raw text search (no stemming/normalization)

##### text

> **text**: `string`

The text to search for

***


***

### QueryEq

> **QueryEq** = `1`

Operation constant: equals.
Matches if a value is equal to the specified value.

***


***

### QueryGe

> **QueryGe** = `9`

Operation constant: greater than or equal to.
Matches if a value is greater than or equal to the specified value.

***


***

### QueryGt

> **QueryGt** = `7`

Operation constant: greater than.
Matches if a value is greater than the specified value.

***


***

### QueryHas

> **QueryHas** = `5`

Operation constant: has property.
Matches if an object has the specified property.

***


***

### QueryIncludes

> **QueryIncludes** = `3`

Operation constant: includes.
Matches if an array value includes the specified value.

***


***

### QueryItem

> **QueryItem** = [`QueryGroup`](#querygroup) \| [`QueryText`](#querytext) \| [`QueryTag`](#querytag) \| [`QueryRef`](#queryref) \| [`QueryJournal`](#queryjournal) \| [`QueryBlock`](#queryblock) \| `QueryNoText` \| [`QueryNoTag`](#querynotag) \| [`QueryNoRef`](#querynoref)

Union type representing all possible query condition items.
Each item represents a different type of condition that can be used in queries.

***


***

### QueryItem2

> **QueryItem2** = [`QueryGroup2`](#querygroup2) \| [`QueryText2`](#querytext2) \| [`QueryTag2`](#querytag2) \| [`QueryRef2`](#queryref2) \| [`QueryJournal2`](#queryjournal2) \| [`QueryBlock2`](#queryblock2) \| [`QueryBlockMatch2`](#queryblockmatch2) \| [`QueryTask`](#querytask) \| [`QueryFormat2`](#queryformat2)

Union type representing all possible query condition items.
Each item represents a different type of condition that can be used in queries.

***


***

### QueryJournalFull

> **QueryJournalFull** = `2`

Constant for absolute date specification in journal queries.
Used for specific dates.

***


***

### QueryJournalRelative

> **QueryJournalRelative** = `1`

Constant for relative date specification in journal queries.
Used for dates like "2 days ago" or "next week".

***


***

### QueryKindAncestorAnd

> **QueryKindAncestorAnd** = `102`

Constant for the ancestor AND group type.

***


***

### QueryKindAncestorOr

> **QueryKindAncestorOr** = `103`

Constant for the ancestor OR group type.

***


***

### QueryKindAnd

> **QueryKindAnd** = `1`

Constant for the AND query group type.
All conditions must match for the group to match.

***


***

### QueryKindBlock

> **QueryKindBlock** = `9`

Constant for the block query type.
Matches blocks according to their properties.

***


***

### QueryKindBlockMatch

> **QueryKindBlockMatch** = `12`

Constant for the block match query type.
Matches specific blocks by their ID.

***


***

### QueryKindChainAnd

> **QueryKindChainAnd** = `106`

Constant for the chain AND group type.

***


***

### QueryKindDescendantAnd

> **QueryKindDescendantAnd** = `104`

Constant for the descendant AND group type.

***


***

### QueryKindDescendantOr

> **QueryKindDescendantOr** = `105`

Constant for the descendant OR group type.

***


***

### QueryKindFormat

> **QueryKindFormat** = `13`

Constant for the content format query type.
Matches blocks containing specific formatting in content.

***


***

### QueryKindJournal

> **QueryKindJournal** = `3`

Constant for the journal query type.
Matches blocks in journal date range.

***


***

### QueryKindNoRef

> **QueryKindNoRef** = `7`

Constant for the no-reference query type.
Matches blocks not referencing other blocks.

***


***

### QueryKindNoTag

> **QueryKindNoTag** = `5`

Constant for the no-tag query type.
Matches blocks without specific tags.

***


***

### QueryKindNoText

> **QueryKindNoText** = `10`

Constant for the no-text query type.
Matches blocks without specific text.

***


***

### QueryKindOr

> **QueryKindOr** = `2`

Constant for the OR query group type.
At least one condition must match for the group to match.

***


***

### QueryKindRef

> **QueryKindRef** = `6`

Constant for the reference query type.
Matches blocks referencing other blocks.

***


***

### QueryKindSelfAnd

> **QueryKindSelfAnd** = `100`

Constant for the self AND group type.

***


***

### QueryKindSelfOr

> **QueryKindSelfOr** = `101`

Constant for the self OR group type.

***


***

### QueryKindTag

> **QueryKindTag** = `4`

Constant for the tag query type.
Matches blocks with specific tags.

***


***

### QueryKindTask

> **QueryKindTask** = `11`

Constant for the task query type.
Matches blocks that are tasks, optionally filtering by completion status.

***


***

### QueryKindText

> **QueryKindText** = `8`

Constant for the text query type.
Matches blocks containing specific text.

***


***

### QueryLe

> **QueryLe** = `10`

Operation constant: less than or equal to.
Matches if a value is less than or equal to the specified value.

***


***

### QueryLt

> **QueryLt** = `8`

Operation constant: less than.
Matches if a value is less than the specified value.

***


***

### QueryNotEq

> **QueryNotEq** = `2`

Operation constant: not equals.
Matches if a value is not equal to the specified value.

***


***

### QueryNotHas

> **QueryNotHas** = `6`

Operation constant: doesn't have property.
Matches if an object doesn't have the specified property.

***


***

### QueryNotIncludes

> **QueryNotIncludes** = `4`

Operation constant: not includes.
Matches if an array value doesn't include the specified value.

***


***

### QueryNotNull

> **QueryNotNull** = `12`

Operation constant: is not null.
Matches if a value is neither null nor undefined.

***


***

### QueryNull

> **QueryNull** = `11`

Operation constant: is null.
Matches if a value is null or undefined.

***


***

### QuerySort

> **QuerySort** = \[`string`, `"ASC"` \| `"DESC"`\]

Specifies sorting for query results.
A tuple of field name and direction.

***


***

### QueryStat

> **QueryStat** = `""` \| `"count"` \| `"count_e"` \| `"count_ne"` \| `"sum"` \| `"avg"` \| `"min"` \| `"max"` \| `"percent_e"` \| `"percent_ne"`

Types of statistical operations that can be performed on query results.

***

