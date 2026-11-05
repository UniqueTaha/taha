        // Create stars
        function createStars() {
            const starsContainer = document.getElementById('stars');
            const numStars = document.documentElement.classList.contains('fx-lite') ? 45 : 150;      // lite mode: a third of the stars

            for (let i = 0; i < numStars; i++) {
                const star = document.createElement('div');
                star.className = 'star';
                
                const size = Math.random() * 2 + 1;
                star.style.width = size + 'px';
                star.style.height = size + 'px';
                star.style.left = Math.random() * 100 + '%';
                star.style.top = Math.random() * 100 + '%';
                star.style.animationDelay = Math.random() * 3 + 's';
                star.style.animationDuration = (Math.random() * 2 + 2) + 's';
                
                starsContainer.appendChild(star);
            }
        }

        // Create floating particles
        function createParticles() {
            if (document.documentElement.classList.contains('fx-lite')) { return; }                 // lite mode: no floating particles
            for (let i = 0; i < 20; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 15 + 's';
                particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
                document.body.appendChild(particle);
            }
        }

        // Create meteors/shooting stars
        function createMeteor() {
            const meteor = document.createElement('div');
            meteor.className = 'meteor';
            
            // Random starting position from top
            const startX = Math.random() * (window.innerWidth * 0.8);
            const startY = -150;
            const duration = Math.random() * 1.5 + 1; // 1 to 2.5 seconds
            const angle = -45 + (Math.random() * 10 - 5); // Slight variation in angle
            
            meteor.style.left = startX + 'px';
            meteor.style.top = startY + 'px';
            meteor.style.animationDuration = duration + 's';
            meteor.style.transform = `rotate(${angle}deg)`;
            
            // Random size variation
            const size = Math.random() * 0.5 + 0.5;
            meteor.style.width = (2 * size) + 'px';
            meteor.style.height = (150 * size) + 'px';
            
            document.body.appendChild(meteor);
            
            // Remove meteor after animation
            setTimeout(() => {
                if (meteor.parentNode) {
                    meteor.remove();
                }
            }, (duration + 0.5) * 1000);
        }

        // Create meteors periodically
        function startMeteorShower() {
            if (document.documentElement.classList.contains('fx-lite')) { return; }                 // lite mode: no shooting stars
            // Create initial meteors with delay
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    createMeteor();
                }, i * 2500);
            }
            
            // Continue creating meteors every few seconds
            setInterval(() => {
                if (Math.random() > 0.4) { // 60% chance
                    createMeteor();
                }
            }, 5000);
        }

        // VPN Modal Management
        let pendingUrl = null;
        const modal = document.getElementById('vpnModal');
        const confirmBtn = document.getElementById('confirmBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const vpnButtons = document.querySelectorAll('.vpn-link-btn');

        // If the Cloudflare Worker cannot reach Aparat, the browser and fresh same-origin JSON file are fallbacks.
        // Sources start together; the first valid answer in this order wins.
        const LIVE_STATUS_API = 'https://uniquetaha-live-status.tahakazrwny.workers.dev/live-status';
        const LIVE_STATUS_SOURCES = [
            { url: LIVE_STATUS_API, timeoutMs: 5000, maxAgeMs: 5 * 60 * 1000 },
            { url: 'https://www.aparat.com/api/fa/v2/Live/LiveStream/show/username/uniquetaha', timeoutMs: 5000, maxAgeMs: Infinity, simple: true, format: 'aparat' },
            { url: '/live-status.json', timeoutMs: 6000, maxAgeMs: 45 * 60 * 1000, bustCache: true }
        ].filter(source => source.url);
        const liveStatus = document.getElementById('liveStatus');
        const liveStatusText = document.getElementById('liveStatusText');
        const liveCta = document.getElementById('liveCta');
        const liveCtaText = document.getElementById('liveCtaText');
        let liveStatusRequestPending = false;
        let liveFeedStatus = 'checking';
        let refreshKillFeed = null;

        function renderLiveStatus(status) {
            const labels = {
                live: { status: '🔴 لایو در حال برگزاری است', cta: 'تماشای لایو در آپارات' },
                offline: { status: '⚫ در حال حاضر آفلاین است', cta: 'مشاهدهٔ کانال آپارات' },
                unknown: { status: 'وضعیت لایو فعلاً در دسترس نیست', cta: 'رفتن به لینک لایو در آپارات' },
                checking: { status: 'در حال بررسی وضعیت لایو...', cta: 'بررسی وضعیت آپارات...' }
            };
            const normalizedStatus = status in labels ? status : 'unknown';
            const label = labels[normalizedStatus];

            if (normalizedStatus !== liveFeedStatus) {
                liveFeedStatus = normalizedStatus;
                document.getElementById('killfeed').replaceChildren();
                if (refreshKillFeed) refreshKillFeed();
            }

            liveStatus.dataset.state = normalizedStatus;
            liveStatusText.textContent = label.status;
            liveCta.dataset.state = normalizedStatus;
            liveCtaText.textContent = label.cta;
        }

        function normalizeAparatStatus(data) {
            const candidates = [
                data && data.live_status && data.live_status.type,
                data && data.live_status && data.live_status.status,
                data && data.live_type,
                data && data.liveStatus && data.liveStatus.type,
                data && data.status,
                data && data.result && data.result.live_status && data.result.live_status.type,
                data && data.result && data.result.live_type
            ];

            for (const value of candidates) {
                if (typeof value === 'string') {
                    const normalized = value.toLowerCase();
                    if (normalized === 'live') return 'live';
                    if (['nolive', 'end', 'offline', 'notlive', 'not_live'].includes(normalized)) return 'offline';
                }
            }

            return null;
        }

        async function fetchLiveSource(source) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), source.timeoutMs);
            try {
                const url = source.bustCache ? `${source.url}?t=${Math.floor(Date.now() / 60000)}` : source.url;
                const options = source.simple
                    ? { signal: controller.signal }
                    : { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal };
                const response = await fetch(url, options);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const result = await response.json();
                let status = result.status;
                if (source.format === 'aparat') {
                    status = normalizeAparatStatus(result);
                }
                if (status !== 'live' && status !== 'offline') throw new Error('invalid status value');
                if (Number.isFinite(source.maxAgeMs)) {
                    const age = Date.now() - Date.parse(result.checkedAt);
                    if (!(age >= -5 * 60000 && age <= source.maxAgeMs)) throw new Error('status is stale');
                }
                return status;
            } finally {
                clearTimeout(timer);
            }
        }

        async function refreshLiveStatus() {
            if (liveStatusRequestPending || document.hidden) return;
            liveStatusRequestPending = true;

            try {
                const attempts = LIVE_STATUS_SOURCES.map(fetchLiveSource);
                attempts.forEach(a => a.catch(() => {}));
                let status = 'unknown';
                for (let i = 0; i < attempts.length; i++) {
                    try {
                        status = await attempts[i];
                        break;
                    } catch (error) {
                        console.warn(`Live status source ${i + 1} failed:`, error.message);
                    }
                }
                renderLiveStatus(status);
            } finally {
                liveStatusRequestPending = false;
            }
        }

        renderLiveStatus('checking');
        refreshLiveStatus();
        window.setInterval(refreshLiveStatus, 60000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshLiveStatus();
        });

        async function copyText(text) {
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    await navigator.clipboard.writeText(text);
                    return;
                } catch (error) {
                    console.warn('Clipboard API unavailable; trying the fallback:', error.message);
                }
            }

            const input = document.createElement('textarea');
            input.value = text;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.select();
            const copied = document.execCommand('copy');
            input.remove();
            if (!copied) throw new Error('Clipboard copy is unavailable');
        }

        document.querySelectorAll('.copy-link-button').forEach(button => {
            let feedbackTimer;
            button.addEventListener('click', async () => {
                const actions = button.closest('.social-card-actions');
                const link = actions && actions.querySelector('a[href]');
                const feedback = actions && actions.querySelector('.copy-link-feedback');

                if (!link || !feedback || button.disabled) return;

                clearTimeout(feedbackTimer);
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
                button.classList.remove('is-copied');
                feedback.classList.remove('is-error');
                try {
                    await copyText(link.href);
                    button.classList.add('is-copied');
                    feedback.classList.add('is-visible');
                    feedback.textContent = button.dataset.copiedLabel || 'لینک کپی شد';
                    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof button.animate === 'function') {
                        button.animate(
                            [
                                { transform: 'translateY(0) scale(1)' },
                                { transform: 'translateY(-3px) scale(1.045)' },
                                { transform: 'translateY(0) scale(1)' }
                            ],
                            { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
                        );
                    }
                } catch (error) {
                    console.error('Could not copy social link:', error);
                    button.classList.remove('is-copied');
                    feedback.classList.add('is-visible', 'is-error');
                    feedback.textContent = 'کپی خودکار در این مرورگر انجام نشد';
                } finally {
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                }

                feedbackTimer = setTimeout(() => {
                    button.classList.remove('is-copied');
                    feedback.classList.remove('is-visible', 'is-error');
                    feedback.textContent = '';
                }, 2200);
            });
        });

        // Handle VPN link buttons
        vpnButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                pendingUrl = btn.getAttribute('data-url') || btn.getAttribute('href');
                modal.classList.add('active');
            });
        });

        // Confirm button - open link
        confirmBtn.addEventListener('click', () => {
            if (pendingUrl) {
                window.open(pendingUrl, '_blank', 'noopener');
                modal.classList.remove('active');
                pendingUrl = null;
            }
        });

        // Cancel button - close modal
        cancelBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            pendingUrl = null;
        });

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                pendingUrl = null;
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                modal.classList.remove('active');
                pendingUrl = null;
            }
        });

        // Loading Screen
        window.addEventListener('load', () => {
            createStars();
            createParticles();
            startMeteorShower();
        });

        // Scroll to Top Button
        const scrollTopBtn = document.getElementById('scrollTop');
        
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                scrollTopBtn.classList.add('visible');
            } else {
                scrollTopBtn.classList.remove('visible');
            }
        });

        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        // Custom Cursor Glow Effect
        const cursorGlow = document.getElementById('cursorGlow');
        let mouseX = 0, mouseY = 0;
        let cursorX = 0, cursorY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        // Smooth cursor follow
        function animateCursor() {
            cursorX += (mouseX - cursorX) * 0.28;
            cursorY += (mouseY - cursorY) * 0.28;
            cursorGlow.style.left = cursorX + 'px';
            cursorGlow.style.top = cursorY + 'px';
            requestAnimationFrame(animateCursor);
        }
        animateCursor();

        // Activate cursor glow on hover over interactive elements
        const interactiveElements = document.querySelectorAll('a, button, .social-card');
        interactiveElements.forEach(el => {
            el.addEventListener('mouseenter', () => {
                cursorGlow.classList.add('active');
            });
            el.addEventListener('mouseleave', () => {
                cursorGlow.classList.remove('active');
            });
        });

        // Add parallax effect on mouse move
        document.addEventListener('mousemove', (e) => {
            const nebula = document.querySelector('.nebula');
            const x = e.clientX / window.innerWidth;
            const y = e.clientY / window.innerHeight;
            
            nebula.style.transform = `translate(${x * 20}px, ${y * 20}px)`;
        });

        // Handle window resize for responsive design
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                // Recalculate positions if needed
            }, 250);
        });

        // تابع پشتیبانی حذف شد چون المان مربوطه وجود ندارد
    
        // ===================== Gaming HUD =====================
        (function () {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            // first mouse move reveals the crosshair cursor
            document.addEventListener('mousemove', () => cursorGlow.classList.add('on'), { once: true });

            // --- health bar (scroll progress) + compass heading ---
            const hp = document.getElementById('hpFill');
            const compass = document.getElementById('compass');
            const track = document.getElementById('compassTrack');
            const PX = 3;
            const dirs = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

            for (let d = -180; d < 540; d += 5) {
                const x = (d + 180) * PX;
                const n = ((d % 360) + 360) % 360;
                const tick = document.createElement('i');
                tick.className = 'tk' + (n % 15 === 0 ? ' big' : '');
                tick.style.left = x + 'px';
                track.appendChild(tick);
                if (n % 15 === 0) {
                    const lb = document.createElement('span');
                    lb.className = 'lb' + (n % 45 === 0 ? ' dir' : '');
                    lb.style.left = x + 'px';
                    lb.textContent = n % 45 === 0 ? dirs[n] : String(n);
                    track.appendChild(lb);
                }
            }

            function updateHud() {
                const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
                const p = Math.min(1, Math.max(0, window.scrollY / max));
                hp.style.width = (p * 100) + '%';
                const heading = p * 360;
                track.style.transform = 'translateX(' + (compass.clientWidth / 2 - (heading + 180) * PX) + 'px)';
            }
            window.addEventListener('scroll', updateHud, { passive: true });
            window.addEventListener('resize', updateHud);
            window.addEventListener('load', updateHud);
            updateHud();

            // --- kill feed ---
            const feed = document.getElementById('killfeed');
            const KF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>';
            const msgs = {
                live: [
                    '<b>UniqueTaha</b> is <em>LIVE</em> on Aparat',
                    '<b>Squad up!</b> <em>UniqueTaha is LIVE</em>'
                ],
                offline: [
                    '<b>UniqueTaha</b> is currently <em>OFFLINE</em>',
                    '<b>Live session</b> <em>has ended</em>'
                ],
                unknown: [
                    '<b>Live status</b> is <em>unavailable</em>',
                    '<b>Checking</b> <em>Aparat status</em>'
                ],
                checking: [
                    '<b>Checking</b> <em>Aparat live status</em>'
                ]
            };
            let mi = 0;
            function pushKill() {
                if (document.hidden) return;
                const el = document.createElement('div');
                el.className = 'kf';
                const currentMessages = msgs[liveFeedStatus] || msgs.unknown;
                el.innerHTML = KF_ICON + currentMessages[mi++ % currentMessages.length];
                feed.appendChild(el);
                while (feed.children.length > 3) feed.firstChild.remove();
                setTimeout(() => el.remove(), 4800);
            }
            refreshKillFeed = pushKill;
            if (!reduce) {
                setTimeout(() => { pushKill(); setInterval(pushKill, 5500); }, 1800);
            }

            // --- hit marker on click / tap ---
            if (!reduce) {
                document.addEventListener('pointerdown', (e) => {
                    const h = document.createElement('div');
                    h.className = 'hit' + (e.target.closest('a, button, .social-card') ? ' red' : '');
                    h.style.left = e.clientX + 'px';
                    h.style.top = e.clientY + 'px';
                    h.innerHTML = '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 3l6 6M23 3l-6 6M3 23l6-6M23 23l-6-6"/></svg>';
                    document.body.appendChild(h);
                    setTimeout(() => h.remove(), 420);
                });
            }

            // --- hotkeys 1..6 open the cards (like inventory slots) ---
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
                if (window.__fxBlocking) return;
                if (modal.classList.contains('active')) return;
                const m = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
                if (!m) return;
                const card = document.querySelectorAll('.social-card')[Number(m[1]) - 1];
                const link = card && card.querySelector('a');
                if (!link) return;
                card.classList.add('pressed');
                setTimeout(() => card.classList.remove('pressed'), 260);
                link.click();
            });
        })();
    
