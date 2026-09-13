/* ============================================================
   AR-Program — Photorealistic Live-Action Movie Video Splash & Sound Engine
   عرض فيديو سينمائي حقيقي MP4 بنظام محاكاة الفيلم الواقعي والمؤثرات الصوتية (18.5 ثانية)
   المشهد 1 (0s - 4.5s): الإنسان يتقدم في الورشة باتجاه آلة التروس
   المشهد 2 (4.5s - 8.5s): لقطة مقربة ليد تمسح الأتربة والغبار عن التروس + صوت مسح الغبار
   المشهد 3 (8.5s - 12.5s): دوران التروس واشتعال المحرك وانطلاق الطاقة + صوت التروس والمحرك
   المشهد 4 (12.5s - 18.5s): إضاءة الشعار AR-PROGRAM والترحيب والتوجيه + رنين نغمات الحروف
   ============================================================ */

/* محرك المؤثرات الصوتية التخليقية التفاعلية باستخدام Web Audio API */
const ARSoundFX = (function () {
    let audioCtx = null;

    function getAudioContext() {
        if (!audioCtx) {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            if (AudioCtxClass) {
                audioCtx = new AudioCtxClass();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    // 1. صوت مسح ونفض الغبار (Swoosh/Wipe Noise Sweep)
    function playWipeSwoosh() {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const bufferSize = ctx.sampleRate * 0.35;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(350, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.3);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.34);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            noise.start(ctx.currentTime);
        } catch (e) {
            console.warn('[SoundFX] playWipeSwoosh blocked:', e);
        }
    }

    // 2. صوت نقرة أو طقطقة التروس الميكانيكية Metal Gear Click
    function playGearClick() {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(140 + Math.random() * 90, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.08);

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.085);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.085);
        } catch (e) {}
    }

    // 3. صوت أزيز واشتعال المحرك الكهربائي Engine Hum & Spark
    function playEngineHum(durationSec = 3.8) {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(50, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + durationSec);

            gain.gain.setValueAtTime(0.02, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + durationSec * 0.4);
            gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + durationSec);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + durationSec);
        } catch (e) {}
    }

    // 4. نغمة رنين جرس الملاحظات لإضاءة الحروف sequential Letter Chime
    function playLetterChime(index) {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const freqs = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66, 1318.51];
            const freq = freqs[index % freqs.length] || 880;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            gain.gain.setValueAtTime(0.35, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch (e) {}
    }

    return { getAudioContext, playWipeSwoosh, playGearClick, playEngineHum, playLetterChime };
})();


const ARSplash = (function () {
    let _redirectTimer = null;
    let _countdownInterval = null;
    let _hasFinished = false;
    let _particleAnimFrame = null;
    let _gearSoundInterval = null;

    function initSplash() {
        const overlay = document.getElementById('splashOverlay');
        if (!overlay) return;

        // تفعيل الصوت عند أول تفاعل للمستخدم على أي مكان في الشاشة
        const unlockAudio = () => {
            ARSoundFX.getAudioContext();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };
        window.addEventListener('click', unlockAudio, { once: true });
        window.addEventListener('touchstart', unlockAudio, { once: true });

        initParticleCanvas();
        setupVideoPlayer();
        startFilmSequence();
    }

    function setupVideoPlayer() {
        const video = document.getElementById('splashVideoPlayer');
        if (video) {
            video.muted = true;
            video.currentTime = 0;
            const p = video.play();
            if (p !== undefined) {
                p.then(() => {
                    console.log('[Splash] Playing real MP4 video intro_movie.mp4');
                }).catch(e => {
                    console.warn('[Splash] Video autoplay fallback to frames:', e);
                });
            }
        }
    }

    /* نظام الجسيمات والغبار المعلق السابح في الهواء */
    function initParticleCanvas() {
        const canvas = document.getElementById('splashParticlesCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const particles = [];
        const particleCount = 55;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 2.2 + 0.6,
                color: Math.random() > 0.35 ? 'rgba(56, 189, 248, ' : 'rgba(245, 158, 11, ',
                alpha: Math.random() * 0.5 + 0.25,
                vx: (Math.random() - 0.5) * 0.4,
                vy: -Math.random() * 0.5 - 0.2
            });
        }

        function drawParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color + p.alpha + ')';
                ctx.fill();

                p.x += p.vx;
                p.y += p.vy;

                if (p.y < 0) p.y = canvas.height;
                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
            });
            _particleAnimFrame = requestAnimationFrame(drawParticles);
        }
        drawParticles();
    }

    function setSceneCaption(text) {
        const cap = document.getElementById('splashSceneCaption');
        if (!cap) return;
        cap.classList.remove('show');
        setTimeout(() => {
            if (_hasFinished) return;
            cap.innerText = text;
            cap.classList.add('show');
        }, 300);
    }

    function startFilmSequence() {
        const frame1 = document.getElementById('filmFrame1');
        const frame2 = document.getElementById('filmFrame2');
        const frame3 = document.getElementById('filmFrame3');
        const frame4 = document.getElementById('filmFrame4');

        // المشهد 1: إنسان يتقدم في الورشة باتجاه آلة التروس (0s - 4.5s)
        if (frame1) frame1.classList.add('active');
        setSceneCaption('المشهد الأول: التقدم نحو آلة الرواتب والمبيعات في الورشة الصناعية...');

        // المشهد 2: نفض ومسح الأتربة عن التروس الماسية (4.5s - 8.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            if (frame1) frame1.classList.remove('active');
            if (frame2) frame2.classList.add('active');
            setSceneCaption('المشهد الثاني: نفض الأتربة وإعادة تجهيز التروس للعمل...');

            // تشغيل مؤثر مسح الغبار 3 مرات متتالية
            ARSoundFX.playWipeSwoosh();
            setTimeout(() => { if (!_hasFinished) ARSoundFX.playWipeSwoosh(); }, 1200);
            setTimeout(() => { if (!_hasFinished) ARSoundFX.playWipeSwoosh(); }, 2400);
        }, 4500);

        // المشهد 3: دوران التروس واشتعال المحرك وانطلاق الطاقة (8.5s - 12.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            if (frame2) frame2.classList.remove('active');
            if (frame3) frame3.classList.add('active');
            setSceneCaption('المشهد الثالث: انطلاق التروس واشتعال المحرك وتوليد الطاقة...');

            // تشغيل صوت أزيز المحرك ونقر التروس
            ARSoundFX.playEngineHum(3.8);
            _gearSoundInterval = setInterval(() => {
                if (_hasFinished) {
                    clearInterval(_gearSoundInterval);
                    return;
                }
                ARSoundFX.playGearClick();
            }, 300);

            setTimeout(() => {
                if (_gearSoundInterval) clearInterval(_gearSoundInterval);
            }, 3800);
        }, 8500);

        // المشهد 4: ظهور الشعار وتتابع إضاءة الحروف (12.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            if (frame3) frame3.classList.remove('active');
            if (frame4) frame4.classList.add('active');
            setSceneCaption('المشهد الرابع: جاهزية نظام AR-Program وإضاءة الشعار الرئيسي');

            illuminateTitleLetters();
        }, 12500);
    }

    function illuminateTitleLetters() {
        const chars = document.querySelectorAll('.splash-char');
        if (!chars.length) return;

        let index = 0;
        const interval = setInterval(() => {
            if (_hasFinished) {
                clearInterval(interval);
                return;
            }
            if (index < chars.length) {
                chars[index].classList.add('lit');
                ARSoundFX.playLetterChime(index);
                index++;
            } else {
                clearInterval(interval);
                // المرحلة الأخيرة: إظهار الرسالة الترحيبية والعد التنازلي للتحويل
                setTimeout(showWelcomeAndRedirect, 500);
            }
        }, 280); // 10 حروف * 280ms = 2.8 ثانية
    }

    function showWelcomeAndRedirect() {
        if (_hasFinished) return;

        const welcomeModal = document.getElementById('welcomeModal');
        const fillBar = document.getElementById('splashProgressFill');
        const subTxt = document.getElementById('splashWelcomeSub');

        if (welcomeModal) welcomeModal.classList.add('show');
        if (fillBar) {
            fillBar.style.transition = 'width 3.5s linear';
            fillBar.style.width = '100%';
        }

        let secondsLeft = 3;
        if (subTxt) subTxt.innerHTML = `جاري التحويل لصفحة تسجيل الدخول خلال <b style="color:#38bdf8;font-size:1.05rem;">${secondsLeft}</b> ثوانٍ...`;

        _countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0 && subTxt) {
                subTxt.innerHTML = `جاري التحويل لصفحة تسجيل الدخول خلال <b style="color:#38bdf8;font-size:1.05rem;">${secondsLeft}</b> ثوانٍ...`;
            } else {
                clearInterval(_countdownInterval);
            }
        }, 1000);

        _redirectTimer = setTimeout(() => {
            finishAndRedirect();
        }, 3500); // 15s + 3.5s = 18.5s إجمالي الوقت السينمائي!
    }

    function finishAndRedirect() {
        if (_hasFinished) return;
        _hasFinished = true;

        if (_redirectTimer) clearTimeout(_redirectTimer);
        if (_countdownInterval) clearInterval(_countdownInterval);
        if (_gearSoundInterval) clearInterval(_gearSoundInterval);
        if (_particleAnimFrame) cancelAnimationFrame(_particleAnimFrame);

        const video = document.getElementById('splashVideoPlayer');
        if (video) {
            video.pause();
        }

        const overlay = document.getElementById('splashOverlay');
        if (overlay) {
            overlay.classList.add('fade-out');
        }

        setTimeout(() => {
            try {
                const sessionStr = localStorage.getItem('ar_session');
                if (!sessionStr) {
                    window.location.href = 'pages/login.html';
                } else {
                    const u = JSON.parse(sessionStr);
                    const isMgr = u && (u.roleId === 1 || u.roleName === 'مدير' || (u.username && u.username.toLowerCase() === 'admin'));
                    if (!isMgr) {
                        window.location.href = 'pages/business/pos.html';
                    } else {
                        if (overlay) overlay.style.display = 'none';
                        if (typeof initDashboard === 'function') initDashboard();
                    }
                }
            } catch (e) {
                window.location.href = 'pages/login.html';
            }
        }, 600);
    }

    return { initSplash, finishAndRedirect };
})();

document.addEventListener('DOMContentLoaded', () => {
    ARSplash.initSplash();
});
