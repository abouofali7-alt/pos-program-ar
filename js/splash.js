/* ============================================================
   AR-Program — Cinematic Machinery Splash Animation Controller
   المسار الزمني الممتد (مدة العرض الكاملة: 16 ثانية على الأقل):
   1. 0s - 4.5s  : الفني يمسح الأتربة عن التروس بدقة وبحركة متكررة (4.5 ثانية)
   2. 4.5s - 8.0s : التماع التروس وبدء دورانها المتشابك وتفعيل المحرك والكباسات (3.5 ثانية)
   3. 8.0s - 12.0s: انطلاق شبكة الطاقة وإضاءة حروف AR-PROGRAM حرفاً بحرف (4.0 ثوانٍ)
   4. 12.0s - 16.5s: ظهور نافذة الترحيب الزجاجية والعد التنازلي واكتمال التحويل (4.5 ثانية)
   ============================================================ */

const ARSplash = (function () {
    let _redirectTimer = null;
    let _countdownInterval = null;
    let _hasFinished = false;

    function initSplash() {
        const overlay = document.getElementById('splashOverlay');
        if (!overlay) return;

        startAnimationSequence();
    }

    function startAnimationSequence() {
        const dustLayer = document.getElementById('dustLayer');
        const armGroup = document.getElementById('rightArmWipingGroup');
        const gear1 = document.getElementById('gear1');
        const gear2 = document.getElementById('gear2');
        const gear3 = document.getElementById('gear3');
        const piston1 = document.getElementById('piston1');
        const piston2 = document.getElementById('piston2');
        const pulseLeft = document.getElementById('energyPulseLeft');
        const pulseRight = document.getElementById('energyPulseRight');

        // المرحلة 1: مسح الأتربة (0s - 4.5s)
        if (armGroup) armGroup.classList.add('wiping-arm');
        if (dustLayer) dustLayer.classList.add('dust-layer-anim');

        // المرحلة 2: دوران التروس والتماعها عند 4.5 ثانية
        setTimeout(() => {
            if (_hasFinished) return;
            if (gear1) gear1.classList.add('gear-spin-cw');
            if (gear2) gear2.classList.add('gear-spin-ccw');
            if (gear3) gear3.classList.add('gear-spin-cw');

            const sparkles = document.getElementById('sparkleGroup');
            if (sparkles) sparkles.classList.add('sparkle-anim');
        }, 4500);

        // المرحلة 3: تشغيل المحرك والكباسات وانطلاق الطاقة عند 6.2 ثانية
        setTimeout(() => {
            if (_hasFinished) return;
            const engineGroup = document.getElementById('engineGroup');
            if (engineGroup) engineGroup.classList.add('engine-active');
            if (piston1) piston1.classList.add('piston-1-anim');
            if (piston2) piston2.classList.add('piston-2-anim');

            if (pulseLeft) pulseLeft.classList.add('energy-line-anim');
            if (pulseRight) pulseRight.classList.add('energy-line-anim');
        }, 6200);

        // المرحلة 4: إضاءة حروف الاسم حرفاً بحرف عند 8.0 ثوانٍ
        setTimeout(() => {
            if (_hasFinished) return;
            illuminateTitleLetters();
        }, 8000);
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
                // المرحلة 5: إظهار الرسالة الترحيبية والتحويل عند 12.0 ثانية
                setTimeout(showWelcomeAndRedirect, 500);
            }
        }, 360); // 10 حروف * 360ms = 3.6s
    }

    function showWelcomeAndRedirect() {
        if (_hasFinished) return;

        const welcomeModal = document.getElementById('welcomeModal');
        const fillBar = document.getElementById('splashProgressFill');
        const subTxt = document.getElementById('splashWelcomeSub');

        if (welcomeModal) welcomeModal.classList.add('show');
        if (fillBar) {
            fillBar.style.transition = 'width 4.5s linear';
            fillBar.style.width = '100%';
        }

        let secondsLeft = 4;
        if (subTxt) subTxt.innerHTML = `جاري التحويل لصفحة تسجيل الدخول خلال <b style="color:#38bdf8;font-size:1rem;">${secondsLeft}</b> ثوانٍ...`;

        _countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0 && subTxt) {
                subTxt.innerHTML = `جاري التحويل لصفحة تسجيل الدخول خلال <b style="color:#38bdf8;font-size:1rem;">${secondsLeft}</b> ثوانٍ...`;
            } else {
                clearInterval(_countdownInterval);
            }
        }, 1000);

        _redirectTimer = setTimeout(() => {
            finishAndRedirect();
        }, 4500);
    }

    function finishAndRedirect() {
        if (_hasFinished) return;
        _hasFinished = true;

        if (_redirectTimer) clearTimeout(_redirectTimer);
        if (_countdownInterval) clearInterval(_countdownInterval);

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
