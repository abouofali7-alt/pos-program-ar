/* ============================================================
   AR-Program — Photorealistic Live-Action Movie Splash Controller
   عرض سينمائي واقعي 100% من مشاهد فيلم سينمائي (18.5 ثانية على الأقل)
   المشهد 1 (0s - 4.5s): الإنسان يتقدم في الورشة باتجاه آلة التروس
   المشهد 2 (4.5s - 8.5s): لقطة مقربة ليد تمسح الأتربة والغبار عن التروس
   المشهد 3 (8.5s - 12.5s): دوران التروس واشتعال المحرك وانطلاق الطاقة
   المشهد 4 (12.5s - 18.5s): إضاءة الشعار AR-PROGRAM والترحيب والتوجيه
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
        startFilmSequence();
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
        const particleCount = 50;

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
        }, 4500);

        // المشهد 3: دوران التروس واشتعال المحرك وانطلاق الطاقة (8.5s - 12.5s)
        setTimeout(() => {
            if (_hasFinished) return;
            if (frame2) frame2.classList.remove('active');
            if (frame3) frame3.classList.add('active');
            setSceneCaption('المشهد الثالث: انطلاق التروس واشتعال المحرك وتوليد الطاقة...');
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
