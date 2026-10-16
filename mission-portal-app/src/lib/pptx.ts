import { LYRIC_PT, type LyricDeck, type LyricSlide } from '@/lib/lyricSlides'
import { utf8, zip, type ZipEntry } from '@/lib/zip'

/**
 * Lyric slides (lib/lyricSlides) as a PowerPoint file — which PowerPoint,
 * Keynote and Google Slides (uploaded to Drive, or File → Import slides) all
 * open. Widescreen, white capitals on black, centred: what a projector shows
 * best, and what a background can be put behind.
 *
 * Written out part by part, the least a presentation needs: one master, one
 * blank layout, one theme, and a slide each.
 *
 * Pure: the deck in, the file's bytes out.
 */

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/** 16:9, in EMUs (914,400 to the inch): 13⅓ by 7½ inches. */
const WIDE = 12192000
const HIGH = 6858000
/** Half an inch, the text's margin from the slide's edge. */
const EDGE = 457200

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Characters XML can't hold at all.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  )
}

function rels(list: { type: string; target: string }[]): string {
  return (
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list
      .map((r, i) => `<Relationship Id="rId${i + 1}" Type="${r.type}" Target="${r.target}"/>`)
      .join('') +
    '</Relationships>'
  )
}

const EMPTY_TREE =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

/** A run of white text, bold or not, at a size in points. */
function run(text: string, pt: number, bold: boolean, color = 'FFFFFF'): string {
  return (
    `<a:r><a:rPr lang="en-US" sz="${pt * 100}" b="${bold ? 1 : 0}" dirty="0">` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    '<a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:rPr>' +
    `<a:t>${escapeXml(text)}</a:t></a:r>`
  )
}

function paragraph(content: string, spaceBefore = 0): string {
  const before = spaceBefore ? `<a:spcBef><a:spcPts val="${spaceBefore * 100}"/></a:spcBef>` : ''
  return `<a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPct val="110000"/></a:lnSpc>${before}</a:pPr>${content}</a:p>`
}

/** One slide: its words in a box the size of the slide less its margins, centred both ways. */
function slideXml(slide: LyricSlide): string {
  const body =
    slide.kind === 'title'
      ? paragraph(run(slide.title, 54, true)) +
        (slide.artist ? paragraph(run(slide.artist, 24, false, 'BFBFBF'), 18) : '')
      : slide.lines.map((line) => paragraph(run(line, LYRIC_PT, true))).join('')
  return (
    XML +
    `<p:sld ${NS}><p:cSld><p:spTree>${EMPTY_TREE}` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Lyrics"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    `<p:spPr><a:xfrm><a:off x="${EDGE}" y="${EDGE}"/><a:ext cx="${WIDE - 2 * EDGE}" cy="${HIGH - 2 * EDGE}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    '<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="ctr" anchorCtr="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
    body +
    '</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  )
}

const MASTER =
  XML +
  `<p:sldMaster ${NS}><p:cSld>` +
  '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
  `<p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>` +
  // Light on dark: text added to a slide by hand is white too.
  '<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  '<p:txStyles>' +
  '<p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="5400" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
  `<p:bodyStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="${LYRIC_PT * 100}" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle>` +
  '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle>' +
  '</p:txStyles></p:sldMaster>'

const LAYOUT =
  XML +
  `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>` +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'

const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
const THEME =
  XML +
  `<a:theme xmlns:a="${NS_A}" name="Lyrics"><a:themeElements>` +
  '<a:clrScheme name="Lyrics">' +
  '<a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
  '</a:clrScheme>' +
  '<a:fontScheme name="Lyrics">' +
  '<a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
  '</a:fontScheme>' +
  '<a:fmtScheme name="Lyrics">' +
  `<a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst>` +
  '<a:lnStyleLst>' +
  [6350, 12700, 19050].map((w) => `<a:ln w="${w}">${solid}</a:ln>`).join('') +
  '</a:lnStyleLst>' +
  '<a:effectStyleLst>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) +
  '</a:effectStyleLst>' +
  `<a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst>` +
  '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'

const TYPE = 'application/vnd.openxmlformats-officedocument'

/** The deck as a .pptx file's bytes. */
export function lyricPptx(deck: LyricDeck): Uint8Array {
  const slides = deck.slides
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      XML +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/ppt/presentation.xml" ContentType="${TYPE}.presentationml.presentation.main+xml"/>` +
        `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${TYPE}.presentationml.slideMaster+xml"/>` +
        `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${TYPE}.presentationml.slideLayout+xml"/>` +
        `<Override PartName="/ppt/theme/theme1.xml" ContentType="${TYPE}.theme+xml"/>` +
        `<Override PartName="/ppt/presProps.xml" ContentType="${TYPE}.presentationml.presProps+xml"/>` +
        `<Override PartName="/ppt/viewProps.xml" ContentType="${TYPE}.presentationml.viewProps+xml"/>` +
        `<Override PartName="/ppt/tableStyles.xml" ContentType="${TYPE}.presentationml.tableStyles+xml"/>` +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        `<Override PartName="/docProps/app.xml" ContentType="${TYPE}.extended-properties+xml"/>` +
        slides
          .map(
            (_, i) =>
              `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${TYPE}.presentationml.slide+xml"/>`
          )
          .join('') +
        '</Types>',
    ],
    [
      '_rels/.rels',
      rels([
        { type: `${REL}/officeDocument`, target: 'ppt/presentation.xml' },
        {
          type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
          target: 'docProps/core.xml',
        },
        { type: `${REL}/extended-properties`, target: 'docProps/app.xml' },
      ]),
    ],
    [
      'docProps/core.xml',
      XML +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${escapeXml(deck.name)}</dc:title><dc:creator>Miriam</dc:creator>` +
        '</cp:coreProperties>',
    ],
    [
      'docProps/app.xml',
      XML +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        `<Application>Mission Portal</Application><Slides>${slides.length}</Slides>` +
        '</Properties>',
    ],
    [
      'ppt/presentation.xml',
      XML +
        `<p:presentation ${NS} saveSubsetFonts="1">` +
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        '<p:sldIdLst>' +
        slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('') +
        '</p:sldIdLst>' +
        `<p:sldSz cx="${WIDE}" cy="${HIGH}"/><p:notesSz cx="${HIGH}" cy="9144000"/>` +
        '</p:presentation>',
    ],
    [
      'ppt/_rels/presentation.xml.rels',
      rels([
        { type: `${REL}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
        ...slides.map((_, i) => ({ type: `${REL}/slide`, target: `slides/slide${i + 1}.xml` })),
        { type: `${REL}/presProps`, target: 'presProps.xml' },
        { type: `${REL}/viewProps`, target: 'viewProps.xml' },
        { type: `${REL}/theme`, target: 'theme/theme1.xml' },
        { type: `${REL}/tableStyles`, target: 'tableStyles.xml' },
      ]),
    ],
    ['ppt/presProps.xml', `${XML}<p:presentationPr ${NS}/>`],
    ['ppt/viewProps.xml', `${XML}<p:viewPr ${NS}/>`],
    [
      'ppt/tableStyles.xml',
      `${XML}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    ],
    ['ppt/slideMasters/slideMaster1.xml', MASTER],
    [
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      rels([
        { type: `${REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' },
        { type: `${REL}/theme`, target: '../theme/theme1.xml' },
      ]),
    ],
    ['ppt/slideLayouts/slideLayout1.xml', LAYOUT],
    [
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      rels([{ type: `${REL}/slideMaster`, target: '../slideMasters/slideMaster1.xml' }]),
    ],
    ['ppt/theme/theme1.xml', THEME],
    ...slides.flatMap((slide, i): [string, string][] => [
      [`ppt/slides/slide${i + 1}.xml`, slideXml(slide)],
      [
        `ppt/slides/_rels/slide${i + 1}.xml.rels`,
        rels([{ type: `${REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' }]),
      ],
    ]),
  ]
  return zip(files.map(([name, text]): ZipEntry => ({ name, data: utf8(text) })))
}

/**
 * A file name for the deck: its name, with only what a file name — and a
 * phone's path to it — holds safely.
 */
export function pptxName(deck: LyricDeck): string {
  const base = deck.name
    .replace(/[^A-Za-z0-9 '’\-_(),.\u00C0-\u024F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim()
  return `${base || 'Lyrics'} - slides.pptx`
}
