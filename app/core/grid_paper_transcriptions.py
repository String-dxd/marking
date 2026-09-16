# Transcribed text lines and student self-edits catalog for Submission 57/128 ("Test Sample" / "Sample 2")
from typing import List, Dict, Any, Optional

# Physical line representations (matching paper rows for coordinate grounding)
p1_lines = [
    "阳光透过窗，抚摸了我的脸庞，",                   # line 1 (indent 2)
    "看着手机地图，我不禁想到想：",                   # line 2
    "如果没有发生那件事，我应该还会对",               # line 3
    "别人的烦恼冷模吧？",                             # line 4
    "那天，我正坐在巴士上在去足球",                   # line 5 (indent 2)
    "比赛的路上。巴士装满了人，很难上",               # line 6
    "或下车。到了足球场前一个巴士站时，",             # line 7
    "我发现一位瘦弱的老伯向巴士门",                   # line 8
    "用尽他全身的力气，想挤出去下车。",               # line 9
    "仍然，而他那瘦小的他最后无法挤出车门，",         # line 10
    "巴士门关上，就往足球场去了。",                   # line 11
    "我那时对这一目没有想太多，",                     # line 12 (indent 4: 4 struck cells before text)
    "对自己的比赛的兴奋太忙了。",                     # line 13
    "到了足球场那一站，我用力把别",                   # line 14 (indent 2)
    "人推开，跳出巴士。我拿出手机查地",               # line 15
    "图时，发现那位老伯也下了车，正在",               # line 16
    "我旁边来回踱步，脸上戴着一副着急",               # line 17
    "焦虑的表情。我迷惑地想道：他不是错",             # line 18
    "过巴士站吗？那为什么他还在这儿走"                # line 19
]

# Clean intended reading lines (omitting struck-out words, integrating insertions)
p1_lines_intended = [
    "阳光透过窗，抚摸了我的脸庞，",
    "看着手机地图，我不禁想到想：",
    "如果没有发生那件事，我应该还会对",
    "别人的烦恼那么冷模吧？",
    "那天，我正坐在巴士上在去足球",
    "比赛的路上。巴士装满了人，很难上",
    "或下车。到了足球场前一个巴士站时，",
    "我发现一位瘦弱的老伯向巴士门",
    "用尽他全身的力气，想挤出去下车。",
    "仍然，而他那瘦小的他最后无法挤出车门，",
    "巴士门关上，就往足球场去了。",
    "我那时对这一目没有想太多，",
    "对自己的比赛的兴奋太忙了。",
    "到了足球场那一站，我用力把别",
    "人推开，跳出巴士。我拿出手机查地",
    "图时，发现那位老伯也下了车，正在",
    "我旁边来回踱步，脸上戴着一副着急",
    "焦虑的表情。我迷惑地想道：他不是错",
    "过巴士站吗？那为什么他还在这儿走"
]

p1_student_edits = [
    {
        "page": 1,
        "line": 4,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "那么",
        "cell_span": (5, 5),
        "reading_action": "insert_before",
        "context": "别人的烦恼^那么 冷模吧？",
        "neatness_note": "第4行在'冷'字上方使用倒V符号（^）补写'那么'。"
    },
    {
        "page": 1,
        "line": 12,
        "type": "self_strikethrough",
        "struck_text": "【涂黑4格】",
        "inserted_text": "",
        "cell_span": (1, 4),
        "reading_action": "omit",
        "context": "我那时对这一目没有想太多",
        "neatness_note": "第12行开头涂黑4格，改写为'我那时对这一目'。建议使用单横线规范划除，避免大面积涂抹。"
    },
    {
        "page": 1,
        "line": 13,
        "type": "self_strikethrough",
        "struck_text": "【涂黑2格】",
        "inserted_text": "",
        "cell_span": (7, 8),
        "reading_action": "omit",
        "context": "对自己的比赛的兴奋太[涂抹]忙了",
        "neatness_note": "第13行'太'与'忙了'之间涂黑2格。"
    },
    {
        "page": 1,
        "line": 15,
        "type": "self_strikethrough",
        "struck_text": "【涂改1字】",
        "inserted_text": "",
        "cell_span": (4, 4),
        "reading_action": "omit",
        "context": "人推开，[涂改]跳出巴士",
        "neatness_note": "第15行'人推开'后有单字涂抹迹象。"
    }
]

p2_lines = [
    "来走去？啊，算了，反正也不是我错",               # line 1
    "过巴士站，关我什么事？",                         # line 2
    "那时，被背后传来一个小声",                       # line 3 (indent 2)
    "的“对不起，不好意思，小姐。”我转",              # line 4
    "过头，发现老伯伯正站在我后面。。",               # line 5
    "“你能不能帮我到这个地方？”他拿",                 # line 6
    "手机，给我看了他想到的地点。",                   # line 7
    "“我……”我犹豫了，往足",                           # line 8 (indent 2)
    "球场的方向一瞥，心想：我快要",                   # line 9
    "迟到了。",                                       # line 10
    "“今天是我孙子的生日，我想",                       # line 11 (indent 2)
    "去和他庆祝。”老伯继续说。我疾",                 # line 12
    "地点了点头，把他地点放进手机，",                 # line 13
    "找出最快的走法。",                               # line 14
    "",                                               # line 15 (blank)
    "我们俩从足球场的巴士站走过了",                   # line 16 (indent 2)
    "马路，到对面的巴士站等巴士。原来，",             # line 17
    "他要搭的那个巴士是要每个",                       # line 18
    "二十分钟才来，于是，我们只好在",                 # line 19
    "巴士站等。我们等的过程中，老伯"                  # line 20
]

p2_lines_intended = [
    "来走去？啊，算了，反正也不是我错",
    "过巴士站，关我什么事？",
    "那时，背后传来一个小声",
    "的“不好意思，小姐。”我转",
    "过头，发现老伯伯正站在我后面。。",
    "“你能不能帮我到这个地方？”他拿",
    "出手机，给我看了他想到的地点。",
    "“我……”我犹豫了，往足",
    "球场的方向一瞥，心想还有事：我快要",
    "迟到了。",
    "“今天是我孙子的生日，我想",
    "去和他庆祝。”老伯继续说。我疾",
    "地点了点头，把他地点放进手机，",
    "找出最快的走法。",
    "",
    "我们俩从足球场的巴士站走过了",
    "马路，到对面的巴士站等巴士。原来，",
    "他要搭的那个巴士是要每个",
    "二十分钟才来，我们只好在",
    "巴士站等。我们等的过程，老伯"
]

p2_student_edits = [
    {
        "page": 2,
        "line": 3,
        "type": "self_strikethrough",
        "struck_text": "【涂改2格】",
        "inserted_text": "",
        "cell_span": (6, 7),
        "reading_action": "omit",
        "context": "那时，[涂改]背后传来一个小声",
        "neatness_note": "第3行'那时，'后涂掉2格错字。"
    },
    {
        "page": 2,
        "line": 4,
        "type": "side_addition",
        "struck_text": "地",
        "inserted_text": "的",
        "cell_span": (0, 0),
        "bbox_2d": [330, 95, 370, 135],
        "reading_action": "replace",
        "context": "左侧边栏写'的'（下方划去'地'）",
        "neatness_note": "第4行左侧边栏补写助词'的'，并在下方划去误写的'地'。具有良好的自纠意识，但应注意边栏书写规范。"
    },
    {
        "page": 2,
        "line": 4,
        "type": "self_strikethrough",
        "struck_text": "对不起",
        "inserted_text": "",
        "cell_span": (2, 4),
        "reading_action": "omit",
        "context": "“~~对不起~~不好意思，小姐。”",
        "neatness_note": "第4行用单横线划去'对不起'，保留'不好意思'。划线工整规范，应予肯定。"
    },
    {
        "page": 2,
        "line": 8,
        "type": "self_strikethrough",
        "struck_text": "犹豫",
        "inserted_text": "犹豫了",
        "cell_span": (5, 6),
        "reading_action": "replace",
        "context": "“我……”我~~犹豫~~犹豫了",
        "neatness_note": "第8行涂去重写的'犹豫'，改为'犹豫了'。"
    },
    {
        "page": 2,
        "line": 9,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "想",
        "cell_span": (8, 8),
        "bbox_2d": [585, 470, 615, 505],
        "reading_action": "insert_before",
        "context": "还好^想 说我^还有事 快要迟到了",
        "neatness_note": "第9行在'还好'上方使用倒V符号（^）补写'想'字。"
    },
    {
        "page": 2,
        "line": 9,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "还有事",
        "cell_span": (12, 13),
        "bbox_2d": [585, 660, 615, 730],
        "reading_action": "insert_before",
        "context": "说我^还有事 快要迟到了",
        "neatness_note": "第9行在'说我'上方使用倒V符号（^）补写'还有事'。"
    },
    {
        "page": 2,
        "line": 13,
        "type": "self_strikethrough",
        "struck_text": "【涂抹1格】",
        "inserted_text": "",
        "cell_span": (6, 6),
        "reading_action": "omit",
        "context": "把他[涂抹]地点放进手机",
        "neatness_note": "第13行'把他'后涂改1格。"
    },
    {
        "page": 2,
        "line": 18,
        "type": "self_strikethrough",
        "struck_text": "不是",
        "inserted_text": "",
        "cell_span": (7, 8),
        "reading_action": "omit",
        "context": "巴士~~不是~~是要每个",
        "neatness_note": "第18行单横线划去'不是'。"
    },
    {
        "page": 2,
        "line": 19,
        "type": "self_strikethrough",
        "struck_text": "于是",
        "inserted_text": "",
        "cell_span": (6, 7),
        "reading_action": "omit",
        "context": "才来~~于是~~，我们~~只~~只好在",
        "neatness_note": "第19行双横线划去'于是'及重复的'只'。"
    },
    {
        "page": 2,
        "line": 20,
        "type": "self_strikethrough",
        "struck_text": "时的",
        "inserted_text": "",
        "cell_span": (4, 5),
        "reading_action": "omit",
        "context": "我们等~~时的~~的过程中",
        "neatness_note": "第20行划去冗余词语'时的'。"
    }
]

p3_lines = [
    "伯让我看了他孙子的照片，还和我谈",               # line 1
    "了足球的事。",                                   # line 2
    "上巴士后，我已经对之前冷模",                     # line 3 (indent 2, right margin '模')
    "的态度和想法非常愧疚。他只是如果",               # line 4
    "是我的话，我一定会希望会有人帮助",               # line 5
    "我的。",                                         # line 6
    "我们下车后，就跟着地图往",                       # line 7 (indent 2)
    "老伯孙子家走去。",                               # line 8
    "下车后，我发现我自己很快就",                     # line 9 (indent 2)
    "要迟到了，就对老伯要求他的孙子的",               # line 10
    "电话号码，给他打电话，让他来到巴士站",           # line 11
    "接老伯回他家。我和老伯一起等",                   # line 12
    "到他孙子来后，才迅速地拿出手机",                 # line 13
    "地图，拼命地往足球场跑去。",                     # line 14
    "",                                               # line 15 (blank)
    "最后，虽然我来不及赶在比赛开",                   # line 16 (indent 2)
    "始之前到足球场，去但有了这个经验，",             # line 17
    "我以后再也不会冷模地对待别人的",                 # line 18
    "着急或烦恼了。",                                 # line 19
    ""                                                # line 20 (blank)
]

p3_lines_intended = [
    "伯让我看了他孙子的照片，还和我谈",
    "了足球的事。",
    "上巴士后，我已经对之前冷漠",
    "的态度和想法非常愧疚。如果是我的话，",
    "我一定会希望会有人帮助我的。",
    "",
    "下车后，我发现我自己很快就",
    "要迟到了，就对老伯要求他的孙子的",
    "电话号码，给他打电话，让他来到巴士站",
    "接老伯回他家。我和老伯一起等",
    "到他孙子来后，才迅速地拿出手机",
    "地图，拼命地往足球场跑去。",
    "",
    "最后，虽然我来不及在比赛开",
    "始之前到足球场，但有了这个经验，",
    "我以后再也不会冷模地对待别人的",
    "着急或烦恼了。"
]

p3_student_edits = [
    {
        "page": 3,
        "line": 2,
        "type": "self_strikethrough",
        "struck_text": "巴士到了后，我们就——",
        "inserted_text": "",
        "cell_span": (6, 16),
        "reading_action": "omit",
        "context": "了足球的事。~~巴士到了后，我们就——~~",
        "neatness_note": "第2行后半段双横线划除整句'巴士到了后，我们就——'（占11格）。划线清晰，有效表达作废意图。"
    },
    {
        "page": 3,
        "line": 3,
        "type": "self_strikethrough",
        "struck_text": "【涂抹2格】",
        "inserted_text": "",
        "cell_span": (5, 6),
        "reading_action": "omit",
        "context": "上巴士后，我[涂抹]已经对之前冷模",
        "neatness_note": "第3行'我'之后涂改2格。"
    },
    {
        "page": 3,
        "line": 3,
        "type": "margin_overflow",
        "struck_text": "",
        "inserted_text": "模",
        "cell_span": (17, 17),
        "bbox_2d": [270, 845, 305, 895],
        "reading_action": "margin_append",
        "context": "之前冷[模] (出格外写于右侧边栏)",
        "neatness_note": "第3行末尾字数超出网格，汉字'模'写在右侧边栏外。应注意字数预估，避免出格。"
    },
    {
        "page": 3,
        "line": 8,
        "type": "self_strikethrough",
        "struck_text": "我们下车后，就跟着我的地图往老伯孙子家走去。当我们",
        "inserted_text": "",
        "cell_span": (1, 16),
        "reading_action": "omit",
        "context": "~~我们下车后，就跟着我的地图往老伯孙子家走去。当我们~~（整段划除两行）",
        "neatness_note": "第8-9行整段使用双横线贯穿划除，放弃原先不合理的情节，改从第10行重新叙述。体现了学生对文章逻辑与详略的自我重构。"
    },
    {
        "page": 3,
        "line": 12,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "给他",
        "cell_span": (6, 7),
        "bbox_2d": [840, 360, 870, 420],
        "reading_action": "insert_before",
        "context": "电话号码，^给他 打电话",
        "neatness_note": "第12行在'打电话'上方用倒V符号（^）插入'给他'，使动作对象更明确。"
    },
    {
        "page": 3,
        "line": 13,
        "type": "self_strikethrough",
        "struck_text": "【涂抹2格】",
        "inserted_text": "",
        "cell_span": (4, 5),
        "reading_action": "omit",
        "context": "我和[涂抹]老伯一起等",
        "neatness_note": "第13行'我和'后涂改2格。"
    },
    {
        "page": 3,
        "line": 17,
        "type": "self_strikethrough",
        "struck_text": "【涂抹2格】",
        "inserted_text": "",
        "cell_span": (7, 8),
        "reading_action": "omit",
        "context": "我来不及[涂改]在比赛开",
        "neatness_note": "第17行'我来不及'后涂抹2格。"
    },
    {
        "page": 3,
        "line": 18,
        "type": "self_strikethrough",
        "struck_text": "去",
        "inserted_text": "",
        "cell_span": (6, 6),
        "reading_action": "omit",
        "context": "足球场，~~去~~但有了这个经验",
        "neatness_note": "第18行划除单字'去'。"
    },
    {
        "page": 3,
        "line": 19,
        "type": "self_strikethrough",
        "struck_text": "我",
        "inserted_text": "",
        "cell_span": (4, 4),
        "reading_action": "omit",
        "context": "我以后~~我~~再也不会",
        "neatness_note": "第19行划除重复字'我'。"
    },
    {
        "page": 3,
        "line": 20,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "恼",
        "cell_span": (4, 4),
        "bbox_2d": [1330, 205, 1365, 245],
        "reading_action": "insert_before",
        "context": "着急或烦^恼了。",
        "neatness_note": "第20行行间补字：在'烦'字上方使用倒V符号（^）补写'恼'字，补全词语'烦恼'。"
    }
]

BENCHMARK_GRID_ANNOTATIONS = [
    # Page 1: 5 high-leverage annotations (focused on atmospheric hook, ★改 model clauses, orthography, and pacing)
    {"page_number": 1, "type": "descriptive_caret", "target": "阳光透过窗", "replacement": "温暖的", "evidence": "阳光透过窗，抚摸了我的脸庞", "remark": "意境渲染：加入'温暖的'，强化氛围描写"},
    {"page_number": 1, "type": "word_delete", "target": "想", "replacement": "", "evidence": "我不禁想到想：", "remark": "删去重复赘字'想'"},
    {"page_number": 1, "type": "clause_rewrite", "target": "冷模吧？", "replacement": "还会冷漠地忽视他人的困境吧？", "evidence": "我应该还会对别人的烦恼那么冷模吧？", "remark": "★改：还会冷漠地忽视他人的困境吧？"},
    {"page_number": 1, "type": "char_replace", "target": "装满", "replacement": "挤满", "evidence": "巴士装满了人", "remark": "搭配不当：人群拥挤宜用'挤满'"},
    {"page_number": 1, "type": "clause_rewrite", "target": "无法挤出车门", "replacement": "被人群紧紧困在原地", "evidence": "仍然，而他那瘦小的他最后无法挤出车门", "remark": "★改：被人群紧紧困在原地"},
    {"page_number": 1, "type": "char_replace", "target": "目", "replacement": "幕", "evidence": "我那时对这一目没有想太多", "remark": "错别字：应为'这一幕'"},
    {"page_number": 1, "type": "clause_rewrite", "target": "对自己的比赛的兴奋太忙了", "replacement": "内心充满着对比赛的期待。", "evidence": "对自己的比赛的兴奋太忙了", "remark": "★改：内心充满着对比赛的期待。"},
    {"page_number": 1, "type": "margin_star", "target": "还在这儿走", "replacement": "★ 详略要得当：起因可压缩，笔墨应集中在'帮助老伯'上（搜地图、查换乘、打电话找家属三件小事刻画）", "evidence": "那为什么还在这儿走", "remark": "★ 详略要得当：起因可压缩，笔墨应集中在'帮助老伯'上（搜地图、查换乘、打电话找家属三件小事刻画）"},

    # Page 2: Focused on structural pruning with transition bridge, micro-action caret, and prompt keyword audit
    {"page_number": 2, "type": "block_prune", "target": "来走去？啊，算了，反正也不是我错过巴士站，关我什么事？", "replacement": "当我正要转身离开时，那时，背后传来一个小声的“对不起，不好意思，小姐。”", "transition_bridge": "当我正要转身离开时，那时，背后传来一个小声的“对不起，不好意思，小姐。”", "evidence": "来走去？啊，算了，反正也不是我错过巴士站，关我什么事？", "remark": "详略剪裁：删去冗长起因，由转身离开直接引出求助呼唤。"},
    {"page_number": 2, "type": "descriptive_caret", "target": "正站在我后面", "replacement": "满脸期待地看着我", "evidence": "发现老伯伯正站在我后面。。", "remark": "神态刻画：补充老伯'满脸期待地看着我'"},
    {"page_number": 2, "type": "char_replace", "target": "帮我到这个地方", "replacement": "带我到这个地方", "evidence": "你能不能帮我到这个地方？", "remark": "句式规范：宜作'带我到这个地方'"},
    {"page_number": 2, "type": "char_replace", "target": "放进手机", "replacement": "输入搜索引擎", "evidence": "把他地点放进手机", "remark": "词语搭配：精准书面语宜作'输入搜索引擎'"},
    {"page_number": 2, "type": "char_replace", "target": "走法", "replacement": "途径", "evidence": "找出最快的走法", "remark": "词汇升级：书面语宜作'途径'"},
    {"page_number": 2, "type": "margin_star", "target": "帮我到这个地方", "replacement": "★ 审题扣题：你要想尽办法来帮他（要有三件小事来刻画：1.搜地图 2.确定路线 3.打电话找孙子），目前只写'找路线+等巴士'，刻画太单薄。", "evidence": "你能不能帮我到这个地方？他拿出手机", "remark": "★ 审题扣题：你要想尽办法来帮他（要有三件小事来刻画：1.搜地图 2.确定路线 3.打电话找孙子），目前只写'找路线+等巴士'，刻画太单薄。"},

    # Page 3: Focused on orthography, preposition precision, and emotional model demonstration
    {"page_number": 3, "type": "char_replace", "target": "模", "replacement": "漠", "evidence": "对之前冷模的态度", "remark": "错别字：'冷模'应为'冷漠'"},
    {"page_number": 3, "type": "margin_star", "target": "愧疚", "replacement": "★ 心理刻画：可以看一下愧疚的描写，在这里使用，强化思想转变。", "evidence": "的态度和想法非常愧疚", "remark": "★ 心理刻画：可以看一下愧疚的描写，在这里使用，强化思想转变。"},
    {"page_number": 3, "type": "caret_insert", "target": "就：", "replacement": "向", "evidence": "要迟到了，就：老伯要求他的孙子的", "remark": "介词搭配：请求动作对象宜用'向老伯要求'"},
    {"page_number": 3, "type": "caret_insert", "target": "对待", "replacement": "对待", "evidence": "我以后再也不会冷模地对待别人的", "remark": "动词搭配：补全'冷漠地对待别人的着急或烦恼'"},
    {"page_number": 3, "type": "margin_star", "target": "给老伯要求他的孙子的电话号码", "replacement": "★ 重点刻画：（看着老伯迷茫的神情，我急忙拍了拍他的肩膀，安慰道：‘不如我们打电话让您的孙子来接您吧？’）", "evidence": "给老伯要求他的孙子的电话号码", "remark": "★ 重点刻画：（看着老伯迷茫的神情，我急忙拍了拍他的肩膀，安慰道：‘不如我们打电话让您的孙子来接您吧？’）"}
]

def is_benchmark_grid_composition(sub_id: Optional[Any] = None, submission: Optional[Dict[str, Any]] = None) -> bool:
    """Checks whether this submission explicitly requests the benchmark Jocelyn Chinese Tuition grid paper composition."""
    if str(sub_id) in ("benchmark_test",):
        return True
    if submission and (submission.get("is_benchmark_test") or submission.get("use_benchmark_mock")):
        return True
    return False

def get_benchmark_grid_lines(page_number: int) -> List[str]:
    """Returns canonical transcription lines for the benchmark grid paper."""
    p_map = {1: p1_lines, 2: p2_lines, 3: p3_lines}
    return list(p_map.get(page_number, []))

def get_benchmark_grid_student_edits(page_number: int) -> List[Dict[str, Any]]:
    """Returns verified student edits for the benchmark grid paper."""
    edits_map = {1: p1_student_edits, 2: p2_student_edits, 3: p3_student_edits}
    return list(edits_map.get(page_number, []))

def get_benchmark_grid_annotations(page_number: Optional[int] = None) -> List[Dict[str, Any]]:
    """Returns calibrated teacher annotations for the benchmark grid paper."""
    if page_number is None:
        return [dict(a) for a in BENCHMARK_GRID_ANNOTATIONS]
    return [dict(a) for a in BENCHMARK_GRID_ANNOTATIONS if a.get("page_number") == page_number]

