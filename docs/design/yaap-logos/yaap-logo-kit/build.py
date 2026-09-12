from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

root = Path(__file__).parent
font = TTFont(root.parent.parent.parent / 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
font = instantiateVariableFont(font, {'wght': 650}, inplace=True)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 52 / font['head'].unitsPerEm
x = 82
paths = []
for letter in 'Yaap':
    name = cmap[ord(letter)]
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 49)))
    paths.append('<path d="' + pen.getCommands() + '"/>')
    x += glyphs[name].width * scale - 1.7
word = ''.join(paths)
width = round(x + 4)
marks = {
 '01-confluence': '<path d="M6 8H18L31 22L21 32L6 17Z M45 8H58V18L39 37V58H25V34Z"/>',
 '02-signal': '<path d="M7 43Q7 40 10 39L18 35Q21 34 21 38V54Q21 57 18 57H10Q7 57 7 54Z M26 29Q26 26 29 25L37 21Q40 20 40 24V54Q40 57 37 57H29Q26 57 26 54Z M45 15Q45 12 48 11L56 7Q59 6 59 10V54Q59 57 56 57H48Q45 57 45 54Z"/>',
 '03-y-dot': '<path d="M12 14V28C12 41 36 41 36 28V14M36 28V39C36 51 28 56 16 56" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="53" cy="13" r="6"/>',
}
def svg(inner, color, vb='0 0 64 64'):
    inner = inner.replace('stroke="currentColor"', f'stroke="{color}"')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" fill="{color}" color="{color}">{inner}</svg>'
for name, mark in marks.items():
    folder = root / name
    folder.mkdir(exist_ok=True)
    for variant, ink in [('blue','#2458EB'),('graphite','#262C32'),('white','#FFFFFF')]:
        (folder / f'mark-{variant}.svg').write_text(svg(mark,ink))
    for variant, symbol, ink in [('light','#2458EB','#262C32'),('dark','#FFFFFF','#FFFFFF'),('mono','#262C32','#262C32')]:
        painted = mark.replace('stroke="currentColor"', f'stroke="{symbol}"')
        lockup = f'<g fill="{symbol}" color="{symbol}">{painted}</g><g fill="{ink}">{word}</g>'
        (folder / f'logo-{variant}.svg').write_text(svg(lockup,ink,f'0 0 {width} 64'))
    favicon = '<rect width="64" height="64" rx="14" fill="#2458EB"/><g transform="translate(8 8) scale(.75)" fill="#FFFFFF" color="#FFFFFF">'+mark+'</g>'
    (folder / 'favicon.svg').write_text(svg(favicon,'#FFFFFF'))
    (folder / 'apple-touch-icon.svg').write_text(svg('<rect width="64" height="64" fill="#2458EB"/><g transform="translate(10 10) scale(.6875)" fill="#FFFFFF" color="#FFFFFF">'+mark+'</g>','#FFFFFF'))
print('Created three SVG logo families; lockups have outlined type, no font dependency.')
