"""Build an offline prototype, SVG boards, and a native Figma development plugin.

Uses the current miniapp palette and local assets. No account, network, or API keys.
Run: python3 artifacts/ui-journey-2026-10-08/figma-prototype/build.py
"""
import base64
import copy
import html
import json
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
C = dict(paper="#fbf8f3", soft="#f0ebe2", ink="#2c241b", muted="#716555",
         red="#c8381f", blush="#fdece6", green="#2f4a3a", mint="#e9f1e9",
         white="#ffffff", line="#e8e2d8", dark="#201c18", light="#c7bdad")
screens, boards, images = [], [], {}
current = None


def page(key, title, route, note, bg="paper", width=390, height=844, board=False):
    global current
    current = dict(id=key, title=title, route=route, note=note, bg=C.get(bg, bg),
                   width=width, height=height, nodes=[], hotspots=[])
    (boards if board else screens).append(current)
    return current


def node(kind, x, y, w, h, name, **attrs):
    p = dict(type=kind, x=x, y=y, w=w, h=h, name=name, **attrs)
    current["nodes"].append(p)
    return p


def rect(x, y, w, h, fill="white", radius=8, name="卡片", **attrs):
    return node("rect", x, y, w, h, name, fill=C.get(fill, fill), radius=radius, **attrs)


def text(value, x, y, w, size=14, color="ink", weight=400, h=None, align="left", name=None):
    lines = value.split("\n")
    lh = round(size * 1.5, 2)
    return node("text", x, y, w, h or lh * len(lines), name or value.replace("\n", " / "),
                text=value, size=size, fill=C.get(color, color), weight=weight,
                lineHeight=lh, align=align)


def photo(asset, x, y, w, h, radius=8, name=None):
    path = ROOT / "miniapp/assets" / asset
    if asset not in images:
        images[asset] = base64.b64encode(path.read_bytes()).decode()
    return node("image", x, y, w, h, name or f"示例图片 / {path.stem}", asset=asset, radius=radius)


def icon(asset, x, y, size=22, color="ink"):
    raw = (ROOT / "miniapp/assets/icons" / asset).read_text()
    raw = re.sub(r'stroke="(?!none)[^"]+"', f'stroke="{C.get(color, color)}"', raw)
    return node("icon", x, y, size, size, f"图标 / {Path(asset).stem}", svg=raw)


def hot(label, x, y, w, h, to, action=None):
    current["hotspots"].append(dict(label=label, x=x, y=y, w=w, h=h, to=to, action=action))


def button(label, x, y, w, to, style="red", h=44, action=None):
    fill, fg = (style, "white") if style in ("red", "green", "ink") else (style, "ink")
    rect(x, y, w, h, fill, 8, f"按钮 / {label}")
    text(label, x+5, y, w-10, 14, fg, 600, h=h, align="center")
    hot(label, x, y, w, h, to, action)


def status(light=False):
    color = "white" if light else "ink"
    text("9:41", 20, 7, 62, 13, color, 600, h=23)
    text("•••", 312, 7, 29, 13, color, 600, h=23)
    rect(347, 15, 24, 11, color, 3, "电池", opacity=.8)


def nav(title, back="home", dark=False):
    status(dark)
    color = "white" if dark else "ink"
    icon("lucide/arrow-left.svg", 19, 48, 23, color)
    text(title, 74, 39, 210, 16, color, 600, h=44, align="center")
    rect(311, 45, 62, 31, "white" if dark else "soft", 16, "微信胶囊", opacity=.94)
    text("•••  ⊙", 315, 45, 54, 14, "ink", 600, h=31, align="center")
    hot("返回", 7, 39, 48, 44, back)


def heading(title, sub, action=None, to="recipes"):
    text(title, 16, 103, 280, 27, weight=700)
    text(sub, 16, 145, 358, 12.5, "muted")
    if action:
        button(action, 291, 105, 83, to, "blush")


def bottom_tab(active):
    rect(0, 754, 390, 90, "paper", 0, "底部主导航")
    rect(0, 754, 390, 1, "line", 0, "导航分隔线")
    items = [("点菜", "home", "home"), ("做菜", "cook", "cook"),
             ("记录", "record", "recipe"), ("社区", "community", "community"),
             ("我的", "me", "profile")]
    for i, (label, to, asset) in enumerate(items):
        x = i*78
        icon(f"tab-{asset}.svg", x+27, 767, 25, "red" if to == active else "muted")
        text(label, x+5, 798, 68, 11, "red" if to == active else "muted", 600,
             align="center")
        hot(f"主导航 · {label}", x, 760, 78, 59, to)
    rect(133, 833, 124, 4, "ink", 2, "安全区指示条")


def safe(dark=False):
    rect(133, 833, 124, 4, "white" if dark else "ink", 2, "安全区指示条")


def thumb(asset, name, x, y, size=76, upload=False):
    if asset:
        photo(asset, x, y, size, size)
    else:
        rect(x, y, size, size, "soft", 8, "无图 / 名称占位")
        text(name, x+5, y+14, size-10, 16, "muted", 600, h=size-38, align="center")
    if upload:
        rect(x, y+size-20, size, 20, "ink", 0, "图片编辑入口", opacity=.82)
        text("换图" if asset else "拍照", x, y+size-20, size, 10, "white", h=20, align="center")
        hot(f"为{name}拍照或选图", x, y, size, size, "photo")


def dish_row(title, asset, y, meta, note, label, to, height=126):
    rect(16, y, 358, height, radius=8, name=f"菜品 / {title}")
    photo(asset, 28, y+12, 94, height-24)
    text(title, 135, y+8, 225, 17, weight=600)
    text(meta, 135, y+35, 225, 12.5, "muted")
    text(note, 135, y+57, 225, 12)
    rect(239, y+height-40, 122, 30, "blush", 6, f"按钮 / {label}")
    text(label, 244, y+height-40, 112, 12.5, weight=600, h=30, align="center")
    hot(label, 239, y+height-47, 122, 44, to)
    hot(f"查看{title}", 16, y, 213, height, "detail")


page("home", "点菜首页", "pages/home/index", "保留现版照片开场；家庭菜单直接接到买菜和做菜。")
photo("dishes/hongshao-pork.jpg", 0, 0, 390, 327, 0)
rect(0, 0, 390, 327, "ink", 0, "头图可读性遮罩", opacity=.52)
status(True)
text("晚上好", 20, 49, 190, 14, "white", 600)
text("家人，今晚想吃点啥", 20, 76, 244, 18, "white", 600)
icon("lucide/shopping-basket.svg", 279, 57, 24, "white")
icon("lucide/book-open.svg", 335, 57, 24, "white")
hot("打开买菜清单", 268, 47, 44, 44, "shopping")
hot("打开菜谱库", 324, 47, 44, 44, "recipes")
rect(20, 132, 81, 26, "red", 13, "主打菜标签")
text("晚上主打", 20, 132, 81, 12, "white", 600, h=26, align="center")
text("红烧肉", 20, 171, 345, 33, "white", 700)
text("慢慢炖一锅，等家人一起上桌。", 20, 219, 345, 14, "white")
text("45 分钟  ·  4 人份  ·  家常 · 鲜香", 20, 250, 345, 12.5, "white", 500)
button("加到菜单", 20, 278, 229, "home", action="cart")
button("换一道", 261, 278, 109, "picker", "soft")
for x, label in [(16, "今日 · 早"), (109, "今日 · 午"), (202, "今日 · 晚")]:
    rect(x, 341, 85, 38, "ink" if x == 202 else "soft", 20, f"餐次 / {label}")
    text(label, x, 341, 85, 13, "white" if x == 202 else "muted", 500, h=38, align="center")
text("本周 ›", 303, 341, 69, 13, "muted", h=38, align="center")
button("随机点菜", 16, 394, 173, "picker", "white")
button("冰箱能做", 201, 394, 173, "picker", "white")
rect(16, 456, 358, 283, radius=8, name="家庭点菜单")
text("今天这一桌 · 晚餐", 30, 470, 215, 12, "muted", 600)
text("完整菜单 ›", 270, 470, 90, 12, "muted", align="right")
hot("完整菜单", 261, 461, 105, 44, "cook")
text("2 道菜 · 0 道已上桌", 30, 493, 314, 17, weight=600, name="menu-count")
rect(30, 522, 330, 3, "soft", 2, "上桌进度")
button("买食材 2", 30, 536, 108, "shopping", "soft", h=44)
button("继续做菜", 148, 536, 212, "cook", h=44)
for y, asset, name, who, state in [(593, "hongshao-pork", "红烧肉", "爸爸 点的", "制作中"),
                                  (665, "tomato-egg", "番茄炒蛋", "妈妈 点的", "待做")]:
    photo(f"dishes/{asset}.jpg", 30, y, 58, 58, name="menu-secondary-photo" if asset == "tomato-egg" else None)
    text(name, 101, y+3, 189, 16, weight=600, name="menu-secondary-title" if asset == "tomato-egg" else None)
    text(who, 101, y+33, 187, 12, "muted")
    text(state, 303, y+3, 57, 11, "red" if state == "制作中" else "muted", h=27, align="right")
    hot(f"菜单中的{name}", 30, y, 260, 58, "detail")
bottom_tab("home")

page("recipes", "菜谱库 · 紧凑菜单", "pages/recipes/index", "分类维度放进左栏；用料开关收进筛选。保留左图右文，让菜更早出现在首屏。")
nav("菜谱库")
text("家里的菜谱", 12, 104, 155, 21, weight=700)
text("4 道", 160, 109, 75, 12.5, "muted")
button("+ 新建", 295, 98, 83, "detail", h=44)
rect(12, 152, 366, 44, "soft", radius=8, name="搜索与筛选工具栏")
icon("lucide/search.svg", 23, 167, 15, "muted")
text("搜菜名、菜系、口味", 46, 152, 252, 12.5, "muted", h=44)
rect(308, 167, 1, 15, "line", 0, "筛选分隔线")
for offset, width in [(0, 15), (5, 10), (10, 5)]:
    rect(319, 168+offset, width, 1.5, "muted", 1, "筛选图标")
text("筛选", 338, 152, 35, 12.5, "muted", h=44)
hot("展开耗时与人份筛选", 310, 152, 68, 44, "recipes", "filters")
icon("lucide/sparkles.svg", 16, 215, 14, "muted")
text("随机一道", 35, 200, 82, 12.5, "muted", h=44)
hot("随机一道", 12, 200, 110, 44, "picker")
icon("tab-fridge.svg", 143, 215, 14, "muted")
text("冰箱能做", 162, 200, 82, 12.5, "muted", h=44)
hot("冰箱能做", 137, 200, 111, 44, "picker")
text("按需挑菜 ›", 275, 200, 103, 12.5, "green", h=44, align="right")
hot("按需挑菜", 275, 200, 103, 44, "request")
rect(12, 244, 366, 1, "line", 0, "工具栏分隔线")
rect(12, 256, 52, 396, "soft", 8, "左侧菜系栏")
text("菜系 ⌄", 12, 256, 52, 12.5, "muted", 600, h=44, align="center", name="左侧分类维度")
hot("切换菜系或来源", 12, 256, 52, 44, "recipes", "source")
for i, label in enumerate(["全部", "家常", "川菜", "粤菜", "湘菜", "鲁菜", "西餐", "日料"]):
    y = 300+i*44
    if label == "全部":
        rect(12, y, 52, 44, "blush", 0, "选中菜系")
        rect(12, y+11, 3, 22, "red", 2, "选中标记")
    text(label, 14, y, 48, 12.5, "red" if label == "全部" else "muted", 600 if label == "全部" else 400,
         h=44, align="center", name=f"分类 / {label}")
    hot(f"菜系 · {label}", 12, y, 52, 44, "recipes", f"cuisine:{label}")
text("可选菜品 · 4", 77, 256, 168, 13, weight=600, h=44)
text("点到 晚餐 ▾", 268, 256, 105, 12.5, "muted", h=44, align="right")
for y, asset, title, meta, taste, summary, material, stock in [
    (302, "hongshao-pork", "红烧肉", "45 分钟 · 4 人份", "家常 · 鲜香 · 下饭", "小火慢炖，酱香浓郁…", "用料 · 五花肉、冰糖", "已有 1/3 · 还差五花肉、冰糖"),
    (496, "tomato-egg", "番茄炒蛋", "15 分钟 · 3 人份", "家常 · 酸甜", "食材简单，趁热上桌…", "用料 · 番茄、鸡蛋", "食材齐全 · 按菜谱量")]:
    rect(76, y, 302, 182, radius=10, name=f"列表菜卡 / {title}")
    photo(f"dishes/{asset}.jpg", 86, y+10, 84, 84)
    rect(91, y+69, 37, 20, "white", 3, "菜谱来源角标")
    text("自建", 91, y+69, 37, 11, "muted", h=20, align="center")
    text(title, 180, y+10, 187, 16, weight=600)
    text(meta, 180, y+38, 187, 12.5, "muted")
    text(taste, 180, y+58, 187, 12.5, "muted")
    text(material, 180, y+78, 187, 12.5, "muted")
    text(summary, 180, y+98, 187, 12.5, "muted")
    rect(86, y+124, 282, 1, "line", 0, "库存与点菜分隔线")
    text("冰箱用料", 86, y+130, 200, 12.5, "muted")
    text(stock, 86, y+149, 200, 12.5, "green" if asset == "tomato-egg" else "muted", h=24)
    button("+ 点菜", 304, y+130, 64, "home", "white", action="cart")
    current["nodes"][-2].update(stroke=C["red"], radius=22)
    current["nodes"][-1].update(fill=C["red"], size=12.5)
    hot(f"查看{title}菜谱", 180, y+10, 187, 111, "detail")
    hot(f"查看{title}图片", 86, y+10, 84, 84, "detail")
text("继续往下，还有家人爱吃的菜", 77, 698, 299, 12.5, "muted")
safe()

# 静态图层用于 Figma；网页表单复用 miniapp 的条件解析函数。
recipe_screen = copy.deepcopy(current)
page("request", "按需挑菜 · 先确认条件", "pages/recipes/index#request", "可输入人数、耗时、菜系、不辣和冰箱条件。网页和小程序复用同一个有限条件解析函数，先确认，再挑选。")
current["nodes"] = copy.deepcopy(recipe_screen["nodes"])
rect(0, 0, 390, 844, "ink", 0, "底部弹层遮罩", opacity=.45)
rect(0, 337, 390, 507, "paper", 16, "按需挑菜弹层")
rect(175, 347, 40, 4, "line", 2, "弹层把手")
text("这顿想怎么吃？", 20, 369, 300, 22, weight=700)
text("×", 326, 365, 44, 24, "muted", h=44, align="center")
text("说说人数、耗时和口味，我们来挑一道。", 20, 410, 350, 13, "muted")
rect(20, 445, 350, 84, "soft", 9, "条件输入框")
text("两人吃，30分钟，不辣，冰箱有的", 32, 459, 326, 14)
rect(20, 545, 350, 155, "white", 9, "确认条件")
text("按这些条件筛选", 34, 555, 320, 12.5, "muted", weight=500)
for y, label, value in [(583, "人数", "2 人以上"), (611, "耗时", "30 分钟内"),
                        (639, "口味", "有不辣／清淡标注"), (667, "食材", "冰箱能做 · 临期优先")]:
    text(label, 34, y, 46, 13, "muted")
    text(value, 98, y, 256, 13, "green", weight=500)
text("只选有“不辣／清淡”标注的菜。", 20, 714, 350, 12, "muted")
button("按这些条件挑一道", 20, 751, 350, "picker", "green", h=48)
hot("关闭按需挑菜", 326, 365, 44, 44, "recipes")
safe()

page("picker", "冰箱挑菜 · 随机结果", "pages/recipes/index?pick=pantry", "先展示冰箱有什么；只在样例候选中换一道，确认后加入晚餐。")
nav("今天吃什么", "recipes")
heading("冰箱里的，先安排", "食材齐全的菜，优先用临期食材")
current["nodes"][-2]["name"] = "picked-heading"
current["nodes"][-1]["name"] = "picked-subheading"
rect(16, 180, 358, 132, "soft", 10, "现有食材摘要")
text("冰箱现有 · 6 种", 30, 192, 215, 14, weight=600)
text("查看全部 ›", 263, 192, 97, 12, "muted", align="right")
hot("查看冰箱库存", 255, 182, 112, 44, "pantry")
for y, left, amount, right, quantity in [(225, "番茄", "2 个", "鸡蛋", "6 个"), (252, "虾仁", "150 g", "豌豆", "100 g")]:
    text(left, 30, y, 72, 13)
    text(amount, 104, y, 73, 13, "muted", align="right")
    text(right, 209, y, 72, 13)
    text(quantity, 283, y, 77, 13, "muted", align="right")
text("番茄还有 2 天到期，优先用", 30, 285, 330, 12, "#b3381f")
rect(16, 328, 358, 272, radius=10, name="随机推荐结果")
photo("dishes/tomato-egg.jpg", 28, 340, 124, 192, name="picked-image")
text("番茄炒蛋", 168, 342, 192, 22, weight=600, name="picked-title")
text("15 分钟 · 3 人份", 168, 380, 192, 13, "muted", name="picked-meta")
text("家常 · 酸甜开胃", 168, 406, 192, 13, "muted", name="picked-taste")
text("食材齐全 · 按菜谱量", 168, 435, 192, 12.5, "green", 500, name="picked-stock")
text("番茄还有 2 天到期。\n趁新鲜先用，15 分钟\n就能端上桌。", 168, 472, 192, 13, "muted", name="picked-note")
hot("查看推荐菜做法", 28, 340, 332, 192, "detail")
button("换一道", 28, 544, 124, "picker", "soft", action="shuffle")
button("加入晚餐", 168, 544, 192, "home", action="cart")
text("冰箱现在能做", 16, 621, 258, 18, weight=600)
text("2 道", 300, 621, 74, 12, "muted", align="right")
dish_row("虾仁炒豌豆", "dishes/shrimp-peas.jpg", 660, "20 分钟 · 2 人份", "食材齐全 · 冷冻食材先解冻", "看做法", "detail", 118)
text("过期食材已排除，实际用量以菜谱为准。", 16, 799, 358, 12, "muted")
safe()

page("detail", "菜谱详情 · 用料与冰箱", "pkg-extra/recipe-detail/index", "头图保留食欲，用料在左图右文的清单中核对库存。")
photo("dishes/tomato-egg.jpg", 0, 0, 390, 224, 0)
rect(0, 0, 390, 91, "ink", 0, "头部遮罩", opacity=.42)
nav("菜谱详情", "recipes", True)
text("番茄炒蛋", 16, 240, 358, 27, weight=700)
text("15 分钟 · 3 人份 · 家常 · 酸甜", 16, 284, 358, 13, "muted")
text("番茄炒出汁，鸡蛋软嫩。\n简单的一道菜，也是家里的好味道。", 16, 313, 358, 13)
rect(16, 367, 358, 1, "line", 0, "简介与用料分隔线")
text("用料", 16, 382, 160, 19, weight=600)
text("按 3 人份", 229, 382, 145, 13, "muted", align="right")
for y, asset, name, amount, note in [(421, "ingredients/tomato.jpg", "番茄", "2 个", "冰箱有 2 个 · 还有 2 天到期"),
                                     (499, None, "鸡蛋", "3 个", "冰箱有 6 个 · 够用")]:
    thumb(asset, name, 16, y, 64, upload=True)
    text(name, 96, y+3, 150, 17, weight=600)
    text(amount, 278, y+3, 96, 15, weight=600, align="right")
    text(note, 96, y+34, 278, 12.5, "green")
    rect(96, y+66, 278, 1, "line", 0, "用料分隔线")
text("做法", 16, 583, 177, 19, weight=600)
text("3 步就能上桌", 229, 585, 145, 12, "muted", align="right")
for i, value in enumerate(["鸡蛋加少许盐打散，番茄切块。", "热锅炒熟鸡蛋盛出，再炒软番茄。", "倒回鸡蛋翻匀，加盐调味后出锅。"]):
    y = 622+i*38
    rect(16, y, 24, 24, "soft", 6, f"做法序号 / {i+1}")
    text(str(i+1), 16, y, 24, 12, "green", 600, h=24, align="center")
    text(value, 52, y+1, 322, 13)
rect(0, 754, 390, 90, "paper", 0, "详情底部操作")
button("加到晚餐", 16, 766, 134, "home", "soft", action="cart")
button("开始做菜", 162, 766, 212, "step")
safe()

page("pantry", "冰箱库存 · 先用临期", "pages/pantry/index", "概览聚焦先用什么、能做几道；提醒设置折叠。有图显示照片，无图显示食材名称。")
nav("冰箱库存")
text("先把家里的用起来", 12, 104, 350, 21, weight=700)
text("6 种在库", 12, 139, 350, 12.5, "muted")
rect(12, 174, 366, 150, "white", 10, "临期与挑菜概览")
text("今天先用 · 2 种临期", 26, 188, 244, 17, weight=600)
text("能做 2 道菜 · 按菜谱用量", 26, 218, 240, 12.5, "muted")
button("挑一道 ›", 285, 187, 79, "picker", "blush", h=44)
text("先用  番茄、鸡蛋", 26, 246, 338, 12.5, "red")
rect(26, 278, 338, 1, "line", 0, "概览分区")
icon("lucide/bell.svg", 26, 294, 15, "muted")
text("临期提醒", 50, 280, 88, 13, weight=600, h=44)
text("提前 3 天", 144, 280, 130, 12.5, "muted", h=44)
text("设置 ›", 288, 280, 76, 12.5, "muted", h=44, align="right")
hot("临期提醒设置", 26, 280, 338, 44, "pantry", "reminder")
text("在库食材", 12, 342, 214, 19, weight=600)
button("+ 添加", 295, 334, 83, "photo", "blush", h=44)
for x, label, active in [(12, "全部 6", True), (134, "临期 2", False), (256, "过期 1", False)]:
    rect(x, 389, 122, 44, "white" if active else "soft", 8, f"库存筛选 / {label}")
    text(label, x, 389, 122, 13, "ink" if active else "muted", h=44, align="center")
    hot(f"库存 · {label}", x, 389, 122, 44, "pantry", f"pantry:{label}")
text("蔬菜、蛋类 · 3 项", 12, 447, 350, 13, "muted", 600)
for y, asset, name, amount, expiry, date, color in [
    (480, "ingredients/tomato.jpg", "番茄", "2 个", "还有 2 天到期", "2026-11-06", "red"),
    (582, None, "鸡蛋", "6 个", "还有 3 天到期", "2026-11-07", "red"),
    (684, "ingredients/shiitake.jpg", "香菇", "200 g", "已过期 · 请核对", "2026-11-03", "muted")]:
    rect(12, y-8, 366, 100, "white", 8, "食材行 / "+name)
    thumb(asset, name, 24, y, 84, upload=True)
    text(name, 122, y+2, 160, 18, weight=700)
    text(amount, 278, y+2, 88, 15, weight=600, align="right")
    rect(122, y+32, 138, 22, "blush" if color == "red" else "soft", 4, "保质期状态")
    text(expiry, 128, y+32, 132, 12.5, color, h=22)
    text("到期 "+date, 122, y+62, 180, 12.5, "muted")
    text("管理 ›", 308, y+54, 58, 12.5, "muted", h=30, align="right")
    hot(f"管理{name}", 302, y+40, 64, 44, "photo")
safe()

page("shopping", "买菜清单与连续加购", "pages/shopping/index", "左图右文；加购可拍照或选图，添加后继续填写下一种食材。此处为样例表单。")
nav("买菜清单")
heading("买菜清单", "按今天的菜单备菜，家里已有的先用。")
rect(16, 180, 358, 87, "white", 9, "采购进度")
text("还差 2 样", 30, 192, 232, 22, weight=600)
text("已买好 1 / 3", 249, 196, 109, 12, "muted", align="right")
rect(30, 235, 330, 5, "soft", 3, "采购进度底轨")
rect(30, 235, 110, 5, "green", 3, "采购进度")
text("待买", 16, 292, 270, 18, weight=600)
text("+ 临时加购", 265, 292, 109, 12, "red", align="right")
for y, asset, name, amount, note, stock in [
    (336, None, "五花肉", "500 g", "用于红烧肉 · 晚餐", "家里还没有"),
    (472, None, "冰糖", "25 g", "用于红烧肉 · 晚餐", "家里还没有")]:
    rect(16, y, 358, 128, "white", 8, f"采购食材 / {name}")
    thumb(asset, name, 29, y+15, 86, True)
    text(name, 130, y+12, 147, 18, weight=600)
    text(amount, 278, y+12, 82, 16, weight=600, align="right")
    text(note, 130, y+39, 229, 12, "muted")
    text(stock, 130, y+58, 229, 11.5, "muted")
    button("买好了", 130, y+76, 152, "shopping", "green", h=44, action="bought")
    rect(294, y+76, 66, 44, "white", 8, "按钮 / 移除", stroke=C["line"])
    text("移除", 294, y+76, 66, 12, "muted", h=44, align="center")
    hot("移除食材", 294, y+76, 66, 44, "shopping", "remove")
text("临时加购", 16, 604, 269, 18, weight=600)
rect(16, 637, 358, 179, "white", 8, "连续加购表单")
thumb(None, "番茄", 30, 652, 76)
text("拍照 / 选图", 28, 733, 80, 11.5, "red", align="center")
hot("为加购食材添加图片", 28, 648, 80, 105, "shopping", "draft-photo")
rect(120, 651, 240, 38, "soft", 6, "食材名称输入")
text("番茄", 132, 651, 215, 14, h=38)
rect(120, 699, 132, 38, "soft", 6, "数量输入")
text("2", 132, 699, 105, 14, h=38)
rect(262, 699, 98, 38, "soft", 6, "单位输入")
text("个", 274, 699, 74, 14, h=38)
text("清单 3 样 · 可连续添加", 30, 776, 190, 11.5, "muted")
button("添加并继续", 226, 762, 134, "shopping", h=44, action="draft-add")
safe()

page("cook", "今日做菜", "pages/menu/index", "左图右进度；各道菜的状态、开做与上桌动作集中。")
nav("今日做菜")
heading("做菜", "今天晚餐 · 家人已经点好，接下来开火。")
rect(16, 180, 358, 113, "ink", 10, "一餐进度概览")
photo("dishes/hongshao-pork.jpg", 29, 193, 87, 87)
text("今天这一桌", 132, 193, 228, 14, "light")
text("2 道菜 · 1 道制作中", 132, 223, 228, 19, "white", 600, name="cook-menu-count")
text("0 / 2 已上桌", 132, 257, 228, 12, "light")
button("厨房总控", 16, 311, 173, "step", "soft")
button("买菜清单", 201, 311, 173, "shopping", "soft")
text("晚餐", 16, 382, 230, 20, weight=600)
text("谁掌勺，都有条理。", 224, 387, 150, 12, "muted", align="right")
dish_row("红烧肉", "dishes/hongshao-pork.jpg", 424, "爸爸 点的 · 45 分钟", "制作中 · 还在慢炖", "继续做菜", "step", 134)
dish_row("番茄炒蛋", "dishes/tomato-egg.jpg", 574, "妈妈 点的 · 15 分钟", "待做 · 食材已齐", "开始做菜", "step", 134)
bottom_tab("cook")

page("step", "分步做菜 · 底部计时", "pkg-extra/cook-mode/index", "计时收在底部；步骤、图与翻步是当前主要信息。", "dark")
nav("番茄炒蛋", "cook", True)
text("专心做这一道", 16, 106, 358, 27, "white", 600)
text("15 分钟 · 3 人份", 16, 149, 358, 13, "light")
photo("dishes/tomato-egg.jpg", 16, 191, 358, 239, 10, "成品示意图")
text("步骤 3 / 4", 16, 452, 358, 12, "light", 600)
text("把番茄炒出汁", 16, 484, 358, 24, "white", 600, name="step-title")
text("锅里留少许油，放入番茄翻炒。\n加入少量盐，炒至番茄变软、出汁。\n再把炒好的鸡蛋倒回锅里。", 16, 531, 358, 16, "light", name="step-copy")
rect(16, 653, 358, 75, "#37312a", 10, "底部计时")
icon("lucide/clock.svg", 30, 668, 19, "light")
text("这一步计时", 58, 664, 162, 12, "light")
text("02:00", 30, 686, 185, 24, "white", 600, name="timer-value")
button("开始计时", 237, 668, 121, "step", "soft", action="timer")
button("返回菜单", 16, 751, 109, "cook", "ink")
button("下一步", 137, 751, 237, "finish")
safe(True)

current = copy.deepcopy(screens[-1])
current.update(id="finish", title="分步做菜 · 完成记录", note="完成后先保存记录，再去分享或再点一次。")
current["hotspots"] = [p for p in current["hotspots"] if p["to"] != "finish" and p.get("action") != "timer"]
for p in current["nodes"]:
    if p["name"] == "步骤 3 / 4":
        p["text"] = "步骤 4 / 4"
    elif p["name"] == "step-title":
        p["text"] = "调味后装盘"
    elif p["name"] == "step-copy":
        p["text"] = "鸡蛋与番茄一起翻炒均匀。\n按家人口味调味，关火后装盘。\n趁热上桌，记下这一餐的好味道。"
    elif p["name"] == "下一步":
        p["text"] = "完成并记录"
    elif p["name"] == "timer-value":
        p["text"] = "已完成"
    elif p["name"] == "开始计时":
        p["text"] = "回看做法"
hot("完成并记录", 137, 751, 237, 44, "record", "finish")
hot("回看做法", 237, 668, 121, 44, "detail")
screens.append(current)

page("record", "做菜记录", "pages/cook-log/index", "日期、掌勺人、评分与心得一起看；记录可再点或关联菜谱分享。")
nav("做菜记录")
heading("记录", "一家人的好味道，慢慢记下来。")
rect(16, 180, 358, 75, "white", 9, "本月统计")
for x, num, label in [(30, "8", "本月开火"), (152, "12", "做过菜品"), (272, "4.8", "平均评分")]:
    text(num, x, 187, 89, 25, weight=600)
    text(label, x, 224, 89, 11.5, "muted")
text("最近 7 天", 16, 279, 250, 13, "muted", 600)
for i, (day, date) in enumerate(zip("六日一二三四五", range(3, 10))):
    x = 16+i*51
    text(day, x, 307, 45, 11, "muted", align="center")
    rect(x+3, 333, 39, 32, "ink" if date == 9 else "soft", 8, f"日历 / {date}")
    text(str(date), x+3, 333, 39, 13, "white" if date == 9 else "ink", h=32, align="center")
text("今天 · 10 月 9 日", 16, 388, 358, 18, weight=600)
dish_row("番茄炒蛋", "dishes/tomato-egg.jpg", 429, "18:35 · 妈妈掌勺", "★★★★★  下次少放一点盐。", "晒到社区", "publish", 132)
text("再点一次", 135, 516, 84, 12, "red", h=32)
hot("再点一次番茄炒蛋", 128, 509, 100, 44, "home", "cart")
text("昨天 · 10 月 8 日", 16, 585, 358, 18, weight=600)
dish_row("红烧肉", "dishes/hongshao-pork.jpg", 622, "19:10 · 爸爸掌勺", "★★★★★  一家人都说好吃。", "看菜谱", "detail", 118)
bottom_tab("record")

page("community", "社区动态", "pages/community/index", "单列作品流；作者、作品、心得、关联菜谱和互动各有位置。")
nav("社区")
heading("别人家的饭桌", "晒一餐，也看看大家怎么做。", "+ 晒一餐", "publish")
rect(16, 182, 358, 44, "white", 9, "社区搜索")
icon("lucide/search.svg", 29, 194, 19, "muted")
text("搜作品、菜名和心得", 57, 182, 302, 13, "muted", h=44)
for x, label, active in [(16, "全部", True), (98, "家常菜", False), (199, "一人食", False), (300, "周末", False)]:
    text(label, x, 239, 74, 13, "red" if active else "muted", 600 if active else 400, h=36, align="center")
    hot(f"社区话题 · {label}", x, 235, 74, 44, "community", "topic")
rect(16, 288, 358, 447, "white", 9, "社区作品卡")
rect(29, 302, 33, 33, "soft", 10, "作者头像")
text("小", 29, 302, 33, 14, "muted", 600, h=33, align="center")
text("小满的厨房", 73, 301, 238, 14, weight=600)
text("今天 18:40", 73, 324, 238, 10.5, "muted")
photo("dishes/tomato-egg.jpg", 29, 350, 332, 218, 6, "作者作品实拍 / 示例")
text("十几分钟，端上家里的好味道", 29, 583, 332, 17, weight=600)
text("番茄炒出汁再加鸡蛋，拌饭太香了。", 29, 614, 332, 13, "muted")
rect(29, 646, 332, 44, "soft", 6, "关联菜谱")
icon("lucide/book-open.svg", 42, 659, 18, "muted")
text("跟做 · 番茄炒蛋", 70, 646, 275, 12.5, h=44)
hot("从作品查看菜谱", 29, 646, 332, 44, "detail")
icon("lucide/heart.svg", 30, 705, 18, "muted")
text("26", 58, 701, 42, 12, "muted")
icon("lucide/message-circle.svg", 177, 705, 18, "muted")
text("8", 207, 701, 42, 12, "muted")
text("看详情 ›", 277, 701, 84, 12, "muted", align="right")
hot("打开帖子详情", 29, 350, 332, 284, "post")
hot("查看评论", 169, 692, 87, 44, "post")
hot("帖子详情", 266, 692, 98, 44, "post")
bottom_tab("community")

page("post", "帖子详情与评论", "pkg-extra/community/post-detail/index", "先看作品，再连续阅读标题与心得；底部常驻互动。", bg="white")
nav("作品详情", "community")
rect(16, 108, 42, 42, "soft", 13, "作者头像")
text("小", 16, 108, 42, 18, "muted", 600, h=42, align="center")
text("小满的厨房", 72, 108, 218, 14, weight=600)
text("今天 18:40 · 作品分享", 72, 135, 218, 11.5, "muted")
text("分享", 316, 108, 58, 13, "muted", h=42, align="right")
hot("分享作品", 310, 106, 64, 44, "post", "share")
photo("dishes/tomato-egg.jpg", 16, 172, 358, 247, 8, "作品大图 / 示例")
text("十几分钟，端上家里的好味道", 16, 433, 358, 18, weight=600)
text("番茄炒出汁再加鸡蛋，拌饭太香了。", 16, 468, 358, 16)["lineHeight"] = 25.6
text("先用掉冰箱里的番茄，家人都很喜欢。", 16, 501, 358, 16)["lineHeight"] = 25.6
text("#家常菜   #今晚吃什么", 16, 542, 298, 12.5, "green", h=44)
text("举报", 329, 542, 45, 11.5, "muted", h=44, align="right")
rect(16, 594, 358, 80, "paper", 8, "关联菜谱卡", stroke=C["line"])
photo("dishes/tomato-egg.jpg", 28, 605, 58, 58)
text("关联菜谱", 100, 599, 257, 11, "green", 600)
text("番茄炒蛋", 100, 619, 257, 16, weight=600)
text("15 分钟 · 3 人份 · 看做法 ›", 100, 649, 257, 12, "muted")
hot("查看关联菜谱", 16, 594, 358, 80, "detail")
text("评论", 16, 692, 267, 18, weight=700)
text("8 条", 296, 695, 78, 12, "muted", align="right")
text("阿宁", 16, 732, 82, 12, weight=600)
text("看着就好吃，今晚也试试。", 91, 732, 283, 12.5, "muted")
rect(0, 754, 390, 90, "paper", 0, "帖子常驻互动")
rect(16, 766, 221, 44, "soft", 22, "评论输入")
icon("lucide/message-circle.svg", 31, 779, 17, "muted")
text("说点什么…", 57, 766, 164, 13, "muted", h=44)
icon("lucide/heart.svg", 254, 771, 23, "muted")
icon("lucide/bookmark.svg", 305, 771, 23, "muted")
icon("lucide/message-circle.svg", 350, 771, 23, "muted")
text("12", 245, 799, 42, 10, "muted", align="center")
text("3", 296, 799, 42, 10, "muted", align="center")
text("8", 342, 799, 42, 10, "muted", align="center")
hot("写评论", 16, 766, 221, 44, "post", "comment")
hot("点赞", 246, 762, 44, 48, "post", "like")
hot("收藏", 294, 762, 44, 48, "post", "favorite")
hot("查看全部评论", 342, 762, 44, 48, "post", "comment")
safe()

page("publish", "晒一餐 · 发布预览", "pages/community/index#publish-sheet", "记录带入关联菜谱，照片选填；发布在此仅做原型演示。")
nav("晒一餐", "record")
heading("晒晒这一餐", "一张成品图，一句心得，分享家里的好味道。")
rect(16, 180, 358, 52, "white", 8, "作品标题输入")
text("十几分钟，端上家里的好味道", 29, 180, 332, 16, weight=500, h=52)
rect(16, 246, 358, 173, "white", 8, "心得输入")
text("番茄炒出汁再加鸡蛋，拌饭太香了。\n今天先用了冰箱里的番茄，\n家人都很喜欢。", 29, 259, 332, 14)
text("写下做法调整和这一餐的心得…", 29, 382, 332, 12, "muted")
text("成品照片", 16, 439, 262, 15, weight=600)
text("选填 · 最多 9 张", 256, 441, 118, 11.5, "muted", align="right")
photo("dishes/tomato-egg.jpg", 16, 473, 105, 105)
rect(135, 473, 105, 105, "soft", 8, "添加照片")
text("+", 135, 485, 105, 29, "muted", h=45, align="center")
text("添加照片", 135, 535, 105, 12, "muted", align="center")
hot("添加成品照片", 135, 473, 105, 105, "photo")
rect(16, 604, 358, 83, "white", 8, "关联菜谱")
photo("dishes/tomato-egg.jpg", 28, 616, 59, 59)
text("已关联 · 番茄炒蛋", 101, 616, 257, 16, weight=600)
text("别人看见你的作品，也能跟着做。", 101, 647, 257, 12, "muted")
text("#家常菜   #今晚吃什么", 16, 709, 358, 12.5, "red")
button("发布这餐", 16, 765, 358, "post", action="publish")
safe()

page("me", "我的 · 家庭与厨房", "pages/me/index", "家人、统计、今日菜单与常用工具一起呈现。")
nav("我的")
rect(16, 108, 76, 76, "soft", 24, "个人头像")
text("家", 16, 108, 76, 28, "muted", 600, h=76, align="center")
text("一家人的厨房", 109, 113, 265, 25, weight=600)
text("一起点菜，一起好好吃饭。", 109, 156, 265, 13, "muted")
rect(16, 207, 358, 53, "white", 8, "家庭成员入口")
icon("lucide/users.svg", 29, 222, 23, "muted")
text("幸福一家 · 3 位家人", 67, 207, 247, 14, h=53)
text("›", 337, 207, 26, 20, "muted", h=53, align="center")
rect(16, 278, 358, 78, "white", 8, "个人厨房统计")
for x, num, label in [(29, "8", "本月做菜"), (151, "24", "我的菜谱"), (274, "12", "收藏")]:
    text(num, x, 285, 87, 26, weight=600)
    text(label, x, 325, 87, 11.5, "muted")
text("常用工具", 16, 383, 270, 18, weight=600)
tools = [("菜谱库", "recipes", "lucide/book-open.svg"), ("冰箱", "pantry", "tab-fridge.svg"),
         ("买菜清单", "shopping", "lucide/shopping-basket.svg"), ("做菜记录", "record", "tab-recipe.svg"),
         ("社区", "community", "tab-community.svg"), ("消息中心", "notifications", "lucide/bell.svg")]
for i, (label, to, asset) in enumerate(tools):
    x, y = 16+(i%3)*122, 425+(i//3)*88
    rect(x, y, 114, 76, "white", 8, f"常用工具 / {label}")
    icon(asset, x+44, y+13, 25, "muted")
    text(label, x+4, y+49, 106, 12, align="center")
    hot(label, x, y, 114, 76, to)
text("今天的菜单", 16, 620, 260, 18, weight=600)
rect(16, 659, 358, 73, "soft", 8, "今日菜单预览")
photo("dishes/hongshao-pork.jpg", 28, 671, 49, 49)
photo("dishes/tomato-egg.jpg", 87, 671, 49, 49)
text("晚餐 · 2 道菜", 151, 667, 207, 15, weight=600)
text("接着去厨房 ›", 151, 697, 207, 12, "muted")
hot("我的今日菜单", 16, 659, 358, 73, "cook")
bottom_tab("me")

page("notifications", "消息中心 · 临期通知", "pkg-extra/me/notifications/index", "批量已读在内容标题右侧；消息时间在卡头右上角，正文使用整卡宽度。")
nav("消息中心", "pantry")
heading("消息通知", "你有 1 条未读消息")
rect(251, 108, 123, 32, "white", 6, "批量已读按钮", stroke=C["line"])
icon("lucide/check.svg", 258, 116, 15, "muted")
text("全部标为已读", 278, 108, 91, 12, "muted", h=32, align="center")
hot("全部标为已读", 248, 102, 128, 44, "notifications", "read-all")
for x, label, width in [(16, "全部", 63), (89, "家庭", 63), (162, "社区", 63), (235, "系统", 63)]:
    rect(x, 180, width, 34, "ink" if label == "全部" else "soft", 8, f"消息分类 / {label}")
    text(label, x, 180, width, 12.5, "white" if label == "全部" else "muted", h=34, align="center")
rect(16, 228, 358, 216, "white", 9, "临期消息")
icon("tab-fridge.svg", 30, 244, 22, "red")
text("2 项食材快到期了", 64, 243, 204, 17, weight=600)
text("临期提醒", 64, 275, 204, 11.5, "muted")
text("今天 09:00", 278, 245, 82, 11.5, "muted", align="right")
text("番茄：还有 2 天，剩余 2 个。\n鸡蛋：还有 3 天，剩余 6 个。\n先看看冰箱能做什么，及时用起来。", 30, 314, 330, 14)
rect(30, 389, 330, 1, "line", 0, "消息分隔线")
text("● 未读", 30, 405, 126, 11.5, "red")
text("查看冰箱 ›", 222, 405, 138, 13, "red", align="right")
hot("从临期消息查看冰箱", 205, 398, 155, 44, "pantry")
rect(16, 461, 358, 148, "white", 9, "家庭消息")
icon("lucide/users.svg", 30, 477, 22, "muted")
text("晚餐又添了一道菜", 64, 477, 204, 17, weight=600)
text("家庭动态", 64, 509, 204, 11.5, "muted")
text("昨天 18:15", 278, 479, 82, 11.5, "muted", align="right")
text("妈妈点了番茄炒蛋，看看今晚的菜单。", 30, 546, 330, 13)
text("已读", 30, 580, 100, 11.5, "muted")
text("查看菜单 ›", 239, 578, 121, 12.5, "muted", align="right")
hot("从消息查看菜单", 231, 565, 129, 44, "home")
rect(16, 635, 358, 94, "soft", 8, "提醒状态说明")
text("微信提醒暂未开放", 30, 648, 330, 14, weight=600)
text("配置模板后，每次订阅可接收一条提醒。\n站内临期消息可从这里查看。", 30, 678, 330, 12, "muted")
safe()

current = copy.deepcopy(next(s for s in screens if s["id"] == "pantry"))
current.update(id="photo", title="食材图片 · 拍照选择", route="pages/pantry/index#photo-actions",
               note="无图默认名称；拍照、相册与恢复文字使用同一入口。此处仅演示选择界面。")
current["hotspots"] = []
screens.append(current)
rect(0, 0, 390, 844, "ink", 0, "弹层遮罩", opacity=.4)
rect(0, 505, 390, 339, "paper", 18, "食材照片操作面板")
rect(174, 517, 42, 4, "line", 2, "弹层拖动条")
text("为鸡蛋添加图片", 20, 540, 350, 23, weight=600)
rect(20, 587, 70, 70, "soft", 8, "名称占位预览")
text("鸡蛋", 20, 587, 70, 18, "muted", 600, h=70, align="center")
text("现在显示食材名称", 105, 589, 265, 15, weight=500)
text("有照片会优先显示；加载失败用名称。", 105, 622, 265, 11.5, "muted")
button("拍照", 20, 679, 169, "pantry", h=45, action="photo")
button("从相册选择", 201, 679, 169, "pantry", "soft", h=45, action="photo")
button("恢复文字显示", 20, 735, 350, "pantry", "soft", h=44, action="restore")
text("取消", 20, 790, 350, 14, "muted", h=36, align="center")
hot("取消图片选择", 20, 784, 350, 44, "pantry")
safe()

page("styles", "设计规范与常用元素", "", "复用当前小程序设计 token；图与文字的位置保持一致。", width=1260, height=650, board=True)
text("一家人的饭桌", 32, 24, 720, 35, weight=700)
text("现代优化 × 家庭点菜单 · 390 × 844 · 样例内容", 32, 83, 900, 16, "muted")
text("颜色", 32, 146, 300, 21, weight=600)
for i, (label, key) in enumerate([("暖纸色", "paper"), ("卡片", "white"), ("墨色", "ink"), ("番茄红", "red"), ("冰箱状态", "green")]):
    x = 32+i*120
    rect(x, 191, 100, 58, key, 8, f"色板 / {label}", stroke=C["line"])
    text(label, x, 264, 115, 14)
    text(C[key], x, 292, 115, 12, "muted")
text("字号与间距", 32, 356, 580, 21, weight=600)
text("页面标题 27 / 40", 32, 398, 580, 27, weight=600)
text("卡片菜名 17 / 26", 32, 450, 580, 17, weight=600)
text("正文 14 / 21 · 辅助文字 12 / 18", 32, 490, 580, 14)
text("页边距 16 · 列间距 12 · 卡片圆角 8\n交互热区优先 44；小按钮可由外层扩大热区。", 32, 533, 580, 13, "muted")
text("左图右文", 698, 146, 530, 21, weight=600)
rect(698, 193, 530, 160, "white", 8, "菜卡规范")
photo("dishes/tomato-egg.jpg", 714, 209, 122, 128)
text("番茄炒蛋", 853, 209, 353, 21, weight=600)
text("15 分钟 · 3 人份 · 家常", 853, 250, 353, 14, "muted")
text("用料：番茄、鸡蛋 · 食材齐全", 853, 283, 353, 14, "green")
text("窄列菜卡：简介、用料与操作另占整行。", 853, 315, 353, 13, "muted")
text("无图食材", 698, 399, 530, 21, weight=600)
thumb(None, "鸡蛋", 714, 448, 86)
text("鸡蛋", 820, 449, 378, 19, weight=600)
text("6 个 · 还有 3 天到期", 820, 485, 378, 14, "red")
text("上传照片后优先显示照片；失败回退名称。", 820, 519, 378, 13, "muted")
button("主要操作", 698, 573, 166, "home")
button("次要操作", 879, 573, 166, "home", "soft")

page("journey", "一餐的页面流程", "", "四条主线与冰箱支线；具体跳转已写入网页和 Figma 插件。", width=1260, height=650, board=True)
text("从今晚想吃什么，到一家人的好味道", 32, 24, 1160, 32, weight=600)
text("点菜  →  做菜  →  记录  →  社区  →  再点一次", 32, 80, 1160, 18, "muted")
groups = [("点菜", ["home", "recipes", "picker", "detail"]),
          ("备菜", ["pantry", "photo", "notifications", "shopping"]),
          ("做菜", ["cook", "step", "finish"]),
          ("记录与分享", ["record", "publish", "community", "post"])]
by_id = {s["id"]: s for s in screens}
for i, (group, keys) in enumerate(groups):
    x = 32+i*304
    text(group, x, 155, 281, 23, "red", 600)
    for j, key in enumerate(keys):
        y = 206+j*85
        rect(x, y, 280, 65, "white", 8, f"流程 / {key}")
        text(by_id[key]["title"], x+14, y+8, 252, 16, weight=500)
        text(key, x+14, y+36, 252, 11.5, "muted")
        hot(by_id[key]["title"], x, y, 280, 65, key)
text("社区作品 → 关联菜谱 → 点回今晚菜单     我的 → 冰箱 / 买菜 / 记录 / 消息", 32, 579, 1160, 15, "muted")


def svg(s, interactive=False):
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{s["width"]}" height="{s["height"]}" viewBox="0 0 {s["width"]} {s["height"]}">',
             f'<title>{html.escape(s["title"])}</title>',
             f'<rect width="100%" height="100%" fill="{s["bg"]}"/>']
    for i, p in enumerate(s["nodes"]):
        x, y, w, h = p["x"], p["y"], p["w"], p["h"]
        parts.append(f'<g id="layer-{i}" data-name="{html.escape(p["name"], quote=True)}" data-x="{x}" data-y="{y}" data-w="{w}" data-h="{h}">')
        opacity = f' opacity="{p["opacity"]}"' if "opacity" in p else ""
        if p["type"] == "rect":
            stroke = f' stroke="{p["stroke"]}"' if p.get("stroke") else ""
            parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{p["radius"]}" fill="{p["fill"]}"{opacity}{stroke}/>')
        elif p["type"] == "image":
            clip = f'clip-{s["id"]}-{i}'
            parts.append(f'<defs><clipPath id="{clip}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{p["radius"]}"/></clipPath></defs>')
            parts.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#{clip})" xlink:href="data:image/jpeg;base64,{images[p["asset"]]}"/>')
        elif p["type"] == "icon":
            raw = re.sub(r'<svg\b[^>]*>', '', p["svg"], count=1).rsplit('</svg>', 1)[0]
            box = re.search(r'viewBox="([^"]+)"', p["svg"]).group(1).split()
            attrs = re.search(r'<svg\b([^>]*)>', p["svg"]).group(1)
            styling = ' '.join(re.findall(r'(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="[^"]+"', attrs))
            parts.append(f'<g transform="translate({x} {y}) scale({w/float(box[2])} {h/float(box[3])})" {styling}>{raw}</g>')
        elif p["type"] == "text":
            anchor = {"left": "start", "center": "middle", "right": "end"}[p["align"]]
            tx = x + (w/2 if p["align"] == "center" else w if p["align"] == "right" else 0)
            lines = p["text"].split("\n")
            first = y + (h-p["lineHeight"]*len(lines))/2 + p["size"]
            parts.append(f'<text fill="{p["fill"]}" font-family="PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif" font-size="{p["size"]}" font-weight="{p["weight"]}" text-anchor="{anchor}">')
            for j, line in enumerate(lines):
                parts.append(f'<tspan x="{tx}" y="{first+j*p["lineHeight"]}">{html.escape(line)}</tspan>')
            parts.append('</text>')
        parts.append('</g>')
    parts.append('</svg>')
    return "\n".join(parts)


def build():
    (OUT / "screens").mkdir(exist_ok=True)
    (OUT / "figma-plugin").mkdir(exist_ok=True)
    all_pages = screens+boards
    keys = {s["id"] for s in all_pages}
    assert len(keys) == len(all_pages)
    for s in all_pages:
        for p in s["nodes"]+s["hotspots"]:
            assert p["w"] > 0 and p["h"] > 0, (s["id"], p)
            assert 0 <= p["x"] <= s["width"]-p["w"] and 0 <= p["y"] <= s["height"]-p["h"], (s["id"], p)
        for p in s["hotspots"]:
            assert p["to"] in keys, (s["id"], p)
        content = svg(s)
        ET.fromstring(content)
        (OUT / "screens" / f'{s["id"]}.svg').write_text(content)
    data = dict(title="一家人的饭桌", version="2026-11-04", width=390, height=844,
                tokens=C, screens=screens, boards=boards, images=images)
    (OUT / "prototype-data.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))
    webdata = dict(screens=[dict(id=s["id"], title=s["title"], route=s["route"], note=s["note"],
                                width=s["width"], height=s["height"], svg=svg(s), hotspots=s["hotspots"])
                            for s in all_pages], images=images)
    template = (OUT / "viewer.html").read_text()
    (OUT / "index.html").write_text(template.replace("/*__PROTOTYPE__*/ null", json.dumps(webdata, ensure_ascii=False).replace("</", "<\\/")))
    # 把共享解析函数打进离线原型，网页无需网络请求或第三方模型。
    generated = (OUT / "index.html").read_text()
    generated = generated.replace("/*__MEAL_REQUEST__*/ null", "(() => { const module = { exports: {} };\n" + (ROOT / "miniapp/utils/meal-request.js").read_text() + "\nreturn module.exports; })()")
    (OUT / "index.html").write_text(generated)
    plugin = (OUT / "plugin-template.js").read_text()
    (OUT / "figma-plugin/code.js").write_text(plugin.replace("/*__PROTOTYPE__*/", json.dumps(data, ensure_ascii=False)))
    manifest = dict(name="一家人的饭桌 · 可编辑原型", api="1.0.0", main="code.js",
                    editorType=["figma"], documentAccess="dynamic-page", networkAccess=dict(allowedDomains=["none"]))
    (OUT / "figma-plugin/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    evidence = dict(passed=True, screens=len(screens), boards=len(boards),
                    textNodes=sum(p["type"] == "text" for s in all_pages for p in s["nodes"]),
                    hotspots=sum(len(s["hotspots"]) for s in all_pages),
                    images=len(images), nativeFigmaImportVerified=False,
                    checks=["unique screen ids", "all targets exist", "all nodes and hotspots within frame", "valid SVG XML"])
    (OUT / "build-checks.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(OUT / "family-menu-figma-kit.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted((OUT / "screens").glob("*.svg")):
            z.write(p, p.relative_to(OUT))
        for name in ["index.html", "viewer.html", "prototype-data.json", "figma-plugin/code.js", "figma-plugin/manifest.json", "README.md"]:
            z.write(OUT / name, name)
        for name in ["build-checks.json", "importer-checks.json", "browser-checks.json", "verify.cjs"]:
            if (OUT / name).exists():
                z.write(OUT / name, name)
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    build()
