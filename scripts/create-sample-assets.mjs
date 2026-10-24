// Original illustrations and sample goods authored for CommerceCore. No external assets.
import { mkdirSync, writeFileSync } from 'node:fs';
import { applyPhotoCatalog } from './apply-photo-catalog.mjs';
const output = new URL('../public/images/', import.meta.url);
mkdirSync(output, { recursive: true });
const defs = `<defs>
<linearGradient id="body"><stop stop-color="#617c6b"/><stop offset=".48" stop-color="#91a58e"/><stop offset="1" stop-color="#587563"/></linearGradient>
<linearGradient id="ceramic"><stop stop-color="#b69e82"/><stop offset=".38" stop-color="#e2d3bd"/><stop offset="1" stop-color="#bfa78a"/></linearGradient>
<linearGradient id="fabric" x2="1" y2="1"><stop stop-color="#e3d6bd"/><stop offset=".55" stop-color="#d4c09d"/><stop offset="1" stop-color="#bba27f"/></linearGradient>
<linearGradient id="ink"><stop stop-color="#284039"/><stop offset=".5" stop-color="#435b52"/><stop offset="1" stop-color="#1e332f"/></linearGradient>
<radialGradient id="light" cx=".25" cy=".12" r="1"><stop stop-color="#fcfaf6"/><stop offset="1" stop-color="#e5e0d6"/></radialGradient>
<filter id="shadow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="10"/></filter>
<pattern id="weave" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0h5M0 0v5" stroke="#6b5139" stroke-opacity=".09" stroke-width=".6"/></pattern>
</defs>`;
const shadow =
  '<ellipse cx="338" cy="514" rx="151" ry="15" fill="#635641" opacity=".17" filter="url(#shadow)"/>';
const shapes = {
  lamp: '<ellipse cx="323" cy="505" rx="94" ry="17" fill="url(#body)"/><ellipse cx="323" cy="499" rx="94" ry="15" fill="#8fa58f"/><path d="M321 486V282q0-74 88-74" fill="none" stroke="#677e6c" stroke-width="14"/><path d="M321 486V284q0-75 83-75" fill="none" stroke="#a1b19a" stroke-width="4"/><path d="M345 209q22-98 68-71 51 30 57 101z" fill="url(#body)"/><ellipse cx="407" cy="225" rx="65" ry="14" transform="rotate(13 407 225)" fill="#d4cfac"/><ellipse cx="407" cy="224" rx="48" ry="9" transform="rotate(13 407 224)" fill="#f4eaca"/>',
  tote: '<path d="M225 259q5-113 89-113 78 0 91 113" fill="none" stroke="#b79e78" stroke-width="21"/><path d="M261 253q-7-89 56-89 66 0 61 90" fill="none" stroke="#dccbab" stroke-width="13"/><path d="M190 245l247 6 22 249q-128 44-289 0z" fill="url(#fabric)"/><path d="M190 245l247 6 22 249q-128 44-289 0z" fill="url(#weave)"/><path d="M206 264l-13 221m229-219 14 218" stroke="#f2e8d2" stroke-width="3"/><path d="M275 251v66m85-64v66" stroke="#b99d73" stroke-width="16"/><path d="M253 379h112v72H253z" fill="#d5c09b" stroke="#bba17a"/><path d="M277 404h63" stroke="#a38966"/>',
  cup: '<path d="M395 305q107-14 69 97-21 40-65 21" fill="none" stroke="#b69f83" stroke-width="30"/><path d="M394 310q89-7 54 81-17 29-42 20" fill="none" stroke="#d9c8ae" stroke-width="16"/><path d="M199 295h204l-17 173q-82 58-170 0z" fill="url(#ceramic)"/><ellipse cx="301" cy="295" rx="102" ry="25" fill="#eadcc7"/><ellipse cx="301" cy="297" rx="87" ry="17" fill="#8b745b"/><ellipse cx="301" cy="301" rx="82" ry="13" fill="#a58c6f"/><path d="M221 326l9 119" stroke="#f0e2cc" stroke-opacity=".6" stroke-width="4"/>',
  notebook:
    '<path d="m201 197 216-23 18 306-215 32z" fill="#b29c75"/><path d="m220 493 210-31v22l-210 32z" fill="#ede5d2"/><path d="m196 190 217-24 18 306-214 32z" fill="url(#body)"/><path d="m212 188 20 307" stroke="#516954" stroke-width="4"/><path d="m399 168 14 306" stroke="#334d3b" stroke-width="9"/><path d="m250 277 111-13m-110 26 85-10" stroke="#d0d8bd" stroke-opacity=".7" stroke-width="2"/><path d="m342 491 13 27 16-31" fill="#997b4e"/>',
  bottle:
    '<path d="M278 196h81v45q42 21 42 63v183q0 32-83 32-79 0-79-32V304q0-44 39-63z" fill="url(#body)"/><rect x="278" y="158" width="81" height="53" rx="12" fill="url(#ink)"/><ellipse cx="319" cy="159" rx="40" ry="8" fill="#52675c"/><path d="M266 295v187" stroke="#b4c3a7" stroke-width="5" stroke-opacity=".5"/><path d="M296 358h47" stroke="#435f4c" stroke-width="2"/>',
  vase: '<path d="M285 184h77l-7 100q82 51 73 150-11 95-112 77-107 10-110-80-3-98 86-147z" fill="url(#ceramic)"/><ellipse cx="323" cy="183" rx="39" ry="10" fill="#9f866c"/><ellipse cx="323" cy="182" rx="29" ry="6" fill="#6e614f"/><path d="M263 312q-35 44-27 104" fill="none" stroke="#eadcc7" stroke-width="5" stroke-opacity=".7"/>',
  clock:
    '<rect x="259" y="470" width="124" height="26" rx="10" fill="#ad9271"/><circle cx="320" cy="330" r="146" fill="url(#fabric)"/><circle cx="320" cy="330" r="130" fill="#f7f1e5"/><circle cx="320" cy="330" r="120" fill="none" stroke="#dfd5c2"/><path d="M320 220v10m0 200v10M210 330h10m200 0h10" stroke="#8e806a" stroke-width="3"/><path d="m320 270 0 60 67 36" fill="none" stroke="#354e42" stroke-width="8" stroke-linecap="round"/><circle cx="320" cy="330" r="8" fill="#a28b6b"/>',
  tray: '<ellipse cx="320" cy="389" rx="190" ry="110" fill="#a18562"/><ellipse cx="320" cy="370" rx="190" ry="105" fill="url(#fabric)"/><ellipse cx="320" cy="370" rx="164" ry="82" fill="#c9ac80"/><ellipse cx="320" cy="367" rx="153" ry="73" fill="#ddc6a0"/><path d="M188 360q136-66 271 5M174 381q138-62 291 2" fill="none" stroke="#bea079" stroke-opacity=".25" stroke-width="2"/>',
  speaker:
    '<rect x="206" y="211" width="228" height="286" rx="42" fill="url(#ink)"/><rect x="219" y="225" width="202" height="255" rx="32" fill="#546258"/><rect x="219" y="225" width="202" height="255" rx="32" fill="url(#weave)"/><circle cx="320" cy="297" r="31" fill="#38483d"/><circle cx="320" cy="297" r="24" fill="#6c7867"/><circle cx="320" cy="405" r="56" fill="#324539"/><circle cx="320" cy="405" r="42" fill="#4b5c4b"/><circle cx="320" cy="405" r="17" fill="#74816b"/>',
  pouch:
    '<path d="m177 299 266-26 33 191q-148 61-286 34z" fill="url(#fabric)"/><path d="m177 299 266-26 33 191q-148 61-286 34z" fill="url(#weave)"/><path d="m184 305 256-24" stroke="#8b7659" stroke-width="8"/><path d="m438 282 22 4 4 28" fill="none" stroke="#6f624f" stroke-width="5"/><path d="m207 451 230-20" stroke="#e7d9c0" stroke-width="3"/><rect x="287" y="368" width="54" height="27" rx="3" fill="#e4d3b3"/>',
  umbrella:
    '<path d="M320 179v290q0 63 47 37" stroke="#9a8466" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M127 333q27-137 193-160 166 24 193 160-47-38-95 0-48-40-98 0-49-40-98 0-48-40-95 0z" fill="url(#body)"/><path d="M320 175q-94 60-98 158m98-158q93 60 98 158m-98-158v158" fill="none" stroke="#4e6856" stroke-width="2"/><path d="M320 177v-19" stroke="#586e5c" stroke-width="5"/>',
  throw:
    '<path d="m184 255 223-47 62 228-229 67z" fill="#c9b8a0"/><path d="m184 255 223-47 62 228-229 67z" fill="url(#weave)"/><path d="m189 277 214-45m-201 83 213-48m-201 86 213-49m-201 89 213-51m-201 88 212-50" stroke="#e6d9c4" stroke-width="16"/><path d="m229 474 224-59 16 21-229 67z" fill="#b6a083"/><path d="m245 496 1 24m16-30 1 24m16-29 1 24m16-29 1 24m16-30 1 24m16-29 1 24m16-29 1 24m16-29 1 24m16-30 1 24m16-29 1 24m16-29 1 24m16-29 1 24" stroke="#baa88d" stroke-width="3"/>',
};
function artwork(shape) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><title>Original CommerceCore sample product illustration</title>${defs}<rect width="640" height="640" fill="#eeeae2"/><rect width="640" height="640" fill="url(#light)" opacity=".55"/><path d="M0 496h640" stroke="#b6aa92" stroke-opacity=".11"/>${shadow}${shape}</svg>`;
}
for (const [name, shape] of Object.entries(shapes)) {
  const alternate = shape
    .replaceAll('url(#body)', 'url(#ink)')
    .replaceAll('url(#ceramic)', 'url(#fabric)')
    .replaceAll('url(#fabric)', 'url(#ink)')
    .replaceAll('#c9b8a0', '#979c91')
    .replaceAll('#e6d9c4', '#c8cdc1')
    .replaceAll('#b6a083', '#7d8476');
  writeFileSync(new URL(`${name}.svg`, output), artwork(shape));
  writeFileSync(new URL(`${name}-alt.svg`, output), artwork(alternate));
  writeFileSync(
    new URL(`${name}-detail.svg`, output),
    artwork(`<g transform="translate(-85 -110) scale(1.28)">${shape}</g>`),
  );
  writeFileSync(
    new URL(`${name}-alt-detail.svg`, output),
    artwork(`<g transform="translate(-85 -110) scale(1.28)">${alternate}</g>`),
  );
}
writeFileSync(
  new URL('studio.svg', output),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 850"><title>A considered workspace, original illustration</title>${defs}<rect width="900" height="850" fill="#e8e5da"/><path d="M630 0h270v560H630z" fill="#f2eddf"/><path d="m580 0-220 535H45L250 0z" fill="#f7f4e9" opacity=".5"/><path d="M0 570h900v280H0z" fill="#c8b594"/><path d="M0 570h900" stroke="#bba581" stroke-width="5"/><g transform="translate(180 30) scale(1.09)">${shadow}${shapes.lamp}</g><g transform="translate(-85 330) scale(.61)">${shadow}${shapes.notebook}</g><g transform="translate(50 310) scale(.58)">${shadow}${shapes.cup}</g><path d="M754 605V267" stroke="#6c7a56" stroke-width="4"/><path d="M752 364q-127-29-89-99 114 22 89 99M754 311q79-93 104-31-40 73-104 31M754 446q-111-39-78-100 107 26 78 100" fill="#83906a"/><path d="M704 512h103l-11 146h-80z" fill="url(#ceramic)"/><ellipse cx="755" cy="512" rx="52" ry="10" fill="#d8c5a6"/></svg>`,
);
writeFileSync(
  new URL('still-life.svg', output),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 650"><title>A quiet corner at home, original illustration</title>${defs}<rect width="900" height="650" fill="#dfe4d7"/><circle cx="470" cy="280" r="221" fill="#e8ebdf"/><path d="M0 505h900v145H0z" fill="#c6b696"/><g transform="translate(140 -80) scale(1.16)">${shadow}${shapes.vase}</g><path d="M518 155q-25-121 74-174M518 86q-90-52-71-116M532 77q71-21 91-67" fill="none" stroke="#62745a" stroke-width="5"/><path d="M485 49q-88-9-58-50 51-5 58 50m48 22q62-78 102-47-16 54-102 47" fill="#7d8b69"/><g transform="translate(-60 232) scale(.63)">${shadow}${shapes.cup}</g></svg>`,
);
const product = (
  type,
  slug,
  name,
  category,
  subtitle,
  priceMinor,
  stock,
  featured,
  isNew,
  material,
  dimensions,
  care,
  color,
  altColor,
  label,
  altLabel,
  description,
) => ({
  id: `prod-${type}`,
  slug,
  name,
  category,
  subtitle,
  description,
  material,
  dimensions,
  care,
  featured,
  isNew,
  variants: [
    {
      id: `var-${type}-main`,
      label,
      color,
      priceMinor,
      stock,
      image: `/images/${type}.svg`,
      detailImage: `/images/${type}-detail.svg`,
    },
    {
      id: `var-${type}-alt`,
      label: type === 'clock' ? 'Ink' : altLabel,
      color: type === 'clock' ? '#344b40' : altColor,
      priceMinor: type === 'throw' ? 249900 : priceMinor,
      stock: ['umbrella', 'cup'].includes(type) ? 0 : 8,
      image: `/images/${type}-alt.svg`,
      detailImage: `/images/${type}-alt-detail.svg`,
    },
  ],
  gallery: [
    { image: `/images/${type}.svg`, alt: `${name}, front view` },
    { image: `/images/${type}-detail.svg`, alt: `${name}, closer detail` },
  ],
});
const catalog = [
  product(
    'lamp',
    'arc-desk-lamp',
    'Arc Desk Lamp',
    'workspace',
    'Warm light. Clear thinking.',
    249900,
    12,
    true,
    true,
    'Powder-coated metal with a weighted base.',
    'Sample dimensions: 42 cm high × 24 cm shade.',
    'Wipe with a soft dry cloth. Unplug before cleaning.',
    '#8a9d82',
    '#344b40',
    'Sage',
    'Ink',
    'An adjustable silhouette and a soft pool of light for a more considered workspace. The compact form gives your desk a little room to breathe.',
  ),
  product(
    'notebook',
    'field-notebook',
    'Field Notebook',
    'workspace',
    'A space for your next idea.',
    69900,
    18,
    true,
    false,
    'Cloth-bound cover and illustrative recycled paper specification.',
    'Sample dimensions: A5, 160 pages.',
    'Keep away from water and store flat.',
    '#7d9577',
    '#344b40',
    'Moss',
    'Forest',
    'An understated notebook for first drafts, daily thoughts, and things to remember. A flat-opening format gives every idea a little more space.',
  ),
  product(
    'speaker',
    'form-desktop-speaker',
    'Form Desktop Speaker',
    'workspace',
    'A softer soundtrack.',
    349900,
    6,
    false,
    false,
    'Illustrative textile grille and polymer enclosure.',
    'Sample dimensions: 18 cm high × 14 cm wide.',
    'Dust gently with a dry cloth.',
    '#43594a',
    '#253c33',
    'Forest',
    'Ink',
    'A compact speaker concept with a tactile woven face and a quiet, rounded silhouette. An illustrative audio companion for your desk.',
  ),
  product(
    'clock',
    'still-desk-clock',
    'Still Desk Clock',
    'workspace',
    'Time, without the noise.',
    179900,
    9,
    false,
    true,
    'Illustrative solid wood frame and mineral glass face.',
    'Sample dimensions: 20 cm diameter.',
    'Clean with a dry cloth; avoid moisture.',
    '#c4a67d',
    '#725b44',
    'Oak',
    'Walnut',
    'A simple clock concept with a warm frame, clear hands, and an uncluttered face. For the corner of a desk or bedside table.',
  ),
  product(
    'tote',
    'daily-canvas-tote',
    'Daily Canvas Tote',
    'everyday',
    'Carry a little possibility.',
    129900,
    20,
    true,
    false,
    'Illustrative 100% cotton canvas.',
    'Sample dimensions: 38 × 40 cm; 12 cm gusset.',
    'Spot clean with cold water; air dry.',
    '#d8c5a3',
    '#344b40',
    'Natural',
    'Forest',
    'A generous carryall for the working day, weekend wanderings, and everything in between. An inside pocket keeps small things close.',
  ),
  product(
    'bottle',
    'slow-stainless-bottle',
    'Slow Stainless Bottle',
    'everyday',
    'A small daily ritual.',
    99900,
    15,
    true,
    true,
    'Illustrative stainless steel body with matte coating.',
    'Sample capacity: 600 ml.',
    'Hand wash with mild detergent.',
    '#82977d',
    '#385340',
    'Sage',
    'Forest',
    'A clean, rounded bottle concept with a comfortable silhouette and screw-top closure. Bring a moment of intention into the everyday.',
  ),
  product(
    'pouch',
    'canvas-utility-pouch',
    'Canvas Utility Pouch',
    'everyday',
    'The little things, together.',
    59900,
    10,
    false,
    false,
    'Illustrative cotton canvas with metal zip.',
    'Sample dimensions: 24 × 16 cm.',
    'Spot clean; do not bleach.',
    '#d3bf9c',
    '#344b40',
    'Sand',
    'Forest',
    'A compact organizer for cables, stationery, or everyday essentials. A simple zip and a soft shape make a useful bag companion.',
  ),
  product(
    'umbrella',
    'canopy-compact-umbrella',
    'Canopy Compact Umbrella',
    'everyday',
    'For a change in the weather.',
    149900,
    0,
    false,
    false,
    'Illustrative recycled polyester canopy and metal frame.',
    'Sample open diameter: 95 cm.',
    'Let the canopy dry fully before storing.',
    '#8c9d81',
    '#344b40',
    'Sage',
    'Ink',
    'A compact umbrella concept with a curved handle and a restrained palette. A considered object for unexpected rainy afternoons.',
  ),
  product(
    'cup',
    'studio-ceramic-cup',
    'Studio Ceramic Cup',
    'home',
    'Your morning, a little warmer.',
    79900,
    4,
    true,
    false,
    'Illustrative glazed stoneware; handmade-style form.',
    'Sample capacity: 300 ml; 9 cm high.',
    'Hand wash with warm soapy water.',
    '#d5c2a6',
    '#344b40',
    'Sand',
    'Ink',
    'A gently rounded cup concept with a generous handle and a matte finish. A quiet companion for slow mornings and afternoon pauses.',
  ),
  product(
    'vase',
    'form-stoneware-vase',
    'Form Stoneware Vase',
    'home',
    'A quiet kind of statement.',
    159900,
    7,
    true,
    true,
    'Illustrative matte glazed stoneware.',
    'Sample dimensions: 24 cm high × 16 cm wide.',
    'Wipe with a damp cloth; avoid abrasive cleaners.',
    '#cdb795',
    '#344b40',
    'Sand',
    'Ink',
    'An organic silhouette that feels at home with a single branch or nothing at all. Warm color and a rounded form create a simple focal point.',
  ),
  product(
    'tray',
    'gather-wooden-tray',
    'Gather Wooden Tray',
    'home',
    'A place for the everyday.',
    119900,
    11,
    false,
    false,
    'Illustrative oak with a natural oil-style finish.',
    'Sample dimensions: 30 cm diameter.',
    'Wipe clean; do not soak.',
    '#c9ac7d',
    '#344b40',
    'Oak',
    'Ink',
    'A shallow wooden tray concept for keys, small objects, or a favorite cup. Natural-looking tones bring warmth to a side table.',
  ),
  product(
    'throw',
    'woven-cotton-throw',
    'Woven Cotton Throw',
    'home',
    'Stay a little longer.',
    199900,
    5,
    false,
    true,
    'Illustrative woven cotton with a fringed hem.',
    'Sample dimensions: 130 × 170 cm.',
    'Gentle cold wash; lay flat to dry.',
    '#cabb9f',
    '#7f7868',
    'Oat',
    'Stone',
    'A softly textured throw concept with a subtle stripe and fringed edge. Drape it over a chair or settle in with a slower afternoon.',
  ),
];
writeFileSync(
  new URL('../public/catalog.json', import.meta.url),
  JSON.stringify(catalog, null, 2) + '\n',
);
applyPhotoCatalog();
console.log(
  `Generated ${catalog.length} sample products and ${Object.keys(shapes).length * 4 + 2} original SVG assets.`,
);
