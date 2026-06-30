# 点菜小程序·家庭版 —— 产品与架构改造蓝图 v1

> 本文档是 2026-06-20 grilling 会话的结论固化,作为后续 V1→V4 开工的唯一依据。
> 凡与本文冲突的旧设计,以本文为准。代码尚未改动,本文先行。

---

## 一、一句话定位

**这是给一家人用的"今天吃什么"决策工具。** 主动作是"点菜",冰箱对账与买菜清单都是它的下游。打开第一眼看到的是"今天这一桌"。

非定位(明确不是):不是食谱内容社区(不主打逛菜谱),不是冰箱库存 ERP(不追精确余量为目的),不是周计划工具(周维度是 V2 扩展)。

---

## 二、核心闭环

```
点菜(往今日菜单加菜)
   │
   ▼
菜需要的食材  ──对账──  冰箱现有食材
   │                        │
   ▼                        ▼
缺的 → 买菜清单         做完菜 → 扣减回写冰箱
   │                        │
   └────────────────────────┘
        盘点/拍照 定期纠偏
```

---

## 三、关键产品决策(grilling 钉死)

### 3.1 今日菜单 = 家庭共享、全员可写、操作留痕

- 今日菜单是 family 级共享对象,所有家庭成员进来看到同一张。
- 权限:**全员可加菜/删菜**(不分掌勺/食客角色)。
- 约束:每次加/删都写一条操作日志(谁、何时、动作、哪道菜)。
- 留痕替代审批流——家庭小范围够用;白送"家庭动态"(如"小明刚加了红烧肉")。
- 早期设想的"掌勺单一写入"已被推翻,以此为准。

### 3.2 食材对账 = 按"计量方式"分类,一类一套逻辑

核心洞察:不同食材计量方式不同,不能用一套逻辑硬套。"番茄"能精确数,"酱油"只能估,"少许"根本没量。按计量分五类,各走各的对账逻辑(这是整个对账模型的心脏):

| 计量类 | 单位例 | 跟踪档 | 做菜时 | 精度定位 | 该买提醒 |
|---|---|---|---|---|---|
| 可数 | 个/只/条/块 | 计数 | 按原单位精确扣(番茄减2个) | **真账** | 剩余≤阈值 |
| 可称 | 克/ml(本身) | 计数 | 按原单位精确扣(肉减300g) | **真账** | 剩余≤阈值 |
| 瓶袋装 | 瓶/袋/盒 | 计数(ml估算) | 折算ml估扣(酱油30ml) | **估算进度条** | 估算≤阈值,下次点菜时问 |
| 整装/手感 | 把/份/撮 | 有无 或 够用 | 不扣量 | **只判在不在** | 复核或手动标"没了" |
| 无量 | 少许/适量 | 跟随主食材 | 当0或小固定值,不搅进度条 | 不计 | 不提醒 |

一句话:**能数的数、能称的称(真账);瓶装的估个进度条(信号);抓把的只问有没有;少许的不管。**

**瓶装 ml 估算的定位必须摆正**:它是"消耗进度条 / 该买提醒器",不是"精确库存计量器"。给出的"还剩 470ml"永远是估算值,作用是攒够多次使用后提醒"该买了",不能当真账看。字典为此加 `pack_size_ml`(1瓶=500ml默认)、模糊单位换算表(1勺≈15ml,够用再加),"少许/适量"折为小固定值或 0。

**track_mode(食材归哪类)的来源 = 三层,优先级 B>A>C**:
- C:系统按 category 自动推断(保证不空,可数→计数,瓶袋→有无/估算)
- A:字典 default_track_mode 覆盖(运营给常见食材标默认,比瞎猜准。**这是 V1 隐藏人工成本,需列入任务**)
- B:用户在冰箱里手动改(最高优先级,永远压倒前两层)

**单位策略(让对账能成立的前提)**:字典给每个食材定死一个单位("生抽就写瓶"),菜谱和冰箱都用它,录入时选不自由填——单位天然一致,减法才做得了。不追求上线覆盖全部,**用着不顺再单独增删那一个食材**(避免单位换算无底洞)。

每样食材带"显示开关",可折叠,避免冰箱变账本墙。

### 3.2b 有/无 档的复核机制(补"有无"档天生漏洞)

计数档靠扣减自我更新;有/无档不扣量,会永远停在"有"。用"被用到才复核"补漏:
- 做菜时记录哪些有/无档食材被用到。
- **下次点菜时**(不主动推送、不每天问),对这些食材给"还够吗?"待复核标记,用户点一下确认有/没了。
- "没了"自动进买菜清单,接回主闭环。
- 微信订阅消息推送 = V2(要申请模板+引导授权,独立工程,不卡 V1)。

### 3.3 标准用量 vs 实际用量(对账不打架的关键)

- **标准用量**:菜谱定义,系统/共享级,做菜时**预填的草稿**。永不被用户修改而"破坏"。
- **实际用量**:用户这次做菜确认的,本地/这一餐级,**真正扣冰箱的数**。
- 菜谱标 3 个番茄、你用 4 个 → 改实际量为 4,扣 4;菜谱标准不变,也不与冰箱"对不上"。

### 3.4 偷懒默认 = A(按标准量自动扣)

- 做完点"我做了这道菜",不填则按菜谱标准量扣冰箱;勤快则改实际量。
- 误差靠盘点纠偏。理由:家庭多数按菜谱差不多做,标准扣误差小且双向抵消;不扣则单向虚高更坑。

### 3.5 盘点 = 手动改数 + 拍照备忘(A+甲)

- 盘点:冰箱条目就地编辑"还剩__个" + "全部清零重录"入口。
- 拍照仅作留影备忘,**不做识图**。
- 数据结构现在就给识图留位:食材条目可挂 image_url、可标 source(manual/photo/ocr)。识图 = V2+ 可插拔增强。

---

## 四、信息架构改造(治"显示和操作逻辑不对"的本)

### 4.1 病灶(已用代码证据确认)

同一个对象/动作散落多个 tab,用户分不清在哪点、点完去哪看:

| 入口 | 首页 | 菜单tab | 我的tab |
|---|---|---|---|
| 冰箱 pantry | ✅ | ✅ | ✅ |
| 买菜清单 shopping | | ✅ | ✅ |
| 周菜单 weekly-menu | | ✅ | ✅ |

英文 eyebrow(Recipe Library / Tonight's Table / My Kitchen)残留在除首页外的页面。

### 4.2 三个对象(只许有这三个,多一个用户就懵)

| 对象 | 是什么 | 主场 |
|---|---|---|
| 菜谱库 | 所有能做的菜 | 菜谱 tab |
| 今日菜单 | 今天决定要做的菜(从菜谱挑入) | 今日餐桌 tab |
| 买菜清单 | 今日菜单食材 ➖ 冰箱 | 今日餐桌下游 |

### 4.3 四 tab 职责(各管一摊,入口去重)

| Tab | 唯一职责 | 第一屏 |
|---|---|---|
| **今日餐桌**(原"菜单"改名) | 今日菜单 + 买菜清单 + 家庭动态 + (V3)转盘 | ★ 当家 |
| **菜谱** | 唯一的点菜操作面:筛选 + 加入今日菜单 | |
| **冰箱**(原 pantry 升 tab) | 库存、三档维护、盘点、拍照 | |
| **我的** | 人和设置:成员/VIP/收藏/导入/设置 | |

去重动作:冰箱只留"冰箱 tab"一处(从首页/我的撤快捷入口或降为跳转);买菜/周菜单从"我的"撤,归今日餐桌。

第一屏归属:**今日餐桌当家**——进来先看今天这一桌,无今日菜单则引导去点。(用户确认 A 当家、BC 平级。)

---

## 五、数据模型改造

### 5.1 现状盘点(已读 schema.sql 确认)

地基比预想好,多数表已存在,缺的是"食材字典层"和几处字段:

| 表 | 现状 | 改造 |
|---|---|---|
| recipe / daily_menu / daily_menu_item / shopping_list / shopping_list_item / cook_history / pantry_item | ✅ 已存在 | 见下 |
| **ingredient(食材字典)** | ❌ 不存在 | **新建,V1 地基** |
| recipe_ingredient | ingredient_name 自由文本 | 加 ingredient_id 关联 + 加 standard 用量语义 |
| pantry_item | ingredient_name 自由文本,amount/unit | 加 ingredient_id + track_mode + level + image_url + source + visible |
| daily_menu_item | 无操作人 | 加 added_by_user_id |
| **menu_operation_log** | ❌ 不存在 | 新建(谁/何时/动作/哪道菜) |

### 5.2 食材字典(V1 不可逆地基,先建死)

```sql
-- 标准食材主表
CREATE TABLE IF NOT EXISTS ingredient (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    canonical_name VARCHAR(64) NOT NULL,   -- 标准名:西红柿
    category VARCHAR(32) NULL,             -- 蔬菜/肉禽/调料...(C 层自动推断依据)
    measure_class VARCHAR(16) NOT NULL DEFAULT 'count', -- 计量类:countable/weighable/bottled/bulk/none
    default_unit VARCHAR(16) NULL,         -- 默认单位:个/克/瓶/把(录入强制用它)
    default_track_mode VARCHAR(16) NOT NULL DEFAULT 'count', -- count/boolean/level(A 层默认)
    pack_size_ml INT NULL,                 -- 瓶袋装:1 单位折多少 ml(估算进度条用,如 500)
    per_use_ml INT NULL,                   -- 无标准量时每次默认消耗 ml
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ingredient_name (canonical_name)
);
-- 别名表(番茄/蕃茄 → 西红柿),录入归一化用
CREATE TABLE IF NOT EXISTS ingredient_alias (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    ingredient_id BIGINT NOT NULL,
    alias VARCHAR(64) NOT NULL,
    UNIQUE KEY uk_alias (alias),
    INDEX idx_alias_ingredient (ingredient_id)
);
-- 模糊单位换算表(1勺≈15ml),不求全,够用再加
CREATE TABLE IF NOT EXISTS unit_conversion (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    unit VARCHAR(16) NOT NULL,             -- 勺/茶匙/大勺
    to_ml INT NOT NULL,                    -- 折算 ml(少许/适量 → 0 或小固定值)
    UNIQUE KEY uk_unit (unit)
);
```

归一化策略:录入食材名 → 去空格 → 查 ingredient_alias/canonical_name → 命中则关联 id,未命中则新建 ingredient + 提示(避免脏数据)。

### 5.3 现有表的 ALTER(前向兼容,IF NOT EXISTS 思路)

```sql
ALTER TABLE recipe_ingredient ADD COLUMN ingredient_id BIGINT NULL;       -- 关联字典
-- amount/unit 语义即"标准用量",保留
ALTER TABLE pantry_item ADD COLUMN ingredient_id BIGINT NULL;
ALTER TABLE pantry_item ADD COLUMN track_mode VARCHAR(16) NOT NULL DEFAULT 'count';  -- count/boolean/level
ALTER TABLE pantry_item ADD COLUMN remaining_ml INT NULL;     -- 瓶装估算剩余(进度条,非真账)
ALTER TABLE pantry_item ADD COLUMN level VARCHAR(16) NULL;    -- enough/low/out(够用档)
ALTER TABLE pantry_item ADD COLUMN need_restock TINYINT NOT NULL DEFAULT 0;  -- 该买标记
ALTER TABLE pantry_item ADD COLUMN last_used_at DATETIME NULL;   -- 有/无档复核触发依据
ALTER TABLE pantry_item ADD COLUMN recheck_pending TINYINT NOT NULL DEFAULT 0; -- 待复核(下次点菜问)
ALTER TABLE pantry_item ADD COLUMN image_url VARCHAR(512) NULL;
ALTER TABLE pantry_item ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'manual'; -- manual/photo/ocr
ALTER TABLE pantry_item ADD COLUMN visible TINYINT NOT NULL DEFAULT 1;
ALTER TABLE daily_menu_item ADD COLUMN added_by_user_id BIGINT NULL;
```

```sql
CREATE TABLE IF NOT EXISTS menu_operation_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    daily_menu_id BIGINT NOT NULL,
    operator_user_id BIGINT NOT NULL,
    action VARCHAR(16) NOT NULL,          -- ADD/REMOVE
    recipe_id BIGINT NOT NULL,
    recipe_title VARCHAR(128) NULL,       -- 冗余,删菜后仍可读
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_menu_log_menu (daily_menu_id, created_at DESC)
);
```

### 5.4 "实际用量"落在哪

做菜回写需要一张"本餐实际消耗"记录(标准用量来自 recipe_ingredient,实际由用户改):

```sql
CREATE TABLE IF NOT EXISTS cook_consumption (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    cook_history_id BIGINT NOT NULL,      -- 关联本次做菜
    ingredient_id BIGINT NOT NULL,
    planned_amount VARCHAR(32) NULL,      -- 标准量(预填)
    actual_amount VARCHAR(32) NULL,       -- 实际量(扣冰箱用)
    unit VARCHAR(16) NULL,
    INDEX idx_consumption_cook (cook_history_id)
);
```

---

## 六、路线图

| 期 | 内容 | 出口标志 |
|---|---|---|
| **V1** | 食材字典 + 对账 + 今日闭环(点菜→买菜清单→冰箱拍照盘点)+ 共享菜单留痕 | 一天的"点→买→做→扣"跑顺 |
| **V2** | 周菜单(按天排)+ 人人点单增强 + 识图入库 | 时间维度 + 智能录入 |
| **V3** | 大转盘三档(零采购/将就/随便)+ 每档说明。菜源 = 做过+收藏+社区收藏 | 对账的情感回报出口 |
| **V4** | 凑一桌组合推荐(冰箱主料+补几样成一桌),初版人工规则(几荤几素一汤)非 AI | 最重,垫底 |

---

## 七、诚实风险与待确认

1. **食材字典是不可逆结构改动**:V1 一旦建表并关联,回退成本高。建议 V1 先在一个空测试库跑通全新 schema,再上现有库。
2. **归一化覆盖率**:别名表初期不全,陌生食材会新建条目,需人工运营补别名,否则"番茄/西红柿"短期仍可能并存。
2b. **食材计量分类是人工运营活**:每个食材要标 measure_class/default_unit/default_track_mode/pack_size_ml,字典几百条,初始化需人工逐条定(C 层自动推断只能兜底,标不准)。V1 必须把"种子字典 + 常见食材计量标注"列为独立任务,别低估。瓶装 ml 估算只是"该买信号",不是真账,产品文案上不要承诺"精确剩余"。
3. **现有前端 43 页**:tab 改造会动 home/recipes/menu/me 四个主页 + tabBar 配置,工作量不小,建议先空壳验证结构(grilling 时的 C 选项)再填。
4. **支付/会员前端悬空**(背景遗留):/api/payment/* 已就绪但前端只调老 /api/vip/*,与本蓝图正交,另行安排。
5. **全新空库 schema 从未实跑**(背景遗留):见风险 1,建议并入 V1 第一步。

