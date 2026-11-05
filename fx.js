    /* FX v2: drop-in intro, radar minimap, supply drop. Pure decoration; each part is isolated so one failing never breaks the others. */
    (function () {
        'use strict';
        var root = document.documentElement;
        var calm = root.classList.contains('fx-calm');          // OS asks for reduced motion: same features, no movement
        var query = location.search;
        var CANON = 'https://uniquetaha.ir/';
        var blockers = {};
        var introDone = false, introCallbacks = [];
        var api = {};
        window.__fxBlocking = false;

        function slice(list) { return Array.prototype.slice.call(list); }
        function rnd(a, b) { return a + Math.random() * (b - a); }
        function block(key, on) { if (on) { blockers[key] = 1; } else { delete blockers[key]; } window.__fxBlocking = Object.keys(blockers).length > 0; }
        function store(key, value) { try { if (value === undefined) { return sessionStorage.getItem(key); } sessionStorage.setItem(key, value); } catch (e) { return null; } }
        function guard(name, fn) { try { fn(); } catch (e) { try { console.warn('[unique-taha fx: ' + name + ']', e); } catch (_) {} } }
        function remove(node) { if (node && node.parentNode) { node.parentNode.removeChild(node); } }
        function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
        function onIntroDone(cb) { if (introDone) { cb(); } else { introCallbacks.push(cb); } }
        function markIntroDone() { if (introDone) { return; } introDone = true; introCallbacks.splice(0).forEach(function (cb) { guard('after-intro', cb); }); }
        function typing(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
        var modal = document.getElementById('vpnModal');
        function modalOpen() { return !!modal && modal.classList.contains('active'); }

        /* ================= 1) DROP-IN INTRO ================= */
        var introHTML = '';
        /* C-130 fly-by: front view approaches, turns into the side view as it passes (the jumper leaves from the rear ramp),
           then the rear 3/4 view banks away. Position, scale, banking and yaw are computed per frame for a 3D feel. */
        function makePlane(el) {
            var craft = el.querySelector('.dropin-craft');
            if (!craft) { return function () {}; }
            var front = craft.querySelector('.dropin-v-front'), side = craft.querySelector('.dropin-sidegrp'), rear = craft.querySelector('.dropin-v-rear');
            var W = window.innerWidth, H = window.innerHeight;
            var Wp = Math.max(230, Math.min(600, W * 0.46)), Hp = Wp * 0.386;
            craft.style.setProperty('--pw', Wp + 'px');
            var P0x = W * 0.44, P0y = H * 0.27;                          // where the jumper leaves the plane at t = 0.7s (rear ramp)
            var RX = 0.2, RY = 0.66;                                     // ramp position inside the side sprite
            var cx0 = P0x - (RX - 0.5) * Wp, cy0 = P0y - (RY - 0.5) * Hp, v = W * 0.4;
            var jump = el.querySelector('.dropin-jumper');
            if (jump) { jump.style.setProperty('--jx', (P0x - W / 2) + 'px'); jump.style.setProperty('--jy', (P0y - H * 0.54) + 'px'); }
            function lerp(a, b, u) { return a + (b - a) * u; }
            function c01(u) { return Math.min(Math.max(u, 0), 1); }
            function eo(u) { u = c01(u); return 1 - Math.pow(1 - u, 3); }
            function ei(u) { u = c01(u); return u * u * u; }
            return function (t) {
                if (t > 2.7) { craft.style.opacity = '0'; return; }
                var x, y, s, rz, ry;
                if (t < 0.5) {                                           // 1) front view comes in from far away
                    var u = eo(t / 0.5);
                    x = lerp(W * 0.3, cx0 + v * (0.5 - 0.7), u); y = lerp(H * 0.09, cy0, u); s = lerp(0.18, 0.96, u); rz = lerp(6, 0, u); ry = 0;
                } else if (t < 1.5) {                                    // 2) side view passes the camera
                    x = cx0 + v * (t - 0.7); y = cy0 + 5 * Math.sin((t - 0.5) * 2.4); s = lerp(0.96, 1.04, c01((t - 0.5) / 0.6)) - 0.1 * c01((t - 1.1) / 0.4); rz = -1.2 * Math.sin((t - 0.5) * 1.6); ry = lerp(-11, 9, c01((t - 0.5) / 1.0));
                } else {                                                 // 3) rear 3/4 view banks away to the right
                    var w = c01((t - 1.5) / 1.1);
                    x = cx0 + v * (t - 0.7) + ei(w) * W * 0.14; y = cy0 - ei(w) * H * 0.18; s = lerp(0.94, 0.34, eo(w)); rz = lerp(-1, -9, eo(w)); ry = lerp(9, 30, eo(w));
                }
                craft.style.transform = 'translate3d(' + (x - Wp / 2).toFixed(1) + 'px,' + (y - Hp / 2).toFixed(1) + 'px,0) rotateZ(' + rz.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) scale(' + s.toFixed(3) + ')';
                craft.style.opacity = String(c01(t / 0.12));
                var of = 1 - c01((t - 0.42) / 0.18), os = c01((t - 0.4) / 0.2) * (1 - c01((t - 1.5) / 0.22)), orr = c01((t - 1.5) / 0.22) * (1 - c01((t - 2.1) / 0.5));
                front.style.opacity = String(of); side.style.opacity = String(os); rear.style.opacity = String(orr);
            };
        }
        function playIntro() {
            var el = document.getElementById('dropIn');
            // the three aircraft sprites are downloaded only now (returning visitors and calm mode never fetch them)
            if (!calm) { Array.prototype.forEach.call(el.querySelectorAll('img[data-src]'), function (im) { im.src = im.getAttribute('data-src'); }); }
            if (!el) { markIntroDone(); return; }
            window.__fxIntroStarted = true;
            var done = false, timers = [], raf = 0;
            var altEl = el.querySelector('.dropin-alt'), statusEl = el.querySelector('.dropin-status');
            var plane = calm ? null : makePlane(el);
            function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
            function status(text, cls) { if (statusEl) { statusEl.textContent = text; statusEl.className = 'dropin-status' + (cls ? ' ' + cls : ''); } }
            function ease(x) { return 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3); }
            var t0 = now();
            el.classList.add('is-run');
            // One clock for everything: the plane, the HUD and the CSS animations (jumper, chute, ...) read the same animation time,
            // so a slow first frame can never separate the jumper from the plane's rear ramp.
            var clockAnim = null;
            try { var cl = el.querySelector('.dropin-clock'), list = cl && cl.getAnimations ? cl.getAnimations() : []; clockAnim = list.length ? list[0] : null; } catch (e) { clockAnim = null; }
            function clockT() {
                if (clockAnim && clockAnim.currentTime !== null && clockAnim.currentTime !== undefined) { return Number(clockAnim.currentTime) / 1000; }
                return (now() - t0) / 1000;
            }
            var stage = 0;
            function tick() {
                if (done) { return; }
                var t = clockT(), a;
                if (!calm) {
                    if (t >= 0.7 && stage < 1) { stage = 1; status('FREEFALL', 'is-fall'); }
                    if (t >= 1.6 && stage < 2) { stage = 2; status('CHUTE OPEN', 'is-open'); }
                    if (t >= 2.7 && stage < 3) { stage = 3; status('LANDED', 'is-land'); }
                    if (t >= 3.75) { finish(); return; }
                }
                if (plane) { plane(t); }
                if (t < 0.7) { a = 1200; } else if (t < 1.6) { a = 1200 - 920 * ease((t - 0.7) / 0.9); } else if (t < 2.7) { a = 280 * (1 - ease((t - 1.6) / 1.1)); } else { a = 0; }
                if (altEl) { altEl.textContent = String(Math.max(0, Math.round(a))); }
                raf = requestAnimationFrame(tick);
            }
            function finish() {
                if (done) { return; }
                done = true;
                if (raf) { cancelAnimationFrame(raf); }
                timers.forEach(clearTimeout);
                el.classList.add('is-gone');
                block('intro', false);
                store('introSeen', '1');
                setTimeout(function () { remove(el); }, 450);
                markIntroDone();
            }
            block('intro', true);
            if (calm) {
                if (altEl) { altEl.textContent = '0'; }
                status('LANDED', 'is-land');
                at(1700, finish);
            } else {
                if (altEl) { altEl.textContent = '1200'; }
                status('JUMP READY', 'is-ready');
                if (plane) { plane(0); }
                raf = requestAnimationFrame(tick);
                at(5200, finish);                                  // safety net; normally the shared clock ends it at 3.75s
            }
            var skip = el.querySelector('.dropin-skip');
            if (skip) { skip.addEventListener('click', function (e) { e.stopPropagation(); finish(); }); }
            el.addEventListener('click', finish);
            function onKey(e) {
                if (done) { document.removeEventListener('keydown', onKey); return; }
                if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
            }
            document.addEventListener('keydown', onKey);
        }
        function replayIntro() {
            if (window.__fxBlocking || document.getElementById('dropIn') || !introHTML) { return; }
            root.classList.remove('no-intro');
            document.body.insertAdjacentHTML('afterbegin', introHTML);
            playIntro();
        }
        guard('intro', function () {
            var first = document.getElementById('dropIn');
            if (first) { introHTML = first.outerHTML; }
            if (!first || root.classList.contains('no-intro')) { remove(first); markIntroDone(); return; }
            playIntro();
        });
        // If anything above failed, never leave the overlay on screen.
        setTimeout(function () { if (!introDone && !window.__fxIntroStarted) { remove(document.getElementById('dropIn')); markIntroDone(); } }, 800);

        /* ================= 2) RADAR MINIMAP ================= */
        guard('radar', function () {
            var radar = document.getElementById('radar');
            if (!radar) { return; }
            var toggle = document.getElementById('radarToggle');
            var captionText = document.getElementById('radarCaptionText');
            var pins = slice(radar.querySelectorAll('.radar-pin'));
            var cards = slice(document.querySelectorAll('.social-card'));
            if (!pins.length || pins.length !== cards.length) { radar.style.display = 'none'; return; }
            var current = -1, holdUntil = 0;
            var smooth = !calm;

            pins.forEach(function (pin, i) {
                var h = cards[i].querySelector('h2');
                pin.setAttribute('aria-label', 'رفتن به ' + (h ? h.textContent.trim() : pin.getAttribute('data-label')));
                pin.addEventListener('mouseenter', function () { caption(i); });
                pin.addEventListener('focus', function () { caption(i); });
                pin.addEventListener('mouseleave', function () { caption(current); });
                pin.addEventListener('blur', function () { caption(current); });
                pin.addEventListener('click', function () { go(i); });
            });
            function caption(i) { if (captionText) { captionText.textContent = i >= 0 ? pins[i].getAttribute('data-label') : 'نقشه سایت'; } }
            function setCurrent(i) {
                current = i;
                pins.forEach(function (p, k) {
                    p.classList.toggle('is-current', k === i);
                    if (k === i) { p.setAttribute('aria-current', 'true'); } else { p.removeAttribute('aria-current'); }
                });
                caption(i);
            }
            function lockOn(card) {
                slice(card.querySelectorAll('.lockon')).forEach(remove);
                var box = document.createElement('div');
                box.className = 'lockon';
                box.setAttribute('aria-hidden', 'true');
                box.innerHTML = '<i></i><i></i><i></i><i></i><b>TARGET LOCKED</b>';
                card.appendChild(box);
                setTimeout(function () { remove(box); }, 1200);
            }
            function go(i) {
                cards[i].scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
                lockOn(cards[i]);
                holdUntil = now() + 1100;
                setCurrent(i);
            }
            function update() {
                if (now() < holdUntil) { return; }
                var vh = window.innerHeight, best = -1, bestDist = Infinity;
                cards.forEach(function (card, i) {
                    var r = card.getBoundingClientRect();
                    if (r.bottom < vh * 0.15 || r.top > vh * 0.85) { return; }
                    var d = Math.abs((r.top + r.bottom) / 2 - vh / 2);
                    if (d < bestDist) { bestDist = d; best = i; }
                });
                if (best !== current) { setCurrent(best); }
            }
            var ticking = false;
            function onScroll() { if (ticking) { return; } ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); }
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll);
            function setOpen(open) { radar.setAttribute('data-open', open ? 'true' : 'false'); toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); }
            var saved = store('radarOpen');
            setOpen(saved === null ? window.innerWidth >= 1200 : saved === '1');
            function toggleRadar() { var open = radar.getAttribute('data-open') !== 'true'; setOpen(open); store('radarOpen', open ? '1' : '0'); }
            toggle.addEventListener('click', toggleRadar);
            api.toggleRadar = toggleRadar;
            update();
            onIntroDone(function () { setTimeout(function () { radar.classList.add('is-ready'); update(); }, 120); });
        });

        /* ================= 3) SUPPLY DROP ================= */
        guard('supply', function () {
            var MAX = 4, count = 0, busy = false, crate = null, dialog = null, scrim = null, timer = 0, lastFocus = null;
            var forced = /[?&]airdrop\b/.test(query);
            var MESSAGES = [
                'ممنون که سر زدی! اگه لایو نیست، ویدیوهای آپارات و یوتیوب رو ببین.',
                'تو این جعبه یه دنیا انرژی بود! اگه از لایوها لذت می‌بری، با حمایتت کمک کن استریم ادامه پیدا کنه.',
                'ایردراپ مخصوص تو! لینک سایت رو برای دوستات بفرست تا تیمت کامل بشه.'
            ];
            var PLANE = '<span class="supply-plane-body"><span class="dropin-trail dropin-trail-a"></span><span class="dropin-trail dropin-trail-b"></span>' +
                '<img src="c130-side.webp" alt="" width="1200" height="463" decoding="async"><i class="dropin-prop" style="left:62%"></i><i class="dropin-prop" style="left:69%"></i></span>';
            var rampDrop = 0;
            var CRATE =
                '<span class="supply-beam" aria-hidden="true"></span><span class="supply-rays" aria-hidden="true"></span>' +
                '<span class="supply-smoke" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
                '<span class="supply-sway">' +
                '<svg class="supply-chute" viewBox="0 0 100 72" aria-hidden="true" focusable="false"><defs><clipPath id="supplyChuteC"><path d="M4 34C4 14 24 3 50 3s46 11 46 31q-11-9-23 0q-12-9-23 0q-12-9-23 0q-12-9-23 0z"/></clipPath></defs><path d="M4 34C4 14 24 3 50 3s46 11 46 31q-11-9-23 0q-12-9-23 0q-12-9-23 0q-12-9-23 0z" fill="#f3efe6"/><g clip-path="url(#supplyChuteC)"><polygon points="50,3 -40,34 20,44" fill="#e5322d"/><polygon points="50,3 50,44 80,44" fill="#e5322d"/><path d="M50 3C38 6 28 16 27 34h23z" fill="rgba(255,255,255,.28)"/><path d="M50 3C62 6 72 16 73 34H50z" fill="rgba(0,0,0,.14)"/></g><path d="M4 34C4 14 24 3 50 3s46 11 46 31q-11-9-23 0q-12-9-23 0q-12-9-23 0q-12-9-23 0z" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M4 34L50 72M27 34L50 72M50 34V72M73 34L50 72M96 34L50 72" stroke="rgba(255,255,255,.75)" stroke-width=".9" fill="none"/></svg>' +
                '<svg class="supply-box" viewBox="0 0 92 92" aria-hidden="true" focusable="false"><defs><linearGradient id="pcL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a5e"/><stop offset="1" stop-color="#e8443b"/></linearGradient><linearGradient id="pcR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9433a"/><stop offset="1" stop-color="#a82821"/></linearGradient><linearGradient id="pcT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ac0f7"/><stop offset="1" stop-color="#5f93e6"/></linearGradient><clipPath id="pccl"><polygon points="6.9,24.7 46,43.3 46,87.3 6.9,68.7"/></clipPath><clipPath id="pccr"><polygon points="46,43.3 85.1,24.7 85.1,68.7 46,87.3"/></clipPath><clipPath id="pcct"><path d="M46,4L88,24L88,40Q80,46 72,46Q62,47 57,54Q53,60 49,64L46,71L43,64Q38,58 31,58Q22,58 17,50Q10,46 4,40L4,24Z"/></clipPath></defs><ellipse cx="47" cy="86" rx="42" ry="5" fill="rgba(0,0,0,.38)"/><polygon points="6.9,24.7 46,43.3 46,87.3 6.9,68.7" fill="url(#pcL)"/><polygon points="46,43.3 85.1,24.7 85.1,68.7 46,87.3" fill="url(#pcR)"/><g fill="#7a120d" opacity=".9" clip-path="url(#pccl)"><polygon points="11.3,26 12.4,26 12.4,65 11.3,65"/><polygon points="16.2,28.3 17.3,28.3 17.3,67.3 16.2,67.3"/><polygon points="21,30.7 22.1,30.7 22.1,69.7 21,69.7"/><polygon points="25.9,33 27,33 27,72 25.9,72"/><polygon points="30.8,35.3 31.9,35.3 31.9,74.3 30.8,74.3"/><polygon points="35.7,37.6 36.8,37.6 36.8,76.7 35.7,76.7"/><polygon points="40.6,40 41.7,40 41.7,79 40.6,79"/></g><g fill="#5e0c09" opacity=".9" clip-path="url(#pccr)"><polygon points="50.3,40 51.4,40 51.4,79 50.3,79"/><polygon points="55.2,37.6 56.3,37.6 56.3,76.7 55.2,76.7"/><polygon points="60.1,35.3 61.2,35.3 61.2,74.3 60.1,74.3"/><polygon points="65,33 66.1,33 66.1,72 65,72"/><polygon points="69.9,30.7 71,30.7 71,69.7 69.9,69.7"/><polygon points="74.7,28.3 75.8,28.3 75.8,67.3 74.7,67.3"/><polygon points="79.6,26 80.7,26 80.7,65 79.6,65"/></g><path d="M12.7,27 v38 M17.6,29.3 v38 M22.5,31.7 v38 M27.4,34 v38 M32.3,36.3 v38 M37.1,38.6 v38 M42,41 v38" stroke="#ffc2b8" stroke-width=".5" opacity=".55" fill="none" clip-path="url(#pccl)"/><path d="M51.8,41 v38 M56.7,38.6 v38 M61.5,36.3 v38 M66.4,34 v38 M71.3,31.7 v38 M76.2,29.3 v38 M81.1,27 v38" stroke="#ff9d90" stroke-width=".5" opacity=".4" fill="none" clip-path="url(#pccr)"/><polygon points="4.6,62.2 46,81.8 46,88.8 4.6,69.2" fill="#f2594f" stroke="#ffd9d3" stroke-width=".6"/><polygon points="46,81.8 87.4,62.2 87.4,69.2 46,88.8" fill="#bf342c" stroke="#f3aaa2" stroke-width=".6"/><path d="M46,43.3V87.3" stroke="#ffd0c8" stroke-width=".8" opacity=".8"/><g fill="#57544f" clip-path="url(#pccl)"><rect x="14.5" y="0" width="4.2" height="100"/><rect x="32.1" y="0" width="4.2" height="100"/></g><g fill="#3b3a38" clip-path="url(#pccr)"><rect x="73.3" y="0" width="4.2" height="100"/><rect x="55.7" y="0" width="4.2" height="100"/></g><g class="supply-lid"><path d="M46,4L88,24L88,40Q80,46 72,46Q62,47 57,54Q53,60 49,64L46,71L43,64Q38,58 31,58Q22,58 17,50Q10,46 4,40L4,24Z" fill="#5f93e6"/><g clip-path="url(#pcct)"><polygon points="46,4 88,24 46,44 4,24" fill="url(#pcT)"/><polygon points="46,44 88,24 88,80 46,80" fill="#3f6fc4" opacity=".75"/><polygon points="4,24 46,44 46,80 4,80" fill="#5586dc" opacity=".35"/><g fill="#b9604e" opacity=".22"><ellipse cx="30" cy="22" rx="7" ry="3"/><ellipse cx="62" cy="30" rx="6" ry="2.6"/><ellipse cx="22" cy="40" rx="3" ry="5"/><ellipse cx="72" cy="43" rx="3" ry="4.5"/><ellipse cx="46" cy="52" rx="2.6" ry="5"/></g><g fill="none" stroke-linecap="round"><path d="M12,36Q18,46 26,50M32,52Q38,60 44,62M50,60Q56,52 62,50M70,44Q78,44 84,38" stroke="#1e3f8f" stroke-width=".9" opacity=".35"/><path d="M10,30Q16,41 22,46M36,50Q40,56 45,59M52,56Q58,50 66,48M75,43Q80,42 85,36" stroke="#d4e5ff" stroke-width=".7" opacity=".5"/><path d="M20,18Q30,24 40,22M54,14Q66,20 76,22M34,30Q44,34 56,30" stroke="#d4e5ff" stroke-width=".6" opacity=".35"/></g><g fill="#4d4a47"><polygon points="56.5,9 60.7,11 18.7,31 14.5,29"/><polygon points="74.1,17.4 78.3,19.4 36.3,39.4 32.1,37.4"/><polygon points="35.5,9 31.3,11 73.3,31 77.5,29"/><polygon points="17.9,17.4 13.7,19.4 55.7,39.4 59.9,37.4"/></g><g fill="#5c5955"><polygon points="14.5,28.5 18.7,30.5 18.7,100 14.5,100"/><polygon points="32.1,36.9 36.3,38.9 36.3,100 32.1,100"/></g><g fill="#3a3937"><polygon points="73.3,30.5 77.5,28.5 77.5,100 73.3,100"/><polygon points="55.7,38.9 59.9,36.9 59.9,100 55.7,100"/></g><g fill="none" stroke="#8d8a85" stroke-width=".4" stroke-dasharray="1.3 1.3" opacity=".7"><path d="M58.6,10L16.6,30"/><path d="M76.2,18.4L34.2,38.4"/><path d="M33.4,10L75.4,30"/><path d="M15.8,18.4L57.8,38.4"/></g></g><path d="M4,24L46,4L88,24" fill="none" stroke="#cfe2ff" stroke-width=".8" opacity=".55"/><g fill="#9a9893" stroke="#262524" stroke-width=".6"><rect x="14.3" y="57" width="4.6" height="3.6" rx="1.2"/><rect x="31.9" y="65.4" width="4.6" height="3.6" rx="1.2"/><rect x="73.1" y="57" width="4.6" height="3.6" rx="1.2"/><rect x="55.5" y="65.4" width="4.6" height="3.6" rx="1.2"/></g></g></svg>' +
                '</span><span class="supply-ring" aria-hidden="true"></span><span class="supply-tag" aria-hidden="true">AIRDROP</span>';
            var OPENED =
                '<svg viewBox="-24 -30 142 124" aria-hidden="true" focusable="false"><defs><linearGradient id="poL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a5e"/><stop offset="1" stop-color="#e8443b"/></linearGradient><linearGradient id="poR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9433a"/><stop offset="1" stop-color="#a82821"/></linearGradient><linearGradient id="poT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ac0f7"/><stop offset="1" stop-color="#5f93e6"/></linearGradient><clipPath id="pocl"><polygon points="6.9,24.7 46,43.3 46,87.3 6.9,68.7"/></clipPath><clipPath id="pocr"><polygon points="46,43.3 85.1,24.7 85.1,68.7 46,87.3"/></clipPath><clipPath id="poct"><path d="M46,4L88,24L88,40Q80,46 72,46Q62,47 57,54Q53,60 49,64L46,71L43,64Q38,58 31,58Q22,58 17,50Q10,46 4,40L4,24Z"/></clipPath></defs><ellipse cx="47" cy="86" rx="42" ry="5" fill="rgba(0,0,0,.38)"/><polygon points="6.9,24.7 46,43.3 46,87.3 6.9,68.7" fill="url(#poL)"/><polygon points="46,43.3 85.1,24.7 85.1,68.7 46,87.3" fill="url(#poR)"/><g fill="#7a120d" opacity=".9" clip-path="url(#pocl)"><polygon points="11.3,26 12.4,26 12.4,65 11.3,65"/><polygon points="16.2,28.3 17.3,28.3 17.3,67.3 16.2,67.3"/><polygon points="21,30.7 22.1,30.7 22.1,69.7 21,69.7"/><polygon points="25.9,33 27,33 27,72 25.9,72"/><polygon points="30.8,35.3 31.9,35.3 31.9,74.3 30.8,74.3"/><polygon points="35.7,37.6 36.8,37.6 36.8,76.7 35.7,76.7"/><polygon points="40.6,40 41.7,40 41.7,79 40.6,79"/></g><g fill="#5e0c09" opacity=".9" clip-path="url(#pocr)"><polygon points="50.3,40 51.4,40 51.4,79 50.3,79"/><polygon points="55.2,37.6 56.3,37.6 56.3,76.7 55.2,76.7"/><polygon points="60.1,35.3 61.2,35.3 61.2,74.3 60.1,74.3"/><polygon points="65,33 66.1,33 66.1,72 65,72"/><polygon points="69.9,30.7 71,30.7 71,69.7 69.9,69.7"/><polygon points="74.7,28.3 75.8,28.3 75.8,67.3 74.7,67.3"/><polygon points="79.6,26 80.7,26 80.7,65 79.6,65"/></g><path d="M12.7,27 v38 M17.6,29.3 v38 M22.5,31.7 v38 M27.4,34 v38 M32.3,36.3 v38 M37.1,38.6 v38 M42,41 v38" stroke="#ffc2b8" stroke-width=".5" opacity=".55" fill="none" clip-path="url(#pocl)"/><path d="M51.8,41 v38 M56.7,38.6 v38 M61.5,36.3 v38 M66.4,34 v38 M71.3,31.7 v38 M76.2,29.3 v38 M81.1,27 v38" stroke="#ff9d90" stroke-width=".5" opacity=".4" fill="none" clip-path="url(#pocr)"/><polygon points="4.6,62.2 46,81.8 46,88.8 4.6,69.2" fill="#f2594f" stroke="#ffd9d3" stroke-width=".6"/><polygon points="46,81.8 87.4,62.2 87.4,69.2 46,88.8" fill="#bf342c" stroke="#f3aaa2" stroke-width=".6"/><path d="M46,43.3V87.3" stroke="#ffd0c8" stroke-width=".8" opacity=".8"/><g fill="#57544f" clip-path="url(#pocl)"><rect x="14.5" y="0" width="4.2" height="100"/><rect x="32.1" y="0" width="4.2" height="100"/></g><g fill="#3b3a38" clip-path="url(#pocr)"><rect x="73.3" y="0" width="4.2" height="100"/><rect x="55.7" y="0" width="4.2" height="100"/></g><g transform="translate(28,-16) rotate(16 46 40)"><path d="M46,4L88,24L88,40Q80,46 72,46Q62,47 57,54Q53,60 49,64L46,71L43,64Q38,58 31,58Q22,58 17,50Q10,46 4,40L4,24Z" fill="#5f93e6"/><g clip-path="url(#poct)"><polygon points="46,4 88,24 46,44 4,24" fill="url(#poT)"/><polygon points="46,44 88,24 88,80 46,80" fill="#3f6fc4" opacity=".75"/><polygon points="4,24 46,44 46,80 4,80" fill="#5586dc" opacity=".35"/><g fill="#b9604e" opacity=".22"><ellipse cx="30" cy="22" rx="7" ry="3"/><ellipse cx="62" cy="30" rx="6" ry="2.6"/><ellipse cx="22" cy="40" rx="3" ry="5"/><ellipse cx="72" cy="43" rx="3" ry="4.5"/><ellipse cx="46" cy="52" rx="2.6" ry="5"/></g><g fill="none" stroke-linecap="round"><path d="M12,36Q18,46 26,50M32,52Q38,60 44,62M50,60Q56,52 62,50M70,44Q78,44 84,38" stroke="#1e3f8f" stroke-width=".9" opacity=".35"/><path d="M10,30Q16,41 22,46M36,50Q40,56 45,59M52,56Q58,50 66,48M75,43Q80,42 85,36" stroke="#d4e5ff" stroke-width=".7" opacity=".5"/><path d="M20,18Q30,24 40,22M54,14Q66,20 76,22M34,30Q44,34 56,30" stroke="#d4e5ff" stroke-width=".6" opacity=".35"/></g><g fill="#4d4a47"><polygon points="56.5,9 60.7,11 18.7,31 14.5,29"/><polygon points="74.1,17.4 78.3,19.4 36.3,39.4 32.1,37.4"/><polygon points="35.5,9 31.3,11 73.3,31 77.5,29"/><polygon points="17.9,17.4 13.7,19.4 55.7,39.4 59.9,37.4"/></g><g fill="#5c5955"><polygon points="14.5,28.5 18.7,30.5 18.7,100 14.5,100"/><polygon points="32.1,36.9 36.3,38.9 36.3,100 32.1,100"/></g><g fill="#3a3937"><polygon points="73.3,30.5 77.5,28.5 77.5,100 73.3,100"/><polygon points="55.7,38.9 59.9,36.9 59.9,100 55.7,100"/></g><g fill="none" stroke="#8d8a85" stroke-width=".4" stroke-dasharray="1.3 1.3" opacity=".7"><path d="M58.6,10L16.6,30"/><path d="M76.2,18.4L34.2,38.4"/><path d="M33.4,10L75.4,30"/><path d="M15.8,18.4L57.8,38.4"/></g></g><path d="M4,24L46,4L88,24" fill="none" stroke="#cfe2ff" stroke-width=".8" opacity=".55"/><g fill="#9a9893" stroke="#262524" stroke-width=".6"><rect x="14.3" y="57" width="4.6" height="3.6" rx="1.2"/><rect x="31.9" y="65.4" width="4.6" height="3.6" rx="1.2"/><rect x="73.1" y="57" width="4.6" height="3.6" rx="1.2"/><rect x="55.5" y="65.4" width="4.6" height="3.6" rx="1.2"/></g></g><path transform="translate(-34,-36) scale(1.1)" d="M60 8l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#ffe38f" stroke="#ffb21a" stroke-width="2" stroke-linejoin="round"/></svg>';

            function canCall() { return !document.hidden && !window.__fxBlocking && !busy && !crate && !dialog && !modalOpen(); }
            function schedule(ms) {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    if (count >= MAX) { return; }
                    if (!canCall()) { schedule(8000); return; }
                    call(false);
                }, ms);
            }
            function call(manual) {
                busy = true;
                if (!manual) { count++; }
                var W = window.innerWidth, wide = W >= 700;
                var min = wide ? 110 : 56, max = Math.max(min + 30, W - (wide ? 250 : 100));
                var x = Math.round(rnd(min, max));
                var alertEl = document.createElement('div');
                alertEl.className = 'supply-alert';
                alertEl.setAttribute('aria-hidden', 'true');
                alertEl.innerHTML = '<span class="supply-alert-dot"></span><span>AIRDROP INCOMING</span>';
                document.body.appendChild(alertEl);
                if (!calm) { try { new Image().src = 'c130-side.webp'; } catch (e) {} }
                setTimeout(function () { remove(alertEl); release(x); }, calm ? 1700 : 2000);
            }
            function release(x) {
                if (calm) { spawn(x, true); return; }
                var W = window.innerWidth, H = window.innerHeight, flight = 2600;
                var pw = Math.round(Math.max(190, Math.min(340, W * 0.26)));
                var plane = document.createElement('div');
                plane.className = 'supply-plane';
                plane.setAttribute('aria-hidden', 'true');
                plane.style.setProperty('--sp-w', pw + 'px');
                plane.innerHTML = PLANE;
                rampDrop = Math.round(H * 0.045 + pw * 0.386 * 0.66 - 8);       // the crate starts at the plane's rear ramp
                document.body.appendChild(plane);
                setTimeout(function () { spawn(x, false); }, Math.max(250, ((x + 0.8 * pw) / (W + pw + 20)) * flight));
                setTimeout(function () { remove(plane); }, flight + 250);
            }
            function spawn(x, instant) {
                var H = window.innerHeight, wide = window.innerWidth >= 700;
                var land = Math.max(70, H - 155 - (wide ? 24 : 72)), start = (!instant && rampDrop) ? rampDrop : Math.round(H * 0.07) + 18;
                var c = document.createElement('button');
                c.type = 'button';
                c.className = 'supply' + (instant ? ' landed' : '');
                c.style.setProperty('--sx', x + 'px');
                c.style.setProperty('--land-y', land + 'px');
                c.style.setProperty('--start-y', start + 'px');
                c.setAttribute('aria-label', 'ایردراپ! برای باز کردن کلیک کن');
                c.innerHTML = CRATE;
                c.addEventListener('click', function () { openCrate(c); });
                crate = c;
                document.body.appendChild(c);
                if (instant) { idle(c); } else { c._land = setTimeout(function () { landed(c); }, 6800); }
            }
            function landed(c) {
                if (crate !== c || c._opening) { return; }
                c.classList.add('landed');
                var dust = document.createElement('span');
                dust.className = 'supply-dust';
                dust.setAttribute('aria-hidden', 'true');
                c.appendChild(dust);
                setTimeout(function () { remove(dust); }, 1000);
                idle(c);
            }
            function idle(c) {
                c._idle = setTimeout(function () {
                    if (crate !== c) { return; }
                    c.classList.add('leaving');
                    c._gone = setTimeout(function () { if (crate === c) { remove(c); crate = null; busy = false; schedule(rnd(55000, 100000)); } }, 650);
                }, 18000);
            }
            function openCrate(c) {
                if (c._opening || dialog) { return; }
                c._opening = true;
                clearTimeout(c._land); clearTimeout(c._idle); clearTimeout(c._gone);
                c.style.setProperty('--land-y', c.getBoundingClientRect().top + 'px');   // freeze where it is, even mid-fall
                c.classList.add('landed', 'opening');
                for (var i = 0; i < 14; i++) {
                    var s = document.createElement('i');
                    var ang = (Math.PI * 2 * i) / 14 + rnd(-0.2, 0.2), dist = rnd(70, 140);
                    s.className = 'supply-spark';
                    s.setAttribute('aria-hidden', 'true');
                    s.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
                    s.style.setProperty('--dy', Math.round(Math.sin(ang) * dist - 30) + 'px');
                    c.appendChild(s);
                }
                setTimeout(function () { remove(c); if (crate === c) { crate = null; } showDialog(); }, calm ? 120 : 780);
            }
            function copyText(text) {
                if (navigator.clipboard && window.isSecureContext) { return navigator.clipboard.writeText(text); }
                return new Promise(function (resolve, reject) {
                    var ta = document.createElement('textarea');
                    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
                    document.body.appendChild(ta); ta.select();
                    try { if (document.execCommand('copy')) { resolve(); } else { reject(); } } catch (e) { reject(e); } finally { remove(ta); }
                });
            }
            function clickLink(selector) { var link = document.querySelector(selector); if (link) { link.click(); } }
            function showDialog() {
                lastFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
                block('supply', true);
                scrim = document.createElement('div');
                scrim.className = 'supply-scrim';
                scrim.setAttribute('aria-hidden', 'true');
                dialog = document.createElement('div');
                dialog.className = 'supply-dialog';
                dialog.setAttribute('role', 'dialog');
                dialog.setAttribute('aria-modal', 'true');
                dialog.setAttribute('aria-labelledby', 'supplyTitle');
                dialog.innerHTML =
                    '<div class="supply-rarity" aria-hidden="true">★ LEGENDARY SUPPLY ★</div>' +
                    '<button class="supply-x" type="button" aria-label="بستن">×</button>' +
                    '<div class="supply-confetti" aria-hidden="true"></div>' +
                    '<div class="supply-gift" aria-hidden="true">' + OPENED + '</div>' +
                    '<h3 id="supplyTitle">ایردراپ باز شد!</h3><p class="supply-msg"></p>' +
                    '<div class="supply-actions">' +
                    '<button class="supply-btn primary" type="button" data-act="donate">حمایت از یونیک طاها</button>' +
                    '<button class="supply-btn" type="button" data-act="live">لایو آپارات</button>' +
                    '<button class="supply-btn" type="button" data-act="copy">کپی لینک سایت</button></div>';
                dialog.querySelector('.supply-msg').textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
                if (!calm) {
                    var box = dialog.querySelector('.supply-confetti'), colors = ['#ffb21a', '#ff2a36', '#fff3d0', '#ffe38f'];
                    for (var i = 0; i < 22; i++) {
                        var p = document.createElement('i');
                        p.style.setProperty('--c', colors[i % colors.length]);
                        p.style.setProperty('--cx', Math.round(rnd(-190, 190)) + 'px');
                        p.style.setProperty('--cr', Math.round(rnd(-540, 540)) + 'deg');
                        p.style.setProperty('--cd', (i * 0.03).toFixed(2) + 's');
                        box.appendChild(p);
                    }
                }
                dialog.addEventListener('click', function (e) {
                    var b = e.target.closest ? e.target.closest('button') : null;
                    if (!b) { return; }
                    if (b.classList.contains('supply-x')) { closeDialog(); return; }
                    var act = b.getAttribute('data-act');
                    if (act === 'donate') { closeDialog(); setTimeout(function () { clickLink('a.vpn-link-btn[href*="reymit.ir"]'); }, 60); }
                    else if (act === 'live') { closeDialog(); setTimeout(function () { clickLink('#liveCta'); }, 60); }
                    else if (act === 'copy') {
                        var original = b.textContent;
                        copyText(CANON).then(function () { b.textContent = 'کپی شد ✓'; }, function () { b.textContent = 'کپی نشد'; });
                        setTimeout(function () { b.textContent = original; }, 1700);
                    }
                });
                dialog.addEventListener('keydown', function (e) {
                    if (e.key !== 'Tab') { return; }
                    var f = slice(dialog.querySelectorAll('button')), first = f[0], last = f[f.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                    else if (f.indexOf(document.activeElement) === -1) { e.preventDefault(); first.focus(); }
                });
                scrim.addEventListener('click', closeDialog);
                document.body.appendChild(scrim);
                document.body.appendChild(dialog);
                requestAnimationFrame(function () { if (scrim) { scrim.classList.add('open'); } if (dialog) { dialog.classList.add('open'); } });
                var primary = dialog.querySelector('.supply-btn.primary');
                if (primary) { primary.focus(); }
            }
            function closeDialog() {
                if (!dialog) { return; }
                var d = dialog, s = scrim;
                dialog = null; scrim = null;
                d.classList.remove('open'); s.classList.remove('open');
                setTimeout(function () { remove(d); remove(s); }, 380);
                block('supply', false);
                if (lastFocus && document.contains(lastFocus)) { lastFocus.focus(); }
                lastFocus = null;
                busy = false;
                schedule(rnd(60000, 110000));
            }
            document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog) { closeDialog(); } });
            api.supplyNow = function () { if (canCall()) { call(true); } };
            onIntroDone(function () { schedule(forced ? 1800 : rnd(14000, 24000)); });
        });

        /* ================= footer buttons (phones have no keyboard) + public handle ================= */
        window.uniqueTahaFx = {
            replayIntro: function () { replayIntro(); },
            supplyDrop: function () { if (api.supplyNow) { api.supplyNow(); } },
            toggleRadar: function () { if (api.toggleRadar) { api.toggleRadar(); } }
        };
        slice(document.querySelectorAll('.fx-btn')).forEach(function (btn) {
            btn.addEventListener('click', function () {
                var k = btn.getAttribute('data-fx');
                if (k === 'intro') { replayIntro(); } else if (k === 'drop') { api.supplyNow && api.supplyNow(); } else if (k === 'radar') { api.toggleRadar && api.toggleRadar(); }
            });
        });
        root.setAttribute('data-fx', 'ready');

        /* ================= hotkeys: M radar, D supply drop, I replay intro ================= */
        document.addEventListener('keydown', function (e) {
            if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target) || window.__fxBlocking) { return; }
            if (e.code === 'KeyM' && api.toggleRadar) { api.toggleRadar(); }
            else if (e.code === 'KeyD' && api.supplyNow) { api.supplyNow(); }
            else if (e.code === 'KeyI') { replayIntro(); }
        });
    })();
    
