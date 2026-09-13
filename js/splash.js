/* ============================================================
   AR-Program — Cinematic Machinery Splash Animation Controller
   المسار الزمني الممتد والواقعي (18 ثانية على الأقل قبل التوجيه):
   1. 0.0s - 3.5s : إنسان يمشي بخطوات واقعية باتجاه الآلة والتروس
   2. 3.5s - 7.5s : الفني يمسح وينفض الأتربة الواقعية عن التروس
   3. 7.5s - 11.5s: التماع التروس الماسي ودورانها المتشابك وتفعيل المحرك
   4. 11.5s - 15.0s: تدفق الطاقة وإضاءة حروف AR-PROGRAM متتالية حرفاً بحرف
   5. 15.0s - 18.5s: ظهور نافذة الترحيب الزجاجية والعد التنازلي واكتمال التحويل
   ============================================================ */

const ARSplash = (function () {
    let _redirectTimer = null;
    let _countdownInterval = null;
    let _hasFinished = false;
    let _particleAnimFrame = null;

    function initSplash() {
        const overlay = document.getElementById('splashOverlay');
        if (!overlay) return;

        initParticleCanvas();
        startAnimationSequence();
    }

    /* نظام جزيئات الهواء والغبار السابح ذو البُعد السينمائي */
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
        const particleCount = 45;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 2 + 0.5,
                color: Math.random() > 0.4 ? 'rgba(56, 189, 248, ' : 'rgba(245, 158, 11, ',
                alpha: Math.random() * 0.5 + 0.2,
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

    function startAnimationSequence() {
        const personRig = document.getElementById('personWalkingRig');
        const dustLayer = document.getElementById('dustLayer');
        const armGroup = document.getElementById('rightArmWipingGroup');
        const gear1 = document.getElementById('gear1');
        const gear2 = document.getElementById('gear2');
        const gear3 = document.getElementById('gear3');
        const piston1 = document.getElementById('piston1');
        const piston2 = document.getElementById('piston2');
        const pulseLeft = document.getElementById('energyPulseLeft');
        const pulseRight = document.getElementById('energyPulseRight');

        // المرحلة 1: الإنسان يمشي باتجاه الآلة (0.0s - 3.5s)
        if (personRig) personRig.classList.add('person-walking-rig');

        // المرحلة 2: يقرر مسح الأتربة وينفض الغبار عند الوصول (3.5s - 7.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            if (armGroup) armGroup.classList.add('dusting-arm');
            if (dustLayer) dustLayer.classList.add('dust-layer-anim');
        }, 3500);

        // المرحلة 3: دوران التروس الحقيقية والتماعها وتفعيل المحرك (7.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            if (gear1) gear1.classList.add('gear-spin-cw');
            if (gear2) gear2.classList.add('gear-spin-ccw');
            if (gear3) gear3.classList.add('gear-spin-cw');

            const sparkles = document.getElementById('sparkleGroup');
            if (sparkles) sparkles.classList.add('sparkle-anim');
        }, 7500);

        // تشغيل قدرة المحرك والكباسات ونبض خطوط الطاقة (9.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            const engineGroup = document.getElementById('engineGroup');
            if (engineGroup) engineGroup.classList.add('engine-active');
            if (piston1) piston1.classList.add('piston-1-anim');
            if (piston2) piston2.classList.add('piston-2-anim');

            if (pulseLeft) pulseLeft.classList.add('energy-line-anim');
            if (pulseRight) pulseRight.classList.add('energy-line-anim');
        }, 9500);

        // المرحلة 4: إضاءة حروف الاسم حرفاً بحرف عند (11.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            illuminateTitleLetters();
        }, 11500);
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
                index++;
            } else {
                clearInterval(interval);
                // المرحلة 5: إظهار الرسالة الترحيبية والتحويل عند (15.0s)
                setTimeout(showWelcomeAndRedirect, 500);
            }
        }, 350); // 10 حروف * 350ms = 3.5s
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
        if (_particleAnimFrame) cancelAnimationFrame(_particleAnimFrame);

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
