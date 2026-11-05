    /* PWA: service worker, install prompt (Android/desktop), iOS instructions, app shortcuts */
    (function () {
        'use strict';
        var root = document.documentElement;
        function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
        var standalone = mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || mq('(display-mode: minimal-ui)') ||
            window.navigator.standalone === true || (document.referrer || '').indexOf('android-app://') === 0;
        if (standalone) root.classList.add('is-app');

        var ua = navigator.userAgent || '';
        var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        var bar = document.getElementById('appInstall'), go = document.getElementById('appInstallGo'), later = document.getElementById('appInstallLater');
        var btn = document.getElementById('appInstallBtn'), desc = document.getElementById('appInstallDesc'), steps = document.getElementById('appInstallSteps');
        var toast = document.getElementById('appToast'), toastBtn = document.getElementById('appToastBtn');
        var deferred = null, autoTimer = null, SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        var COOLDOWN = 7 * 24 * 3600 * 1000;

        function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
        function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
        function snoozed() { var v = parseInt(lsGet('appInstallLater') || '0', 10); return v && Date.now() - v < COOLDOWN; }
        function installed() { return lsGet('appInstalled') === '1'; }
        function whenFree(cb, extraMs) {
            var t0 = Date.now();
            (function poll() {
                var busy = window.__fxBlocking || document.getElementById('dropIn') || document.hidden;
                if (!busy && Date.now() - t0 >= (extraMs || 0)) { cb(); return; }
                if (Date.now() - t0 > 120000) return;
                setTimeout(poll, 500);
            })();
        }
        function setMode() {
            steps.hidden = true; steps.innerHTML = '';
            if (deferred) { desc.textContent = 'مثل یک اپ روی گوشیت نصب می‌شه: آیکون خودش، تمام‌صفحه و حتی بدون اینترنت.'; go.hidden = false; return; }
            go.hidden = true; steps.hidden = false;
            if (isIOS) {
                desc.textContent = 'تو آیفون و آیپد نصب از همین مرورگر Safari انجام می‌شه:';
                steps.innerHTML = '<li>دکمه Share ' + SHARE + ' (مربع با فلش رو به بالا) پایین صفحه را بزن.</li><li>گزینه «Add to Home Screen» را انتخاب کن.</li><li>روی «Add» بزن؛ آیکون برنامه روی صفحه اصلی میاد.</li>';
            } else {
                desc.textContent = 'نصب از منوی مرورگر:';
                steps.innerHTML = '<li>منوی مرورگر (⋮ یا ⋯) را باز کن.</li><li>«Install app» یا «Add to Home screen» را بزن.</li>';
            }
        }
        function open() {
            if (standalone || !bar) return;
            var ic = bar.querySelector('img[data-src]'); if (ic && !ic.getAttribute('src')) { ic.src = ic.getAttribute('data-src'); }
            setMode(); bar.hidden = false;
            setTimeout(function () { bar.classList.add('is-open'); }, 30);
        }
        function close(snooze) {
            if (!bar) return;
            bar.classList.remove('is-open');
            setTimeout(function () { bar.hidden = true; }, 380);
            if (snooze) lsSet('appInstallLater', String(Date.now()));
        }
        function scheduleAuto() {
            if (standalone || installed() || snoozed() || autoTimer) return;
            autoTimer = true;
            whenFree(function () { if (!standalone && !installed() && !snoozed()) open(); }, deferred ? 12000 : 18000);
        }

        if (!standalone) {
            if (btn) {
                btn.hidden = false;
                btn.addEventListener('click', function () { open(); });
            }
            window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; scheduleAuto(); });
            if (btn) {
                window.addEventListener('appinstalled', function () { deferred = null; lsSet('appInstalled', '1'); close(false); btn.hidden = true; });
            }
            if (go) {
                go.addEventListener('click', function () {
                    if (!deferred) { close(false); return; }
                    var d = deferred; deferred = null;
                    try { d.prompt(); (d.userChoice || Promise.resolve()).then(function () { close(true); }); } catch (e) { close(true); }
                });
            }
            if (later) { later.addEventListener('click', function () { close(true); }); }
            if (bar) {
                document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !bar.hidden && bar.classList.contains('is-open') && !window.__fxBlocking) close(true); });
            }
            if (isIOS) scheduleAuto();
            if (/[?&]install\b/.test(location.search)) whenFree(open, 0);
        }

        /* service worker (needs https or localhost) */
        if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
            var hadController = !!navigator.serviceWorker.controller;
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
            });
            navigator.serviceWorker.addEventListener('controllerchange', function () {
                if (!hadController) { hadController = true; return; }
                toast.hidden = false; setTimeout(function () { toast.classList.add('is-open'); }, 30);
            });
            toastBtn.addEventListener('click', function () { location.reload(); });
        }

        /* app shortcuts: long-press the icon -> ?go=live / ?go=donate */
        var m = /[?&]go=(live|donate)\b/.exec(location.search);
        if (m) {
            whenFree(function () {
                try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
                var el = m[1] === 'live' ? document.getElementById('liveCta') : document.querySelector('a.vpn-link-btn[href*="reymit.ir"]');
                if (el) el.click();
            }, 300);
        }

        window.uniqueTahaApp = { showInstall: open, isStandalone: function () { return standalone; } };
    })();
    
