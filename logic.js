(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MealBuddyLogic = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  const TAIPEI = 8 * HOUR;

  // Reject timezone-less strings so the host OS cannot reinterpret a demo instant.
  function timestamp(value) {
    if (value instanceof Date || typeof value === 'number') return Number(new Date(value));
    if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return NaN;
    return Date.parse(value);
  }
  function clock(value) {
    const result = timestamp(value);
    if (!Number.isFinite(result)) throw new TypeError('需要含時區的有效時間');
    return result;
  }
  const dayNumber = instant => Math.floor((instant + TAIPEI) / DAY);
  const clamp = value => Math.max(0, Math.min(1, value));
  const denied = reason => ({ ok: false, reason });
  const allowed = () => ({ ok: true, reason: '' });

  function parseDemoRequest(text) {
    const source = typeof text === 'string' ? text.normalize('NFKC') : '';
    function wants(word) {
      let positive = false;
      let negative = false;
      // A list separator (、) shares its clause's negation; commas/contrasts reset it.
      for (const clause of source.split(/(?:但是|但|可是|不過|而是|改成|[，。；,;！!？?\n])/)) {
        for (const match of clause.matchAll(new RegExp(word, 'g'))) {
          const prefix = clause.slice(0, match.index);
          if (/(?:不(?:是|要|想|吃|能|愛|喜歡)?|避免|別|無)[^，。；,;]*$/.test(prefix)) negative = true;
          else positive = true;
        }
      }
      return positive && !negative;
    }
    const money = source.match(/預算\s*(?:NT\$|NTD|\$)?\s*(\d+(?:\.\d+)?)/i);
    const budget = money && Number(money[1]) > 0 ? Number(money[1]) : 150;
    return {
      day: wants('明天') ? 'tomorrow' : 'today',
      meal: wants('早餐') ? 'breakfast' : wants('晚餐') ? 'dinner' : 'lunch',
      taste: [['鹹', 'salty'], ['甜', 'sweet'], ['辣', 'spicy']].filter(([word]) => wants(word)).map(([, taste]) => taste),
      budget
    };
  }

  function rankRestaurants(restaurants, criteria = {}) {
    const budget = Number(criteria.budget ?? 150);
    const maxDistance = Number(criteria.maxDistance ?? 1500);
    if (!Number.isFinite(budget) || budget < 0 || !Number.isFinite(maxDistance) || maxDistance < 0) return [];
    const tastes = Array.isArray(criteria.taste) ? [...new Set(criteria.taste)] : [];
    const ranked = restaurants.filter(r => r.open === true && Number.isFinite(r.price) && r.price >= 0 && r.price <= budget &&
      Number.isFinite(r.distance) && r.distance >= 0 && r.distance <= maxDistance && Number.isFinite(r.rating)).map(r => {
      const distanceFit = maxDistance === 0 ? 1 : clamp(1 - r.distance / maxDistance);
      const ratingFit = clamp(r.rating / 5);
      const budgetFit = budget === 0 ? 1 : clamp(1 - r.price / budget);
      const tasteFit = tastes.length ? tastes.filter(t => (r.tastes || []).includes(t)).length / tastes.length : 1;
      // JEV: distance 30%, rating 25%, budget headroom 20%, taste 15%, open 10%.
      const score = 30 * distanceFit + 25 * ratingFit + 20 * budgetFit + 15 * tasteFit + 10;
      return { ...r, matchScore: Math.round(score * 100) / 100 };
    });
    return ranked.sort((a, b) => {
      const primary = criteria.sort === 'distance' ? a.distance - b.distance :
        criteria.sort === 'rating' ? b.rating - a.rating : b.matchScore - a.matchScore;
      return primary || b.matchScore - a.matchScore || a.distance - b.distance || String(a.id).localeCompare(String(b.id));
    });
  }

  function stillActive(intent, now) {
    return intent && intent.status === 'active' &&
      (intent.expiresAt == null || timestamp(intent.expiresAt) > now) &&
      (intent.endAt == null || timestamp(intent.endAt) > now);
  }

  function groupIntentsByWindow(intents, now) {
    const instant = clock(now);
    const today = dayNumber(instant);
    const result = { now: [], later: [], tomorrow: [] };
    for (const intent of intents) {
      if (!stillActive(intent, instant)) continue;
      const start = timestamp(intent.startAt);
      if (!Number.isFinite(start)) continue;
      if (intent.endAt != null && timestamp(intent.endAt) <= start) continue;
      const day = dayNumber(start);
      if (day === today + 1) result.tomorrow.push(intent);
      else if (day === today || (day < today && intent.endAt != null && timestamp(intent.endAt) > instant)) {
        if (start <= instant + HOUR) result.now.push(intent);
        else result.later.push(intent);
      }
    }
    return result;
  }

  function canInvite(senderId, recipientId, intent, invitations, now) {
    const instant = clock(now);
    if (!senderId || !recipientId) return denied('請選擇邀請對象');
    if (senderId === recipientId) return denied('不能邀請自己');
    if (!intent || intent.userId !== recipientId) return denied('用餐意向與邀請對象不符');
    if (!intent.id || !stillActive(intent, instant) || intent.expiresAt == null) return denied('這個用餐意向已失效');
    const duplicate = invitations.some(invite => invite.senderUserId === senderId && invite.recipientUserId === recipientId &&
      invite.mealIntentId === intent.id && (invite.status === 'declined' || invite.status === 'accepted' ||
        (invite.status === 'pending' && (invite.expiresAt == null || !Number.isFinite(timestamp(invite.expiresAt)) || timestamp(invite.expiresAt) > instant))));
    return duplicate ? denied('已邀請過這個用餐意向，請勿重複邀請') : allowed();
  }

  /**
   * Pure invitation factory. The app must supply a fresh, nonempty unique input.id
   * for every new invitation, including a resend after cancellation at the same
   * frozen demo clock. Supplied IDs are preserved exactly. The deterministic
   * fallback is for reproducible fixtures/legacy callers, not per-attempt uniqueness.
   */
  function createInvitation(input, now) {
    const instant = clock(now);
    const deadlines = [instant + DAY];
    // intentExpiresAt is the preferred integration field; explicit expiry and nested intent are also supported.
    for (const deadline of [input.intentExpiresAt, input.intent && input.intent.expiresAt, input.expiresAt, input.proposedAt]) {
      if (deadline != null) deadlines.push(clock(deadline));
    }
    const expiry = Math.min(...deadlines);
    if (expiry <= instant) throw new RangeError('邀請時間已過，請重新選擇');
    // No randomness or mutable counter: attempt identity belongs to the caller.
    const canonical = JSON.stringify(Object.keys(input).sort().map(key => [key, input[key]]));
    let hash = 2166136261;
    for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619) >>> 0;
    return { ...input, id: input.id || `inv-${instant.toString(36)}-${hash.toString(36)}`, status: 'pending',
      createdAt: new Date(instant).toISOString(), expiresAt: new Date(expiry).toISOString() };
  }

  function canJoinGroup(group, userId) {
    if (!group || !Number.isInteger(group.capacity) || group.capacity < 2 || group.capacity > 6) return denied('飯局人數需為 2–6 人');
    if (group.status !== 'open') return denied('飯局目前未開放');
    if (!Array.isArray(group.memberIds)) return denied('飯局成員資料無效');
    if (group.memberIds.includes(userId)) return denied('你已加入這個飯局');
    if ((group.applicantIds || []).includes(userId)) return denied('申請已送出，等待主辦人確認');
    if (group.memberIds.length >= group.capacity) return denied('飯局已額滿');
    return allowed();
  }

  function transitionInvitation(invitation, status, now) {
    const instant = clock(now);
    const expiry = clock(invitation.expiresAt);
    const transitions = { pending: ['accepted', 'declined', 'cancelled', 'expired'], accepted: ['cancelled'] };
    if (!(transitions[invitation.status] || []).includes(status)) throw new Error('無效的邀請狀態變更');
    if (status === 'expired' && instant < expiry) throw new Error('邀請尚未到期');
    if (instant >= expiry && (status === 'accepted' || status === 'declined')) throw new Error('邀請已過期');
    return { ...invitation, status };
  }

  return { parseDemoRequest, rankRestaurants, groupIntentsByWindow, canInvite, createInvitation, canJoinGroup, transitionInvitation };
});
