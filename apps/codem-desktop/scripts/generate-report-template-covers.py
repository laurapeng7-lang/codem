"""Render illustrative report covers, without launching a browser.

Requires Pillow and the macOS Songti/Heiti fonts. These are custom template
illustrations requested for the catalog, not screenshots or replacement icons.
Theme colors come directly from the embedded report's shared theme catalog.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/assets/report-templates'
SCALE = 2
WIDTH, HEIGHT = 864, 400
SERIF = '/System/Library/Fonts/Supplemental/Songti.ttc'
SANS = '/System/Library/Fonts/STHeiti Medium.ttc'
LATIN = '/System/Library/Fonts/Helvetica.ttc'
templates = json.loads((ROOT / 'src/deep-report-content.json').read_text())['templates']
themes = {theme['id']: theme for theme in json.loads((ROOT / 'src/report-themes.json').read_text())}


def mix(first, second, amount):
    a, b = ImageColor.getrgb(first), ImageColor.getrgb(second)
    return tuple(round(x * (1 - amount) + y * amount) for x, y in zip(a, b))


class Cover:
    def __init__(self, theme):
        self.bg, self.accent, self.ink = theme['colors']
        self.image = Image.new('RGB', (WIDTH * SCALE, HEIGHT * SCALE), self.bg)
        self.draw = ImageDraw.Draw(self.image)
        self.rule = mix(self.bg, self.ink, .2)

    def box(self, bounds, fill, radius=0, outline=None):
        bounds = tuple(round(n * SCALE) for n in bounds)
        if radius:
            self.draw.rounded_rectangle(bounds, radius=radius * SCALE, fill=fill, outline=outline, width=SCALE)
        else:
            self.draw.rectangle(bounds, fill=fill, outline=outline, width=SCALE)

    def line(self, points, fill=None, width=1):
        self.draw.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=fill or self.rule, width=width * SCALE)

    def text(self, xy, text, size, color=None, serif=False, latin=False, bold=False):
        path = LATIN if latin else SERIF if serif else SANS
        index = 1 if (serif and bold) or not (serif or latin) else 4 if serif else 0
        font = ImageFont.truetype(path, round(size * SCALE), index=index)
        self.draw.text(tuple(round(n * SCALE) for n in xy), text, font=font, fill=color or self.ink, anchor='lt', stroke_width=0)

    def circle(self, bounds, fill, outline=None, width=1):
        self.draw.ellipse(tuple(round(n * SCALE) for n in bounds), fill=fill, outline=outline, width=width * SCALE)

    def grid(self, left, top, right, bottom, step):
        for x in range(left, right + 1, step):
            self.line([(x, top), (x, bottom)])
        for y in range(top, bottom + 1, step):
            self.line([(left, y), (right, y)])

    def footer(self, method, color=None):
        self.line([(36, 352), (828, 352)])
        self.text((36, 370), method, 13, color)
        self.text((704, 370), 'REPORT / 01', 13, color, latin=True)


def render_analysis(c, template):
    """Use a method-specific diagram for each additional report template."""
    layout = template['layout']
    c.text((36, 91), template['coverTitle'][0], 52, serif=True, bold=True)
    c.text((36, 153), template['coverTitle'][1], 52, serif=True, bold=True)
    c.text((38, 241), template['subtitle'], 16)
    c.box((38, 298, 110, 304), c.accent)
    left, right = 480, 824

    if layout == 'capacity':
        c.text((left, 84), '团队容量 / 本期投入', 18, c.accent)
        for index, (label, value) in enumerate([('产品', .72), ('设计', .88), ('研发', .94), ('测试', .61)]):
            top = 129 + index * 48
            c.text((left, top), label, 14)
            c.box((540, top, right, top + 22), mix(c.bg, c.accent, .1), radius=8)
            c.box((540, top, 540 + 284 * value, top + 22), c.accent, radius=8)

    elif layout == 'objectives':
        c.text((left, 84), '把交付连接到目标', 18)
        for index, (label, value) in enumerate([('产品体验', '82%'), ('交付效能', '76%'), ('业务增长', '91%')]):
            top = 124 + index * 68
            c.box((left, top, right, top + 54), c.accent)
            c.text((left + 16, top + 19), label, 17, c.bg)
            c.text((right - 81, top + 15), value, 26, c.bg, latin=True)

    elif layout == 'cycle':
        c.text((left, 84), '交付周期分布', 18)
        c.grid(left, 126, right, 286, 40)
        for index, value in enumerate([28, 60, 100, 140, 113, 74, 44, 22]):
            x = left + 6 + index * 42
            c.box((x, 286 - value, x + 27, 286), c.accent)
        c.text((left, 310), '0–3 天       4–7 天       8–14 天       15+ 天', 12)

    elif layout == 'dependencies':
        c.text((left, 84), '关键依赖链', 18)
        points = [(524, 157), (645, 157), (773, 240), (524, 294)]
        c.line([points[0], points[1], points[2], points[3]], c.accent, 3)
        for index, (x, y) in enumerate(points):
            c.box((x - 40, y - 24, x + 40, y + 24), c.accent)
            c.text((x - 26, y - 8), ['需求', '接口', '联调', '发布'][index], 19, c.bg)
        c.text((704, 168), '阻塞待解', 13)

    elif layout == 'response':
        c.text((left, 84), '风险治理进展', 18, c.accent)
        for index, (label, value) in enumerate([('待评估', '03'), ('应对中', '08'), ('已关闭', '12')]):
            top = 123 + index * 69
            c.box((left, top, right, top + 55), mix(c.bg, c.accent, .12))
            c.circle((left + 17, top + 21, left + 29, top + 33), c.accent)
            c.text((left + 46, top + 19), label, 17)
            c.text((right - 62, top + 13), value, 31, c.accent, latin=True)

    elif layout == 'improvement':
        c.text((left, 84), '从计划到验证', 18)
        for index, label in enumerate(['PLAN / 计划', 'DO / 执行', 'CHECK / 检查', 'ACT / 调整']):
            top = 126 + index * 49
            c.box((left, top, left + 26, top + 26), c.accent)
            c.text((left + 8, top + 6), str(index + 1), 16, c.bg, latin=True)
            c.text((left + 44, top + 5), label, 16)
            c.line([(left + 44, top + 32), (right, top + 32)])


def render(template):
    c = Cover(themes[template['theme']])
    theme = template['theme']
    heading = template['coverTitle']
    c.text((36, 24), template['eyebrow'], 13, c.accent, latin=True)
    c.text((737, 24), 'PROJECT', 13, c.accent, latin=True)
    c.line([(36, 50), (828, 50)])

    if template.get('layout'):
        render_analysis(c, template)
    elif theme == 'paper-ink':
        c.box((36, 84, 86, 88), c.accent)
        c.circle((618, 66, 790, 238), mix(c.bg, c.accent, .09))
        c.text((36, 108), heading[0], 53, serif=True, bold=True)
        c.text((36, 169), heading[1], 53, serif=True, bold=True)
        c.text((38, 240), '全局进展 / 资源分布 / 交付风险', 16)
        for index, (value, label) in enumerate([('12', '进行中项目'), ('86%', '里程碑达成'), ('03', '重点关注')]):
            left = 40 + index * 142
            c.text((left, 283), value, 28, c.accent, latin=True)
            c.text((left, 322), label, 13)
        c.box((510, 158, 828, 325), '#ffffff', outline=c.rule)
        c.text((530, 177), '项目交付健康度', 16)
        for index, (name, value) in enumerate([('业务中台', .86), ('客户体验', .72), ('基础平台', .94)]):
            top = 217 + index * 32
            c.text((530, top), name, 13)
            c.box((610, top + 2, 798, top + 14), mix(c.bg, c.accent, .1))
            c.box((610, top + 2, 610 + 188 * value, top + 14), c.accent)

    elif theme == 'cobalt-grid':
        c.grid(468, 78, 828, 318, 40)
        c.text((36, 90), heading[0], 58, serif=True)
        c.text((36, 156), heading[1], 58, serif=True)
        c.text((40, 243), '少一些等待，多一些确定。', 18)
        c.box((36, 282, 337, 324), c.accent)
        c.text((52, 296), 'THROUGHPUT  +24%', 18, c.bg, latin=True)
        points = [(484, 281), (531, 263), (576, 271), (621, 219), (666, 226), (711, 166), (757, 176), (811, 112)]
        c.line(points, c.accent, 5)
        for x, y in points:
            c.circle((x - 5, y - 5, x + 5, y + 5), c.bg, c.accent, 2)

    elif theme == 'signal':
        c.text((36, 88), heading[0], 54, serif=True)
        c.text((36, 150), heading[1], 54, serif=True)
        c.text((38, 234), '先看依赖，再判断交付。', 17, c.accent)
        c.text((38, 280), '06', 42, c.accent, latin=True)
        c.text((111, 300), '个关键里程碑', 15)
        c.box((461, 78, 828, 324), mix(c.bg, c.accent, .035), outline=c.rule)
        c.text((483, 98), 'DELIVERY TIMELINE', 14, c.accent, latin=True)
        for index, value in enumerate(['需求确认', '方案评审', '开发验证', '灰度发布']):
            top = 145 + index * 41
            c.text((482, top), value, 13)
            c.line([(560, top + 8), (805, top + 8)])
            left = 563 + index * 43
            c.box((left, top + 1, left + 84, top + 15), c.accent if index < 3 else mix(c.bg, c.accent, .5))
        c.line([(774, 136), (774, 306)], c.accent, 1)

    elif theme == 'editorial-forest':
        c.text((36, 91), heading[0], 58, serif=True)
        c.text((36, 157), heading[1], 58, c.accent, serif=True)
        c.text((38, 244), '识别信号，把行动放在前面。', 17)
        c.box((36, 291, 300, 326), c.accent)
        c.text((49, 301), '概率 × 影响 = 行动优先级', 15, c.bg)
        for row in range(5):
            for col in range(5):
                left, top = 500 + col * 57, 82 + row * 46
                amount = .08 + (col + 4 - row) * .085
                c.box((left, top, left + 50, top + 39), mix(c.bg, c.accent, amount))
        for x, y in [(3, 1), (4, 0), (2, 3)]:
            left, top = 500 + x * 57, 82 + y * 46
            c.circle((left + 17, top + 12, left + 32, top + 27), c.ink)
        c.text((500, 321), 'LOW                 IMPACT                 HIGH', 11, c.accent, latin=True)

    elif theme == 'vintage-editorial':
        c.line([(36, 57), (828, 57)], c.ink, 2)
        c.text((38, 91), heading[0], 53, serif=True, bold=True)
        c.text((38, 152), heading[1], 53, serif=True, bold=True)
        c.text((40, 238), '回看事实，带着经验继续。', 18, c.accent, serif=True)
        c.line([(454, 86), (454, 323)])
        c.text((482, 90), '01  回看目标', 22, serif=True, bold=True)
        c.text((482, 125), '对齐预期与实际结果，留下事实。', 14)
        c.line([(482, 156), (828, 156)])
        c.text((482, 177), '02  看见差距', 22, serif=True, bold=True)
        c.text((482, 212), '从关键事件中寻找可复用的经验。', 14)
        c.line([(482, 243), (828, 243)])
        c.text((482, 266), '03  明确行动', 22, serif=True, bold=True)
        c.text((482, 301), '让每一项改进，都有下一步。', 14)
        c.text((40, 299), 'REVIEW. LEARN. IMPROVE.', 14, c.accent, latin=True)

    else:
        c.text((36, 91), heading[0], 58)
        c.text((36, 158), heading[1], 58)
        c.text((39, 245), '不止发现问题，更要理解原因。', 17)
        c.box((486, 77, 828, 328), c.accent)
        c.text((507, 91), '5', 132, '#1a1a1a', latin=True)
        c.text((614, 173), 'WHYS', 29, '#1a1a1a', latin=True)
        c.line([(508, 232), (805, 232)], '#1a1a1a', 2)
        c.text((508, 254), '从现象到根因', 23, '#1a1a1a')
        c.text((508, 291), 'EVIDENCE / CAUSE / ACTION', 13, '#1a1a1a', latin=True)
        c.box((38, 302, 121, 309), c.accent)

    c.footer(template['method'])
    return c.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {'kind': 'Custom report template cover illustrations', 'note': 'Illustrative layouts and fictional metrics; not screenshots of generated reports. No icons are drawn.', 'paletteSource': 'src/report-themes.json', 'reportSource': 'public/reports/project-risk-report-beautified.html', 'generator': 'scripts/generate-report-template-covers.py', 'assets': []}
    contact = Image.new('RGB', (WIDTH * 2, (HEIGHT + 68) * ((len(templates) + 1) // 2)), '#ffffff')
    draw = ImageDraw.Draw(contact)
    for index, template in enumerate(templates):
        image = render(template)
        path = OUTPUT / f"{template['id']}.png"
        image.save(path, optimize=True)
        with Image.open(path) as check:
            check.verify()
        manifest['assets'].append({'file': path.name, 'theme': template['theme'], 'width': WIDTH, 'height': HEIGHT, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        x, y = (index % 2) * WIDTH, (index // 2) * (HEIGHT + 68)
        contact.paste(image, (x, y))
        draw.text((x + 24, y + HEIGHT + 17), template['title'] + ' · ' + themes[template['theme']]['label'], font=ImageFont.truetype(SANS, 24, index=1), fill='#1f2329')
    (OUTPUT / 'provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    contact.save('/tmp/meego-report-template-covers.png')
    print(f'Generated and verified {len(templates)} report covers at {WIDTH} × {HEIGHT}.')


if __name__ == '__main__':
    main()
