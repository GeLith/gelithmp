/*
 * Glass Surface — 液态位移滤镜（常驻，不随滚动降级）
 *
 * 每张 .card / .btn 通过 backdrop-filter: url(#glass-filter-xxx) 应用：
 *   feImage 位移贴图 → feDisplacementMap 液态扭曲（Chromium 软件路径，效果最正）
 * 每个元素拥有【专属】内嵌滤镜与按自身精确尺寸生成的贴图——
 * 不做共享/分桶/取整，保证边缘折射与最初版本逐像素一致。
 *
 * 折射带：圆角矩形有符号距离场，跟随卡片 border-radius；四边等宽（小元素按短边 18% 自适应收窄），
 *         左右两侧水平折射按 DISTORTION_X_FACTOR 衰减（上下 100%、左右 55%）。
 * 大小分档：类名 main-card/hero-card/btn 或最长边 ≥ BIG_SIZE_PX → 强扭曲档；其余轻微。扭曲常驻，滚动时不消失。
 */
(function () {
  'use strict';

  /* 版本标记：DevTools 控制台应看到此日志；看不到 = 浏览器在用缓存的旧脚本 */
  console.log('[glass] v24 · 逐元素内嵌滤镜（主卡独立液态档 -520，赞赏卡保持 -320 参照）');

  /* ---------- 可调参数 ---------- */
  var DISTORTION_SCALE_BIG = -320;   // 大档通用：上限 |scale|/2 = 160px
  var DISTORTION_SCALE_MAIN = -520;  // 主卡专属：等比放大到接近赞赏卡的相对液态强度（上限 260px）
  var DISTORTION_SCALE_SMALL = -50;  // 小卡片轻微折射（上限 25px）
  var RIM_BAND_PX = 21;              // 折射带宽度基准（小元素按短边 18% 自适应收窄，≥6px）
  var GLASS_BLUR_BIG = 2;            // 大卡片磨砂：低磨砂保持折射线条锐利
  var GLASS_BLUR_SMALL = 6;          // 小卡片磨砂
  var BIG_SIZE_PX = 500;             // 尺寸分档阈值：最长边 ≥ 此值视为大卡片
  var DISTORTION_X_FACTOR = 0.55;    // 左右两侧水平折射强度系数（上下 100%、左右 55%）
  var CORNER_BOOST = 1.45;           // 四角强化系数：圆弧处折射增强 45%
  var MAP_MAX = 384;                 // 位移贴图最长边封顶（平滑渐变，feImage 放大到 100% 视觉无损）

  var _sizeCache = new Map();
  var _SIZE_EPS = 8;

  function supportsSVGFilters() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    var div = document.createElement('div');
    div.style.backdropFilter = 'url(#x)';
    return div.style.backdropFilter !== '';
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  /* ---------- 位移贴图：圆角矩形等宽折射带（跟随卡片 border-radius） ----------
      sd    = 圆角矩形有符号距离场（半长 hw/hh，圆角 rad=卡片 border-radius）
      edgeDist = -sd（内部到边界的像素距离）
      wgt   = 立方衰减（能量集中在贴边处，锐利线条感；t=0 处值与斜率皆 0，无接缝）
      四角强化：qx/qy 几何均值只在角落区非零，平滑无接缝
      位移方向 = SDF 梯度（处处垂直于边/圆角，连续无翻转线） */
  function generateDisplacementMap(w, h, scale, radius, bandPx) {
    /* 贴图按最长边封顶：平滑渐变无需全分辨率，feImage 放大到 100% 视觉无损 */
    var s = Math.min(1, MAP_MAX / Math.max(w, h));
    var mw = Math.max(2, Math.round(w * s));
    var mh = Math.max(2, Math.round(h * s));
    var c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(mw, mh);
    var d = img.data;

    var cx = (mw - 1) / 2, cy = (mh - 1) / 2;
    var hw = (mw - 1) / 2, hh = (mh - 1) / 2;
    var rad = Math.max(0, Math.min(radius * s || 0, Math.min(hw, hh))); // 跟随卡片圆角（映射到贴图分辨率）
    var bendMax = Math.abs(scale) * 0.5; // 边缘最大采样位移(px)，与贴图分辨率无关
    var band = (bandPx || RIM_BAND_PX) * s; // 折射带宽度（映射到贴图分辨率）

    for (var y = 0; y < mh; y++) {
      var ay = y - cy;
      for (var x = 0; x < mw; x++) {
        var i = (y * mw + x) << 2;
        var ax = x - cx;

        /* 圆角矩形有符号距离场：折射带跟随卡片圆角，四边等宽（无波浪、无噪声） */
        var qx = Math.abs(ax) - (hw - rad);
        var qy = Math.abs(ay) - (hh - rad);
        var sd = Math.sqrt(Math.max(qx, 0) * Math.max(qx, 0) + Math.max(qy, 0) * Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
        var edgeDist = -sd;
        if (sd > 0 || edgeDist >= band) {
          d[i] = 128; d[i + 1] = 128; // 带外/圆角外中性 → 严格零位移
        } else {
          var t = 1 - edgeDist / band;            // 1=贴边, 0=带外
          var wgt = t * t * t;                    // 立方衰减：锐利线条感（t=0 处值与斜率皆 0）

          /* 四角强化：qx/qy 几何均值只在角落区非零（直边=0，圆弧对角≈1），平滑无接缝 */
          var gqx = Math.max(qx, 0), gqy = Math.max(qy, 0);
          var cornerT = Math.min(1, Math.sqrt(gqx * gqy) / (rad * 0.5));
          wgt *= 1 + (CORNER_BOOST - 1) * cornerT;

          /* 位移方向 = 圆角矩形 SDF 梯度：处处垂直于边/圆角，连续无翻转线 */
          var sxn = ax >= 0 ? 1 : -1, syn = ay >= 0 ? 1 : -1;
          var ux, uy;
          if (qx > 0 && qy > 0) {
            var rl = Math.sqrt(qx * qx + qy * qy);
            ux = sxn * qx / rl; uy = syn * qy / rl;
          } else if (qx > 0) {
            ux = sxn; uy = 0;
          } else if (qy > 0) {
            ux = 0; uy = syn;
          } else {
            ux = 0; uy = 0;
          }

          var k = bendMax * wgt;
          d[i]     = Math.round(127.5 - 255 * k * ux * DISTORTION_X_FACTOR / scale); // 水平分量衰减：左右边折射更柔和
          d[i + 1] = Math.round(127.5 - 255 * k * uy / scale);
        }
        d[i + 2] = 0;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  /* ---------- 构建专属内嵌滤镜 ---------- */
  function buildFilter(w, h, glassBlur, scale, radius, bandPx) {
    var fid = 'glass-filter-' + uid();
    var map = generateDisplacementMap(w, h, scale, radius, bandPx);
    var markup =
      '<svg class="glass-surface__filter" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>' +
      '<filter id="' + fid + '" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="' + glassBlur + '" result="soft"/>' +
      '<feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" xlink:href="' + map + '" href="' + map + '" result="map"/>' +
      '<feDisplacementMap in="soft" in2="map" scale="' + scale + '" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter></defs></svg>';
    var wrapper = document.createElement('div');
    wrapper.innerHTML = markup;
    return { svg: wrapper.querySelector('svg'), filterId: fid, map: map };
  }

  /* ---------- 单卡初始化 ---------- */
  function initCard(card) {
    /* offsetWidth 测布局尺寸：getBoundingClientRect 会把入场动画的 scale 算进去 */
    var w = Math.max(card.offsetWidth || Math.round(card.getBoundingClientRect().width), 10);
    var h = Math.max(card.offsetHeight || Math.round(card.getBoundingClientRect().height), 10);
    var last = _sizeCache.get(card);
    if (last && Math.abs(last.w - w) < _SIZE_EPS && Math.abs(last.h - h) < _SIZE_EPS) return;
    _sizeCache.set(card, { w: w, h: h });

    /* 大档判定：类名或实际尺寸；.btn 恒为大档（按钮边缘与卡片同款扭曲） */
    var isBig = card.classList.contains('main-card') ||
                card.classList.contains('hero-card') ||
                card.classList.contains('btn') ||
                Math.max(w, h) >= BIG_SIZE_PX;
    /* 主卡用更强的专属档，使其边缘位移按更大尺寸等比放大到接近赞赏卡的观感强度；
       hero-card / btn / 尺寸达标的其他大档仍走通用 big 档，不受影响 */
    var scale = card.classList.contains('main-card') ? DISTORTION_SCALE_MAIN :
                (isBig ? DISTORTION_SCALE_BIG : DISTORTION_SCALE_SMALL);
    var glassBlur = isBig ? GLASS_BLUR_BIG : GLASS_BLUR_SMALL;
    var br = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
    /* 折射带自适应：小元素按短边 18% 收窄且不低于 6px，避免糊满整个按钮 */
    var bandPx = Math.min(RIM_BAND_PX, Math.max(6, Math.min(w, h) * 0.18));

    var built = buildFilter(w, h, glassBlur, scale, br, bandPx);
    var old = card.querySelector(':scope > svg.glass-surface__filter');
    if (old) old.parentNode.removeChild(old);
    card.insertBefore(built.svg, card.firstChild);
    card.style.setProperty('--filter-id', 'url(#' + built.filterId + ')');
    card.classList.add('glass-surface--svg');
    card.classList.remove('glass-surface--fallback');
    /* 预热：显式解码 feImage 的 base64 贴图 → 首次打开弹卡玻璃立即生效（无延迟）。
       decode() 等待位图真正进解码缓存，比仅赋 src 更确定 */
    var warm = new Image();
    warm.src = built.map;
    if (warm.decode) warm.decode().catch(function () {});
  }

  /* ---------- 批量初始化 ---------- */
  function initVisible() {
    if (!supportsSVGFilters()) {
      var all = document.querySelectorAll('.card, .btn');
      for (var k = 0; k < all.length; k++) all[k].classList.add('glass-surface--fallback');
      return;
    }
    var cards = document.querySelectorAll('.card, .btn');
    for (var i = 0; i < cards.length; i++) initCard(cards[i]);
  }

  /* ---------- 启动：IO 懒加载 + resize 防抖重测 ---------- */
  function start() {
    /* 移动端（≤768px）：跳过逐卡 SVG 位移滤镜生成——feDisplacementMap 滚动重绘极昂贵，是手机端卡顿根因。
       直接降级为轻量磨砂玻璃（.glass-surface--fallback 纯 blur），桌面(>768px) 路径零改动。 */
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
      var mob = document.querySelectorAll('.card, .btn');
      for (var m = 0; m < mob.length; m++) mob[m].classList.add('glass-surface--fallback');
      return;
    }

    initVisible();

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function() { initVisible(); }, { rootMargin: '160px' });
      var cards = document.querySelectorAll('.card, .btn');
      for (var i = 0; i < cards.length; i++) observer.observe(cards[i]);
    }

    var resizeTimer = null;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(initVisible, 300);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
