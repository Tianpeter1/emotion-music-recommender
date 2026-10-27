/*
 * songs.js —— 歌曲数据库 + 情绪/音乐映射（基于人脸情绪的推荐系统）
 * 课程：《前端框架应用开发》week-09「JS 函数与对象」演示项目
 *
 * 本文件组织五类数据与两套算法所需的映射：
 *   1) EMOTIONS       —— 七类情绪的元信息 + 心理维度 valence(效价)/arousal(唤醒度)
 *   2) LOCAL_SONGS    —— 已下载到本地 audio/ 的真实 MP3，可完整离线播放（source='local'）
 *   3) ONLINE_KEYWORDS—— 在线歌曲 API（iTunes Search）的检索关键词（中英文）
 *   4) SONG_DB        —— 情绪→推荐文案 / 风格标签模板（用于生成推荐理由）
 *   5) DEMO_PHOTOS    —— 本地生成的多情绪人脸，供「演示选择」一键识别
 *
 * 数据组织方式：全部用「对象 + 数组」，便于 app.js 中用函数检索与渲染。
 */

// ===== 1. 情绪元信息 + 心理维度 =====
// valence 效价 ∈[-1,1]：负=消极，正=积极
// arousal 唤醒度 ∈[0,1]：低=平静，高=激动
// 这两个维度是「歌曲推荐算法」的核心匹配依据（见 app.js 说明）。
const EMOTIONS = {
  neutral:  { key:'neutral',  label:'平静', color:'#7c8aa5', emoji:'😐', valence: 0.0, arousal:0.30, desc:'情绪平稳，适合轻快不吵闹的曲风' },
  happy:    { key:'happy',    label:'开心', color:'#f6a623', emoji:'😄', valence: 0.9, arousal:0.70, desc:'心情愉悦，来点明亮欢快的节奏' },
  sad:      { key:'sad',      label:'难过', color:'#5b8def', emoji:'😢', valence:-0.8, arousal:0.30, desc:'略带低落，用舒缓治愈的旋律陪伴' },
  angry:    { key:'angry',    label:'愤怒', color:'#e05656', emoji:'😠', valence:-0.7, arousal:0.90, desc:'需要宣泄或安抚，给点有力量的歌' },
  fearful:  { key:'fearful',  label:'害怕', color:'#9b6dde', emoji:'😨', valence:-0.6, arousal:0.80, desc:'紧张不安，用温柔的纯音乐平复' },
  surprised:{ key:'surprised',label:'惊讶', color:'#33c2b8', emoji:'😲', valence: 0.3, arousal:0.80, desc:'新鲜刺激，配上有张力的旋律' },
  disgusted:{ key:'disgusted',label:'厌恶', color:'#8aa634', emoji:'🤢', valence:-0.5, arousal:0.50, desc:'想逃离当下，换个叛逆松弛的调子' }
};

// ===== 2. 本地歌曲（已下载到 audio/，离线可完整播放）=====
// 每情绪 1 首本地示例曲目（SoundHelix 免费可商用 MP3），确保断网也能出声。
const LOCAL_SONGS = {
  neutral:  [ { title:'本地·静谧前奏', artist:'SoundHelix', file:'audio/local-1.mp3', tag:'轻音乐', reason:'本地离线曲目，平静时刻的留白' } ],
  happy:    [ { title:'本地·明亮律动', artist:'SoundHelix', file:'audio/local-2.mp3', tag:'流行',   reason:'本地离线曲目，明快节奏点亮心情' } ],
  sad:      [ { title:'本地·深夜独白', artist:'SoundHelix', file:'audio/local-3.mp3', tag:'抒情',   reason:'本地离线曲目，低吟浅唱陪你发呆' } ],
  angry:    [ { title:'本地·电流冲击', artist:'SoundHelix', file:'audio/local-4.mp3', tag:'摇滚',   reason:'本地离线曲目，强节拍帮你释放' } ],
  fearful:  [ { title:'本地·温柔涟漪', artist:'SoundHelix', file:'audio/local-5.mp3', tag:'钢琴',   reason:'本地离线曲目，如水般安抚紧张' } ],
  surprised:[ { title:'本地·意外转折', artist:'SoundHelix', file:'audio/local-6.mp3', tag:'电子',   reason:'本地离线曲目，跳脱的日常惊喜' } ],
  disgusted:[ { title:'本地·抽离空间', artist:'SoundHelix', file:'audio/local-7.mp3', tag:'氛围',   reason:'本地离线曲目，松弛抽离不适感' } ]
};

// ===== 3. 在线歌曲 API 检索关键词（iTunes Search，免费 / CORS 友好）=====
// 每个情绪给 2~3 个中英文词，前端按顺序检索，展示真实歌曲（30s 预览可播 + 跳转）。
const ONLINE_KEYWORDS = {
  neutral:  ['relaxing piano','轻音乐','chill'],
  happy:    ['happy pop','快乐歌曲','upbeat'],
  sad:      ['sad ballad','伤感歌曲','melancholy'],
  angry:    ['rock','摇滚','heavy metal'],
  fearful:  ['calm music','放松音乐','ambient'],
  surprised:[ 'dance pop','流行歌曲','energetic'],
  disgusted:[ 'alternative','独立摇滚','grunge']
};

// ===== 4. 情绪→推荐文案 / 风格标签模板（生成推荐理由用）=====
const SONG_DB = {
  happy: [
    { id: 'h1', title: 'Happy',                       artist: 'Pharrell Williams', reason: '标题即态度，放克节奏一秒点燃好心情', tag: '放克 / 流行' },
    { id: 'h2', title: '阳光宅男',                     artist: '周杰伦',            reason: '轻快摇滚，宅家也能元气满满',       tag: '流行摇滚' },
    { id: 'h3', title: '倍儿爽',                       artist: '大张伟',            reason: '洗脑副歌，不开心都难',             tag: '神曲 / 电子' },
    { id: 'h4', title: "Don't Stop 'Til You Get Enough", artist: 'Michael Jackson', reason: '经典迪斯科，律动感拉满',           tag: 'Disco' },
    { id: 'h5', title: '大艺术家',                     artist: '蔡依林',            reason: '自信张扬，给开心加点态度',         tag: '流行' },
    { id: 'h6', title: '伤心的人别听慢歌',             artist: '五月天',            reason: '反着来，用快歌把难过甩掉',         tag: '摇滚' }
  ],
  sad: [
    { id: 's1', title: 'Someone Like You',            artist: 'Adele',             reason: '钢琴叙事，给情绪一个出口',         tag: '流行 / 抒情' },
    { id: 's2', title: '演员',                         artist: '薛之谦',            reason: '细腻情歌，适合一个人静静听',       tag: '华语流行' },
    { id: 's3', title: '消愁',                         artist: '毛不易',            reason: '娓娓道来，把心事唱成故事',         tag: '民谣' },
    { id: 's4', title: '富士山下',                     artist: '陈奕迅',            reason: '粤语经典，克制的伤感',             tag: '流行' },
    { id: 's5', title: '模特',                         artist: '李荣浩',            reason: '都市孤独感，深夜单曲循环',         tag: '流行' },
    { id: 's6', title: '后来',                         artist: '刘若英',            reason: '回忆杀，温柔又戳心',               tag: '华语流行' }
  ],
  angry: [
    { id: 'a1', title: 'Believer',                    artist: 'Imagine Dragons',   reason: '鼓点凶猛，把怒气变成力量',         tag: '另类摇滚' },
    { id: 'a2', title: 'In The End',                  artist: 'Linkin Park',       reason: '说唱金属，宣泄恰到好处',           tag: '说唱金属' },
    { id: 'a3', title: 'Numb',                        artist: 'Linkin Park',       reason: '压抑到爆发，共鸣感强',             tag: '另类摇滚' },
    { id: 'a4', title: '将军',                         artist: '周杰伦',            reason: '中国风快嘴，气势压人',             tag: '中国风' },
    { id: 'a5', title: '听海',                         artist: '张惠妹',            reason: '爆发式情歌，释放情绪',             tag: '流行' },
    { id: 'a6', title: '高级动物',                     artist: '窦唯',              reason: '实验摇滚，冷静地炸裂',             tag: '实验摇滚' }
  ],
  fearful: [
    { id: 'f1', title: 'River Flows in You',          artist: 'Yiruma',            reason: '钢琴如水流，温柔安抚',             tag: '新世纪钢琴' },
    { id: 'f2', title: 'Summer',                       artist: '久石让',            reason: '宫崎骏式明亮，驱散阴霾',           tag: '电影配乐' },
    { id: 'f3', title: 'Only Time',                    artist: 'Enya',              reason: '空灵女声，像被轻轻抱住',           tag: '新世纪' },
    { id: 'f4', title: '故乡的原风景',                 artist: '宗次郎',            reason: '陶笛悠远，让人安定',               tag: 'New Age' },
    { id: 'f5', title: 'Kiss the Rain',                artist: 'Yiruma',            reason: '雨声般的音符，治愈紧张',           tag: '钢琴' },
    { id: 'f6', title: '安妮的仙境',                   artist: '班得瑞',            reason: '自然采样 + 轻音乐，松弛下来',       tag: '轻音乐' }
  ],
  surprised: [
    { id: 'p1', title: 'Firework',                    artist: 'Katy Perry',        reason: '爆炸式副歌，呼应惊喜瞬间',         tag: '流行' },
    { id: 'p2', title: '牛仔很忙',                     artist: '周杰伦',            reason: '俏皮快歌，新鲜感十足',             tag: '流行' },
    { id: 'p3', title: '新的心跳',                     artist: '邓紫棋',            reason: '电音鼓点，元气满满',               tag: '电子流行' },
    { id: 'p4', title: '菊次郎的夏天',                 artist: '久石让',            reason: '轻快口琴，夏天的惊喜',             tag: '电影配乐' },
    { id: 'p5', title: '春',                           artist: 'Vivaldi',           reason: '四季之春，生机勃发',               tag: '古典' },
    { id: 'p6', title: '齐天',                         artist: '大张伟',            reason: '戏腔混电音，反差惊喜',             tag: '国风电子' }
  ],
  neutral: [
    { id: 'n1', title: '稻香',                         artist: '周杰伦',            reason: '温暖叙事，回归简单的快乐',         tag: '流行' },
    { id: 'n2', title: 'Photograph',                  artist: 'Ed Sheeran',        reason: '木吉他与嗓音，平淡却动人',         tag: '民谣流行' },
    { id: 'n3', title: '风吹麦浪',                     artist: '李健',              reason: '清澈和声，像午后微风',             tag: '民谣' },
    { id: 'n4', title: '天空之城',                     artist: '久石让',            reason: '纯净旋律，平静心神',               tag: '电影配乐' },
    { id: 'n5', title: '越长大越孤单',                 artist: '牛奶咖啡',          reason: '轻柔吟唱，适合放空',               tag: '流行' },
    { id: 'n6', title: '平凡之路',                     artist: '朴树',              reason: '豁达叙事，与平静很搭',             tag: '摇滚民谣' }
  ],
  disgusted: [
    { id: 'd1', title: 'Creep',                        artist: 'Radiohead',         reason: '阴郁另类，唱出想逃离的感觉',       tag: '另类摇滚' },
    { id: 'd2', title: '逆鳞',                         artist: '周杰伦',            reason: '暗黑中国风，叛逆又带感',           tag: '中国风' },
    { id: 'd3', title: "Smells Like Teen Spirit",      artist: 'Nirvana',           reason: '垃圾摇滚，把烦躁吼出来',           tag: 'Grunge' },
    { id: 'd4', title: '杀死那个石家庄人',             artist: '万能青年旅店',      reason: '叙事摇滚，荒诞又真实',             tag: '独立摇滚' },
    { id: 'd5', title: '黑色梦中',                     artist: '窦唯',              reason: '迷幻氛围，松弛抽离',               tag: '迷幻摇滚' },
    { id: 'd6', title: '无聊军队',                     artist: '反光镜',            reason: '朋克三和弦，干脆利落',             tag: '朋克' }
  ]
};

// ===== 5. 演示照片（本地生成的多情绪人脸，方便选择演示）=====
const DEMO_PHOTOS = [
  { emotion:'happy',     src:'test-samples/happy.png',     label:'😄 开心' },
  { emotion:'neutral',   src:'test-samples/neutral.png',   label:'😐 平静' },
  { emotion:'sad',       src:'test-samples/sad.png',       label:'😢 难过' },
  { emotion:'angry',     src:'test-samples/angry.png',     label:'😠 愤怒' },
  { emotion:'fearful',   src:'test-samples/fearful.png',   label:'😨 害怕' },
  { emotion:'surprised', src:'test-samples/surprised.png', label:'😲 惊讶' },
  { emotion:'disgusted', src:'test-samples/disgusted.png', label:'🤢 厌恶' }
];

// 暴露到全局，供 app.js 使用（无打包工具的传统脚本写法）
window.EMOTIONS = EMOTIONS;
window.LOCAL_SONGS = LOCAL_SONGS;
window.ONLINE_KEYWORDS = ONLINE_KEYWORDS;
window.SONG_DB = SONG_DB;
window.DEMO_PHOTOS = DEMO_PHOTOS;
