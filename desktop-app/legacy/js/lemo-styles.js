/* Lemo-Opuscar 59 种风格，注入旧 CodeMV 的风格库（不替换原有 100+ 风格） */
(function (NS) {
  if (!NS.styleLibrary || !NS.styleLibrary.list) return;
  var LEMO = [
{
"id": "lemo-caption-news",
"name": "字幕新闻",
"slug": "caption-news",
"en": "Caption News",
"cat": "剪辑与纪实",
"desc": "美国一年死掉 130 万箱蜜蜂，总数却涨了 6%：静音也能看懂的新闻。",
"uses": "Social news / Report explainers / Data shorts",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/caption-news_0.jpg"
},
{
"id": "lemo-newsreel",
"name": "1920s 新闻影片",
"slug": "newsreel",
"en": "1920s Newsreel",
"cat": "剪辑与纪实",
"desc": "1926 年报纸说查尔斯顿会跳坏膝盖，福特工人野餐会上的孩子照跳不误。",
"uses": "History stories / Fads & eras / Anniversaries",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/newsreel_0.jpg"
},
{
"id": "lemo-countdown",
"name": "实时倒计时分屏",
"slug": "countdown",
"en": "Live Countdown Split-screen",
"cat": "剪辑与纪实",
"desc": "阿尔忒弥斯二号发射的最后一分钟，一秒不剪：格子从 1 开到 9，点火合成 1。",
"uses": "Launches / Countdowns / Live events",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/countdown_0.jpg"
},
{
"id": "lemo-city-symphony",
"name": "延时交响",
"slug": "city-symphony",
"en": "Time-lapse Symphony",
"cat": "剪辑与纪实",
"desc": "纽约的一天：延时光河、踩着十六分音符的网格，1899 年和今天并排。",
"uses": "City films / Music montages / Openers",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/city-symphony_0.jpg"
},
{
"id": "lemo-visual-investigation",
"name": "视觉调查",
"slug": "visual-investigation",
"en": "Visual Investigation",
"cat": "剪辑与纪实",
"desc": "新闻片、照片、证词和调查报告排上同一条时间轴，五路来源指向一处。",
"uses": "Reconstructions / Fact-checks / Incident reports",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/visual-investigation_0.jpg"
},
{
"id": "lemo-kino-montage",
"name": "构成主义蒙太奇",
"slug": "kino-montage",
"en": "Constructivist Montage",
"cat": "剪辑与纪实",
"desc": "帝国大厦的小册子写着建造者，工地实拍和老照片给出答案：每天 2,500 人。",
"uses": "Industry histories / Milestones / Collective effort",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/kino-montage_0.jpg"
},
{
"id": "lemo-telestrator",
"name": "体育战术板",
"slug": "telestrator",
"en": "Sports Telestrator",
"cat": "剪辑与纪实",
"desc": "半场 0–3，费内巴切 12 分钟连进三球：冻住画面、画线、分屏、射门图。",
"uses": "Sports analysis / Match recaps / Coaching",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/telestrator_0.jpg"
},
{
"id": "lemo-news-package",
"name": "电视新闻包装",
"slug": "news-package",
"en": "Broadcast News Package",
"cat": "剪辑与纪实",
"desc": "一周四条 AI 新闻，一整套电视台包装：串联单、标题条、翻牌价格表、规格卡。",
"uses": "News round-ups / Bulletins / Market updates",
"palette": "steel",
"forms": [
"grid",
"lines"
],
"motion": "wipe",
"texture": "scanlines",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/news-package_0.jpg"
},
{
"id": "lemo-satellite-briefing",
"name": "卫星简报",
"slug": "satellite-briefing",
"en": "Satellite Briefing",
"cat": "实证影像",
"desc": "卫星照着地图去找咸海，找到的是沙漠；只有筑了坝的那一块回来了。",
"uses": "Climate / News explainers / Geography",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/satellite-briefing_0.jpg"
},
{
"id": "lemo-briefing-board",
"name": "工程简报板",
"slug": "briefing-board",
"en": "Engineering Briefing Board",
"cat": "实证影像",
"desc": "一条河要架桥，四种桥型在一面简报墙上逐个受检，拍板的是桥下要过的船。",
"uses": "Engineering / Option comparisons / Briefings",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/briefing-board_0.jpg"
},
{
"id": "lemo-lidar-survey",
"name": "点云测绘",
"slug": "lidar-survey",
"en": "LiDAR Survey",
"cat": "实证影像",
"desc": "激光点云剥掉一片森林的树冠，露出当年农田的石墙：3.4 公里。",
"uses": "Heritage / Environment / Site surveys",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/lidar-survey_0.jpg"
},
{
"id": "lemo-white-model",
"name": "白模投影",
"slug": "white-model",
"en": "Projection on White Model",
"cat": "实证影像",
"desc": "投影机把数据一层层刷上鹿特丹白模：从 1940 年的空洞到今天的塔楼。",
"uses": "Urban planning / Exhibitions / City data",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/white-model_0.jpg"
},
{
"id": "lemo-data-physical",
"name": "数据实物化",
"slug": "data-physical",
"en": "Data Physicalization",
"cat": "实证影像",
"desc": "十二年风电和太阳能装机叠成实物，绕表盘升成两条螺旋，2021 年太阳能反超。",
"uses": "Annual reports / Investor decks / Energy data",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/data-physical_0.jpg"
},
{
"id": "lemo-teardown",
"name": "产品拆解",
"slug": "teardown",
"en": "Exploded Teardown",
"cat": "实证影像",
"desc": "开源键盘的一半在一次环绕中逐层拆开，看到主控再合拢，标上真实尺寸。",
"uses": "Hardware launches / Product pages / Spec explainers",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/teardown_0.jpg"
},
{
"id": "lemo-microscope",
"name": "显微叙事",
"slug": "microscope",
"en": "Microscope Story",
"cat": "实证影像",
"desc": "一镜从肝组织玻片推到单个细胞核，两个圆逐像素数出 2.4 倍的蓝。",
"uses": "Biomedicine / Materials science / Skincare science",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/microscope_0.jpg"
},
{
"id": "lemo-archive-lighttable",
"name": "档案灯台",
"slug": "archive-lighttable",
"en": "Archive Light Table",
"cat": "实证影像",
"desc": "电报说最长飞了 57 秒；放大镜下，莱特兄弟的底片和档案说是 59 秒。",
"uses": "Brand history / Archive stories / Museums",
"palette": "ice",
"forms": [
"grid",
"dots"
],
"motion": "drift",
"texture": "dots",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/archive-lighttable_0.jpg"
},
{
"id": "lemo-crayon-book",
"name": "蜡笔儿童绘本",
"slug": "crayon-book",
"en": "Crayon Picture Book",
"cat": "手绘与绘画",
"desc": "月亮失眠了，小女孩爬上屋顶给它唱摇篮曲。",
"uses": "Picture books / Bedtime stories / Kids' learning",
"palette": "paper",
"forms": [
"orbs",
"ribbons"
],
"motion": "flow",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/crayon-book_0.jpg"
},
{
"id": "lemo-watercolor",
"name": "水彩笔刷",
"slug": "watercolor",
"en": "Watercolor Brush",
"cat": "手绘与绘画",
"desc": "跟着降雨从澳洲红色腹地一路画到绿色海岸，一镜到底。",
"uses": "Nature documentary / Travel / Science explainers",
"palette": "paper",
"forms": [
"orbs",
"ribbons"
],
"motion": "flow",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/watercolor_0.jpg"
},
{
"id": "lemo-ink-wash",
"name": "中国水墨",
"slug": "ink-wash",
"en": "Chinese Ink Wash",
"cat": "手绘与绘画",
"desc": "侠客踏水过江，一剑断流。",
"uses": "Wuxia / Cultural brands / Poetry",
"palette": "paper",
"forms": [
"orbs",
"ribbons"
],
"motion": "flow",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/ink-wash_0.jpg"
},
{
"id": "lemo-impasto",
"name": "油画厚涂",
"slug": "impasto",
"en": "Impasto Oil Painting",
"cat": "手绘与绘画",
"desc": "灰色雨中广场，第一把红伞撑开，圆舞曲把整个广场刷上颜色。",
"uses": "Music videos / Art & culture / Emotional ads",
"palette": "paper",
"forms": [
"orbs",
"ribbons"
],
"motion": "flow",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/impasto_0.jpg"
},
{
"id": "lemo-one-line",
"name": "一笔画",
"slug": "one-line",
"en": "One-line Drawing",
"cat": "手绘与绘画",
"desc": "一根不离纸的线画完一个人的一生，再把笔交给孩子。",
"uses": "Brand stories / Life milestones / Minimal ads",
"palette": "paper",
"forms": [
"orbs",
"ribbons"
],
"motion": "flow",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/one-line_0.jpg"
},
{
"id": "lemo-whiteboard",
"name": "白板讲解",
"slug": "whiteboard",
"en": "Whiteboard Explainer",
"cat": "手绘与绘画",
"desc": "手机怎么知道你在哪：GPS、原子钟，和相对论每天多出的 38 微秒。",
"uses": "Explainers / Online courses / Science",
"palette": "paper",
"forms": [
"orbs",
"ribbons"
],
"motion": "flow",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/whiteboard_0.jpg"
},
{
"id": "lemo-urban-sketch",
"name": "钢笔淡彩",
"slug": "urban-sketch",
"en": "Urban Sketch · Pen & Wash",
"cat": "手绘与绘画",
"desc": "公园只是一张钢笔速写，风把草帽吹到哪里，哪里才有颜色。",
"uses": "City & travel / Architecture / Lifestyle brands",
"palette": "paper",
"forms": [
"orbs",
"ribbons"
],
"motion": "flow",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/urban-sketch_0.jpg"
},
{
"id": "lemo-shadow-puppet",
"name": "皮影戏",
"slug": "shadow-puppet",
"en": "Shadow Puppetry",
"cat": "东方传统",
"desc": "十日炙烤大地，后羿张弓射日。",
"uses": "Myths & folklore / Heritage / Festivals",
"palette": "sand",
"forms": [
"orbs",
"arcs"
],
"motion": "sway",
"texture": "grain",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/shadow-puppet_0.jpg"
},
{
"id": "lemo-ukiyoe",
"name": "浮世绘",
"slug": "ukiyoe",
"en": "Ukiyo-e",
"cat": "东方传统",
"desc": "旅人走向远山，每个镜头都是一幅版画；巨浪是高潮，结尾是远山与整幅画轴拉远。",
"uses": "Travel / Japanese culture / Poetry",
"palette": "sand",
"forms": [
"orbs",
"arcs"
],
"motion": "sway",
"texture": "grain",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/ukiyoe_0.jpg"
},
{
"id": "lemo-papercut-red",
"name": "红色窗花剪纸",
"slug": "papercut-red",
"en": "Red Paper-cut",
"cat": "东方传统",
"desc": "除夕年兽进村，小女孩剪出的大窗花照亮全村，把它吓跑。",
"uses": "Lunar New Year / Festive greetings / Folk tales",
"palette": "sand",
"forms": [
"orbs",
"arcs"
],
"motion": "sway",
"texture": "grain",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/papercut-red_0.jpg"
},
{
"id": "lemo-paper-lantern",
"name": "纸雕灯影",
"slug": "paper-lantern",
"en": "Paper-cut Lightbox",
"cat": "东方传统",
"desc": "一枚月饼讲中秋的团圆与思念，纸雕灯箱层层透光。",
"uses": "Festivals / Gift brands / Cultural stories",
"palette": "sand",
"forms": [
"orbs",
"arcs"
],
"motion": "sway",
"texture": "grain",
"overlay": "frame",
"lyric": "plain",
"image": "/style-library/img/paper-lantern_0.jpg"
},
{
"id": "lemo-risograph",
"name": "Risograph 孔版印刷",
"slug": "risograph",
"en": "Risograph Print",
"cat": "印刷与版画",
"desc": "周日早晨骑车穿过城市：面包店、公园、河边，每到一处加一版油墨，最后三版套印。",
"uses": "Indie brands / Zines / Lifestyle",
"palette": "retro",
"forms": [
"blocks",
"lines"
],
"motion": "wipe",
"texture": "halftone",
"overlay": "vignette",
"lyric": "block",
"image": "/style-library/img/risograph_0.jpg"
},
{
"id": "lemo-halftone-dossier",
"name": "复古半调案卷",
"slug": "halftone-dossier",
"en": "Halftone Dossier",
"cat": "印刷与版画",
"desc": "橘猫胖橘被立案审查：测试重力、凌晨跑酷，最后无罪释放。",
"uses": "Humour / Pet content / Social shorts",
"palette": "retro",
"forms": [
"blocks",
"lines"
],
"motion": "wipe",
"texture": "halftone",
"overlay": "vignette",
"lyric": "block",
"image": "/style-library/img/halftone-dossier_0.jpg"
},
{
"id": "lemo-woodcut",
"name": "木刻版画",
"slug": "woodcut",
"en": "Woodcut Print",
"cat": "印刷与版画",
"desc": "村子用一整个冬天铸一口钟，钟声第一次响起，雪停了。",
"uses": "Folk tales / Craft brands / Book trailers",
"palette": "retro",
"forms": [
"blocks",
"lines"
],
"motion": "wipe",
"texture": "halftone",
"overlay": "vignette",
"lyric": "block",
"image": "/style-library/img/woodcut_0.jpg"
},
{
"id": "lemo-engraving",
"name": "铜版画",
"slug": "engraving",
"en": "Copperplate Engraving",
"cat": "印刷与版画",
"desc": "一张博物志图版自己刻出来：雕刀推开铜版，蜜蜂一线线成形，最后手工水彩上色。",
"uses": "Museum labels / Science explainers / Brand heritage",
"palette": "retro",
"forms": [
"blocks",
"lines"
],
"motion": "wipe",
"texture": "halftone",
"overlay": "vignette",
"lyric": "block",
"image": "/style-library/img/engraving_0.jpg"
},
{
"id": "lemo-silkscreen-poster",
"name": "丝印旅行海报",
"slug": "silkscreen-poster",
"en": "Silkscreen Travel Poster",
"cat": "印刷与版画",
"desc": "三条步道各一张丝印海报，一色一刮印出来，再沿山脊一镜到底从正午爬到黄昏。",
"uses": "Destination guides / Tourism / Event posters",
"palette": "retro",
"forms": [
"blocks",
"lines"
],
"motion": "wipe",
"texture": "halftone",
"overlay": "vignette",
"lyric": "block",
"image": "/style-library/img/silkscreen-poster_0.jpg"
},
{
"id": "lemo-swiss-motion",
"name": "瑞士动态排版",
"slug": "swiss-motion",
"en": "Swiss Motion Graphics",
"cat": "图形与排版",
"desc": "一张音乐会海报按瑞士设计的五条规则自己排版，第五条是只打破一条。",
"uses": "Brand identity / Events / Design education",
"palette": "mono",
"forms": [
"grid",
"steps"
],
"motion": "pulse",
"texture": "none",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/swiss-motion_0.jpg"
},
{
"id": "lemo-spy-titles",
"name": "60s 间谍片头",
"slug": "spy-titles",
"en": "60s Spy Title Sequence",
"cat": "图形与排版",
"desc": "虚构 1964 年间谍片的片头：追一把被偷的钥匙，几何碎片最后拼成片名。",
"uses": "Title sequences / Event openers / Trailers",
"palette": "mono",
"forms": [
"grid",
"steps"
],
"motion": "pulse",
"texture": "none",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/spy-titles_0.jpg"
},
{
"id": "lemo-art-deco",
"name": "装饰艺术",
"slug": "art-deco",
"en": "Art Deco",
"cat": "图形与排版",
"desc": "1930 年的大饭店，门童赶在午夜前把一封信送上顶楼。",
"uses": "Luxury & hospitality / Galas / Invitations",
"palette": "mono",
"forms": [
"grid",
"steps"
],
"motion": "pulse",
"texture": "none",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/art-deco_0.jpg"
},
{
"id": "lemo-blueprint",
"name": "蓝图 / 工程制图",
"slug": "blueprint",
"en": "Blueprint",
"cat": "图形与排版",
"desc": "发明家的蓝图自己画出一台接云机器，修订云线变成了真的雨云。",
"uses": "Engineering / Hardware launches / Tech explainers",
"palette": "mono",
"forms": [
"grid",
"steps"
],
"motion": "pulse",
"texture": "none",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/blueprint_0.jpg"
},
{
"id": "lemo-stained-glass",
"name": "彩色玻璃窗",
"slug": "stained-glass",
"en": "Stained Glass",
"cat": "图形与排版",
"desc": "阳光从清晨移到黄昏，照到哪一格花窗，哪一格的故事就动起来。",
"uses": "Legends / Heritage / Holiday stories",
"palette": "mono",
"forms": [
"grid",
"steps"
],
"motion": "pulse",
"texture": "none",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/stained-glass_0.jpg"
},
{
"id": "lemo-pictogram-motion",
"name": "象形运动图形",
"slug": "pictogram-motion",
"en": "Pictogram Motion",
"cat": "图形与排版",
"desc": "2026 亚运会 43 个大项，几何象形人卡着节拍快闪。",
"uses": "Sports events / Visual identity / Event openers",
"palette": "mono",
"forms": [
"grid",
"steps"
],
"motion": "pulse",
"texture": "none",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/pictogram-motion_0.jpg"
},
{
"id": "lemo-ascii-crt",
"name": "ASCII / CRT 终端",
"slug": "ascii-crt",
"en": "ASCII / CRT Terminal",
"cat": "图形与排版",
"desc": "月球基地的 AI 沉睡 40 年后被唤醒，用字符画出“家”来回复。",
"uses": "Developer tools / Sci-fi / Tech brands",
"palette": "mono",
"forms": [
"grid",
"steps"
],
"motion": "pulse",
"texture": "none",
"overlay": "frame",
"lyric": "mono",
"image": "/style-library/img/ascii-crt_0.jpg"
},
{
"id": "lemo-dataviz",
"name": "数据叙事",
"slug": "dataviz",
"en": "Data Storytelling",
"cat": "信息与发布",
"desc": "一百年的夏季气温，图表本身就是故事。",
"uses": "Data journalism / Reports / Climate & science",
"palette": "cyan",
"forms": [
"grid",
"radialBars"
],
"motion": "pulse",
"texture": "dots",
"overlay": "none",
"lyric": "mono",
"image": "/style-library/img/dataviz_0.jpg"
},
{
"id": "lemo-iso-infographic",
"name": "等距信息图",
"slug": "iso-infographic",
"en": "Isometric Infographic",
"cat": "信息与发布",
"desc": "一杯咖啡从种植园到你手里的旅程。",
"uses": "Process explainers / Supply chains / Annual reports",
"palette": "cyan",
"forms": [
"grid",
"radialBars"
],
"motion": "pulse",
"texture": "dots",
"overlay": "none",
"lyric": "mono",
"image": "/style-library/img/iso-infographic_0.jpg"
},
{
"id": "lemo-dark-keynote",
"name": "暗色科技发布",
"slug": "dark-keynote",
"en": "Dark Tech Keynote",
"cat": "信息与发布",
"desc": "虚构 app Tidy 的发布片：被埋掉的光标一键把几百个窗口归位。",
"uses": "Product launches / SaaS / Keynotes",
"palette": "cyan",
"forms": [
"grid",
"radialBars"
],
"motion": "pulse",
"texture": "dots",
"overlay": "none",
"lyric": "mono",
"image": "/style-library/img/dark-keynote_0.jpg"
},
{
"id": "lemo-living-screencast",
"name": "活体实机录屏",
"slug": "living-screencast",
"en": "Living Screencast",
"cat": "信息与发布",
"desc": "像素小人 Clawd 搬进 Claude 应用，一镜到底演示 Plan 模式和自检。",
"uses": "Product tutorials / Feature launches / Onboarding",
"palette": "cyan",
"forms": [
"grid",
"radialBars"
],
"motion": "pulse",
"texture": "dots",
"overlay": "none",
"lyric": "mono",
"image": "/style-library/img/living-screencast_0.jpg"
},
{
"id": "lemo-hologram-hud",
"name": "科幻全息界面",
"slug": "hologram-hud",
"en": "Sci-fi Hologram HUD",
"cat": "信息与发布",
"desc": "电助力车被扫描成全息线框，目标框依次锁定电池、电机、刹车。",
"uses": "Spec walkthroughs / Launch videos / Trade shows",
"palette": "cyan",
"forms": [
"grid",
"radialBars"
],
"motion": "pulse",
"texture": "dots",
"overlay": "none",
"lyric": "mono",
"image": "/style-library/img/hologram-hud_0.jpg"
},
{
"id": "lemo-rubber-hose",
"name": "1930s 橡皮管卡通",
"slug": "rubber-hose",
"en": "1930s Rubber Hose Cartoon",
"cat": "卡通与动画",
"desc": "一只咖啡杯满厨房追一块逃跑的方糖。",
"uses": "Food & drink / Retro ads / Kids",
"palette": "candy",
"forms": [
"orbs",
"burst"
],
"motion": "float",
"texture": "dots",
"overlay": "none",
"lyric": "glow",
"image": "/style-library/img/rubber-hose_0.jpg"
},
{
"id": "lemo-cel-anime-80s",
"name": "80 年代赛璐璐动画",
"slug": "cel-anime-80s",
"en": "80s Cel Anime",
"cat": "卡通与动画",
"desc": "快递少女骑车穿过雨后霓虹都市，赶在黎明发射前送到一盘磁带。",
"uses": "Music videos / Game trailers / Nostalgia",
"palette": "candy",
"forms": [
"orbs",
"burst"
],
"motion": "float",
"texture": "dots",
"overlay": "none",
"lyric": "glow",
"image": "/style-library/img/cel-anime-80s_0.jpg"
},
{
"id": "lemo-scifi-toon",
"name": "科幻情景喜剧卡通",
"slug": "scifi-toon",
"en": "Sci-Fi Sitcom Toon",
"cat": "卡通与动画",
"desc": "厌世天才开传送门只想买杯咖啡，却穿过越来越离谱的平行宇宙。",
"uses": "Comedy / Tech brands / Social shorts",
"palette": "candy",
"forms": [
"orbs",
"burst"
],
"motion": "float",
"texture": "dots",
"overlay": "none",
"lyric": "glow",
"image": "/style-library/img/scifi-toon_0.jpg"
},
{
"id": "lemo-midcentury-toon",
"name": "50s 扁平卡通",
"slug": "midcentury-toon",
"en": "Mid-century Cartoon",
"cat": "卡通与动画",
"desc": "用 50 年代教育片的口吻，三步教你装好一台扫地机。",
"uses": "Set-up guides / Help centres / How-to",
"palette": "candy",
"forms": [
"orbs",
"burst"
],
"motion": "float",
"texture": "dots",
"overlay": "none",
"lyric": "glow",
"image": "/style-library/img/midcentury-toon_0.jpg"
},
{
"id": "lemo-pixel-rpg",
"name": "16-bit 像素 RPG",
"slug": "pixel-rpg",
"en": "16-bit Pixel RPG",
"cat": "游戏",
"desc": "勇士在最终 Boss 门前存档，存档画面闪回一路冒险。",
"uses": "Game trailers / Recaps / Nostalgia",
"palette": "neon",
"forms": [
"grid",
"shards"
],
"motion": "spin",
"texture": "scanlines",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/pixel-rpg_0.jpg"
},
{
"id": "lemo-hd-2d",
"name": "HD-2D",
"slug": "hd-2d",
"en": "HD-2D",
"cat": "游戏",
"desc": "灯塔熄灭，孙女提着最后一簇火穿过夜林、爬上风暴悬崖。",
"uses": "Game trailers / Fantasy / Story films",
"palette": "neon",
"forms": [
"grid",
"shards"
],
"motion": "spin",
"texture": "scanlines",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/hd-2d_0.jpg"
},
{
"id": "lemo-microgame",
"name": "微游戏快闪",
"slug": "microgame",
"en": "Microgame Frenzy",
"cat": "游戏",
"desc": "见习宇航员闯五秒训练营，越来越快，Boss 关亲手降落回地球。",
"uses": "Game trailers / Onboarding / Social shorts",
"palette": "neon",
"forms": [
"grid",
"shards"
],
"motion": "spin",
"texture": "scanlines",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/microgame_0.jpg"
},
{
"id": "lemo-game-show",
"name": "综艺节奏扁平",
"slug": "game-show",
"en": "Game Show Flat",
"cat": "游戏",
"desc": "把 AI 发展史做成一局节奏游戏，模型踩着拍登场，最后发成绩单。",
"uses": "Tech timelines / Year in review / Variety shows",
"palette": "neon",
"forms": [
"grid",
"shards"
],
"motion": "spin",
"texture": "scanlines",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/game-show_0.jpg"
},
{
"id": "lemo-silent-film",
"name": "1920s 默片",
"slug": "silent-film",
"en": "1920s Silent Film",
"cat": "电影与时代",
"desc": "面包店学徒追一个滚走的面包，最后掰成两半分给饿肚子的小女孩。",
"uses": "Comedy / Retro brands / Silent storytelling",
"palette": "ink",
"forms": [
"none",
"arcs"
],
"motion": "drift",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/silent-film_0.jpg"
},
{
"id": "lemo-backrooms",
"name": "后室 / 新怪谈",
"slug": "backrooms",
"en": "Liminal Found Footage",
"cat": "电影与时代",
"desc": "新夜班员工拍下入职第一晚：无尽的黄色办公空间，和墙上的员工守则。",
"uses": "Horror / Mystery & ARG / Game teasers",
"palette": "ink",
"forms": [
"none",
"arcs"
],
"motion": "drift",
"texture": "grain",
"overlay": "vignette",
"lyric": "plain",
"image": "/style-library/img/backrooms_0.jpg"
},
{
"id": "lemo-brick-toy",
"name": "积木玩具",
"slug": "brick-toy",
"en": "Brick Toy",
"cat": "材质与 3D",
"desc": "积木宇航员用零件拼出火箭，飞向积木月亮。",
"uses": "Toys & kids / Product builds / Space",
"palette": "copper",
"forms": [
"orbs",
"shards"
],
"motion": "orbit",
"texture": "grain",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/brick-toy_0.jpg"
},
{
"id": "lemo-paper-popup",
"name": "纸片立体书",
"slug": "paper-popup",
"en": "Paper Pop-up Book",
"cat": "材质与 3D",
"desc": "立体书在书桌上打开，小精灵 Pip 在纸片世界冒险，最后跳出书外。",
"uses": "Children's books / Game trailers / Story films",
"palette": "copper",
"forms": [
"orbs",
"shards"
],
"motion": "orbit",
"texture": "grain",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/paper-popup_0.jpg"
},
{
"id": "lemo-tilt-shift",
"name": "移轴微缩",
"slug": "tilt-shift",
"en": "Tilt-Shift Miniature",
"cat": "材质与 3D",
"desc": "玩具城的早高峰，一切都像模型。",
"uses": "City promos / Real estate / Transport",
"palette": "copper",
"forms": [
"orbs",
"shards"
],
"motion": "orbit",
"texture": "grain",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/tilt-shift_0.jpg"
},
{
"id": "lemo-lowpoly-island",
"name": "低多边形等距",
"slug": "lowpoly-island",
"en": "Low-poly Isometric Island",
"cat": "材质与 3D",
"desc": "空海里一格格长出小岛和村庄，每放一块响一个音符，直到星空。",
"uses": "Game trailers / World building / Calm content",
"palette": "copper",
"forms": [
"orbs",
"shards"
],
"motion": "orbit",
"texture": "grain",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/lowpoly-island_0.jpg"
},
{
"id": "lemo-glass-product",
"name": "玻璃质感产品",
"slug": "glass-product",
"en": "Glass Product Render",
"cat": "材质与 3D",
"desc": "虚构玻璃耳机 Aura 的开箱与特写。",
"uses": "Product launches / Consumer tech / Beauty",
"palette": "copper",
"forms": [
"orbs",
"shards"
],
"motion": "orbit",
"texture": "grain",
"overlay": "vignette",
"lyric": "glow",
"image": "/style-library/img/glass-product_0.jpg"
}
];
  // 每个 Lemo 风格使用不同色板 / 运动 / 纹理，避免 59 个卡片看起来一模一样。
  var PALS = Object.keys(NS.styleLibrary.PALETTES);
  var MOTIONS = ["drift", "pulse", "orbit", "fall", "flow", "sway", "rise", "spin", "wipe"];
  var TEX = ["grain", "scanlines", "dots", "halftone", "none"];
  var OVER = ["vignette", "frame", "corners", "bars", "none"];
  var LYR = ["glow", "plain", "outline", "block", "mono", "spaced"];
  var FORMS = [["orbs", "lines"], ["grid", "dots"], ["shards", "arcs"], ["blocks", "steps"], ["ribbons", "halo"], ["waves", "rings"], ["burst", "dots"], ["vortex", "orbs"], ["rings", "radialBars"], ["none", "lines"]];
  LEMO.forEach(function (s, i) {
    s.palette = PALS[(i * 5 + 3) % PALS.length];
    s.motion = MOTIONS[(i * 2) % MOTIONS.length];
    s.texture = TEX[(i * 3) % TEX.length];
    s.overlay = OVER[(i * 2) % OVER.length];
    s.lyric = LYR[(i * 5) % LYR.length];
    s.forms = FORMS[(i * 7) % FORMS.length];
  });
  if (!NS.styleLibrary.CATEGORIES.some(function (c) { return c.id === "lemo"; })) {
    NS.styleLibrary.CATEGORIES.unshift({ id: "lemo", name: "Lemo 风格", desc: "59 种电影风格，和 AI 提示词打通" });
  }
  var existing = {};
  NS.styleLibrary.list.forEach(function (s) { existing[s.id] = true; });
  LEMO.forEach(function (s) {
    if (existing[s.id]) return;
    NS.styleLibrary.list.push({
      id: s.id, name: s.name, category: "lemo", palette: s.palette,
      forms: s.forms, motion: s.motion, texture: s.texture, overlay: s.overlay,
      lyric: s.lyric, desc: s.desc, dark: true, lemo: { slug: s.slug, image: s.image, uses: s.uses, en: s.en }
    });
  });
  var originalGet = NS.styleLibrary.get;
  NS.styleLibrary.get = function (id) {
    var found = originalGet(id);
    if (found) return found;
    for (var i = 0; i < NS.styleLibrary.list.length; i++) if (NS.styleLibrary.list[i].id === id) return NS.styleLibrary.list[i];
    return null;
  };
  var originalPalette = NS.styleLibrary.palette;
  NS.styleLibrary.palette = function (id) {
    var def = NS.styleLibrary.get(id);
    if (def && def.category === "lemo") return NS.styleLibrary.PALETTES[def.palette] || NS.styleLibrary.PALETTES.night;
    return originalPalette(id);
  };
  setTimeout(function () {
    var group = document.querySelector('.style-group[data-cat="lemo"]');
    if (!group) return;
    group.open = true;
    Array.prototype.forEach.call(group.querySelectorAll('.style-item'), function (item) {
      var def = NS.styleLibrary.get(item.dataset.style);
      if (!def || !def.lemo) return;
      var sw = item.querySelector('.style-swatch');
      if (sw) {
        sw.style.backgroundImage = 'url(' + def.lemo.image + ')';
        sw.style.backgroundSize = 'cover';
        sw.style.backgroundPosition = 'center';
      }
    });
  }, 900);
})(window.CodeMV);
