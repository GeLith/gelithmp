/*
 * Q 弹动效（全站共享）— JS 部分
 *  1. 入场：卡片进入视口时加 .in 触发 cardPop 弹出（css/qpop.css）
 *  2. 果冻：滚动时可见卡片按速度轻微纵向拉伸（--jqsx/--jqsy），停止后自然回弹
 * 性能设计：
 *  - 果冻形变只作用于视口 ±90px 的卡片；写入隔帧执行（~30Hz）
 *  - 写入期间挂 .jq-on 旁路 transform 过渡，防止逐帧重启动画
 *  - document.hidden 挂起；prefers-reduced-motion 用户不启用果冻
 */
(function () {
    'use strict';

    /* ---- 入场弹出 ---- */
    document.body.classList.add('js-anim');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
    /* 赞助弹卡的显隐由页面自身逻辑（open/closeDonate + 专属过渡）接管，
       不参与 Q 弹入场/果冻，否则其 opacity 会被 .in 永久置 1 导致无淡入淡出 */
    cards = cards.filter(function (c) {
        return !c.classList.contains('donate-card-inner') &&
               !c.classList.contains('jump-card-inner');
    });
    if (!cards.length) return;

    var visible = cards.slice(); // 无 IO 时退化为全量
    if ('IntersectionObserver' in window) {
        visible = [];
        var rio = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('in');
                    rio.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -8% 0px' });
        cards.forEach(function (c) { rio.observe(c); });

        /* 果冻形变的视口门控集合 */
        var vio = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                var i = visible.indexOf(e.target);
                if (e.isIntersecting && i === -1) visible.push(e.target);
                else if (!e.isIntersecting && i !== -1) visible.splice(i, 1);
            });
        }, { rootMargin: '90px' });
        cards.forEach(function (c) { vio.observe(c); });
    } else {
        cards.forEach(function (c) { c.classList.add('in'); });
    }

    /* ---- 滚动惯性果冻 ---- */
    if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var MAX_STRETCH = 0.085; // 最大 8.5% 纵向拉伸
    var GAIN = 0.0017;       // 滚动速度(px/帧) → 形变量
    var lastY = window.scrollY, vel = 0, raf = null, parity = 0;

    function clearAll() {
        cards.forEach(function (c) {
            c.classList.remove('jq-on');
            if (c.style.getPropertyValue('--jqsx')) c.style.removeProperty('--jqsx');
            if (c.style.getPropertyValue('--jqsy')) c.style.removeProperty('--jqsy');
        });
    }

    function tick() {
        if (document.hidden) {          // 页面不可见：挂起，滚动事件会重新拉起
            raf = null; clearAll(); return;
        }
        var y = window.scrollY;
        var dv = y - lastY; lastY = y;
        vel += (dv - vel) * 0.22;                 // 平滑速度
        if (Math.abs(vel) < 0.08) {               // 回弹完成 → 归位并停表
            vel = 0; raf = null; clearAll();
            return;
        }
        parity ^= 1;
        if (!parity) {                            // 隔帧写入：~30Hz 视觉无差别
            var a = Math.abs(vel) * GAIN;
            if (a > MAX_STRETCH) a = MAX_STRETCH;
            var sy = (1 + a).toFixed(4), sx = (1 - a * 0.6).toFixed(4);
            for (var i = 0; i < visible.length; i++) {
                var c = visible[i];
                if (c.classList.contains('in')) {
                    c.classList.add('jq-on');     // 写入期间旁路 transform 过渡
                    c.style.setProperty('--jqsx', sx);
                    c.style.setProperty('--jqsy', sy);
                }
            }
        }
        raf = requestAnimationFrame(tick);
    }
    window.addEventListener('scroll', function () {
        if (raf === null) raf = requestAnimationFrame(tick);
    }, { passive: true });
})();
