/**
 * Minimal programmatic EPUB fixtures for deterministic tests.
 */

import JSZip from "jszip"

export async function buildMinimalEpub3(options?: {
  title?: string
  author?: string
  chapters?: Array<{ id: string; href: string; title: string; body: string }>
  withImage?: boolean
}): Promise<ArrayBuffer> {
  const title = options?.title ?? "Test Book"
  const author = options?.author ?? "Test Author"
  const chapters = options?.chapters ?? [
    {
      id: "c1",
      href: "chapter1.xhtml",
      title: "第一章",
      body: "<h1>第一章</h1><p>Hello one.</p>"
    },
    {
      id: "c2",
      href: "chapter2.xhtml",
      title: "第二章",
      body: "<h1>第二章</h1><p>Hello two.</p>"
    }
  ]

  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" })
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )

  const manifestItems = chapters
    .map(
      (ch) =>
        `    <item id="${ch.id}" href="${ch.href}" media-type="application/xhtml+xml"/>`
    )
    .join("\n")
  const spine = chapters.map((ch) => `    <itemref idref="${ch.id}"/>`).join("\n")
  const navLinks = chapters
    .map((ch) => `        <li><a href="${ch.href}">${ch.title}</a></li>`)
    .join("\n")

  const imageItem = options?.withImage
    ? `    <item id="img1" href="images/dot.png" media-type="image/png"/>`
    : ""

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>zh</dc:language>
    <dc:identifier id="uid">test-book-1</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
${imageItem}
  </manifest>
  <spine>
${spine}
  </spine>
</package>`
  )

  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc" class="toc">
      <ol>
${navLinks}
      </ol>
    </nav>
  </body>
</html>`
  )

  for (const ch of chapters) {
    let body = ch.body
    if (options?.withImage && ch.id === chapters[0].id) {
      body = `${body}<p><img src="images/dot.png" alt="dot"/></p>`
    }
    zip.file(
      `OEBPS/${ch.href}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>${body}</body>
</html>`
    )
  }

  if (options?.withImage) {
    // 1x1 PNG
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
    ])
    zip.file("OEBPS/images/dot.png", png)
  }

  const out = await zip.generateAsync({ type: "arraybuffer" })
  return out
}

export async function buildEpub2Ncx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" })
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>EPUB2 Book</dc:title>
    <dc:creator>NCX Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">epub2-1</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`
  )
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1">
      <navLabel><text>NCX Chapter A</text></navLabel>
      <content src="c1.xhtml"/>
    </navPoint>
    <navPoint id="n2">
      <navLabel><text>NCX Chapter B</text></navLabel>
      <content src="c2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`
  )
  zip.file("OEBPS/c1.xhtml", `<html><body><p>A</p></body></html>`)
  zip.file("OEBPS/c2.xhtml", `<html><body><p>B</p></body></html>`)
  return zip.generateAsync({ type: "arraybuffer" })
}

export async function buildEpub2WithFrontMatter(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" })
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`
  )
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
<package version="2.0"><metadata><title>Front Matter</title><creator>A</creator></metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="x_coverpage" href="Text/cover_page.xhtml" media-type="application/xhtml+xml"/>
    <item id="titlepage" href="Text/title.xhtml" media-type="application/xhtml+xml"/>
    <item id="dedication" href="Text/BW0575.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="x_coverpage" linear="no"/>
    <itemref idref="titlepage"/>
    <itemref idref="dedication"/>
    <itemref idref="chapter"/>
  </spine>
  <guide><reference type="cover" href="Text/cover_page.xhtml" title="Cover"/></guide>
</package>`
  )
  zip.file(
    "OEBPS/toc.ncx",
    `<ncx><navMap><navPoint><navLabel><text>第一章 正文</text></navLabel><content src="Text/chapter.xhtml"/></navPoint></navMap></ncx>`
  )
  zip.file("OEBPS/Text/cover_page.xhtml", `<html><head><title>Cover</title></head><body><img src="cover.jpg"/></body></html>`)
  zip.file("OEBPS/Text/title.xhtml", `<html><head><title>书名页</title></head><body><img src="title.jpg"/></body></html>`)
  zip.file(
    "OEBPS/Text/BW0575.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>BW0575</title><script src="kobo.js"/></head><body><p>致学习旅途上的种种刺激</p></body></html>`
  )
  zip.file("OEBPS/Text/chapter.xhtml", `<html><head><title>chapter</title></head><body><p>正文内容</p></body></html>`)
  return zip.generateAsync({ type: "arraybuffer" })
}

export async function buildInvalidContainerEpub(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" })
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container><rootfiles></rootfiles></container>`
  )
  return zip.generateAsync({ type: "arraybuffer" })
}

/**
 * EPUB 3 where nav lives under Text/ and links use `../Text/...` paths.
 * Mirrors real books where string-equality matching against spine href fails.
 */
export async function buildEpub3NavRelativePaths(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" })
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Logic Book</dc:title>
    <dc:creator>Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">logic-1</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="Text/chapter001.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/chapter002.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`
  )
  zip.file(
    "OEBPS/Text/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc" class="toc">
      <ol>
        <li><a href="../Text/chapter001.xhtml">1 Why logic?</a></li>
        <li><a href="../Text/chapter002.xhtml">2 What is logic?</a></li>
      </ol>
    </nav>
  </body>
</html>`
  )
  zip.file(
    "OEBPS/Text/chapter001.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1 class="chapter-number">1</h1>
    <h1 class="chapter-title">WHY LOGIC?</h1>
    <p>Body of chapter one.</p>
    <h2>A section later</h2>
    <p>Section body.</p>
  </body>
</html>`
  )
  zip.file(
    "OEBPS/Text/chapter002.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1 class="chapter-number">2</h1>
    <h1 class="chapter-title">WHAT IS LOGIC?</h1>
    <p>Body of chapter two.</p>
  </body>
</html>`
  )
  return zip.generateAsync({ type: "arraybuffer" })
}

/**
 * Nav exists but its links never match spine hrefs (wrong paths).
 * NCX has correct relative links and should fill titles.
 */
export async function buildEpubNavZeroMatchNcxFallback(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" })
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Dual TOC Book</dc:title>
    <dc:creator>Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">dual-toc-1</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`
  )
  // Broken nav links that will never match spine after normalization.
  zip.file(
    "OEBPS/Text/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc" class="toc">
      <ol>
        <li><a href="missing/c1.xhtml">Broken Nav A</a></li>
        <li><a href="missing/c2.xhtml">Broken Nav B</a></li>
      </ol>
    </nav>
  </body>
</html>`
  )
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1">
      <navLabel><text>NCX Fallback A</text></navLabel>
      <content src="Text/c1.xhtml"/>
    </navPoint>
    <navPoint id="n2">
      <navLabel><text>NCX Fallback B</text></navLabel>
      <content src="Text/c2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`
  )
  zip.file(
    "OEBPS/Text/c1.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>1</h1><p>A</p></body></html>`
  )
  zip.file(
    "OEBPS/Text/c2.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>2</h1><p>B</p></body></html>`
  )
  return zip.generateAsync({ type: "arraybuffer" })
}
