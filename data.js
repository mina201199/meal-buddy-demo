(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MealBuddyData = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const HOUR = 3600000;
  const DAY = HOUR * 24;
  const svgUri = source => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(source)}`;

  // Original vector portraits: fictional adults, never real photographs or verification evidence.
  function portrait(index) {
    const palettes = [
      ['#ffe0b9', '#e1884e', '#49342f', '#efba91'], ['#dae9cc', '#66876e', '#3e302a', '#edba98'],
      ['#fde5a8', '#c88143', '#594236', '#e8aa83'], ['#f4d9d0', '#ba776c', '#2c333b', '#d59879'],
      ['#d9e9ed', '#547b93', '#393233', '#e7b698'], ['#e9def3', '#867495', '#715042', '#f2c5a5'],
      ['#eee5ce', '#92945f', '#292f35', '#ce9778']
    ];
    const [background, shirt, hair, skin] = palettes[index];
    const longHair = index === 1 || index === 3 || index === 5;
    const glasses = index === 0 || index === 4;
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="280" viewBox="0 0 240 280" role="img" aria-labelledby="title desc">
      <title id="title">虛構飯友・人物插畫</title><desc id="desc">原創成人角色插畫，非真人照片；所有身分及資料皆為 Demo 虛構。</desc>
      <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="#fff6e8"/></linearGradient>
      <linearGradient id="shirt" x2="0" y2="1"><stop stop-color="${shirt}"/><stop offset="1" stop-color="${shirt}" stop-opacity=".78"/></linearGradient></defs>
      <rect width="240" height="280" rx="28" fill="url(#bg)"/>
      <circle cx="192" cy="57" r="32" fill="#fff" opacity=".35"/><path d="M20 189Q3 152 31 132Q42 155 20 189M28 171Q56 143 66 163Q48 182 28 171" fill="${shirt}" opacity=".18"/>
      <ellipse cx="120" cy="249" rx="83" ry="12" fill="${hair}" opacity=".09"/>
      ${longHair ? `<path d="M67 130Q46 47 111 40Q183 27 178 131L190 209Q118 231 52 205Z" fill="${hair}"/>` : ''}
      <path d="M38 246Q41 185 94 176H145Q198 185 203 246Z" fill="url(#shirt)"/>
      <path d="M98 164L98 187Q120 207 142 187L142 164" fill="${skin}"/>
      <path d="M95 183L120 204L100 220L81 188M145 183L120 204L140 220L158 188" fill="#fff8eb"/>
      <path d="M120 207V246" stroke="#fff8eb" stroke-width="3" opacity=".5"/>
      <ellipse cx="73" cy="119" rx="10" ry="15" fill="${skin}"/><ellipse cx="167" cy="119" rx="10" ry="15" fill="${skin}"/>
      <path d="M74 93Q74 56 120 55Q166 57 166 95V134Q160 176 120 180Q80 175 74 134Z" fill="${skin}"/>
      <path d="M70 108Q52 48 107 41Q168 25 176 85L166 113L153 84Q127 95 99 73Q91 97 70 108" fill="${hair}"/>
      <path d="M87 108Q97 102 106 107M134 107Q143 102 153 108" fill="none" stroke="${hair}" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="98" cy="119" rx="3" ry="4" fill="${hair}"/><ellipse cx="143" cy="119" rx="3" ry="4" fill="${hair}"/>
      <path d="M120 121L116 138H122" fill="none" stroke="#b8765e" stroke-width="2.5" stroke-linecap="round"/>
      <ellipse cx="91" cy="138" rx="10" ry="5" fill="#d77b70" opacity=".34"/><ellipse cx="150" cy="138" rx="10" ry="5" fill="#d77b70" opacity=".34"/>
      <path d="M106 151Q120 162 135 150" fill="none" stroke="#914f49" stroke-width="3" stroke-linecap="round"/>
      ${glasses ? '<g fill="none" stroke="#5c544e" stroke-width="3"><rect x="80" y="109" width="34" height="24" rx="9"/><rect x="128" y="109" width="34" height="24" rx="9"/><path d="M114 117H128M73 114H80M162 114H169"/></g>' : ''}
      ${index === 2 || index === 6 ? `<path d="M66 79Q63 40 118 38Q170 36 175 81L151 73L86 79Z" fill="${shirt}"/><path d="M63 80Q111 65 164 78" stroke="#fff6e8" stroke-width="5" fill="none"/>` : ''}
      ${index === 1 || index === 5 ? '<path d="M153 78L165 94" stroke="#f3ce69" stroke-width="6" stroke-linecap="round"/>' : ''}
      <rect x="76" y="251" width="88" height="22" rx="11" fill="#fffaf0" opacity=".92"/>
      <text x="120" y="266" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#69594e">虛構・插畫</text>
    </svg>`);
  }

  function foodImage(emoji, background) {
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><title>虛構餐點示意插畫</title><rect width="480" height="320" rx="28" fill="${background}"/><ellipse cx="240" cy="252" rx="125" ry="22" fill="#583d28" opacity=".12"/><circle cx="240" cy="154" r="108" fill="#fffaf0"/><text x="240" y="204" text-anchor="middle" font-size="142">${emoji}</text></svg>`);
  }

  function createSeed(now = new Date()) {
    if (typeof now === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(now)) throw new TypeError('請提供含時區的日期');
    const input = Number(new Date(now));
    if (!Number.isFinite(input)) throw new TypeError('無效的 Demo 日期');
    // Taiwan has a fixed UTC+08 offset. All calendar math uses UTC, never OS-local setters.
    const taipeiDay = Math.floor((input + 8 * HOUR) / DAY) * DAY - 8 * HOUR;
    const at = (day, hour, minute = 0) => new Date(taipeiDay + day * DAY + hour * HOUR + minute * 60000).toISOString();
    const clock = at(0, 12);
    const restaurants = [
      { id: 'r1', name: '小巷日常食堂', category: '台式家常', distance: 280, rating: 4.8, ratingCount: 128, price: 95,
        tastes: ['salty'], open: true, image: foodImage('🍱', '#f2d4ae'), description: '熱騰騰的家常飯，配一道當季蔬菜。店家、餐點與評分皆為虛構示範。', address: '示範街區・暖陽路 12 號（虛構店址）' },
      { id: 'r2', name: '青葉麵屋', category: '清爽麵食', distance: 450, rating: 4.6, ratingCount: 86, price: 85,
        tastes: ['salty', 'spicy'], open: true, image: foodImage('🍜', '#dfe6c6'), description: '一碗暖心湯麵，辣度可以自己選。店家、餐點與評分皆為虛構示範。', address: '示範街區・青葉巷 8 號（虛構店址）' },
      { id: 'r3', name: '晨光飯糰所', category: '手作飯糰', distance: 620, rating: 4.7, ratingCount: 64, price: 75,
        tastes: ['salty', 'sweet'], open: true, image: foodImage('🍙', '#f4dfba'), description: '手作飯糰與微甜豆乳，適合輕鬆聊幾句。店家、餐點與評分皆為虛構示範。', address: '示範街區・晨光路 6 號（虛構店址）' },
      { id: 'r4', name: '橙花小餐館', category: '義式料理', distance: 980, rating: 4.9, ratingCount: 152, price: 180,
        tastes: ['salty', 'spicy'], open: true, image: foodImage('🍝', '#f2c7aa'), description: '番茄香氣與慢慢吃的晚餐時光。店家、餐點與評分皆為虛構示範。', address: '示範街區・橙花路 20 號（虛構店址）' }
    ];
    const profiles = [
      ['me', '小日', '25–29', '喜歡找街角小店，一起好好吃一頓飯。', ['散步', '咖啡', '閱讀'], ['家常菜', '麵食'], [], '自在聊天', 8, 100, 4.8],
      ['u1', '小禾', '25–29', '午休想找個伴，聊聊最近讀到的好書。', ['閱讀', '散步', '植物'], ['家常菜', '清淡'], [], '慢慢吃、輕鬆聊', 16, 98, 4.9],
      ['u2', '阿橙', '30–34', '喜歡探索巷弄美食，也歡迎安靜吃飯。', ['底片攝影', '單車', '音樂'], ['飯糰', '麵食'], ['不吃花生'], '安靜也自在', 12, 100, 4.8],
      ['u3', '沐沐', '25–29', '下班後吃點熱的，交換一件今天的小事。', ['電影', '展覽', '料理'], ['微辣', '湯麵'], [], '開心分享', 9, 97, 4.7],
      ['u4', '柏宇', '30–34', '今天午餐想試試家常飯，歡迎一起坐。', ['登山', '桌遊', '咖啡'], ['台式料理', '鹹食'], [], '輕鬆聊天', 21, 99, 4.9],
      ['u5', '米米', '20–24', '喜歡旅行裡的小吃，也喜歡日常的小店。', ['旅行', '插畫', '烘焙'], ['飯糰', '甜點'], ['不吃牛肉'], '邊吃邊聊', 6, 100, 4.8],
      ['u6', '阿森', '35–39', '吃飯不用趕，聊聊音樂和週末散步路線。', ['音樂', '散步', '手作'], ['蔬食', '清淡'], ['蛋奶素'], '慢慢享用', 18, 98, 4.9]
    ];
    const users = profiles.map(([id, displayName, ageRange, bio, interests, foodPreferences, dietaryRestrictions, mealStyle, mealCount, onTimeRate, rating], index) => ({
      id, displayName, ageRange, photoUrl: portrait(index), bio: `${bio}（Demo 虛構人物；頭像為插畫。）`,
      interests, foodPreferences, dietaryRestrictions, mealStyle, verificationStatus: 'Demo 模擬驗證', mealCount, onTimeRate, rating
    }));
    const makeIntent = (id, userId, restaurantId, day, hour, minute, message, budget = 100) => ({
      id, userId, restaurantId, startAt: at(day, hour, minute), endAt: at(day, hour + 1, minute),
      expiresAt: at(day, hour + 1, minute), status: 'active', partyPreference: 'either', budget, message
    });
    const intents = [
      makeIntent('i1', 'u1', 'r1', 0, 12, 15, '午休一起吃家常飯，輕鬆聊聊吧。'),
      makeIntent('i2', 'u2', 'r1', 0, 12, 30, '想吃點鹹的，一起坐也很好。'),
      makeIntent('i3', 'u3', 'r1', 0, 18, 30, '晚餐想吃熱騰騰的飯。'),
      makeIntent('i4', 'u4', 'r1', 1, 12, 30, '明天中午預留一小時好好吃飯。'),
      makeIntent('i5', 'u5', 'r1', 1, 12, 30, '明天一起探索這間小店！'),
      makeIntent('i6', 'u6', 'r2', 0, 12, 20, '想點蔬菜麵，可以各自選餐。'),
      makeIntent('i7', 'u5', 'r3', 0, 12, 40, '飯糰配豆乳，簡單又滿足。'),
      makeIntent('i8', 'me', 'r1', 0, 12, 30, '一起吃午餐，認識新飯友。'),
      makeIntent('i9', 'u1', 'r1', 1, 12, 30, '明天四人小飯局，歡迎加入。')
    ];
    const groups = [
      { id: 'g1', restaurantId: 'r1', hostUserId: 'u1', startAt: at(1, 12, 30), capacity: 4, memberIds: ['u1', 'u5'], description: '明天的午餐小聚，吃家常飯、聊日常。', visibility: 'public', approvalRequired: true, status: 'open', applicantIds: [] },
      { id: 'g2', restaurantId: 'r1', hostUserId: 'me', startAt: at(0, 18, 30), capacity: 4, memberIds: ['me'], description: '下班後一起吃頓暖暖的晚餐。', visibility: 'public', approvalRequired: true, status: 'open', applicantIds: [] },
      { id: 'g3', restaurantId: 'r2', hostUserId: 'u6', startAt: at(0, 12, 20), capacity: 3, memberIds: ['u6'], description: '現在來碗麵，自在用餐不拘束。', visibility: 'public', approvalRequired: false, status: 'open', applicantIds: [] }
    ];
    const invitations = [
      { id: 'inv-seed-received', senderUserId: 'u4', recipientUserId: 'me', restaurantId: 'r1', mealIntentId: 'i8', message: '中午一起吃家常飯嗎？（模擬邀請）', proposedAt: at(0, 12, 30), status: 'pending', createdAt: at(0, 11, 50), expiresAt: at(0, 12, 30) },
      { id: 'inv-seed-expired', senderUserId: 'u2', recipientUserId: 'me', restaurantId: 'r3', mealIntentId: 'i-expired', message: '上次的飯糰邀請已到期。（模擬邀請）', proposedAt: at(-1, 12, 30), status: 'expired', createdAt: at(-1, 11), expiresAt: at(-1, 12, 30) }
    ];
    // Keep expired invitation references resolvable while excluding them from live intent boards.
    intents.push({ ...makeIntent('i-expired', 'me', 'r3', -1, 12, 30, '已結束的模擬午餐。'), status: 'expired' });
    return { now: clock, currentUserId: 'me', restaurants, users, intents, groups, invitations };
  }

  return { createSeed };
});
