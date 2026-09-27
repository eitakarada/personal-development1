/* home.js — CieloEmo メイン画面 */

'use strict';

// ─────────────────────────────────────────
//  感情 → 見た目マッピング
// ─────────────────────────────────────────
const EMOTION_MAP = {
    '感動した':      { color: '#c084fc', glow: '#a855f7', emoji: '💜' },
    '勇気をもらった':{ color: '#fbbf24', glow: '#f59e0b', emoji: '⭐' },
    '嬉しかった':    { color: '#fde047', glow: '#facc15', emoji: '✨' },
    '安心した':      { color: '#7dd3fc', glow: '#38bdf8', emoji: '💙' },
    'ユーモア':      { color: '#fb923c', glow: '#f97316', emoji: '😄' },
    '考えさせられた':{ color: '#e5e7eb', glow: '#9ca3af', emoji: '🤔' },
    '人間関係':      { color: '#f472b6', glow: '#ec4899', emoji: '🤝' },
    '希望を感じた':  { color: '#34d399', glow: '#10b981', emoji: '💚' },
};

// ─────────────────────────────────────────
//  背景の微細な星（Canvas）
// ─────────────────────────────────────────
(function initBackground() {
    const canvas = document.getElementById('backgroundStars');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let bgStars = [];

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function createBgStars() {
        bgStars = [];
        const count = Math.floor((canvas.width * canvas.height) / 4000);
        for (let i = 0; i < count; i++) {
            bgStars.push({
                x:      Math.random() * canvas.width,
                y:      Math.random() * canvas.height,
                r:      Math.random() * 0.8 + 0.2,
                alpha:  Math.random(),
                speed:  Math.random() * 0.01 + 0.003,
                dir:    Math.random() > 0.5 ? 1 : -1,
            });
        }
    }

    function drawBgStars() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const s of bgStars) {
            s.alpha += s.speed * s.dir;
            if (s.alpha >= 1)   { s.alpha = 1;   s.dir = -1; }
            if (s.alpha <= 0.1) { s.alpha = 0.1; s.dir =  1; }
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
            ctx.fill();
        }
        requestAnimationFrame(drawBgStars);
    }

    resize();
    createBgStars();
    drawBgStars();
    window.addEventListener('resize', () => { resize(); createBgStars(); });

    // 画面サイズが変わったら星の配置も再計算する（デバウンス付き）
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (typeof applySkyFilter === 'function') applySkyFilter();
        }, 250);
    });
})();

// ─────────────────────────────────────────
//  ステート
// ─────────────────────────────────────────
let allQuotes = [];
let currentDetail = null;

// ─────────────────────────────────────────
//  ユーザー名表示
// ─────────────────────────────────────────
(function showUser() {
    fetch('../api/quotes.php')
        .then(r => {
            if (r.status === 401) { location.href = '../auth/login.html'; return null; }
            return r.json();
        })
        .then(async data => {
            if (!data) return;
            allQuotes = data.quotes || [];
            // 夜空を描く前に「五つの星」を取得しておく
            await loadRankings();
            applySkyFilter();
            updateStats();
        })
        .catch(() => {
            location.href = '../auth/login.html';
        });
})();

// ─────────────────────────────────────────
//  星空の切り替え（すべて / 年 / 月 / 週）
// ─────────────────────────────────────────
let skyRange   = 'all';           // all | year | month | week
let periodBase = new Date();      // 表示中の基準日

// 範囲ボタン
document.querySelectorAll('.sky-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        skyRange   = btn.dataset.range;
        periodBase = new Date();   // 選び直したら現在に戻す
        updateRangeButtons();
        applySkyFilter();
    });
});

// 期間ナビ（前後）
document.getElementById('periodPrev').addEventListener('click', () => { shiftPeriod(-1); });
document.getElementById('periodNext').addEventListener('click', () => { shiftPeriod(1); });

function shiftPeriod(dir) {
    const d = new Date(periodBase);
    if (skyRange === 'year')  d.setFullYear(d.getFullYear() + dir);
    if (skyRange === 'month') d.setMonth(d.getMonth() + dir);
    if (skyRange === 'week')  d.setDate(d.getDate() + dir * 7);
    periodBase = d;
    applySkyFilter();
}

function updateRangeButtons() {
    document.querySelectorAll('.sky-range-btn').forEach(b => {
        const active = b.dataset.range === skyRange;
        b.classList.toggle('bg-yellow-400', active);
        b.classList.toggle('text-black',    active);
        b.classList.toggle('font-bold',     active);
        b.classList.toggle('text-gray-300', !active);
        b.classList.toggle('hover:bg-slate-700', !active);
    });
    // 期間ナビの表示切替
    document.getElementById('skyPeriodNav').classList.toggle('hidden', skyRange === 'all');
    document.getElementById('skyPeriodNav').classList.toggle('flex',   skyRange !== 'all');
}

// 週の始まり（月曜）を求める
function startOfWeek(date) {
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7; // 月曜=0
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}

// 指定した星が現在の期間に含まれるか
function isInPeriod(q) {
    if (skyRange === 'all') return true;
    const created = new Date(q.created_at);
    if (isNaN(created)) return false;

    if (skyRange === 'year') {
        return created.getFullYear() === periodBase.getFullYear();
    }
    if (skyRange === 'month') {
        return created.getFullYear() === periodBase.getFullYear()
            && created.getMonth() === periodBase.getMonth();
    }
    if (skyRange === 'week') {
        const start = startOfWeek(periodBase);
        const end   = new Date(start);
        end.setDate(end.getDate() + 7);
        return created >= start && created < end;
    }
    return true;
}

// 期間ラベル生成
function periodLabelText() {
    if (skyRange === 'year')  return `${periodBase.getFullYear()}年`;
    if (skyRange === 'month') return `${periodBase.getFullYear()}年${periodBase.getMonth() + 1}月`;
    if (skyRange === 'week') {
        const start = startOfWeek(periodBase);
        const end   = new Date(start);
        end.setDate(end.getDate() + 6);
        const f = d => `${d.getMonth() + 1}/${d.getDate()}`;
        return `${f(start)} 〜 ${f(end)}`;
    }
    return '';
}

// フィルターを適用して再描画
function applySkyFilter() {
    updateRangeButtons();
    document.getElementById('periodLabel').textContent = periodLabelText();

    const filtered = allQuotes.filter(isInPeriod);
    renderStars(filtered);

    // 星の数表示
    const countEl = document.getElementById('skyStarCount');
    if (skyRange === 'all') {
        countEl.textContent = `全 ${filtered.length} 個の星`;
    } else {
        countEl.textContent = filtered.length > 0
            ? `${filtered.length} 個の星`
            : 'この期間に星はありません';
    }
}

// 「あなたを構成する五つの星」の順位を返す（入っていなければ null）
function getConstellationRank(q) {
    if (!currentRankings || currentRankings.length === 0) return null;
    const isShared = q.is_shared == 1 ? 1 : 0;
    const hit = currentRankings.find(r =>
        r.quote_id == q.id && (r.is_shared == 1 ? 1 : 0) === isShared
    );
    return hit ? hit.rank : null;
}

// ─────────────────────────────────────────
//  星の描画
// ─────────────────────────────────────────
function renderStars(quotes, filterFn) {
    const container = document.getElementById('starContainer');
    if (!container) return;
    container.innerHTML = '';

    const list = filterFn ? quotes.filter(filterFn) : quotes;

    // スマホ幅ではヘッダー+切り替えバーが縦に高くなるので余白を広げる
    const isNarrow  = window.innerWidth < 640;
    const marginTop = isNarrow ? 170 : 130;
    const marginX   = isNarrow ? 24  : 80;
    const marginBottom = 40;

    // 星の数に応じて必要な縦の高さを確保する
    const viewportH   = window.innerHeight;
    const availableW  = Math.max(window.innerWidth - marginX * 2, 100);
    const perStarArea = 3600;
    const neededArea  = list.length * perStarArea;
    const contentH    = Math.max(
        viewportH - marginTop - marginBottom,
        Math.ceil(neededArea / availableW)
    );

    container.style.minHeight = (contentH + marginTop + marginBottom) + 'px';

    list.forEach((q, i) => {
        const meta = EMOTION_MAP[q.emotion] || { color: '#ffffff', glow: '#aaaaaa', emoji: '⭐' };
        const isFav = q.favorite == 1;

        // 「あなたを構成する五つの星」に入っているか判定
        const rankInfo = getConstellationRank(q);
        const isConstellation = rankInfo !== null;

        // サイズ: 五つの星 > お気に入り > 通常
        let size;
        if (isConstellation) size = 17;
        else if (isFav)      size = 14;
        else                 size = 8 + Math.random() * 6;

        const x = marginX   + Math.random() * (window.innerWidth - marginX * 2);
        const y = marginTop + Math.random() * contentH;

        const star = document.createElement('div');
        star.className = 'star'
            + (isFav ? ' favorite' : '')
            + (isConstellation ? ' constellation' : '');
        star.setAttribute('data-id', q.id);
        star.setAttribute('data-emotion', q.emotion);

        // 五つの星はグローを少しだけ強める
        const glowStrength = isConstellation ? 2.4 : 2;
        star.style.cssText = `
            left: ${x}px;
            top: ${y}px;
            width: ${size}px;
            height: ${size}px;
            background: ${meta.color};
            box-shadow: 0 0 ${size * glowStrength}px ${size}px ${meta.glow}70, 0 0 ${size}px ${size / 2}px ${meta.color}90;
            animation-delay: ${Math.random() * 4}s;
            ${q.is_shared == 1 ? `outline: 1.5px dashed ${meta.color}80; outline-offset: 3px;` : ''}
        `;

        star.addEventListener('click', () => starFallEffect(star, q, meta));
        container.appendChild(star);
    });
}

// ─────────────────────────────────────────
//  星降り演出
// ─────────────────────────────────────────
function starFallEffect(starEl, q, meta) {
    // 二重クリック防止
    if (document.getElementById('skyOverlay').classList.contains('active')) return;

    const overlay = document.getElementById('skyOverlay');
    overlay.classList.add('active');

    const rect  = starEl.getBoundingClientRect();
    const fromX = rect.left + rect.width  / 2;
    const fromY = rect.top  + rect.height / 2;
    const starW = Math.max(rect.width, 10);

    // 飛ぶ用のクローンを生成
    const clone = document.createElement('div');
    clone.style.cssText = `
        position:fixed;
        left:${fromX - starW/2}px;
        top:${fromY - starW/2}px;
        width:${starW}px; height:${starW}px;
        border-radius:50%;
        background:${meta.color};
        box-shadow:0 0 ${starW*3}px ${starW*2}px ${meta.glow}80,
                   0 0 ${starW*6}px ${starW*3}px ${meta.color}40;
        z-index:200; pointer-events:none; will-change:transform,opacity;
    `;
    document.body.appendChild(clone);
    starEl.style.opacity = '0';

    const toX  = window.innerWidth  / 2;
    const toY  = window.innerHeight / 2;
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const dur  = Math.max(500, Math.min(900, dist * 0.8));

    clone.animate([
        { transform:'translate(0,0) scale(1)',         opacity:1, offset:0 },
        { transform:'translate(0,-40px) scale(2.2)',   opacity:1, offset:0.2 },
        { transform:`translate(${toX-fromX}px,${toY-fromY-starW}px) scale(0.8)`, opacity:0.9, offset:0.85 },
        { transform:`translate(${toX-fromX}px,${toY-fromY}px) scale(0.3)`,       opacity:0,   offset:1 }
    ], { duration:dur, easing:'cubic-bezier(0.22,1,0.36,1)', fill:'forwards' });

    // 着地エフェクト
    setTimeout(() => {
        spawnRipple(toX, toY, meta.color, meta.glow, 0);
        spawnRipple(toX, toY, meta.color, meta.glow, 80);
    }, dur - 60);

    setTimeout(() => {
        clone.remove();
        overlay.classList.remove('active');
        starEl.style.opacity = '';
        openDetail(q);
    }, dur + 120);
}

function spawnRipple(cx, cy, color, glow, delay) {
    const size = 60;
    const el   = document.createElement('div');
    el.className = 'star-ripple';
    el.style.cssText = `
        left:${cx - size/2}px; top:${cy - size/2}px;
        width:${size}px; height:${size}px;
        background:radial-gradient(circle,${color}cc 0%,${glow}44 50%,transparent 75%);
        animation-delay:${delay}ms;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800 + delay);
}

// ─────────────────────────────────────────
//  詳細モーダル
// ─────────────────────────────────────────
function openDetail(q) {
    currentDetail = q;
    const meta = EMOTION_MAP[q.emotion] || { emoji: '⭐' };

    document.getElementById('detailEmotion').textContent     = meta.emoji;
    document.getElementById('detailEmotionText').textContent = q.emotion;
    document.getElementById('detailQuote').textContent       = q.quote;
    document.getElementById('detailAuthor').textContent      = q.author ? `— ${q.author}` : '';
    document.getElementById('detailSource').textContent      = q.source ? `『${q.source}』` : '';
    document.getElementById('detailReason').textContent      = q.reason || '（理由の記録なし）';
    document.getElementById('detailDate').textContent        = formatDate(q.created_at);

    // 共有された星かどうかでボタン表示を変える
    const isShared   = q.is_shared == 1;
    const favBtn     = document.getElementById('favoriteBtn');
    const pubBtn     = document.getElementById('publicToggleBtn');
    const editArea   = document.getElementById('detailEditArea');

    // お気に入りは自分の星・持ってきた星どちらでも設定できる
    favBtn.style.display = 'block';
    favBtn.textContent = q.favorite == 1 ? '★' : '☆';
    favBtn.className   = q.favorite == 1
        ? 'text-2xl transition hover:scale-110 text-yellow-400'
        : 'text-2xl transition hover:scale-110 text-gray-400';

    if (isShared) {
        // 持ってきた星は公開設定・編集・削除はできない
        editArea.style.display = 'none';
        pubBtn.innerHTML = `<span class="text-indigo-400">✨</span><span>${escHtml(q.original_owner || '')}さんの星</span>`;
        pubBtn.className = 'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-indigo-500/50 text-indigo-300';
        pubBtn.disabled  = true;
        pubBtn.style.cursor = 'default';
    } else {
        editArea.style.display = 'flex';
        pubBtn.disabled = false;
        pubBtn.style.cursor = 'pointer';
        updatePublicToggle();
    }

    openModal('detailModal');

    // この星に付いたコメントを読み込む
    document.getElementById('detailCommentInput').value = '';
    document.getElementById('detailCommentMsg').textContent = '';
    loadDetailComments(q);

    // 振り返りメモのリセット＆ロード
    detailReflectionEmotion = '';
    document.querySelectorAll('.detail-ref-emo').forEach(b =>
        b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800')
    );
    document.getElementById('detailReflectionInput').value = '';
    document.getElementById('detailReflectionMsg').textContent = '';
    loadDetailReflections(q.id, q.is_shared == 1);
}

document.getElementById('closeDetailBtn').addEventListener('click', () => closeModal('detailModal'));

// 自分の夜空にある星へのコメントを読み込む
async function loadDetailComments(q) {
    const listEl = document.getElementById('detailCommentList');
    listEl.innerHTML = '<p class="text-xs text-gray-500">読み込み中…</p>';

    try {
        const url = `../api/social.php?action=comments&quote_id=${q.id}&is_shared=${q.is_shared == 1 ? 1 : 0}`;
        const res = await fetch(url);
        const data = await res.json();
        const comments = data.comments || [];

        listEl.innerHTML = '';
        if (comments.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-gray-500">まだコメントはありません</p>';
            return;
        }

        comments.forEach(c => {
            listEl.insertAdjacentHTML('beforeend', `
                <div class="bg-slate-800/40 rounded-lg px-3 py-2">
                    <div class="flex items-center justify-between mb-0.5">
                        <span class="text-xs font-bold text-indigo-300">${escHtml(c.commenter_name)}</span>
                        <span class="text-[10px] text-gray-500">${formatDate(c.created_at)}</span>
                    </div>
                    <p class="text-sm text-gray-200 leading-relaxed">${escHtml(c.comment)}</p>
                </div>
            `);
        });
    } catch (_) {
        listEl.innerHTML = '<p class="text-xs text-red-400">読み込みに失敗しました</p>';
    }
}

document.getElementById('detailCommentSendBtn').addEventListener('click', sendDetailComment);
document.getElementById('detailCommentInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) sendDetailComment();
});

async function sendDetailComment() {
    if (!currentDetail) return;

    const input = document.getElementById('detailCommentInput');
    const msgEl = document.getElementById('detailCommentMsg');
    const comment = input.value.trim();

    if (!comment) {
        msgEl.textContent = 'コメントを入力してください';
        msgEl.className = 'text-xs mt-2 text-red-400';
        return;
    }

    try {
        const res = await fetch('../api/social.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quote_id: currentDetail.id,
                is_shared: currentDetail.is_shared == 1,
                comment
            })
        });
        const data = await res.json();

        if (!res.ok) {
            msgEl.textContent = data.error || '送信に失敗しました';
            msgEl.className = 'text-xs mt-2 text-red-400';
            return;
        }

        input.value = '';
        msgEl.textContent = '';
        await loadDetailComments(currentDetail);
    } catch (_) {
        msgEl.textContent = 'ネットワークエラーが発生しました';
        msgEl.className = 'text-xs mt-2 text-red-400';
    }
}

// ─────────────────────────────────────────
//  詳細モーダル内の振り返りメモ
// ─────────────────────────────────────────
let detailReflectionEmotion = '';

// 感情ピッカー
document.getElementById('detailReflectionEmotionPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.detail-ref-emo');
    if (!btn) return;
    document.querySelectorAll('.detail-ref-emo').forEach(b =>
        b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800')
    );
    btn.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-800');
    detailReflectionEmotion = btn.getAttribute('data-emotion');
});

// 振り返りメモ一覧を読み込む
async function loadDetailReflections(quoteId, isShared) {
    const listEl = document.getElementById('detailReflectionList');
    listEl.innerHTML = '<p class="text-xs text-indigo-400/60 text-center py-2">読み込み中…</p>';
    try {
        const res  = await fetch(`../api/reflections.php?quote_id=${quoteId}&is_shared=${isShared ? 1 : 0}`);
        const data = await res.json();
        const refs = data.reflections || [];

        listEl.innerHTML = '';
        if (refs.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-indigo-400/50 text-center py-2">まだメモはありません</p>';
            return;
        }
        refs.forEach((r, idx) => {
            const meta    = EMOTION_MAP[r.emotion] || null;
            const isFirst = idx === 0;
            listEl.insertAdjacentHTML('beforeend', `
                <div class="relative pl-4 border-l-2 ${isFirst ? 'border-indigo-400' : 'border-slate-700'} py-1">
                    <div class="flex items-center gap-2 mb-1">
                        ${meta ? `<span class="text-sm">${meta.emoji}</span>` : ''}
                        <span class="text-xs ${isFirst ? 'text-indigo-300' : 'text-gray-500'}">${formatDate(r.created_at)}</span>
                        ${isFirst ? '<span class="text-xs bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded">最新</span>' : ''}
                    </div>
                    <p class="text-sm ${isFirst ? 'text-white' : 'text-gray-400'} leading-relaxed">${escHtml(r.memo)}</p>
                </div>
            `);
        });
    } catch (_) {
        listEl.innerHTML = '<p class="text-xs text-red-400/70 text-center py-2">読み込みに失敗しました</p>';
    }
}

// メモ投稿
document.getElementById('addDetailReflectionBtn').addEventListener('click', async () => {
    if (!currentDetail) return;
    const msgEl    = document.getElementById('detailReflectionMsg');
    const memo     = document.getElementById('detailReflectionInput').value.trim();
    const isShared = currentDetail.is_shared == 1;

    if (!memo) {
        msgEl.textContent = 'メモを入力してください';
        msgEl.className   = 'text-xs mt-2 text-red-400';
        return;
    }

    try {
        const res = await fetch('../api/reflections.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quote_id:  currentDetail.id,
                memo,
                emotion:   detailReflectionEmotion,
                is_shared: isShared
            })
        });
        const data = await res.json();

        if (!res.ok) {
            msgEl.textContent = data.error || '投稿に失敗しました';
            msgEl.className   = 'text-xs mt-2 text-red-400';
            return;
        }

        msgEl.textContent = 'メモを残しました 🪐';
        msgEl.className   = 'text-xs mt-2 text-indigo-300';
        document.getElementById('detailReflectionInput').value = '';
        detailReflectionEmotion = '';
        document.querySelectorAll('.detail-ref-emo').forEach(b =>
            b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800')
        );
        await loadDetailReflections(currentDetail.id, isShared);
        setTimeout(() => { msgEl.textContent = ''; }, 2000);
    } catch (_) {
        msgEl.textContent = 'ネットワークエラーが発生しました';
        msgEl.className   = 'text-xs mt-2 text-red-400';
    }
});

// 編集ボタン
document.getElementById('editStarBtn').addEventListener('click', () => {
    if (!currentDetail || currentDetail.is_shared == 1) return;
    openEditModal();
});

// 削除ボタン
document.getElementById('deleteStarBtn').addEventListener('click', async () => {
    if (!currentDetail || currentDetail.is_shared == 1) return;
    if (!confirm('本当にこの星を削除しますか？振り返りメモも一緒に削除されます。')) return;

    try {
        const res = await fetch(`../api/quotes.php?id=${currentDetail.id}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
            closeModal('detailModal');
            // 一覧から削除して再描画
            allQuotes = allQuotes.filter(q => q.id !== currentDetail.id);
            applySkyFilter();
            updateStats();
            alert('星を削除しました');
        } else {
            alert(data.error || '削除に失敗しました');
        }
    } catch (_) {
        alert('ネットワークエラーが発生しました');
    }
});

// ─────────────────────────────────────────
//  編集モーダル
// ─────────────────────────────────────────
document.getElementById('closeEditBtn').addEventListener('click', () => closeModal('editModal'));
document.getElementById('cancelEditBtn').addEventListener('click', () => closeModal('editModal'));

function openEditModal() {
    const q = currentDetail;
    if (!q) return;

    // フォームに現在の値をセット
    document.getElementById('editQuoteInput').value  = q.quote  || '';
    document.getElementById('editAuthorInput').value = q.author || '';
    document.getElementById('editSourceInput').value = q.source || '';
    document.getElementById('editReasonInput').value = q.reason || '';
    document.getElementById('editMessage').textContent = '';

    // 現在の感情を選択状態にする
    const radios = document.querySelectorAll('input[name="editEmotion"]');
    radios.forEach(r => { r.checked = r.value === q.emotion; });

    closeModal('detailModal');
    openModal('editModal');
}

document.getElementById('editQuoteForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!currentDetail) return;
    const msgEl = document.getElementById('editMessage');

    const quote   = document.getElementById('editQuoteInput').value.trim();
    const author  = document.getElementById('editAuthorInput').value.trim();
    const source  = document.getElementById('editSourceInput').value.trim();
    const reason  = document.getElementById('editReasonInput').value.trim();
    const emoEl   = document.querySelector('input[name="editEmotion"]:checked');

    if (!quote) { showMsg(msgEl, '言葉を入力してください', 'error'); return; }
    if (!emoEl) { showMsg(msgEl, '感情を選択してください', 'error'); return; }

    try {
        const res = await fetch('../api/quotes.php', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id:      currentDetail.id,
                quote,
                author,
                source,
                reason,
                emotion: emoEl.value
            })
        });
        const data = await res.json();

        if (!res.ok) {
            showMsg(msgEl, data.error || '更新に失敗しました', 'error');
            return;
        }

        // ローカルのデータも更新
        Object.assign(currentDetail, { quote, author, source, reason, emotion: emoEl.value });
        const target = allQuotes.find(q => q.id === currentDetail.id);
        if (target) Object.assign(target, { quote, author, source, reason, emotion: emoEl.value });

        showMsg(msgEl, '更新しました ✨', 'success');
        setTimeout(() => {
            closeModal('editModal');
            applySkyFilter();
            updateStats();
            openDetail(currentDetail);
        }, 800);
    } catch (_) {
        showMsg(msgEl, 'ネットワークエラーが発生しました', 'error');
    }
});

// 公開/非公開トグル
document.getElementById('publicToggleBtn').addEventListener('click', async () => {
    if (!currentDetail) return;
    const newVal = currentDetail.is_public == 1 ? 0 : 1;

    try {
        const res = await fetch('../api/quotes.php', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentDetail.id, is_public: newVal })
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || '更新に失敗しました');
            return;
        }

        currentDetail.is_public = newVal;
        const target = allQuotes.find(q => q.id === currentDetail.id);
        if (target) target.is_public = newVal;

        updatePublicToggle();
    } catch (_) {
        alert('ネットワークエラーが発生しました');
    }
});

function updatePublicToggle() {
    if (!currentDetail) return;
    const btn = document.getElementById('publicToggleBtn');
    const isPublic = currentDetail.is_public == 1;
    btn.innerHTML = isPublic
        ? '<span class="text-green-400">🌍</span><span>公開中</span>'
        : '<span class="text-gray-500">🔒</span><span>非公開（秘密にしてる）</span>';
    btn.className = 'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition ' +
        (isPublic
            ? 'border-green-500/50 text-green-300 hover:bg-green-500/10'
            : 'border-gray-600 text-gray-400 hover:bg-gray-700/30');
}

document.getElementById('favoriteBtn').addEventListener('click', () => {
    if (!currentDetail) return;
    const newVal = currentDetail.favorite == 1 ? 0 : 1;
    const isShared = currentDetail.is_shared == 1;

    fetch('../api/quotes.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentDetail.id, favorite: newVal, is_shared: isShared })
    })
    .then(r => r.json().then(data => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
        if (!ok) {
            alert(data.error || '更新に失敗しました');
            return;
        }
        currentDetail.favorite = newVal;
        // 自分の星と持ってきた星はIDが重なることがあるので、種類も合わせて探す
        const target = allQuotes.find(q => q.id == currentDetail.id && (q.is_shared == 1) === isShared);
        if (target) target.favorite = newVal;

        const favBtn = document.getElementById('favoriteBtn');
        favBtn.textContent = newVal === 1 ? '★' : '☆';
        favBtn.className   = newVal === 1
            ? 'text-2xl transition hover:scale-110 text-yellow-400'
            : 'text-2xl transition hover:scale-110 text-gray-400';

        applySkyFilter();
        updateStats();
    });
});

// ─────────────────────────────────────────
//  振り返りモーダル（3フェーズ）
// ─────────────────────────────────────────
let reflectFilterEmotion = '';
let reflectSearchKeyword = '';   // テキスト検索キーワード
let reflectSelectedQuote = null;
let reflectMemoEmotion   = '';

document.getElementById('reflectBtn').addEventListener('click', () => {
    openReflectModal();
});
document.getElementById('closeReflectBtn').addEventListener('click', () => closeModal('reflectModal'));
document.getElementById('backToStarList').addEventListener('click', () => showReflectPhase(1));

// テキスト検索（入力のたびに絞り込み）
document.getElementById('reflectSearchInput').addEventListener('input', (e) => {
    reflectSearchKeyword = e.target.value.trim().toLowerCase();
    buildReflectStarList();
});

// 感情フィルタータグ
document.getElementById('reflectEmotionFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.reflect-filter-tag');
    if (!btn) return;
    document.querySelectorAll('.reflect-filter-tag').forEach(b => {
        b.classList.remove('ring-2', 'ring-yellow-400');
    });
    btn.classList.add('ring-2', 'ring-yellow-400');
    reflectFilterEmotion = btn.getAttribute('data-emotion');
    buildReflectStarList();
});

// 感情ピッカー（メモ用）
document.getElementById('reflectMemoPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.rmemo-emo');
    if (!btn) return;
    document.querySelectorAll('.rmemo-emo').forEach(b =>
        b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800')
    );
    btn.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-800');
    reflectMemoEmotion = btn.getAttribute('data-emotion');
});

// メモ投稿
document.getElementById('saveReflectMemoBtn').addEventListener('click', async () => {
    if (!reflectSelectedQuote) return;
    const msgEl = document.getElementById('reflectMemoMsg');
    const memo  = document.getElementById('reflectMemoInput').value.trim();

    if (!memo) {
        msgEl.textContent = 'メモを入力してください';
        msgEl.className   = 'text-xs mt-2 text-red-400';
        return;
    }

    try {
        const res = await fetch('../api/reflections.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quote_id: reflectSelectedQuote.id,
                memo,
                emotion: reflectMemoEmotion
            })
        });
        const data = await res.json();

        if (!res.ok) {
            msgEl.textContent = data.error || '投稿に失敗しました';
            msgEl.className   = 'text-xs mt-2 text-red-400';
            return;
        }

        msgEl.textContent = '過去の星にメモを残しました 🪐';
        msgEl.className   = 'text-xs mt-2 text-indigo-300';
        document.getElementById('reflectMemoInput').value = '';
        document.querySelectorAll('.rmemo-emo').forEach(b =>
            b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800')
        );
        reflectMemoEmotion = '';
        await loadReflectPastMemos(reflectSelectedQuote.id);
        setTimeout(() => { msgEl.textContent = ''; }, 2500);
    } catch (_) {
        msgEl.textContent = 'エラーが発生しました';
        msgEl.className   = 'text-xs mt-2 text-red-400';
    }
});

function openReflectModal() {
    reflectFilterEmotion  = '';
    reflectSearchKeyword  = '';
    reflectSelectedQuote  = null;
    reflectMemoEmotion    = '';
    // 検索欄をクリア
    const searchInput = document.getElementById('reflectSearchInput');
    if (searchInput) searchInput.value = '';
    showReflectPhase(1);
    openModal('reflectModal');
}

function showReflectPhase(phase) {
    document.getElementById('reflectPhase1').classList.toggle('hidden', phase !== 1);
    document.getElementById('reflectPhase2').classList.toggle('hidden', phase !== 2);
    document.getElementById('reflectPhase3').classList.toggle('hidden', phase !== 3);
    if (phase === 1) buildReflectStarList();
}

// フェーズ1: 星リスト構築
function buildReflectStarList() {
    const listEl = document.getElementById('reflectStarList');
    listEl.innerHTML = '';

    // 振り返り対象は自分の言葉のみ（共有星は除外）
    const ownQuotes = allQuotes.filter(q => q.is_shared != 1);
    const kw = reflectSearchKeyword;
    const filtered = ownQuotes.filter(q => {
        // 感情フィルター
        const emotionMatch = !reflectFilterEmotion || q.emotion === reflectFilterEmotion;
        // テキスト検索（言葉・作者・出典）
        const kwMatch = !kw ||
            q.quote.toLowerCase().includes(kw) ||
            (q.author || '').toLowerCase().includes(kw) ||
            (q.source || '').toLowerCase().includes(kw);
        return emotionMatch && kwMatch;
    });

    if (filtered.length === 0) {
        const msg = (kw || reflectFilterEmotion)
            ? '条件に合う星が見つかりません'
            : 'まだ言葉が登録されていません';
        listEl.innerHTML = `<p class="text-gray-500 text-sm text-center py-8">${msg}</p>`;
        return;
    }

    filtered.forEach(q => {
        const meta  = EMOTION_MAP[q.emotion] || { emoji: '⭐', color: '#ffffff', glow: '#aaaaaa' };
        const isFav = q.favorite == 1;
        listEl.insertAdjacentHTML('beforeend', `
            <div class="reflect-star-card group flex items-start gap-4 px-4 py-4 cursor-pointer
                        border-b border-white/5 hover:bg-white/5 transition"
                 data-qid="${q.id}">
                <!-- 星アイコン -->
                <div class="flex-shrink-0 mt-0.5">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-lg
                                transition group-hover:scale-125"
                         style="background:${meta.color}22;
                                box-shadow:0 0 12px 2px ${meta.glow}50">
                        ${meta.emoji}
                    </div>
                </div>
                <!-- 内容 -->
                <div class="flex-1 min-w-0">
                    <p class="text-sm text-white leading-relaxed line-clamp-2">${escHtml(q.quote)}</p>
                    <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        ${q.author ? `<span>— ${escHtml(q.author)}</span>` : ''}
                        ${q.source ? `<span>『${escHtml(q.source)}』</span>` : ''}
                        <span>${formatDate(q.created_at)}</span>
                    </div>
                </div>
                <!-- お気に入りバッジ -->
                ${isFav ? '<span class="text-yellow-400 flex-shrink-0 self-center">★</span>' : ''}
                <!-- 呼び戻す矢印 -->
                <span class="text-gray-600 group-hover:text-indigo-400 flex-shrink-0 self-center transition text-lg">→</span>
            </div>
        `);
    });

    // 各カードのクリックで呼び戻し演出へ
    listEl.querySelectorAll('.reflect-star-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.getAttribute('data-qid'), 10);
            const q  = allQuotes.find(q => q.id === id);
            if (!q) return;
            summonStar(q);
        });
    });
}

// フェーズ2: 呼び戻し演出
function summonStar(q) {
    reflectSelectedQuote = q;
    const meta = EMOTION_MAP[q.emotion] || { emoji: '⭐', color: '#ffffff' };

    document.getElementById('summonStar').textContent    = meta.emoji;
    document.getElementById('summonQuotePreview').textContent =
        q.quote.length > 40 ? q.quote.slice(0, 40) + '…' : q.quote;

    showReflectPhase(2);

    // 流れ星演出を起動しながら1.5秒後にフェーズ3へ
    triggerShootingStar();
    setTimeout(() => buildReflectPhase3(q), 1500);
}

// フェーズ3: 振り返り記入
async function buildReflectPhase3(q) {
    const meta = EMOTION_MAP[q.emotion] || { emoji: '⭐', color: '#6366f1', glow: '#4f46e5' };

    // バッジ
    document.getElementById('reflectEmotionBadge').innerHTML =
        `<span style="color:${meta.color}">${meta.emoji} ${q.emotion}</span>`;

    // カードのグロー
    document.getElementById('reflectCardGlow').style.background =
        `radial-gradient(ellipse at center, ${meta.glow}, transparent)`;

    // 言葉
    document.getElementById('reflectQuoteText').textContent   = q.quote;
    document.getElementById('reflectQuoteAuthor').textContent = q.author ? `— ${q.author}` : '';
    document.getElementById('reflectQuoteSource').textContent = q.source ? `『${q.source}』` : '';
    document.getElementById('reflectQuoteDate').textContent   = `登録日: ${formatDate(q.created_at)}`;
    document.getElementById('reflectQuoteReason').textContent = q.reason || '（記録なし）';

    // 入力欄リセット
    document.getElementById('reflectMemoInput').value = '';
    document.getElementById('reflectMemoMsg').textContent = '';
    document.querySelectorAll('.rmemo-emo').forEach(b =>
        b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800')
    );
    reflectMemoEmotion = '';

    showReflectPhase(3);
    await loadReflectPastMemos(q.id);
}

// 過去のメモ読み込み（フェーズ3用）
async function loadReflectPastMemos(quoteId) {
    const el = document.getElementById('reflectPastMemos');
    el.innerHTML = '<p class="text-xs text-indigo-400/50 text-center py-1">読み込み中…</p>';
    try {
        const res  = await fetch(`../api/reflections.php?quote_id=${quoteId}`);
        const data = await res.json();
        const refs = data.reflections || [];

        el.innerHTML = '';
        if (refs.length === 0) {
            el.innerHTML = '<p class="text-xs text-gray-600 text-center py-1">過去のメモはまだありません</p>';
            return;
        }

        refs.forEach((r, idx) => {
            const m       = EMOTION_MAP[r.emotion] || null;
            const isFirst = idx === 0;
            el.insertAdjacentHTML('beforeend', `
                <div class="relative pl-3 border-l-2 ${isFirst ? 'border-indigo-400' : 'border-slate-700'} py-1">
                    <div class="flex items-center gap-2 mb-0.5">
                        ${m ? `<span class="text-xs">${m.emoji}</span>` : ''}
                        <span class="text-xs ${isFirst ? 'text-indigo-300' : 'text-gray-600'}">${formatDate(r.created_at)}</span>
                        ${isFirst ? '<span class="text-xs bg-indigo-500/30 text-indigo-300 px-1 rounded">最新</span>' : ''}
                    </div>
                    <p class="text-xs ${isFirst ? 'text-gray-200' : 'text-gray-500'} leading-relaxed">${escHtml(r.memo)}</p>
                </div>
            `);
        });
    } catch (_) {
        el.innerHTML = '<p class="text-xs text-red-400/60 text-center py-1">読み込みに失敗しました</p>';
    }
}

// ─────────────────────────────────────────
//  ランダム星呼び出し（流れ星）
// ─────────────────────────────────────────
document.getElementById('randomStarBtn').addEventListener('click', () => {
    if (allQuotes.length === 0) return;
    const q = allQuotes[Math.floor(Math.random() * allQuotes.length)];
    openDetail(q);
    triggerShootingStar();
});

function triggerShootingStar() {
    const canvas = document.getElementById('backgroundStars');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 画面右上から左下へ流れる流れ星を一瞬描画
    let progress = 0;
    const startX = canvas.width * 0.75 + Math.random() * canvas.width * 0.25;
    const startY = Math.random() * canvas.height * 0.3;
    const length = 180 + Math.random() * 120;
    const angle  = Math.PI * 0.7 + Math.random() * 0.2;

    function draw() {
        if (progress > 1) return;
        const tailX = startX + Math.cos(angle) * length * progress;
        const tailY = startY + Math.sin(angle) * length * progress;
        const headX = tailX + Math.cos(angle) * 20;
        const headY = tailY + Math.sin(angle) * 20;

        const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,220,${0.9 * (1 - progress)})`);

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth   = 2;
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        progress += 0.035;
        requestAnimationFrame(draw);
    }
    draw();
}

// ─────────────────────────────────────────
//  言葉登録モーダル
// ─────────────────────────────────────────
document.getElementById('addQuoteBtn').addEventListener('click', () => openModal('addModal'));
document.getElementById('cancelAddBtn').addEventListener('click', () => closeModal('addModal'));

document.getElementById('addQuoteForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const msgEl = document.getElementById('addMessage');

    const quote  = document.getElementById('quoteInput').value.trim();
    const author = document.getElementById('authorInput').value.trim();
    const source = document.getElementById('sourceInput').value.trim();
    const reason = document.getElementById('reasonInput').value.trim();
    const emotionEl = document.querySelector('input[name="emotion"]:checked');

    if (!quote) { showMsg(msgEl, '言葉を入力してください', 'error'); return; }
    if (!emotionEl) { showMsg(msgEl, '感情を選択してください', 'error'); return; }

    try {
        const res = await fetch('../api/quotes.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quote, author, source, reason, emotion: emotionEl.value })
        });
        const data = await res.json();

        if (!res.ok) {
            showMsg(msgEl, data.error || '登録に失敗しました', 'error');
            return;
        }

        showMsg(msgEl, '夜空に新しい星が生まれました ✨', 'success');

        // 一覧を再取得して星を更新
        const listRes = await fetch('../api/quotes.php');
        const listData = await listRes.json();
        allQuotes = listData.quotes || [];
        applySkyFilter();
        updateStats();

        // フォームリセット
        this.reset();
        setTimeout(() => {
            closeModal('addModal');
            msgEl.textContent = '';
        }, 1200);
    } catch (_) {
        showMsg(msgEl, 'ネットワークエラーが発生しました', 'error');
    }
});

// ─────────────────────────────────────────
//  統計モーダル
// ─────────────────────────────────────────
document.getElementById('statsBtn').addEventListener('click', () => {
    updateStats();
    openModal('statsModal');
});
document.getElementById('closeStatsBtn').addEventListener('click', () => closeModal('statsModal'));

function updateStats() {
    const total   = allQuotes.length;
    const favs    = allQuotes.filter(q => q.favorite == 1).length;

    document.getElementById('totalCount').textContent    = total;
    document.getElementById('favoriteCount').textContent = favs;

    // 感情別カウント
    const counts = {};
    for (const q of allQuotes) {
        counts[q.emotion] = (counts[q.emotion] || 0) + 1;
    }

    const el = document.getElementById('emotionStats');
    el.innerHTML = '';
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [emotion, count] of sorted) {
        const meta = EMOTION_MAP[emotion] || { emoji: '⭐', color: '#ffffff' };
        const pct  = total > 0 ? Math.round(count / total * 100) : 0;
        el.insertAdjacentHTML('beforeend', `
            <div>
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-white">${meta.emoji} ${emotion}</span>
                    <span style="color:${meta.color}">${count}個 (${pct}%)</span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${meta.color}"></div>
                </div>
            </div>
        `);
    }
    if (sorted.length === 0) {
        el.innerHTML = '<p class="text-gray-500 text-sm">まだ言葉が登録されていません</p>';
    }
}

// ─────────────────────────────────────────
//  マイページ
// ─────────────────────────────────────────
document.getElementById('myPageBtn').addEventListener('click', () => {
    buildMyPage();
    openModal('myPageModal');
});
document.getElementById('closeMyPageBtn').addEventListener('click', () => closeModal('myPageModal'));

function buildMyPage() {
    const total   = allQuotes.length;
    const favs    = allQuotes.filter(q => q.favorite == 1);
    const kinds   = new Set(allQuotes.map(q => q.emotion)).size;

    document.getElementById('mpTotal').textContent        = total;
    document.getElementById('mpFavorite').textContent     = favs.length;
    document.getElementById('mpEmotionKinds').textContent = kinds;

    // お気に入り一覧
    const favList = document.getElementById('mpFavoriteList');
    favList.innerHTML = '';
    if (favs.length === 0) {
        favList.innerHTML = '<p class="text-gray-500 text-sm">お気に入りはまだありません</p>';
    } else {
        favs.forEach(q => {
            const meta = EMOTION_MAP[q.emotion] || { emoji: '⭐', color: '#ffffff' };
            favList.insertAdjacentHTML('beforeend', `
                <div class="bg-slate-800/40 rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-700/50 transition" data-quote-id="${q.id}">
                    <div class="flex items-start gap-2">
                        <span class="text-base">${meta.emoji}</span>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-white truncate">${escHtml(q.quote)}</p>
                            <p class="text-xs text-gray-400 mt-0.5">${escHtml(q.author || '')}${q.source ? '『' + escHtml(q.source) + '』' : ''}</p>
                        </div>
                        <span class="text-yellow-400 flex-shrink-0">★</span>
                    </div>
                </div>
            `);
        });
    }

    // 最近追加した言葉（上位5件）
    const recentList = document.getElementById('mpRecentList');
    recentList.innerHTML = '';
    const recent = [...allQuotes].slice(0, 5);
    if (recent.length === 0) {
        recentList.innerHTML = '<p class="text-gray-500 text-sm">まだ言葉が登録されていません</p>';
    } else {
        recent.forEach(q => {
            const meta = EMOTION_MAP[q.emotion] || { emoji: '⭐', color: '#ffffff' };
            recentList.insertAdjacentHTML('beforeend', `
                <div class="bg-slate-800/40 rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-700/50 transition" data-quote-id="${q.id}">
                    <div class="flex items-start gap-2">
                        <span class="text-base">${meta.emoji}</span>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-white truncate">${escHtml(q.quote)}</p>
                            <p class="text-xs text-gray-400 mt-0.5">${formatDate(q.created_at)}</p>
                        </div>
                    </div>
                </div>
            `);
        });
    }

    // リスト内のカードをクリックすると詳細を開く
    for (const card of document.querySelectorAll('[data-quote-id]')) {
        card.addEventListener('click', () => {
            const id = parseInt(card.getAttribute('data-quote-id'), 10);
            const q = allQuotes.find(q => q.id === id);
            if (!q) return;
            closeModal('myPageModal');
            openDetail(q);
        });
    }

    loadReceivedCopies();
}

async function loadReceivedCopies() {
    const listEl = document.getElementById('mpReceivedCopiesList');
    listEl.innerHTML = '<p class="text-gray-500 text-sm">読み込み中…</p>';

    try {
        const res = await fetch('../api/social.php?action=received_copies');
        const data = await res.json();
        const copies = data.received_copies || [];
        listEl.innerHTML = '';

        if (copies.length === 0) {
            listEl.innerHTML = '<p class="text-gray-500 text-sm">まだ受け取られた星はありません</p>';
            return;
        }

        copies.forEach(copy => {
            const meta = EMOTION_MAP[copy.emotion] || { emoji: '⭐' };
            listEl.insertAdjacentHTML('beforeend', `
                <div class="bg-slate-800/40 rounded-lg px-4 py-3">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-bold text-indigo-300">${escHtml(copy.copier_username)}さんが受け取りました</span>
                        <span class="text-xs text-gray-500">${formatDate(copy.created_at)}</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="text-base">${meta.emoji}</span>
                        <p class="text-sm text-white leading-relaxed">${escHtml(copy.quote)}</p>
                    </div>
                </div>
            `);
        });
    } catch (_) {
        listEl.innerHTML = '<p class="text-red-400 text-sm">読み込みに失敗しました</p>';
    }
}

// ─────────────────────────────────────────
//  検索モーダル
// ─────────────────────────────────────────
let searchEmotion = ''; // 現在選択中の感情フィルター

document.getElementById('searchBtn').addEventListener('click', () => {
    openModal('searchModal');
    runSearch();
});
document.getElementById('closeSearchBtn').addEventListener('click', () => closeModal('searchModal'));

document.getElementById('doSearchBtn').addEventListener('click', runSearch);
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
});

// 感情タグのトグル
document.getElementById('emotionFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.emotion-tag');
    if (!btn) return;
    document.querySelectorAll('.emotion-tag').forEach(b => {
        b.classList.remove('ring-2', 'ring-yellow-400', 'bg-slate-500');
    });
    btn.classList.add('ring-2', 'ring-yellow-400', 'bg-slate-500');
    searchEmotion = btn.getAttribute('data-emotion');
    runSearch();
});

function runSearch() {
    const kw  = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    const resultsEl = document.getElementById('searchResults');

    const filtered = allQuotes.filter(q => {
        const emotionMatch = !searchEmotion || q.emotion === searchEmotion;
        const kwMatch = !kw ||
            q.quote.toLowerCase().includes(kw) ||
            (q.author || '').toLowerCase().includes(kw) ||
            (q.source || '').toLowerCase().includes(kw);
        return emotionMatch && kwMatch;
    });

    // 夜空の星にも反映
    if (kw || searchEmotion) {
        renderStars(allQuotes, q => {
            const emotionMatch = !searchEmotion || q.emotion === searchEmotion;
            const kwMatch = !kw ||
                q.quote.toLowerCase().includes(kw) ||
                (q.author || '').toLowerCase().includes(kw) ||
                (q.source || '').toLowerCase().includes(kw);
            return emotionMatch && kwMatch;
        });
    } else {
        // 検索条件が空になったら期間フィルターに戻す
        applySkyFilter();
    }

    resultsEl.innerHTML = '';
    if (filtered.length === 0) {
        resultsEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">見つかりませんでした</p>';
        return;
    }

    filtered.forEach(q => {
        const meta = EMOTION_MAP[q.emotion] || { emoji: '⭐', color: '#ffffff' };
        resultsEl.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-800/40 rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-700/50 transition search-result-card" data-qid="${q.id}">
                <div class="flex items-start gap-2">
                    <span class="text-base flex-shrink-0">${meta.emoji}</span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-white leading-relaxed">${escHtml(q.quote)}</p>
                        <div class="flex gap-2 mt-1">
                            ${q.author ? `<span class="text-xs text-gray-400">— ${escHtml(q.author)}</span>` : ''}
                            ${q.source ? `<span class="text-xs text-gray-400">『${escHtml(q.source)}』</span>` : ''}
                        </div>
                    </div>
                    ${q.favorite == 1 ? '<span class="text-yellow-400 flex-shrink-0">★</span>' : ''}
                </div>
            </div>
        `);
    });

    // 検索結果カードをクリックで詳細表示
    resultsEl.querySelectorAll('.search-result-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.getAttribute('data-qid'), 10);
            const q  = allQuotes.find(q => q.id === id);
            if (!q) return;
            closeModal('searchModal');
            openDetail(q);
        });
    });
}

// ─────────────────────────────────────────
//  ユーティリティ
// ─────────────────────────────────────────
function openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; el.classList.add('active'); }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = ''; el.classList.remove('active'); }
}

function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'mt-4 text-sm ' + (type === 'success' ? 'text-green-400' : 'text-red-400');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// モーダル外クリックで閉じる
window.addEventListener('click', (e) => {
    for (const id of ['addModal', 'detailModal', 'statsModal', 'myPageModal', 'searchModal', 'reflectModal', 'friendsModal', 'friendStarModal', 'editModal', 'rankingModal', 'friendRankingModal']) {
        const el = document.getElementById(id);
        if (el && e.target === el) closeModal(id);
    }
});

// ─────────────────────────────────────────
//  フレンド機能
// ─────────────────────────────────────────
let currentFriendList = [];  // フレンド一覧キャッシュ
let currentSkyFriend  = null; // 夜空タブで選択中のフレンド
let friendSkyStars = [];
let friendSkyRange = 'all';
let friendSkyPeriodBase = new Date();
let currentFriendStar = null; // フレンド星プレビュー

document.getElementById('friendsBtn').addEventListener('click', () => {
    openModal('friendsModal');
    switchFriendTab('list');
});
document.getElementById('closeFriendsBtn').addEventListener('click', () => closeModal('friendsModal'));

// タブ切り替え
document.querySelectorAll('.friend-tab').forEach(btn => {
    btn.addEventListener('click', () => switchFriendTab(btn.dataset.tab));
});

function switchFriendTab(tab) {
    // タブのアクティブスタイル
    document.querySelectorAll('.friend-tab').forEach(b => {
        const isActive = b.dataset.tab === tab;
        b.classList.toggle('border-yellow-400', isActive);
        b.classList.toggle('text-yellow-300',   isActive);
        b.classList.toggle('border-transparent', !isActive);
    });
    // コンテンツの表示切替
    document.querySelectorAll('.friend-tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`friendTab-${tab}`).classList.remove('hidden');

    if (tab === 'list')     loadFriendList();
    if (tab === 'requests') loadFriendRequests();
    if (tab === 'sky')      loadSkyFriendPicker();
}

// ── フレンド一覧 ──
async function loadFriendList() {
    const el = document.getElementById('friendListContent');
    el.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">読み込み中…</p>';
    try {
        const res  = await fetch('../api/friends.php?action=list');
        const data = await res.json();
        currentFriendList = data.friends || [];

        el.innerHTML = '';
        if (currentFriendList.length === 0) {
            el.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">まだフレンドがいません</p>';
            return;
        }
        currentFriendList.forEach(f => {
            el.insertAdjacentHTML('beforeend', `
                <div class="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3 mb-2">
                    <div>
                        <p class="text-sm text-white font-bold">${escHtml(f.username)}</p>
                        <p class="text-xs text-gray-400">${escHtml(f.email)}</p>
                    </div>
                    <button class="remove-friend-btn text-xs text-red-400 hover:text-red-300 transition"
                            data-id="${f.id}">削除</button>
                </div>
            `);
        });
        el.querySelectorAll('.remove-friend-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('フレンドを削除しますか？')) return;
                const res = await fetch(`../api/friends.php?friend_id=${btn.dataset.id}`, { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) loadFriendList();
                else alert(data.error);
            });
        });
    } catch (_) {
        el.innerHTML = '<p class="text-red-400 text-sm text-center py-4">読み込みに失敗しました</p>';
    }
}

// ── 申請受信 ──
async function loadFriendRequests() {
    const el = document.getElementById('friendRequestsContent');
    el.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">読み込み中…</p>';
    try {
        const res  = await fetch('../api/friends.php?action=requests');
        const data = await res.json();
        const reqs = data.requests || [];

        // バッジ更新
        const badge = document.getElementById('requestBadge');
        if (reqs.length > 0) {
            badge.textContent = reqs.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        el.innerHTML = '';
        if (reqs.length === 0) {
            el.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">申請はありません</p>';
            return;
        }
        reqs.forEach(r => {
            el.insertAdjacentHTML('beforeend', `
                <div class="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3 mb-2">
                    <div>
                        <p class="text-sm text-white font-bold">${escHtml(r.username)}</p>
                        <p class="text-xs text-gray-400">${escHtml(r.email)}</p>
                    </div>
                    <div class="flex gap-2">
                        <button class="accept-req-btn text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg transition"
                                data-rid="${r.request_id}">承認</button>
                        <button class="reject-req-btn text-xs bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg transition"
                                data-id="${r.id}">拒否</button>
                    </div>
                </div>
            `);
        });
        el.querySelectorAll('.accept-req-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const res  = await fetch('../api/friends.php', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ request_id: parseInt(btn.dataset.rid) })
                });
                const data = await res.json();
                if (res.ok) loadFriendRequests();
                else alert(data.error);
            });
        });
        el.querySelectorAll('.reject-req-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const res  = await fetch(`../api/friends.php?friend_id=${btn.dataset.id}`, { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) loadFriendRequests();
                else alert(data.error);
            });
        });
    } catch (_) {
        el.innerHTML = '<p class="text-red-400 text-sm text-center py-4">読み込みに失敗しました</p>';
    }
}

// ── フレンド追加（ユーザー検索） ──
document.getElementById('friendSearchBtn').addEventListener('click', searchFriendUser);
document.getElementById('friendSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchFriendUser();
});

async function searchFriendUser() {
    const q   = document.getElementById('friendSearchInput').value.trim();
    const el  = document.getElementById('friendSearchResults');
    if (!q) return;

    el.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">検索中…</p>';
    try {
        const res  = await fetch(`../api/friends.php?action=search&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const users = data.users || [];

        el.innerHTML = '';
        if (users.length === 0) {
            el.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">ユーザーが見つかりません</p>';
            return;
        }
        users.forEach(u => {
            el.insertAdjacentHTML('beforeend', `
                <div class="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3 mb-2">
                    <div>
                        <p class="text-sm text-white font-bold">${escHtml(u.username)}</p>
                        <p class="text-xs text-gray-400">${escHtml(u.email)}</p>
                    </div>
                    <button class="send-req-btn text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition"
                            data-id="${u.id}">申請する</button>
                </div>
            `);
        });
        el.querySelectorAll('.send-req-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled   = true;
                btn.textContent = '送信中…';
                const res  = await fetch('../api/friends.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ friend_id: parseInt(btn.dataset.id) })
                });
                const data = await res.json();
                if (res.ok) {
                    btn.textContent   = '申請済み ✓';
                    btn.className     = 'text-xs text-gray-400 px-3 py-1.5 rounded-lg';
                } else {
                    btn.disabled      = false;
                    btn.textContent   = '申請する';
                    alert(data.error);
                }
            });
        });
    } catch (_) {
        el.innerHTML = '<p class="text-red-400 text-sm text-center py-4">エラーが発生しました</p>';
    }
}

// ── 夜空を見る ──
async function loadSkyFriendPicker() {
    const el = document.getElementById('skyFriendList');
    el.innerHTML = '<p class="text-gray-500 text-xs">読み込み中…</p>';

    try {
        const res  = await fetch('../api/friends.php?action=list');
        const data = await res.json();
        const friends = data.friends || [];

        el.innerHTML = '';
        if (friends.length === 0) {
            el.innerHTML = '<p class="text-gray-500 text-xs">フレンドがまだいません</p>';
            return;
        }
        friends.forEach(f => {
            const btn = document.createElement('button');
            btn.className = 'px-4 py-2 rounded-full text-sm bg-slate-700 text-gray-300 hover:bg-indigo-700 hover:text-white transition';
            btn.textContent = f.username;
            btn.addEventListener('click', () => openFriendSky(f));
            el.appendChild(btn);
        });
    } catch (_) {
        el.innerHTML = '<p class="text-red-400 text-xs">読み込みに失敗しました</p>';
    }
}

function openFriendSky(friend) {
    currentSkyFriend = friend;
    closeModal('friendsModal');
    document.getElementById('friendSkyOwnerLabel').textContent = `${friend.username} の夜空`;
    friendSkyRange = 'all';
    friendSkyPeriodBase = new Date();
    updateFriendSkyRangeButtons();
    openModal('friendSkyModal');
    loadFriendSkyStars(friend.id);
}

// ── フレンドの星の詳細 + コピー ──
document.getElementById('closeFriendStarBtn').addEventListener('click', () => closeModal('friendStarModal'));

let copyStarEmotion = '';

// 感情ピッカー
document.getElementById('copyEmotionPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-emo');
    if (!btn) return;
    document.querySelectorAll('.copy-emo').forEach(b =>
        b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800/60')
    );
    btn.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-800/60');
    copyStarEmotion = btn.getAttribute('data-emotion');
});

function openFriendStarDetail(s) {
    currentFriendStar = s;
    copyStarEmotion   = '';
    const meta = EMOTION_MAP[s.emotion] || { emoji: '⭐' };

    document.getElementById('fStarEmotion').textContent     = meta.emoji;
    document.getElementById('fStarEmotionText').textContent = s.emotion;
    document.getElementById('fStarOwner').textContent       = s.is_shared == 1
        ? `${s.username} の星（${s.original_owner || '誰か'}さんから受け取った星）`
        : `${s.username} の星`;
    document.getElementById('fStarQuote').textContent       = s.quote;
    document.getElementById('fStarAuthor').textContent      = s.author  ? `— ${s.author}` : '';
    document.getElementById('fStarSource').textContent      = s.source  ? `『${s.source}』` : '';
    document.getElementById('fStarReason').textContent      = s.reason || '（理由の記録なし）';
    document.getElementById('fStarDate').textContent        = formatDate(s.created_at);

    // ピッカーとテキストリセット
    document.querySelectorAll('.copy-emo').forEach(b =>
        b.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-800/60')
    );
    document.getElementById('copyReasonInput').value = '';

    const copyBtn = document.getElementById('copyStarBtn');
    const msgEl   = document.getElementById('copyStarMsg');
    const form    = document.getElementById('copyStarForm');

    if (s.already_copied) {
        form.classList.add('hidden');
        copyBtn.textContent = '✓ すでに自分の夜空にある';
        copyBtn.className   = 'text-xs text-gray-400 px-4 py-2 rounded-lg border border-gray-600';
        copyBtn.disabled    = true;
    } else {
        form.classList.remove('hidden');
        copyBtn.innerHTML  = '✨ 自分の夜空に加える';
        copyBtn.className  = 'flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-4 py-2 rounded-lg transition';
        copyBtn.disabled   = false;
    }
    msgEl.textContent = '';

    // コメント欄をリセットして読み込む
    document.getElementById('fStarCommentInput').value = '';
    document.getElementById('fStarCommentMsg').textContent = '';
    loadFriendStarComments(s);
    loadFriendStarReflections(s);

    openModal('friendStarModal');
}

async function loadFriendStarReflections(s) {
    const listEl = document.getElementById('fStarReflectionList');
    listEl.innerHTML = '<p class="text-xs text-gray-500">読み込み中…</p>';
    if (!currentSkyFriend) {
        listEl.innerHTML = '';
        return;
    }

    try {
        const url = `../api/reflections.php?quote_id=${s.id}&owner_id=${currentSkyFriend.id}&is_shared=${s.is_shared == 1 ? 1 : 0}`;
        const res = await fetch(url);
        const data = await res.json();
        const reflections = data.reflections || [];
        listEl.innerHTML = '';

        if (reflections.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-gray-500">まだ振り返りはありません</p>';
            return;
        }

        reflections.forEach((reflection, index) => {
            const meta = EMOTION_MAP[reflection.emotion] || null;
            listEl.insertAdjacentHTML('beforeend', `
                <div class="relative pl-3 border-l-2 ${index === 0 ? 'border-indigo-400' : 'border-slate-700'} py-1">
                    <div class="flex items-center gap-2 mb-0.5">
                        ${meta ? `<span class="text-xs">${meta.emoji}</span>` : ''}
                        <span class="text-xs text-gray-500">${formatDate(reflection.created_at)}</span>
                    </div>
                    <p class="text-sm text-gray-300 leading-relaxed">${escHtml(reflection.memo)}</p>
                </div>
            `);
        });
    } catch (_) {
        listEl.innerHTML = '<p class="text-xs text-red-400">読み込みに失敗しました</p>';
    }
}

document.getElementById('copyStarBtn').addEventListener('click', async () => {
    if (!currentFriendStar) return;
    const btn    = document.getElementById('copyStarBtn');
    const msgEl  = document.getElementById('copyStarMsg');
    const reason = document.getElementById('copyReasonInput').value.trim();

    if (!copyStarEmotion) {
        msgEl.textContent = '感情を選んでください';
        msgEl.className   = 'text-xs mt-3 text-center text-red-400';
        return;
    }

    btn.disabled    = true;
    btn.textContent = '追加中…';

    try {
        const res  = await fetch('../api/social.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quote_id: currentFriendStar.is_shared == 1
                    ? currentFriendStar.original_quote_id
                    : currentFriendStar.id,
                emotion:  copyStarEmotion,
                reason:   reason
            })
        });
        const data = await res.json();

        if (res.ok) {
            msgEl.textContent = '夜空に加わりました ✨';
            msgEl.className   = 'text-xs mt-3 text-center text-green-400';
            btn.textContent   = '✓ 追加済み';
            btn.className     = 'text-xs text-gray-400 px-4 py-2 rounded-lg border border-gray-600';
            currentFriendStar.already_copied = true;
            document.getElementById('copyStarForm').classList.add('hidden');

            // 一覧を再取得して夜空を更新
            const listRes  = await fetch('../api/quotes.php');
            const listData = await listRes.json();
            allQuotes = listData.quotes || [];
            applySkyFilter();
            updateStats();
        } else {
            msgEl.textContent = data.error || '追加に失敗しました';
            msgEl.className   = 'text-xs mt-3 text-center text-red-400';
            btn.disabled      = false;
            btn.textContent   = '✨ 自分の夜空に加える';
        }
    } catch (_) {
        msgEl.textContent = 'エラーが発生しました';
        msgEl.className   = 'text-xs mt-3 text-center text-red-400';
        btn.disabled      = false;
    }
});

// 起動時に申請バッジをチェック
(async function checkPendingRequests() {
    try {
        const res  = await fetch('../api/friends.php?action=requests');
        const data = await res.json();
        const count = (data.requests || []).length;
        const badge = document.getElementById('requestBadge');
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        }
    } catch (_) { /* サイレント */ }
})();


// ─────────────────────────────────────────
//  モバイル用ハンバーガーメニュー
// ─────────────────────────────────────────
(function initMobileMenu() {
    const toggleBtn = document.getElementById('menuToggleBtn');
    const menu      = document.getElementById('mobileMenu');
    if (!toggleBtn || !menu) return;

    // 開閉
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('hidden');
    });

    // メニュー外をタップしたら閉じる
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== toggleBtn) {
            menu.classList.add('hidden');
        }
    });

    // モバイル用ボタン → 対応するPC用ボタンのクリックを発火
    const pairs = {
        myPageBtnM:     'myPageBtn',
        rankingBtnM:    'rankingBtn',
        friendsBtnM:    'friendsBtn',
        reflectBtnM:    'reflectBtn',
        statsBtnM:      'statsBtn',
        searchBtnM:     'searchBtn',
        randomStarBtnM: 'randomStarBtn',
    };
    for (const [mobileId, pcId] of Object.entries(pairs)) {
        const mBtn = document.getElementById(mobileId);
        const pBtn = document.getElementById(pcId);
        if (mBtn && pBtn) {
            mBtn.addEventListener('click', () => {
                menu.classList.add('hidden'); // メニューを閉じる
                pBtn.click();                 // 本来の機能を呼ぶ
            });
        }
    }
})();


// ─────────────────────────────────────────
//  好きな言葉 TOP5 ランキング
// ─────────────────────────────────────────
let currentRankings = [];  // [{rank, quote_id, quote, author, source, emotion}, ...]

document.getElementById('rankingBtn').addEventListener('click', openRankingModal);
document.getElementById('closeRankingBtn').addEventListener('click', () => closeModal('rankingModal'));
document.getElementById('editRankingBtn').addEventListener('click', showRankingEdit);
document.getElementById('cancelRankingBtn').addEventListener('click', showRankingView);
document.getElementById('saveRankingBtn').addEventListener('click', saveRankings);

async function openRankingModal() {
    openModal('rankingModal');
    await loadRankings();
    showRankingView();
}

// ランキングをAPIから取得
async function loadRankings() {
    try {
        const res  = await fetch('../api/rankings.php');
        const data = await res.json();
        currentRankings = data.rankings || [];
    } catch (_) {
        currentRankings = [];
    }
}

// 表示モード
function showRankingView() {
    document.getElementById('rankingView').classList.remove('hidden');
    document.getElementById('rankingEdit').classList.add('hidden');

    const listEl = document.getElementById('rankingList');
    listEl.innerHTML = '';

    // 1〜5位を順に表示（空きは「未設定」）
    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    for (let rank = 1; rank <= 5; rank++) {
        const item = currentRankings.find(r => r.rank == rank);
        const medal = medals[rank - 1];

        if (item) {
            const meta = EMOTION_MAP[item.emotion] || { emoji: '⭐', color: '#ffffff', glow: '#aaaaaa' };
            listEl.insertAdjacentHTML('beforeend', `
                <div class="flex items-start gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border-l-4"
                     style="border-color:${meta.color}">
                    <div class="text-2xl flex-shrink-0 w-8 text-center">${medal}</div>
                    <div class="flex-1 min-w-0">
                        <p class="text-white text-sm leading-relaxed">${escHtml(item.quote)}</p>
                        <div class="flex gap-2 mt-1 text-xs text-gray-400">
                            <span>${meta.emoji}</span>
                            ${item.author ? `<span>— ${escHtml(item.author)}</span>` : ''}
                            ${item.source ? `<span>『${escHtml(item.source)}』</span>` : ''}
                            ${item.is_shared == 1 ? '<span class="text-indigo-300">✨共有</span>' : ''}
                        </div>
                    </div>
                </div>
            `);
        } else {
            listEl.insertAdjacentHTML('beforeend', `
                <div class="flex items-center gap-3 bg-slate-800/20 rounded-xl px-4 py-3 border-l-4 border-slate-700">
                    <div class="text-2xl flex-shrink-0 w-8 text-center opacity-40">${medal}</div>
                    <p class="text-gray-600 text-sm">未設定</p>
                </div>
            `);
        }
    }
}

// 編集モード
function showRankingEdit() {
    document.getElementById('rankingView').classList.add('hidden');
    document.getElementById('rankingEdit').classList.remove('hidden');
    document.getElementById('rankingEditMsg').textContent = '';

    // 既存のランキングを「選んだ順」の初期値にする（rank順）
    // キーは "isShared-quoteId" の文字列で管理（テーブルをまたぐID重複対策）
    rankingSelectedKeys = currentRankings
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map(r => `${r.is_shared == 1 ? 1 : 0}-${r.quote_id}`);

    renderRankingGrid();
}

// 選択中の星キー（"isShared-id" 形式、選んだ順に並ぶ）
let rankingSelectedKeys = [];

// 星のキーを作る
function starKey(q) {
    return `${q.is_shared == 1 ? 1 : 0}-${q.id}`;
}

// カードグリッドを描画
function renderRankingGrid() {
    const gridEl = document.getElementById('rankingGrid');
    gridEl.innerHTML = '';

    // 自分の空にある星すべて（自分の星 + 共有星）
    const stars = allQuotes;

    if (stars.length === 0) {
        gridEl.innerHTML = '<p class="col-span-full text-gray-500 text-sm text-center py-8">まだ星がありません</p>';
        updateRankingCount();
        return;
    }

    stars.forEach(q => {
        const meta   = EMOTION_MAP[q.emotion] || { emoji: '⭐', color: '#ffffff', glow: '#aaaaaa' };
        const key    = starKey(q);
        const order  = rankingSelectedKeys.indexOf(key); // -1なら未選択
        const picked = order !== -1;
        const label  = q.quote.length > 44 ? q.quote.slice(0, 44) + '…' : q.quote;
        const shared = q.is_shared == 1;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'ranking-card relative text-left rounded-xl p-3 border transition h-full ' +
            (picked
                ? 'bg-yellow-400/10 border-yellow-400'
                : 'bg-slate-800/40 border-white/10 hover:border-white/30 hover:bg-slate-800/70');

        card.innerHTML = `
            ${picked ? `<span class="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-bold flex items-center justify-center shadow-lg">${order + 1}</span>` : ''}
            <div class="flex items-center gap-1 mb-1">
                <span class="text-sm">${meta.emoji}</span>
                <span class="text-[10px] text-gray-400 truncate">${escHtml(q.source || '')}</span>
                ${shared ? '<span class="text-[9px] text-indigo-300 flex-shrink-0">✨共有</span>' : ''}
            </div>
            <p class="text-xs text-white leading-relaxed">${escHtml(label)}</p>
        `;

        card.addEventListener('click', () => toggleRankingCard(q));
        gridEl.appendChild(card);
    });

    updateRankingCount();
}

// カードの選択/解除
function toggleRankingCard(q) {
    const key = starKey(q);
    const idx = rankingSelectedKeys.indexOf(key);
    if (idx !== -1) {
        // 解除
        rankingSelectedKeys.splice(idx, 1);
    } else {
        // 5個まで
        if (rankingSelectedKeys.length >= 5) {
            const msgEl = document.getElementById('rankingEditMsg');
            msgEl.textContent = '選べるのは5つまでです';
            msgEl.className   = 'mt-3 text-sm text-yellow-400';
            setTimeout(() => { msgEl.textContent = ''; }, 1500);
            return;
        }
        rankingSelectedKeys.push(key);
    }
    renderRankingGrid();
}

function updateRankingCount() {
    document.getElementById('rankingSelectCount').textContent =
        `${rankingSelectedKeys.length} / 5`;
}

// 保存
async function saveRankings() {
    const msgEl = document.getElementById('rankingEditMsg');

    // 選んだ順に 1位・2位… を割り当てる（キーを分解）
    const rankings = rankingSelectedKeys.map((key, i) => {
        const [isShared, quoteId] = key.split('-');
        return {
            rank: i + 1,
            quote_id: parseInt(quoteId, 10),
            is_shared: isShared === '1'
        };
    });

    try {
        const res = await fetch('../api/rankings.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rankings })
        });
        const data = await res.json();

        if (!res.ok) {
            msgEl.textContent = data.error || '保存に失敗しました';
            msgEl.className   = 'mt-3 text-sm text-red-400';
            return;
        }

        msgEl.textContent = '保存しました ✨';
        msgEl.className   = 'mt-3 text-sm text-green-400';

        await loadRankings();
        applySkyFilter();
        setTimeout(showRankingView, 600);
    } catch (_) {
        msgEl.textContent = 'ネットワークエラーが発生しました';
        msgEl.className   = 'mt-3 text-sm text-red-400';
    }
}


// ─────────────────────────────────────────
//  フレンドの夜空（フルスクリーン専用画面）
// ─────────────────────────────────────────
document.getElementById('closeFriendSkyBtn').addEventListener('click', () => closeModal('friendSkyModal'));

async function loadFriendSkyStars(friendId) {
    const container = document.getElementById('friendStarContainer');
    container.innerHTML = '<p class="text-gray-500 text-sm text-center mt-40">読み込み中…</p>';
    try {
        const res  = await fetch(`../api/social.php?action=sky&user_id=${friendId}`);
        const data = await res.json();
        if (!res.ok) {
            container.innerHTML = `<p class="text-red-400 text-sm text-center mt-40">${escHtml(data.error)}</p>`;
            return;
        }
        friendSkyStars = data.stars || [];
        applyFriendSkyFilter();
    } catch (_) {
        container.innerHTML = '<p class="text-red-400 text-sm text-center mt-40">読み込みに失敗しました</p>';
    }
}

// 全・年・月・週の切り替え
document.querySelectorAll('.friend-sky-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        friendSkyRange = btn.dataset.range;
        friendSkyPeriodBase = new Date();
        updateFriendSkyRangeButtons();
        applyFriendSkyFilter();
    });
});
document.getElementById('friendPeriodPrev').addEventListener('click', () => shiftFriendSkyPeriod(-1));
document.getElementById('friendPeriodNext').addEventListener('click', () => shiftFriendSkyPeriod(1));

function shiftFriendSkyPeriod(dir) {
    const d = new Date(friendSkyPeriodBase);
    if (friendSkyRange === 'year')  d.setFullYear(d.getFullYear() + dir);
    if (friendSkyRange === 'month') d.setMonth(d.getMonth() + dir);
    if (friendSkyRange === 'week')  d.setDate(d.getDate() + dir * 7);
    friendSkyPeriodBase = d;
    applyFriendSkyFilter();
}

function updateFriendSkyRangeButtons() {
    document.querySelectorAll('.friend-sky-range-btn').forEach(b => {
        const active = b.dataset.range === friendSkyRange;
        b.classList.toggle('bg-yellow-400', active);
        b.classList.toggle('text-black', active);
        b.classList.toggle('font-bold', active);
        b.classList.toggle('text-gray-300', !active);
    });
    const nav = document.getElementById('friendSkyPeriodNav');
    nav.classList.toggle('hidden', friendSkyRange === 'all');
    nav.classList.toggle('flex', friendSkyRange !== 'all');
}

// 自分の夜空と同じ判定ロジックを、基準日だけ差し替えて使う
function isInFriendSkyPeriod(s) {
    if (friendSkyRange === 'all') return true;
    const created = new Date(s.created_at);
    if (isNaN(created)) return false;
    const base = friendSkyPeriodBase;
    if (friendSkyRange === 'year')  return created.getFullYear() === base.getFullYear();
    if (friendSkyRange === 'month') return created.getFullYear() === base.getFullYear() && created.getMonth() === base.getMonth();
    if (friendSkyRange === 'week') {
        const start = startOfWeek(base);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return created >= start && created < end;
    }
    return true;
}

function friendSkyPeriodLabelText() {
    const base = friendSkyPeriodBase;
    if (friendSkyRange === 'year')  return `${base.getFullYear()}年`;
    if (friendSkyRange === 'month') return `${base.getFullYear()}年${base.getMonth() + 1}月`;
    if (friendSkyRange === 'week') {
        const start = startOfWeek(base);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const f = d => `${d.getMonth() + 1}/${d.getDate()}`;
        return `${f(start)} 〜 ${f(end)}`;
    }
    return '';
}

function applyFriendSkyFilter() {
    document.getElementById('friendPeriodLabel').textContent = friendSkyPeriodLabelText();
    const filtered = friendSkyStars.filter(isInFriendSkyPeriod);
    renderFriendStars(filtered);
    const countEl = document.getElementById('friendSkyStarCount');
    if (friendSkyRange === 'all') {
        countEl.textContent = `全 ${filtered.length} 個の星`;
    } else {
        countEl.textContent = filtered.length > 0 ? `${filtered.length} 個の星` : 'この期間に星はありません';
    }
}

// 自分の夜空と同じ見た目で描画
function renderFriendStars(stars) {
    const container = document.getElementById('friendStarContainer');
    container.innerHTML = '';
    if (stars.length === 0) {
        container.style.minHeight = '';
        container.innerHTML = '<p class="text-gray-500 text-sm text-center mt-48">公開されている星がありません</p>';
        return;
    }

    const isNarrow  = window.innerWidth < 640;
    const marginTop = isNarrow ? 170 : 130;
    const marginX   = isNarrow ? 24 : 80;
    const marginBottom = 60;
    const availableW = Math.max(window.innerWidth - marginX * 2, 100);
    const contentH = Math.max(
        window.innerHeight - marginTop - marginBottom,
        Math.ceil((stars.length * 3600) / availableW)
    );

    // 中身を入れる内側の箱（スクロール領域の高さを確保）
    const inner = document.createElement('div');
    inner.style.position = 'relative';
    inner.style.height = (contentH + marginTop + marginBottom) + 'px';

    stars.forEach(s => {
        const meta = EMOTION_MAP[s.emotion] || { color: '#ffffff', glow: '#aaaaaa' };
        const size = 8 + Math.random() * 6;
        const star = document.createElement('div');
        star.className = 'star';
        star.setAttribute('data-emotion', s.emotion);
        star.style.cssText = `
            left:${marginX + Math.random() * (window.innerWidth - marginX * 2)}px;
            top:${marginTop + Math.random() * contentH}px;
            width:${size}px; height:${size}px;
            background:${meta.color};
            box-shadow:0 0 ${size * 2}px ${size}px ${meta.glow}70, 0 0 ${size}px ${size / 2}px ${meta.color}90;
            animation-delay:${Math.random() * 4}s;
        `;
        star.style.outline = s.is_shared == 1 ? '1.5px dashed rgba(129, 140, 248, 0.7)' : '';
        star.style.outlineOffset = s.is_shared == 1 ? '3px' : '';
        star.addEventListener('click', () => openFriendStarDetail(s));
        inner.appendChild(star);
    });
    container.appendChild(inner);
}

// ── フレンドの「五つの星」 ──
document.getElementById('friendSkyRankingBtn').addEventListener('click', openFriendRankingModal);
document.getElementById('closeFriendRankingBtn').addEventListener('click', () => closeModal('friendRankingModal'));

async function openFriendRankingModal() {
    if (!currentSkyFriend) return;
    document.getElementById('friendRankingTitle').textContent = `✨ ${currentSkyFriend.username}を構成する五つの星`;
    const listEl = document.getElementById('friendRankingList');
    listEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">読み込み中…</p>';
    openModal('friendRankingModal');

    try {
        const res  = await fetch(`../api/social.php?action=ranking&user_id=${currentSkyFriend.id}`);
        const data = await res.json();
        const rankings = data.rankings || [];
        listEl.innerHTML = '';

        if (rankings.length === 0) {
            listEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">まだ五つの星が選ばれていません</p>';
            return;
        }

        const medals = ['🥇', '🥈', '🥉', '4', '5'];
        rankings.forEach(item => {
            const meta = EMOTION_MAP[item.emotion] || { emoji: '⭐', color: '#ffffff' };
            listEl.insertAdjacentHTML('beforeend', `
                <div class="friend-rank-card flex items-start gap-3 bg-slate-800/50 rounded-xl px-4 py-3 border-l-4 cursor-pointer hover:bg-slate-800/70 transition"
                     style="border-color:${meta.color}" data-qid="${item.quote_id}" data-shared="${item.is_shared == 1 ? 1 : 0}">
                    <div class="text-2xl flex-shrink-0 w-8 text-center">${medals[item.rank - 1] || item.rank}</div>
                    <div class="flex-1 min-w-0">
                        <p class="text-white text-sm leading-relaxed">${escHtml(item.quote)}</p>
                        <div class="flex gap-2 mt-1 text-xs text-gray-400">
                            <span>${meta.emoji}</span>
                            ${item.author ? `<span>— ${escHtml(item.author)}</span>` : ''}
                            ${item.source ? `<span>『${escHtml(item.source)}』</span>` : ''}
                            ${item.is_shared == 1 ? `<span class="text-indigo-300">✨ ${escHtml(item.original_owner || '')}さんから受け取った星</span>` : ''}
                        </div>
                    </div>
                </div>
            `);
        });

        // タップで星の詳細（コメントもここから）
        listEl.querySelectorAll('.friend-rank-card').forEach(card => {
            card.addEventListener('click', () => {
                const qid = parseInt(card.dataset.qid, 10);
                const isShared = card.dataset.shared === '1';
                const s = friendSkyStars.find(st => st.id == qid && (st.is_shared == 1) === isShared);
                if (s) {
                    closeModal('friendRankingModal');
                    openFriendStarDetail(s);
                }
            });
        });
    } catch (_) {
        listEl.innerHTML = '<p class="text-red-400 text-sm text-center py-8">読み込みに失敗しました</p>';
    }
}

// ── フレンドの星へのコメント ──
async function loadFriendStarComments(s) {
    const listEl = document.getElementById('fStarCommentList');
    listEl.innerHTML = '<p class="text-xs text-gray-500">読み込み中…</p>';
    if (!currentSkyFriend) { listEl.innerHTML = ''; return; }
    try {
        const url = `../api/social.php?action=comments&quote_id=${s.id}&owner_id=${currentSkyFriend.id}&is_shared=${s.is_shared == 1 ? 1 : 0}`;
        const res  = await fetch(url);
        const data = await res.json();
        const comments = data.comments || [];
        listEl.innerHTML = '';
        if (comments.length === 0) {
            listEl.innerHTML = '<p class="text-xs text-gray-500">まだコメントはありません</p>';
            return;
        }
        comments.forEach(c => {
            listEl.insertAdjacentHTML('beforeend', `
                <div class="bg-slate-800/40 rounded-lg px-3 py-2">
                    <div class="flex items-center justify-between mb-0.5">
                        <span class="text-xs font-bold text-indigo-300">${escHtml(c.commenter_name)}</span>
                        <span class="text-[10px] text-gray-500">${formatDate(c.created_at)}</span>
                    </div>
                    <p class="text-sm text-gray-200 leading-relaxed">${escHtml(c.comment)}</p>
                </div>
            `);
        });
    } catch (_) {
        listEl.innerHTML = '<p class="text-xs text-red-400">読み込みに失敗しました</p>';
    }
}

document.getElementById('fStarCommentSendBtn').addEventListener('click', sendFriendStarComment);
document.getElementById('fStarCommentInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) sendFriendStarComment();
});

async function sendFriendStarComment() {
    if (!currentFriendStar || !currentSkyFriend) return;
    const input = document.getElementById('fStarCommentInput');
    const msgEl = document.getElementById('fStarCommentMsg');
    const comment = input.value.trim();
    if (!comment) {
        msgEl.textContent = 'コメントを入力してください';
        msgEl.className = 'text-xs mt-2 text-red-400';
        return;
    }
    try {
        const res = await fetch('../api/social.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quote_id: currentFriendStar.id,
                owner_id: currentSkyFriend.id,
                is_shared: false,
                comment
            })
        });
        const data = await res.json();
        if (!res.ok) {
            msgEl.textContent = data.error || '送信に失敗しました';
            msgEl.className = 'text-xs mt-2 text-red-400';
            return;
        }
        input.value = '';
        msgEl.textContent = '';
        await loadFriendStarComments(currentFriendStar);
    } catch (_) {
        msgEl.textContent = 'ネットワークエラーが発生しました';
        msgEl.className = 'text-xs mt-2 text-red-400';
    }
}
